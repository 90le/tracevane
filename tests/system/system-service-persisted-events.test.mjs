import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemService } from "../../dist/apps/api/modules/system/service.js";
import { createConfigService } from "../../dist/apps/api/modules/config/service.js";

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-system-service-"));
  fs.mkdirSync(path.join(root, "system"), { recursive: true });
  fs.writeFileSync(path.join(root, "config.json"), "{}\n", "utf8");
  return root;
}

function createConfig(root) {
  return {
    pluginId: "studio",
    pluginName: "Tracevane",
    version: "0.1.21",
    port: 3760,
    autoStart: false,
    openclawRoot: root,
    openclawConfigFile: path.join(root, "config.json"),
    projectRoot: root,
    webDistDir: path.join(root, "dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "/studio",
    transport: {
      preferredMode: "gateway",
      standalone: { enabled: false, port: 3760 },
      gateway: { enabled: true, basePath: "/studio" },
    },
  };
}

test("system service persists action events into the system state directory", async () => {
  const root = createTempRoot();
  const service = createSystemService(createConfig(root), () => 0);

  await service.repairBootstrap();

  const jsonlPath = path.join(root, "system", "system-events.jsonl");
  assert.equal(fs.existsSync(jsonlPath), true);
  const lines = fs.readFileSync(jsonlPath, "utf8").trim().split("\n");
  assert.ok(lines.length > 0);
});

test("config write success persists config_change event into system-events.jsonl", () => {
  const root = createTempRoot();
  fs.mkdirSync(path.join(root, "studio"), { recursive: true });
  const config = createConfig(root);
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        gateway: {
          controlUi: {
            basePath: "/studio",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "studio", "device-trust.json"),
    `${JSON.stringify({ autoApproveLocalHelper: true }, null, 2)}\n`,
    "utf8",
  );

  const service = createConfigService(config);
  const summary = service.getSummary();
  const payload = {
    defaults: summary.defaults,
    compaction: summary.compaction,
    sandbox: summary.sandbox,
    tools: summary.tools,
    execApprovals: {
      defaults: summary.execApprovals.defaults,
      agents: summary.execApprovals.agents,
    },
    session: summary.session,
    messages: summary.messages,
    providers: summary.providers.map((provider) => ({
      id: provider.id,
      api: provider.api,
      baseUrl: provider.baseUrl,
      models: provider.models,
      extra: provider.extra,
    })),
    gateway: {
      controlUi: {
        basePath: "/studio-v2",
      },
    },
  };

  service.saveConfig(payload);

  const jsonlPath = path.join(root, "system", "system-events.jsonl");
  assert.equal(fs.existsSync(jsonlPath), true);
  const rows = fs
    .readFileSync(jsonlPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const configChangeEvent = rows.find((row) => row.kind === "config_change");
  assert.ok(configChangeEvent);
  assert.equal(configChangeEvent.category, "audit");
  assert.equal(configChangeEvent.sourceModule, "config");
});

test("system service recovers stale failed upgrade status after the installed version reaches the target", async () => {
  const root = createTempRoot();
  fs.mkdirSync(path.join(root, "studio"), { recursive: true });
  const config = {
    ...createConfig(root),
    version: "0.1.25",
  };
  const upgradeStatusPath = path.join(root, "studio", "upgrade-status.json");
  fs.writeFileSync(
    upgradeStatusPath,
    `${JSON.stringify(
      {
        checkedAt: "2026-04-27T00:00:00.000Z",
        status: "failed",
        running: false,
        pid: null,
        mode: "gateway",
        targetVersion: "0.1.25",
        startedAt: "2026-04-27T00:00:00.000Z",
        finishedAt: "2026-04-27T00:01:00.000Z",
        logFile: path.join(root, "studio", "upgrade.log"),
        lastError: "installer log marker missing",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const service = createSystemService(config, () => 0);
  const status = await service.getStudioUpgradeStatus();

  assert.equal(status.status, "succeeded");
  assert.equal(status.running, false);
  assert.equal(status.pid, null);
  assert.equal(status.targetVersion, "0.1.25");
  assert.equal(status.lastError, "");

  const persisted = JSON.parse(fs.readFileSync(upgradeStatusPath, "utf8"));
  assert.equal(persisted.status, "succeeded");
  assert.equal(persisted.lastError, "");
});
