import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStandaloneTracevaneConfig } from "./config.js";
import { createOpenClawRecoveryDaemon } from "./modules/openclaw-recovery/daemon.js";

const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

function parsePort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535
    ? port
    : undefined;
}

async function main(): Promise<void> {
  const config = createStandaloneTracevaneConfig();
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: parsePort(process.env.OPENCLAW_RECOVERY_CONTROL_PORT),
    logger,
  });
  await daemon.start();

  const shutdown = async () => {
    await daemon.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    shutdown().catch((error) => {
      logger.error("openclaw-recovery-daemon: SIGINT shutdown failed", error);
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    shutdown().catch((error) => {
      logger.error("openclaw-recovery-daemon: SIGTERM shutdown failed", error);
      process.exit(1);
    });
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error("openclaw-recovery-daemon: failed to start", error);
    process.exit(1);
  });
}
