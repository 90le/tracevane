import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createChannelConnectorsService } from "../../dist/apps/api/modules/channel-connectors/service.js";

function createConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  return {
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot,
    openclawConfigFile: path.join(openclawRoot, "openclaw.json"),
    projectRoot: path.join(root, "workspace"),
    webDistDir: path.join(root, "web-dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: { standalone: { enabled: true, port: 3760 }, gateway: { enabled: true, basePath: "/tracevane" } },
  };
}

test("Channel Connectors persists only v3 resources and redacts generated runtime mappings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-v3-"));
  const config = createConfig(root);
  const service = createChannelConnectorsService(config, {
    homeDir: root,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  const initial = service.getV3Config();
  assert.equal(initial.config.version, 3);
  assert.equal(initial.config.targets[0].id, "default-codex");

  const candidate = structuredClone(initial.config);
  candidate.accounts.push({
    id: "feishu-main",
    platform: "feishu",
    displayName: "Feishu main",
    lifecycle: "enabled",
    externalAccountId: "cli_example",
    botId: null,
    credentials: { appId: "cli_example", appSecret: "secret-value" },
    transport: { apiUrl: "https://open.feishu.cn" },
    security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
    advanced: {},
  });
  candidate.deliveryPolicies.push({
    id: "feishu-main-policy",
    accountRef: "feishu-main",
    defaultTargetRef: "default-codex",
    defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
    defaultAccessPolicy: { allowlist: [], adminUsers: [], disabledCommands: [], mentionRequired: false },
    rules: [],
  });

  const plan = service.planV3Config({ config: candidate, expectedRevision: initial.revision });
  assert.equal(plan.ok, true);
  assert.ok(plan.planId);
  const saved = service.saveV3Config(candidate);
  assert.equal(saved.config.accounts[0].credentials.appSecret, "[redacted]");
  assert.deepEqual(service.getAccountSecrets("feishu-main").secrets, {
    appId: "cli_example",
    appSecret: "secret-value",
  });

  const daemon = service.getDaemonConfig();
  assert.equal(daemon.config.deliveryConfig.version, 3);
  assert.equal(daemon.config.projects.length, 1);
  assert.equal(daemon.config.projects[0].platformBindings[0].metadata.appSecret, "[redacted]");
  assert.doesNotMatch(daemon.preview, /secret-value/);
  const persisted = fs.readFileSync(saved.configPath, "utf8");
  assert.match(persisted, /"version": 3/);
  assert.doesNotMatch(persisted, /platformBindings/);
});
