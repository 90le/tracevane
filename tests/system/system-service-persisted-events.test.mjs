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
    pluginName: "OpenClaw Studio",
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
