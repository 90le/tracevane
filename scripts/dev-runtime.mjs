import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnNpm(args, options) {
  // npm.cmd is not directly executable by child_process on Windows. npm always
  // supplies npm_execpath to lifecycle scripts, so invoke that JavaScript entry
  // point with the current Node executable instead of invoking a shell.
  if (process.env.npm_execpath) {
    return spawn(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  return spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    ...options,
    shell: process.platform === "win32",
  });
}

function runtimePaths(mode) {
  const runtimeDir = join(rootDir, ".tmp", mode === "fresh" ? "dev-fresh" : "dev-runtime");
  return {
    runtimeDir,
    pidDir: join(runtimeDir, "pids"),
    logDir: join(runtimeDir, "logs"),
    backendPid: join(runtimeDir, "pids", "backend.pid"),
    frontendPid: join(runtimeDir, "pids", "frontend.pid"),
    backendLog: join(runtimeDir, "logs", "backend.log"),
    frontendLog: join(runtimeDir, "logs", "frontend.log"),
    envFile: join(runtimeDir, mode === "fresh" ? "runtime.env" : "ports.env"),
  };
}

function ensureRuntime(paths) {
  mkdirSync(paths.pidDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopManagedProcess(pidFile, label) {
  let pid;
  try {
    pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
  } catch {
    return;
  }
  rmSync(pidFile, { force: true });
  if (!Number.isSafeInteger(pid) || !isRunning(pid)) return;

  console.log(`Stopping previous ${label} process (pid=${pid})`);
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
  }
  for (let attempt = 0; attempt < 20 && isRunning(pid); attempt += 1) await wait(250);
  if (isRunning(pid) && process.platform !== "win32") {
    try { process.kill(-pid, "SIGKILL"); } catch { process.kill(pid, "SIGKILL"); }
  }
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

async function findFreePort(startPort) {
  let port = startPort;
  while (!(await portIsFree(port))) port += 1;
  return port;
}

async function waitForHttp(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`${label} did not become ready: ${url}`);
}

function startSupervisor({ target, logFile, pidFile, env }) {
  writeFileSync(logFile, "");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervise", target, logFile], {
    cwd: rootDir,
    detached: true,
    env: { ...process.env, ...env },
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);
  return child.pid;
}

function runSupervisor(target, logFile) {
  const args = target === "backend"
    ? ["run", "dev:api"]
    : ["run", "dev", "--workspace=apps/web", "--", "--host", "0.0.0.0", "--port", process.env.TRACEVANE_WEB_PORT, "--force"];
  const launch = () => {
    appendFileSync(logFile, `\n[dev-runtime] starting ${target} at ${new Date().toISOString()}\n`);
    const fd = openSync(logFile, "a");
    const child = spawnNpm(args, { cwd: rootDir, env: process.env, stdio: ["ignore", fd, fd], windowsHide: true });
    child.once("close", (code, signal) => {
      closeSync(fd);
      appendFileSync(logFile, `[dev-runtime] ${target} exited (${signal ?? code}); restarting in 1s\n`);
      setTimeout(launch, 1_000);
    });
    child.once("error", (error) => appendFileSync(logFile, `[dev-runtime] ${target} spawn failed: ${error.message}\n`));
  };
  launch();
}

async function refresh(mode) {
  const paths = runtimePaths(mode);
  const requestedBackendPort = Number.parseInt(process.env.TRACEVANE_API_PORT ?? "3761", 10);
  const frontendPort = Number.parseInt(process.env.TRACEVANE_WEB_PORT ?? (mode === "fresh" ? "5177" : "5176"), 10);
  ensureRuntime(paths);
  console.log(`Refreshing Tracevane ${mode === "fresh" ? "canonical" : "development"} runtime`);
  await stopManagedProcess(paths.backendPid, "backend");
  await stopManagedProcess(paths.frontendPid, "frontend");

  if (!(await portIsFree(frontendPort))) {
    throw new Error(`Frontend port ${frontendPort} is already in use. Stop its owner or set TRACEVANE_WEB_PORT.`);
  }
  const backendPort = await findFreePort(requestedBackendPort);
  if (backendPort !== requestedBackendPort) console.log(`Backend port ${requestedBackendPort} is busy, using ${backendPort} instead`);

  if (mode === "fresh") {
    await new Promise((resolve, reject) => {
      const build = spawnNpm(["run", "build"], { cwd: rootDir, stdio: "inherit", windowsHide: true });
      build.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Build failed with status ${code}`)));
      build.once("error", reject);
    });
  }

  console.log(`Starting backend on port ${backendPort}`);
  const backendPid = startSupervisor({ target: "backend", logFile: paths.backendLog, pidFile: paths.backendPid, env: { TRACEVANE_API_PORT: String(backendPort) } });
  await waitForHttp(`http://127.0.0.1:${backendPort}/api/system/health`, "Backend");

  console.log(`Starting frontend on port ${frontendPort}`);
  const frontendPid = startSupervisor({ target: "frontend", logFile: paths.frontendLog, pidFile: paths.frontendPid, env: {
    TRACEVANE_USE_EXTERNAL_API: "1", TRACEVANE_API_PORT: String(backendPort), TRACEVANE_WEB_PORT: String(frontendPort),
  } });
  await waitForHttp(`http://127.0.0.1:${frontendPort}`, "Frontend");

  writeFileSync(paths.envFile, `TRACEVANE_API_PORT=${backendPort}\nTRACEVANE_WEB_PORT=${frontendPort}\nTRACEVANE_WEB_URL=http://127.0.0.1:${frontendPort}\nTRACEVANE_API_URL=http://127.0.0.1:${backendPort}\nBACKEND_PID=${backendPid}\nFRONTEND_PID=${frontendPid}\n`);
  console.log(`\nTracevane dev processes are ready\nFrontend: http://127.0.0.1:${frontendPort}\nBackend:  http://127.0.0.1:${backendPort}\nFrontend log: ${paths.frontendLog}\nBackend log: ${paths.backendLog}`);
}

const [command = "restart", target, logFile] = process.argv.slice(2);
if (command === "supervise") runSupervisor(target, logFile);
else refresh(command === "fresh" ? "fresh" : "restart").catch((error) => { console.error(error.message); process.exitCode = 1; });
