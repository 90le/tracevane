import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemService } from "../../dist/apps/api/modules/system/service.js";
import { createConfigService } from "../../dist/apps/api/modules/config/service.js";

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-system-service-"));
  fs.mkdirSync(path.join(root, "system"), { recursive: true });
  fs.writeFileSync(path.join(root, "config.json"), "{}\n", "utf8");
  return root;
}

function createConfig(root) {
  return {
    pluginId: "tracevane",
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
    gatewayControlUiBasePath: "/tracevane",
    transport: {
      preferredMode: "gateway",
      standalone: { enabled: false, port: 3760 },
      gateway: { enabled: true, basePath: "/tracevane" },
    },
  };
}

function writeFakeDiagnosticsOpenClaw(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const runnerPath = path.join(binDir, "fake-openclaw.cjs");
  fs.writeFileSync(
    runnerPath,
    `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACEVANE_FAKE_OPENCLAW_LOG, JSON.stringify(args) + "\\n", "utf8");
if (args.join(" ") === "gateway status --json") {
  process.stdout.write(JSON.stringify({ service: { runtime: { status: "running", pid: 1234 } }, rpc: { ok: true } }));
  process.exit(0);
}
if (args.join(" ") === "status --json") {
  process.stdout.write(JSON.stringify({ channels: { configured: 1 }, agents: { configured: 1 } }));
  process.exit(0);
}
if (args.join(" ") === "doctor") {
  process.stdout.write("OPENCLAW_DOCTOR_OK");
  process.exit(0);
}
process.stderr.write("unexpected args: " + JSON.stringify(args));
process.exit(2);
`,
    "utf8",
  );
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(binDir, "openclaw.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-openclaw.cjs" %*\r\n`,
      "utf8",
    );
    return;
  }
  const commandPath = path.join(binDir, "openclaw");
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env node\n${fs.readFileSync(runnerPath, "utf8")}`,
    { encoding: "utf8", mode: 0o755 },
  );
  fs.chmodSync(commandPath, 0o755);
}

test("system diagnostics launches the platform-native OpenClaw command", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane system diagnostics 测试 "));
  fs.mkdirSync(path.join(root, "system"), { recursive: true });
  fs.writeFileSync(path.join(root, "config.json"), "{}\n", "utf8");
  const binDir = path.join(root, "OpenClaw CLI bin");
  const logPath = path.join(root, "openclaw-calls.jsonl");
  const previousPath = process.env.PATH;
  const previousLog = process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
  writeFakeDiagnosticsOpenClaw(binDir);
  process.env.PATH = [binDir, previousPath || ""].filter(Boolean).join(path.delimiter);
  process.env.TRACEVANE_FAKE_OPENCLAW_LOG = logPath;

  try {
    const service = createSystemService(createConfig(root), () => 0);
    const diagnostics = await service.getDiagnostics({ includeCommands: true });

    assert.equal(diagnostics.commands.gatewayStatus.ok, true);
    assert.equal(diagnostics.commands.status.ok, true);
    assert.equal(diagnostics.commands.doctor.ok, true);
    assert.match(diagnostics.commands.doctor.stdout, /OPENCLAW_DOCTOR_OK/);
    const calls = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => args.join(" ") === "gateway status --json"));
    assert.ok(calls.some((args) => args.join(" ") === "status --json"));
    assert.ok(calls.some((args) => args.join(" ") === "doctor"));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousLog === undefined) delete process.env.TRACEVANE_FAKE_OPENCLAW_LOG;
    else process.env.TRACEVANE_FAKE_OPENCLAW_LOG = previousLog;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

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
  fs.mkdirSync(path.join(root, "tracevane"), { recursive: true });
  const config = createConfig(root);
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        gateway: {
          controlUi: {
            basePath: "/tracevane",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "tracevane", "device-trust.json"),
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
        basePath: "/tracevane-v2",
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
  fs.mkdirSync(path.join(root, "tracevane"), { recursive: true });
  const config = {
    ...createConfig(root),
    version: "0.1.25",
  };
  const upgradeStatusPath = path.join(root, "tracevane", "upgrade-status.json");
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
        logFile: path.join(root, "tracevane", "upgrade.log"),
        lastError: "installer log marker missing",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const service = createSystemService(config, () => 0);
  const status = await service.getTracevaneUpgradeStatus();

  assert.equal(status.status, "succeeded");
  assert.equal(status.running, false);
  assert.equal(status.pid, null);
  assert.equal(status.targetVersion, "0.1.25");
  assert.equal(status.lastError, "");

  const persisted = JSON.parse(fs.readFileSync(upgradeStatusPath, "utf8"));
  assert.equal(persisted.status, "succeeded");
  assert.equal(persisted.lastError, "");
});

test("system service reports the POSIX installer as unsupported on Windows", { skip: process.platform !== "win32" }, async () => {
  const root = createTempRoot();
  fs.writeFileSync(
    path.join(root, "install-tracevane.sh"),
    "#!/bin/sh\nprintf 'installer must not run on Windows\\n'\n",
    "utf8",
  );
  const service = createSystemService(createConfig(root), () => 0);

  const response = await service.startTracevaneUpgrade({
    mode: "gateway",
    version: "0.1.99",
    skipUpgrade: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.status.status, "failed");
  assert.equal(response.status.running, false);
  assert.equal(response.status.pid, null);
  assert.equal(response.status.mode, "gateway");
  assert.equal(response.status.targetVersion, "0.1.99");
  assert.match(response.status.lastError, /not supported on Windows/i);
});
