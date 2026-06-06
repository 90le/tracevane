import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import type { ChannelConnectorsDaemonRuntimeConfig } from "../../../../types/channel-connectors.js";

function configPathFromArgv(argv: string[]): string {
  const index = argv.findIndex((item) => item === "--config");
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find((item) => item.startsWith("--config="));
  if (inline) return inline.slice("--config=".length);
  throw new Error("Missing --config <path>");
}

function readConfig(filePath: string): ChannelConnectorsDaemonRuntimeConfig {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ChannelConnectorsDaemonRuntimeConfig;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendLog(filePath: string, message: string): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${new Date().toISOString()} ${message}\n`, "utf8");
}

function writeRuntime(config: ChannelConnectorsDaemonRuntimeConfig): void {
  ensureDir(path.dirname(config.paths.runtime));
  fs.writeFileSync(config.paths.runtime, JSON.stringify({
    version: 1,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    management: config.management,
    projects: config.projects.map((project) => ({
      id: project.id,
      agent: project.agent,
      platformBindings: project.platformBindings.length,
    })),
  }, null, 2), "utf8");
}

function startHttp(config: ChannelConnectorsDaemonRuntimeConfig): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }
    if (req.url === "/status") {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok: true,
        implementation: "studio-native",
        pid: process.pid,
        projects: config.projects.length,
        platformBindings: config.projects.reduce((sum, project) => sum + project.platformBindings.length, 0),
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  server.listen(config.management.port, config.management.host);
  return server;
}

async function main(): Promise<void> {
  const configPath = configPathFromArgv(process.argv.slice(2));
  const config = readConfig(configPath);
  ensureDir(config.paths.root);
  ensureDir(config.paths.state);
  writeRuntime(config);
  appendLog(config.paths.log, "Studio native Channel Connectors daemon started");
  const server = startHttp(config);

  const stop = () => {
    appendLog(config.paths.log, "Studio native Channel Connectors daemon stopping");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
