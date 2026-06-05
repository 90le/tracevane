import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const contextSource = read("apps/api/core/context.ts");
const indexSource = read("apps/api/index.ts");
const serverSource = read("apps/api/server.ts");
const routesSource = read("apps/api/modules/openclaw-recovery/routes.ts");
const serviceSource = read("apps/api/modules/openclaw-recovery/service.ts");
const daemonSource = read("apps/api/modules/openclaw-recovery/daemon.ts");
const cliBootstrapSource = read("apps/api/modules/openclaw-recovery/cli-bootstrap.ts");
const gatewayRuntimeSource = read("apps/api/modules/openclaw-recovery/gateway-runtime.ts");
const gatewayServiceSource = read("apps/api/modules/openclaw-recovery/gateway-service.ts");
const probeSource = read("apps/api/modules/openclaw-recovery/probe.ts");
const repairSource = read("apps/api/modules/openclaw-recovery/repair.ts");
const systemServiceSource = read("apps/api/modules/system/service.ts");
const systemRoutesSource = read("apps/api/modules/system/routes.ts");
const typesIndexSource = read("types/index.ts");

test("OpenClaw recovery service is wired into the API context and routes", () => {
  assert.match(contextSource, /openclawRecovery: OpenClawRecoveryService/);
  assert.match(indexSource, /createOpenClawRecoveryService/);
  assert.match(indexSource, /openclawRecovery/);
  assert.match(serverSource, /registerOpenClawRecoveryRoutes\(router\)/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/status/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/events/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/backups/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/run/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/daemon-service/);
  assert.match(typesIndexSource, /openclaw-recovery/);
});

test("recovery daemon separates lightweight probes from heavy repair commands", () => {
  assert.match(daemonSource, /probeOpenClawGateway/);
  assert.match(daemonSource, /failureThresholdMs/);
  assert.match(daemonSource, /repairCooldownMs/);
  assert.match(daemonSource, /runOpenClawRecoveryRepair/);
  assert.match(serviceSource, /getRecoveryDaemonServiceSnapshot/);
  assert.match(serviceSource, /applyRecoveryDaemonServiceAction/);
  assert.match(serviceSource, /action === "config-repair"/);
  assert.match(serviceSource, /runOpenClawRecoveryConfigRepair/);
  assert.match(cliBootstrapSource, /ensureOpenClawCliAvailable/);
  assert.match(cliBootstrapSource, /\["install", "-g", manifest\.packageSpec/);
  assert.match(gatewayRuntimeSource, /takeoverOpenClawGatewayListeners/);
  assert.match(gatewayRuntimeSource, /isOpenClawGatewayProcess/);
  assert.match(gatewayServiceSource, /parseOpenClawGatewayStatus/);
  assert.match(gatewayServiceSource, /assessOpenClawGatewayServiceStatus/);
  assert.match(probeSource, /probeOpenClawGatewayDeep/);
  assert.match(repairSource, /inspectStudioWebBundle/);
  assert.match(repairSource, /\["run", "build:web"\]/);
  assert.match(repairSource, /REPAIR_LOCK_STALE_MS/);
  assert.match(repairSource, /repairLockLooksStale/);
  assert.match(repairSource, /process\.kill\(pid, 0\)/);
  assert.match(daemonSource, /\/backups/);
  assert.match(daemonSource, /\/restore-backup/);
  assert.doesNotMatch(daemonSource, /openclaw", \["doctor"/);
});

test("system hot paths avoid deep diagnostics unless explicitly requested", () => {
  assert.match(systemRoutesSource, /\/api\/system\/diagnostics/);
  assert.doesNotMatch(systemRoutesSource, /\/api\/system\/recovery/);
  assert.match(routesSource, /\/api\/openclaw-recovery\/status/);
  assert.match(systemServiceSource, /async getRuntimeSummary\(\): Promise<SystemRuntimeSummaryPayload>/);
  const runtimeSummaryBlock = systemServiceSource.match(
    /async getRuntimeSummary\(\): Promise<SystemRuntimeSummaryPayload>[\s\S]*?async getTerminalActionSuggestions/,
  )?.[0] || "";
  assert.doesNotMatch(runtimeSummaryBlock, /this\.getDiagnostics\(\)/);

  const eventListBlock = systemServiceSource.match(
    /async listEvents\(limit = 100\): Promise<SystemEventRecord\[]>[\s\S]*?async getEventSummary/,
  )?.[0] || "";
  assert.doesNotMatch(eventListBlock, /this\.getDiagnostics\(\)/);
  assert.match(eventListBlock, /systemEventWriter\.listPersistedEvents\(limit\)/);

  const eventSummaryBlock = systemServiceSource.match(
    /async getEventSummary\(limit = 100\): Promise<SystemEventSummaryPayload>[\s\S]*?\n    },/,
  )?.[0] || "";
  assert.doesNotMatch(eventSummaryBlock, /this\.getDiagnostics\(\)/);
  assert.match(eventSummaryBlock, /buildSystemEventSummaryCards/);
});
