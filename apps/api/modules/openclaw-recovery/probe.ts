import http from "node:http";

export function probeOpenClawGateway(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        method: "GET",
        timeout: Math.max(50, timeoutMs),
      },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}
