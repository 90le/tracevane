import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
        gatewayKeyRef: "studio-gateway-client-key",
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
        accountId: "studio-cc",
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
    gateway: { endpoint: "http://127.0.0.1:18796/v1", clientKeyRef: "studio-gateway-client-key" },
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
    },
    encoding: "utf8",
  });
}

test("persistent live smoke script backs up, writes, redacts, and restores binding metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-persistent-live-"));
  const { configPath, daemonConfigPath } = writeFixture(root);
  const backupDir = path.join(root, "backups");

  const dryRun = runScript([
    "--config", configPath,
    "--daemon-config", daemonConfigPath,
    "--backup-dir", backupDir,
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
