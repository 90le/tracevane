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

test("all daemon domains expose the normalized supervisor contract", () => {
  const source = read("types/supervisor.ts");
  assert.match(source, /"session" \| "persistent"/);
  assert.match(source, /"not-installed"/);
  assert.match(source, /"stale-config"/);
  assert.match(source, /"task-not-found"/);
  assert.match(source, /"permission-denied"/);
  for (const file of [
    "types/model-gateway.ts",
    "types/channel-connectors.ts",
    "types/openclaw-recovery.ts",
  ]) {
    assert.match(read(file), /TracevaneServiceManagerStatus/);
  }
});

test("Channel Connectors exposes the full shared manager contract while keeping reload domain-only", () => {
  const source = read("types/channel-connectors.ts");
  assert.match(source, /mode\?:\s*TracevaneServiceMode/);
  assert.match(
    source,
    /ChannelConnectorsDaemonAction\s*=\s*TracevaneServiceAction\s*\|\s*"reload"/,
  );
  assert.match(source, /manager:\s*TracevaneServiceManagerStatus/);
  assert.doesNotMatch(
    source,
    /ChannelConnectorsDaemonManagerStatus\s+extends\s+Partial</,
  );
  assert.match(source, /errorCode:/);
  assert.match(source, /errorMessage:/);
  assert.match(source, /durationMs:/);

  const sharedActions = read("types/supervisor.ts");
  assert.match(sharedActions, /TracevaneServiceAction[^;]+"repair"/);
  assert.match(sharedActions, /TracevaneServiceAction[^;]+"uninstall"/);
  assert.doesNotMatch(sharedActions, /TracevaneServiceAction[^;]+"reload"/);

  const serviceSource = read("apps/api/modules/channel-connectors/service.ts");
  assert.match(serviceSource, /export function createChannelConnectorsServiceDefinition/);
  for (const removed of [
    "buildSystemdTemplate",
    "buildLaunchdTemplate",
    "runDefaultCommand",
    "summarizeManager",
    "runStatusCommands",
    "isTemplateCurrent",
  ]) {
    assert.doesNotMatch(serviceSource, new RegExp(`function\\s+${removed}\\b`), removed);
  }

  const daemonSource = read("apps/api/modules/channel-connectors/daemon.ts");
  assert.match(daemonSource, /export function parseChannelConnectorsDaemonConfigPath/);
  assert.match(daemonSource, /const server = await startHttp/);
  assert.match(daemonSource, /return removeOwnedRuntimeMetadata\(runtimePath, ownedPid\)/);
  assert.match(daemonSource, /cleanupChannelConnectorsRuntimeMetadata\(config\.paths\.runtime\)/);
  assert.match(daemonSource, /invokedPath === fileURLToPath\(import\.meta\.url\)/);
  assert.doesNotMatch(daemonSource, /\nmain\(\)\.catch/);
});
