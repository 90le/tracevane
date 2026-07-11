import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createStandaloneTracevaneConfig } from "./config.js";
import { createModelGatewayDaemon } from "./modules/model-gateway/daemon.js";
import type { ModelGatewaySupervisorKind } from "../../types/model-gateway.js";

const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

const SUPERVISORS = new Set<ModelGatewaySupervisorKind>([
  "systemd-user",
  "launchd-user",
  "scheduled-task",
  "session",
  "none",
  "unknown",
]);

function parseCliOptions(args: string[]): {
  configPath?: string;
  stateDir?: string;
  host?: string;
  port?: string;
  supervisor?: string;
  serviceName?: string;
} {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      config: { type: "string" },
      "state-dir": { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
      supervisor: { type: "string" },
      "service-name": { type: "string" },
    },
  });
  return {
    configPath: values.config,
    stateDir: values["state-dir"],
    host: values.host,
    port: values.port,
    supervisor: values.supervisor,
    serviceName: values["service-name"],
  };
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : undefined;
}

function parseSupervisor(value: string | undefined): ModelGatewaySupervisorKind | undefined {
  return SUPERVISORS.has(value as ModelGatewaySupervisorKind)
    ? value as ModelGatewaySupervisorKind
    : undefined;
}

async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const configPath = cli.configPath
    ? path.resolve(cli.configPath)
    : undefined;
  const stateDir = cli.stateDir
    ? path.resolve(cli.stateDir)
    : configPath
      ? path.dirname(configPath)
      : undefined;
  const config = createStandaloneTracevaneConfig({
    ...(stateDir ? { openclawRoot: stateDir } : {}),
    ...(configPath ? { openclawConfigFile: configPath } : {}),
  });
  const daemon = createModelGatewayDaemon(config, {
    host: cli.host || process.env.MODEL_GATEWAY_HOST,
    port: parsePort(cli.port || process.env.MODEL_GATEWAY_PORT),
    supervisor: parseSupervisor(
      cli.supervisor || process.env.MODEL_GATEWAY_SUPERVISOR,
    ),
    serviceName: cli.serviceName || process.env.MODEL_GATEWAY_SERVICE_NAME,
    logger,
  });
  await daemon.start();

  const shutdown = async () => {
    await daemon.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    shutdown().catch((error) => {
      logger.error("model-gateway-daemon: SIGINT shutdown failed", error);
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    shutdown().catch((error) => {
      logger.error("model-gateway-daemon: SIGTERM shutdown failed", error);
      process.exit(1);
    });
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error("model-gateway-daemon: failed to start", error);
    process.exit(1);
  });
}
