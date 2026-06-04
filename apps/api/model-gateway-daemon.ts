import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStandaloneStudioConfig } from "./config.js";
import { createModelGatewayDaemon } from "./modules/model-gateway/daemon.js";

const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

async function main(): Promise<void> {
  const config = createStandaloneStudioConfig();
  const daemon = createModelGatewayDaemon(config, {
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
