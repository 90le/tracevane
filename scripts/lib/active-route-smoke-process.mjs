import { execFile } from "node:child_process";

export const ACTIVE_ROUTE_SMOKE_CONTROL_ENV = "TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_CONTROL";
export const ACTIVE_ROUTE_SMOKE_CONTROL_MODE = "stdio";
export const ACTIVE_ROUTE_SMOKE_STOP_TYPE = "tracevane-active-route-smoke-stop";

const ALLOWED_STOP_SIGNALS = new Set(["SIGHUP", "SIGINT", "SIGTERM"]);
const DEFAULT_CLEANUP_TIMEOUT_MS = 6_000;

export function installActiveRouteSmokeStopControl(onStop, options = {}) {
  const env = options.env || process.env;
  const input = options.input || process.stdin;
  if (env[ACTIVE_ROUTE_SMOKE_CONTROL_ENV] !== ACTIVE_ROUTE_SMOKE_CONTROL_MODE) return () => {};

  let buffered = "";
  const onData = (chunk) => {
    buffered += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline < 0) break;
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message?.type !== ACTIVE_ROUTE_SMOKE_STOP_TYPE) continue;
        if (!ALLOWED_STOP_SIGNALS.has(message.signal)) continue;
        onStop(message.signal);
      } catch {
        // Ignore malformed control input; stdin is not a public command surface.
      }
    }
  };
  input.on("data", onData);
  input.resume?.();
  input.unref?.();
  return () => {
    input.off("data", onData);
    input.pause?.();
  };
}

export function requestActiveRouteSmokeStop(child, signal = "SIGTERM") {
  if (!ALLOWED_STOP_SIGNALS.has(signal)) return false;
  if (!child?.stdin || child.stdin.destroyed || !child.stdin.writable) return false;
  try {
    child.stdin.write(`${JSON.stringify({
      type: ACTIVE_ROUTE_SMOKE_STOP_TYPE,
      signal,
    })}\n`);
    return true;
  } catch {
    return false;
  }
}

export function execActiveRouteSmoke(file, args, options = {}) {
  const {
    cleanupTimeoutMs = DEFAULT_CLEANUP_TIMEOUT_MS,
    timeout = 0,
    env = process.env,
    ...execOptions
  } = options;
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let timeoutHandle = null;
    let forceHandle = null;
    const child = execFile(file, args, {
      ...execOptions,
      env: {
        ...env,
        [ACTIVE_ROUTE_SMOKE_CONTROL_ENV]: ACTIVE_ROUTE_SMOKE_CONTROL_MODE,
      },
    }, (error, stdout, stderr) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (forceHandle) clearTimeout(forceHandle);
      if (error) {
        error.timedOut = timedOut;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin?.on("error", () => {
      // The child may finish between the timeout firing and the control write.
    });
    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        requestActiveRouteSmokeStop(child, "SIGTERM");
        forceHandle = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, Math.max(1, cleanupTimeoutMs));
        forceHandle.unref?.();
      }, timeout);
      timeoutHandle.unref?.();
    }
  });
}
