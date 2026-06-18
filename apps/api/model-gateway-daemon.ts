import path from "node:path";
import { fileURLToPath } from "node:url";
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
  "windows-service",
  "scheduled-task",
  "none",
  "unknown",
]);

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
  const config = createStandaloneTracevaneConfig();
  const daemon = createModelGatewayDaemon(config, {
    host: process.env.MODEL_GATEWAY_HOST,
    port: parsePort(process.env.MODEL_GATEWAY_PORT),
    supervisor: parseSupervisor(process.env.MODEL_GATEWAY_SUPERVISOR),
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
