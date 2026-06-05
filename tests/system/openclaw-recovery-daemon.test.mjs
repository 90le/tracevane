import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOpenClawConfigBackup,
  pruneInvalidOpenClawConfigFromValidation,
} from "../../dist/apps/api/modules/openclaw-recovery/repair.js";
import { createOpenClawRecoveryService } from "../../dist/apps/api/modules/openclaw-recovery/service.js";
import {
  buildDefaultRecoveryState,
  writeRecoveryState,
} from "../../dist/apps/api/modules/openclaw-recovery/store.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-recovery-"));
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  const openclawConfigFile = path.join(openclawRoot, "openclaw.json");
  fs.writeFileSync(
    openclawConfigFile,
    `${JSON.stringify(
      {
        agents: {
          defaults: {
            llm: "legacy-bad-key",
            sandbox: { mode: "off" },
          },
        },
        tools: {
          exec: {
            mode: "legacy",
            security: "default",
            ask: "never",
          },
        },
        plugins: {
          entries: {
            studio: {
              enabled: true,
              config: {
                keep: "plugin-config",
              },
            },
          },
          providerParams: {
            keep: true,
          },
        },
        channels: {
          customProvider: {
            extensionField: "preserve",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.70",
    port: 3760,
    autoStart: false,
    openclawRoot,
    openclawConfigFile,
    projectRoot: path.join(root, "studio"),
    webDistDir: path.join(root, "studio/apps/web-vue/dist"),
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

test("recovery repair creates backups before pruning dynamic validation paths", () => {
  const config = makeConfig();

  const backupPath = createOpenClawConfigBackup(config);
  const changedKeys = pruneInvalidOpenClawConfigFromValidation(config, [
    {
      path: "agents.defaults.llm",
      message: "agents.defaults.llm is not allowed",
    },
    {
      path: "tools.exec.mode",
      message: "tools.exec.mode cannot be combined with tools.exec.security or tools.exec.ask",
    },
    {
      path: "plugins.entries.studio.config.keep",
      message: "unsupported plugin config field",
    },
    {
      path: "channels.customProvider.extensionField",
      message: "unsupported channel field",
    },
  ]);

  assert.ok(backupPath);
  assert.equal(fs.existsSync(backupPath), true);
  assert.deepEqual(changedKeys, ["agents.defaults.llm", "tools.exec.mode"]);

  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal("llm" in repaired.agents.defaults, false);
  assert.equal("mode" in repaired.tools.exec, false);
  assert.equal(repaired.tools.exec.security, "default");
  assert.equal(repaired.tools.exec.ask, "never");
  assert.equal(repaired.plugins.entries.studio.config.keep, "plugin-config");
  assert.equal(repaired.plugins.providerParams.keep, true);
  assert.equal(repaired.channels.customProvider.extensionField, "preserve");

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert.equal(backup.agents.defaults.llm, "legacy-bad-key");
});

test("recovery status is read-only and returns default daemon state without CLI output", async () => {
  const config = makeConfig();
  const service = createOpenClawRecoveryService(config);

  const status = await service.getStatus();

  assert.equal(status.status, "unknown");
  assert.equal(status.daemon.pid, null);
  assert.equal(status.policy.failureThresholdMs, 180000);
  assert.equal(status.service.serviceName.length > 0, true);
  assert.equal(status.probe.gatewayReachable, null);
  assert.equal(status.lastRepair, null);
});

test("recovery status preserves the latest daemon service action snapshot", async () => {
  const config = makeConfig();
  const service = createOpenClawRecoveryService(config);
  const state = buildDefaultRecoveryState(config);

  const initialStatus = await service.getStatus();
  writeRecoveryState(config, {
    ...state,
    service: {
      ...initialStatus.service,
      installed: true,
      activeState: "active",
      enabledState: "enabled",
      lastCheckedAt: "2026-06-05T00:00:00.000Z",
    },
  });

  const status = await service.getStatus();

  assert.equal(status.service.activeState, "active");
  assert.equal(status.service.enabledState, "enabled");
  assert.equal(status.service.lastCheckedAt, "2026-06-05T00:00:00.000Z");
});

test("system and event hot paths no longer call diagnostics by default", () => {
  const systemService = fs.readFileSync(
    path.join(rootDir, "apps/api/modules/system/service.ts"),
    "utf8",
  );
  const systemPage = fs.readFileSync(
    path.join(rootDir, "apps/web-vue/src/features/system/SystemControlPage.vue"),
    "utf8",
  );

  const runtimeSummaryBody = systemService.match(/async getRuntimeSummary\(\)[\s\S]*?\n    async getTerminalActionSuggestions/)?.[0] || "";
  const listEventsBody = systemService.match(/async listEvents\(limit = 100\)[\s\S]*?\n    async getEventSummary/)?.[0] || "";
  const eventSummaryBody = systemService.match(/async getEventSummary\(limit = 100\)[\s\S]*?\n  \};/)?.[0] || "";

  assert.doesNotMatch(runtimeSummaryBody, /getDiagnostics\(/);
  assert.doesNotMatch(listEventsBody, /getDiagnostics\(/);
  assert.doesNotMatch(eventSummaryBody, /getDiagnostics\(/);
  assert.match(listEventsBody, /systemEventWriter\.listPersistedEvents\(limit\)/);
  assert.match(eventSummaryBody, /buildSystemEventSummaryCards\(/);
  assert.match(eventSummaryBody, /systemEventWriter\.listPersistedEvents\(limit\)/);
  assert.doesNotMatch(systemPage, /fetchSystemDiagnostics/);
});
