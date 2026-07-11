import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-persistent-live.mjs");

function writeFixture(root) {
  const configPath = path.join(root, "config.json");
  const daemonConfigPath = path.join(root, "daemon-config.json");
  const config = {
    version: 1,
    updatedAt: "2026-06-07T00:00:00.000Z",
    defaultAgentProfileId: "codex-agent",
    agentProfiles: [
      {
        id: "codex-agent",
        name: "Codex Agent",
        agent: "codex",
        model: "glm-5",
        workDir: root,
        permissionMode: "suggest",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "tracevane-gateway-client-key",
      },
      {
        id: "claude-agent",
        name: "Claude Agent",
        agent: "claude-code",
        model: "glm-4.6",
        workDir: root,
        permissionMode: "suggest",
      },
    ],
    platformBindings: [
      {
        id: "octo-live",
        platform: "octo",
        accountId: "tracevane-cc",
        botId: "bot-a",
        displayName: "Octo",
        agentProfileId: "codex-agent",
        enabled: true,
        metadata: {
          botToken: "secret-octo-token",
        },
      },
      {
        id: "feishu-live",
        platform: "feishu",
        accountId: "cli_a",
        displayName: "Feishu",
        agentProfileId: "codex-agent",
        enabled: true,
        metadata: {
          appSecret: "secret-feishu-app",
          verificationToken: "secret-feishu-token",
        },
      },
      {
        id: "claude-live",
        platform: "octo",
        accountId: "claude",
        displayName: "Claude",
        agentProfileId: "claude-agent",
        enabled: true,
        metadata: {},
      },
    ],
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.writeFileSync(daemonConfigPath, `${JSON.stringify({
    version: 1,
    management: { host: "127.0.0.1", port: 18797 },
    paths: {},
    gateway: { endpoint: "http://127.0.0.1:18796/v1", clientKeyRef: "tracevane-gateway-client-key" },
    projects: [
      {
        id: "codex-agent",
        name: "Codex Agent",
        agent: "codex",
        model: "glm-5",
        platformBindings: [
          {
            id: "octo-live",
            platform: "octo",
            metadata: { botToken: "secret-octo-token" },
          },
          {
            id: "feishu-live",
            platform: "feishu",
            metadata: { appSecret: "secret-feishu-app" },
          },
        ],
      },
    ],
  }, null, 2)}\n`, "utf8");
  return { configPath, daemonConfigPath };
}

function runScript(args, root) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
    },
    encoding: "utf8",
  });
}

test("persistent live smoke script backs up, writes, redacts, and restores binding metadata", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-persistent-live-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { configPath, daemonConfigPath } = writeFixture(root);
  const backupDir = path.join(root, "backups");
  const runtimePath = path.join(root, "daemon", "runtime.json");
  for (const fixturePath of [configPath, daemonConfigPath, runtimePath, backupDir]) {
    assert.equal(path.isAbsolute(fixturePath), true);
  }

  const dryRun = runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", backupDir,
    "--runtime", runtimePath,
    "--bindings", "octo-live,feishu-live",
    "--dry-run",
    "--no-restart",
    "--json",
  ], root);
  assert.doesNotMatch(dryRun, /secret-octo-token|secret-feishu-app|secret-feishu-token/);
  assert.equal(readBindingMode(configPath, "octo-live"), undefined);

  const apply = runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", backupDir,
    "--runtime", runtimePath,
    "--bindings", "octo-live,feishu-live",
    "--apply",
    "--no-restart",
    "--json",
  ], root);
  assert.doesNotMatch(apply, /secret-octo-token|secret-feishu-app|secret-feishu-token/);
  assert.equal(readBindingMode(configPath, "octo-live"), "persistent");
  assert.equal(readBindingMode(configPath, "feishu-live"), "persistent");
  assert.equal(readBindingMode(configPath, "claude-live"), undefined);
  assert.equal(readDaemonBindingMode(daemonConfigPath, "octo-live"), "persistent");
  assert.equal(readDaemonBindingMode(daemonConfigPath, "feishu-live"), "persistent");

  const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith(".json"));
  assert.equal(backups.length, 2);

  runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", backupDir,
    "--runtime", runtimePath,
    "--restore-latest",
    "--apply",
    "--no-restart",
    "--json",
  ], root);
  assert.equal(readBindingMode(configPath, "octo-live"), undefined);
  assert.equal(readBindingMode(configPath, "feishu-live"), undefined);
  assert.equal(readDaemonBindingMode(daemonConfigPath, "octo-live"), undefined);
  assert.equal(readDaemonBindingMode(daemonConfigPath, "feishu-live"), undefined);
  assert.equal(readBindingSecret(configPath, "octo-live", "botToken"), "secret-octo-token");
  assert.equal(readBindingSecret(configPath, "feishu-live", "appSecret"), "secret-feishu-app");

  const restartSkip = JSON.parse(runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--runtime", runtimePath,
    "--backup-dir", backupDir,
    "--bindings", "octo-live",
    "--apply",
    "--restart",
    "--json",
  ], root));
  assert.equal(restartSkip.ok, false);
  assert.equal(restartSkip.status, null);
  assert.equal(restartSkip.result.restart.attempted, false);
  assert.equal(restartSkip.result.restart.status, "skipped");
  assert.match(restartSkip.result.restart.reason, /authenticated Channel lifecycle API/);
  assert.doesNotMatch(
    fs.readFileSync(scriptPath, "utf8"),
    /systemctl|launchctl|schtasks(?:\.exe)?/,
  );
});

test("persistent live smoke ignores stale runtime when no restart was attempted", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-persistent-live-stale-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { configPath, daemonConfigPath } = writeFixture(root);
  const runtimePath = path.join(root, "daemon", "runtime.json");
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, "stale runtime that must not be read", "utf8");

  const startedAt = Date.now();
  const output = JSON.parse(runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", path.join(root, "backups"),
    "--runtime", runtimePath,
    "--bindings", "octo-live",
    "--apply",
    "--no-restart",
    "--timeout-ms", "100",
    "--poll-ms", "5",
    "--json",
  ], root));

  assert.equal(output.ok, true);
  assert.equal(output.result.restart.attempted, false);
  assert.equal(output.status, null);
  assert.ok(Date.now() - startedAt < 2_000, "no-restart must return without polling stale runtime");
});

test("persistent live smoke keeps independent wait-active runtime monitoring", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-persistent-live-monitor-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { configPath, daemonConfigPath } = writeFixture(root);
  const runtimePath = path.join(root, "daemon", "runtime.json");
  const requestLogPath = path.join(root, "status-requests.log");
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });

  const server = spawn(process.execPath, [
    "--input-type=module",
    "-e",
    `
      import fs from "node:fs";
      import http from "node:http";
      const requestLogPath = ${JSON.stringify(requestLogPath)};
      const status = {
        ok: true,
        pid: process.pid,
        agentSessionDriver: {
          requestedPersistentBindings: [],
          activeSessions: [{ bindingId: "octo-live", sessionId: "session-1" }],
        },
        activeRuns: [],
      };
      const server = http.createServer((_req, res) => {
        fs.appendFileSync(requestLogPath, "status\\n", "utf8");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(status));
      });
      server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }));
    `,
  ], {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
    windowsHide: true,
  });
  t.after(async () => {
    if (server.exitCode !== null) return;
    server.kill();
    await once(server, "exit");
  });
  const [{ port }] = await once(server, "message");
  fs.writeFileSync(runtimePath, `${JSON.stringify({
    management: { host: "127.0.0.1", port },
  }, null, 2)}\n`, "utf8");

  const output = JSON.parse(runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", path.join(root, "backups"),
    "--runtime", runtimePath,
    "--bindings", "octo-live",
    "--no-restart",
    "--wait-active",
    "--wait-idle-after-active",
    "--timeout-ms", "1000",
    "--poll-ms", "5",
    "--json",
  ], root));

  assert.equal(output.ok, true);
  assert.equal(output.result.applied, false);
  assert.equal(output.status.ok, true);
  assert.equal(output.active.activeSessions.length, 1);
  assert.equal(output.idleAfterActive.activeRuns.length, 0);
  assert.ok(fs.readFileSync(requestLogPath, "utf8").trim().split("\n").length >= 3);
});

function readBindingMode(configPath, id) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return config.platformBindings.find((binding) => binding.id === id)?.metadata?.agentSessionDriver;
}

function readBindingSecret(configPath, id, key) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return config.platformBindings.find((binding) => binding.id === id)?.metadata?.[key];
}

function readDaemonBindingMode(configPath, id) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  for (const project of config.projects || []) {
    const binding = (project.platformBindings || []).find((item) => item.id === id);
    if (binding) return binding.metadata?.agentSessionDriver;
  }
  return undefined;
}
