#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configModulePath = path.join(repoRoot, "dist", "apps", "api", "config.js");
const serviceModulePath = path.join(repoRoot, "dist", "apps", "api", "modules", "model-gateway", "service.js");
const daemonEntryPath = path.join(repoRoot, "dist", "apps", "api", "model-gateway-daemon.js");

const APPLY = process.env.TRACEVANE_VERIFY_MODEL_GATEWAY_SERVICE_APPLY === "1";
const STOP_AFTER = process.env.TRACEVANE_VERIFY_MODEL_GATEWAY_SERVICE_STOP_AFTER === "1";
const RESTART = process.env.TRACEVANE_VERIFY_MODEL_GATEWAY_SERVICE_RESTART !== "0";

function requireBuiltArtifact(filePath) {
  if (fs.existsSync(filePath)) return;
  throw new Error(`Missing ${path.relative(repoRoot, filePath)}. Run npm run build:api before service-manager verification.`);
}

function commandSummary(result) {
  return {
    label: result.label,
    command: result.command,
    args: result.args,
    ok: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error,
  };
}

function responseSummary(response) {
  const daemon = response.lifecycle.localDaemon;
  return {
    action: response.action,
    applied: response.applied,
    templateWritten: response.templateWritten,
    installed: response.installed,
    supervisor: response.plan.supervisor,
    serviceName: response.plan.serviceName,
    configPath: response.plan.selectedTemplate.configPath,
    serviceManager: response.serviceManager,
    bootstrap: response.bootstrap,
    localDaemon: {
      state: daemon.state,
      runtimeMode: daemon.runtimeMode,
      endpoint: daemon.endpoint,
      pid: daemon.pid,
      supervisor: daemon.supervisor,
      survivesControlPlaneCrash: daemon.survivesControlPlaneCrash,
    },
    commandsRun: response.commandsRun.map(commandSummary),
  };
}

function hasCommandFailure(response) {
  return response.commandsRun.some((command) => !command.ok);
}

async function main() {
  requireBuiltArtifact(configModulePath);
  requireBuiltArtifact(serviceModulePath);
  requireBuiltArtifact(daemonEntryPath);

  const [{ createStandaloneTracevaneConfig }, { createModelGatewayService }] = await Promise.all([
    import(pathToFileURL(configModulePath).href),
    import(pathToFileURL(serviceModulePath).href),
  ]);

  const config = createStandaloneTracevaneConfig();
  const service = createModelGatewayService(config);
  const results = [];

  results.push(await service.manageDaemonService(undefined, {
    action: "install",
    apply: false,
  }));
  results.push(await service.manageDaemonService(undefined, {
    action: "status",
    runCommands: true,
  }));
  results.push(await service.manageDaemonService(undefined, {
    action: "ensure-running",
    apply: false,
  }));

  if (APPLY) {
    results.push(await service.manageDaemonService(undefined, {
      action: "install",
      apply: true,
      runCommands: true,
    }));
    results.push(await service.manageDaemonService(undefined, {
      action: "start",
      apply: true,
      runCommands: true,
    }));
    results.push(await service.manageDaemonService(undefined, {
      action: "status",
      runCommands: true,
    }));
    if (RESTART) {
      results.push(await service.manageDaemonService(undefined, {
        action: "restart",
        apply: true,
        runCommands: true,
      }));
      results.push(await service.manageDaemonService(undefined, {
        action: "status",
        runCommands: true,
      }));
    }
    if (STOP_AFTER) {
      results.push(await service.manageDaemonService(undefined, {
        action: "stop",
        apply: true,
        runCommands: true,
      }));
      results.push(await service.manageDaemonService(undefined, {
        action: "status",
        runCommands: true,
      }));
    }
  }

  const commandFailures = results.filter(hasCommandFailure);
  const output = {
    ok: APPLY ? commandFailures.length === 0 : true,
    mode: APPLY ? "apply" : "probe",
    apply: APPLY,
    restart: RESTART,
    stopAfter: STOP_AFTER,
    checkedAt: new Date().toISOString(),
    repoRoot,
    config: {
      projectRoot: config.projectRoot,
      openclawRoot: config.openclawRoot,
    },
    note: APPLY
      ? "Executed real service-manager install/start/status/restart commands."
      : "Probe mode is read-only except for service-manager status commands; set TRACEVANE_VERIFY_MODEL_GATEWAY_SERVICE_APPLY=1 to execute install/start/restart.",
    results: results.map(responseSummary),
  };

  console.log(JSON.stringify(output, null, 2));
  if (APPLY && commandFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
