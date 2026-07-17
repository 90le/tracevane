import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createStandaloneTracevaneConfig } from "./config.js";
import {
  createOpenClawRecoveryDaemon,
  type OpenClawRecoveryDaemonOptions,
} from "./modules/openclaw-recovery/daemon.js";
import type { TracevaneServerConfig } from "../../types/api.js";
import {
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  type OpenClawRecoverySupervisorKind,
} from "../../types/openclaw-recovery.js";

const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

const SUPERVISORS = new Set<OpenClawRecoverySupervisorKind>([
  "systemd-user",
  "launchd-user",
  "scheduled-task",
  "session",
  "none",
  "unknown",
]);

export interface OpenClawRecoveryDaemonCliArgs {
  projectRoot?: string;
  openclawRoot?: string;
  controlPort?: string;
  supervisor?: string;
  serviceName?: string;
  configPath?: string;
}

export function parseOpenClawRecoveryDaemonArgs(
  args: string[],
): OpenClawRecoveryDaemonCliArgs {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      "project-root": { type: "string" },
      "openclaw-root": { type: "string" },
      "control-port": { type: "string" },
      supervisor: { type: "string" },
      "service-name": { type: "string" },
      config: { type: "string" },
    },
  });
  return {
    projectRoot: values["project-root"],
    openclawRoot: values["openclaw-root"],
    controlPort: values["control-port"],
    supervisor: values.supervisor,
    serviceName: values["service-name"],
    configPath: values.config,
  };
}

function parsePort(
  value: string | undefined,
  strict = false,
): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  if (Number.isInteger(port) && port >= 0 && port <= 65535) return port;
  if (strict) throw new TypeError(`Invalid Recovery control port: ${value}`);
  return undefined;
}

function parseSupervisor(
  value: string | undefined,
  strict = false,
): OpenClawRecoverySupervisorKind | undefined {
  if (!value) return undefined;
  if (SUPERVISORS.has(value as OpenClawRecoverySupervisorKind)) {
    return value as OpenClawRecoverySupervisorKind;
  }
  if (strict) throw new TypeError(`Invalid Recovery supervisor: ${value}`);
  return undefined;
}

export function resolveOpenClawRecoveryDaemonLaunch(
  args: string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): {
  config: TracevaneServerConfig;
  daemonOptions: Pick<
    OpenClawRecoveryDaemonOptions,
    "controlPort" | "supervisor" | "serviceName"
  >;
} {
  const cli = parseOpenClawRecoveryDaemonArgs(args);
  const projectRoot = cli.projectRoot
    ? path.resolve(cli.projectRoot)
    : undefined;
  const configPath = cli.configPath
    ? path.resolve(cli.configPath)
    : undefined;
  const openclawRootInput = cli.openclawRoot
    || environment.OPENCLAW_STATE_DIR
    || (configPath ? path.dirname(configPath) : undefined);
  const openclawRoot = openclawRootInput
    ? path.resolve(openclawRootInput)
    : undefined;
  const config = createStandaloneTracevaneConfig({
    ...(projectRoot ? { projectRoot } : {}),
    ...(openclawRoot ? { openclawRoot } : {}),
    ...(configPath ? { openclawConfigFile: configPath } : {}),
  });
  return {
    config,
    daemonOptions: {
      controlPort: parsePort(
        cli.controlPort || environment.OPENCLAW_RECOVERY_CONTROL_PORT,
        cli.controlPort !== undefined,
      ) ?? OPENCLAW_RECOVERY_DEFAULT_PORT,
      supervisor: parseSupervisor(
        cli.supervisor || environment.OPENCLAW_RECOVERY_SUPERVISOR,
        cli.supervisor !== undefined,
      ),
      serviceName:
        cli.serviceName || environment.OPENCLAW_RECOVERY_SERVICE_NAME,
    },
  };
}

async function main(): Promise<void> {
  const launch = resolveOpenClawRecoveryDaemonLaunch(process.argv.slice(2));
  const daemon = createOpenClawRecoveryDaemon(launch.config, {
    ...launch.daemonOptions,
    logger,
  });

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (reason: string, exitCode: number) => {
    shutdownPromise ??= (async () => {
      try {
        await daemon.stop();
      } catch (error) {
        logger.error(`openclaw-recovery-daemon: ${reason} cleanup failed`, error);
        exitCode = 1;
      }
      process.exit(exitCode);
    })();
    return shutdownPromise;
  };
  process.once("SIGINT", () => {
    shutdown("SIGINT", 0).catch((error) => {
      logger.error("openclaw-recovery-daemon: SIGINT shutdown failed", error);
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    shutdown("SIGTERM", 0).catch((error) => {
      logger.error("openclaw-recovery-daemon: SIGTERM shutdown failed", error);
      process.exit(1);
    });
  });
  process.once("uncaughtException", (error) => {
    logger.error("openclaw-recovery-daemon: uncaught exception", error);
    void shutdown("uncaughtException", 1);
  });
  process.once("unhandledRejection", (error) => {
    logger.error("openclaw-recovery-daemon: unhandled rejection", error);
    void shutdown("unhandledRejection", 1);
  });

  await daemon.start();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error("openclaw-recovery-daemon: failed to start", error);
    process.exit(1);
  });
}
