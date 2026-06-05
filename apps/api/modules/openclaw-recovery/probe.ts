import http from "node:http";

export interface OpenClawGatewayHttpProbeCheck {
  path: string;
  ok: boolean;
  connected: boolean;
  statusCode: number | null;
  error: string;
}

export interface OpenClawGatewayDeepProbeResult {
  ok: boolean;
  connected: boolean;
  checks: OpenClawGatewayHttpProbeCheck[];
  error: string;
}

function normalizeProbePath(value: string | null | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function summarizeProbeError(check: OpenClawGatewayHttpProbeCheck): string {
  if (check.ok) return "";
  if (check.statusCode !== null) {
    return `${check.path} returned HTTP ${check.statusCode}`;
  }
  return `${check.path} ${check.error || "did not respond"}`;
}

function probeOpenClawGatewayPath(
  port: number,
  path: string,
  timeoutMs: number,
  isOkStatus: (statusCode: number) => boolean,
): Promise<OpenClawGatewayHttpProbeCheck> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (check: OpenClawGatewayHttpProbeCheck) => {
      if (settled) return;
      settled = true;
      resolve(check);
    };
    const normalizedPath = normalizeProbePath(path);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: normalizedPath,
        method: "GET",
        timeout: Math.max(50, timeoutMs),
      },
      (res) => {
        res.resume();
        const statusCode = res.statusCode || 0;
        finish({
          path: normalizedPath,
          ok: isOkStatus(statusCode),
          connected: true,
          statusCode,
          error: "",
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      finish({
        path: normalizedPath,
        ok: false,
        connected: false,
        statusCode: null,
        error: "timed out",
      });
    });
    req.on("error", (error) => {
      finish({
        path: normalizedPath,
        ok: false,
        connected: false,
        statusCode: null,
        error: error.message,
      });
    });
    req.end();
  });
}

export function probeOpenClawGateway(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return probeOpenClawGatewayPath(port, "/", timeoutMs, () => true).then(
    (check) => check.connected,
  );
}

export async function probeOpenClawGatewayDeep(input: {
  port: number;
  timeoutMs: number;
  controlUiBasePath?: string | null;
}): Promise<OpenClawGatewayDeepProbeResult> {
  const root = await probeOpenClawGatewayPath(
    input.port,
    "/",
    input.timeoutMs,
    () => true,
  );
  const controlPath = normalizeProbePath(input.controlUiBasePath);
  const checks = [root];

  if (controlPath !== "/") {
    checks.push(
      await probeOpenClawGatewayPath(
        input.port,
        controlPath,
        input.timeoutMs,
        (statusCode) => statusCode < 500 && statusCode !== 404,
      ),
    );
  }

  const failed = checks.find((check) => !check.ok);
  return {
    ok: !failed,
    connected: checks.some((check) => check.connected),
    checks,
    error: failed ? summarizeProbeError(failed) : "",
  };
}
