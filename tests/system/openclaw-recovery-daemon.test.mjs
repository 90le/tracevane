import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOpenClawCliShim,
  ensureOpenClawCliAvailable,
  writeOpenClawRecoveryInstallManifest,
} from "../../dist/apps/api/modules/openclaw-recovery/cli-bootstrap.js";
import {
  isOpenClawGatewayProcess,
  parseLsofListeners,
  parseSsListeners,
} from "../../dist/apps/api/modules/openclaw-recovery/gateway-runtime.js";
import {
  assessOpenClawGatewayServiceStatus,
  parseOpenClawGatewayStatus,
} from "../../dist/apps/api/modules/openclaw-recovery/gateway-service.js";
import {
  probeOpenClawGateway,
  probeOpenClawGatewayDeep,
} from "../../dist/apps/api/modules/openclaw-recovery/probe.js";
import {
  createOpenClawConfigBackup,
  inspectTracevaneWebBundle,
  pruneDeprecatedOpenClawPluginResidue,
  pruneMissingOpenClawPluginLoadPaths,
  pruneInvalidOpenClawConfigFromValidation,
  repairOpenClawGatewayAuthSecretRefDrift,
  repairOpenClawPluginConfigFromFindings,
  restoreOpenClawRecoveryBackup,
} from "../../dist/apps/api/modules/openclaw-recovery/repair.js";
import { createOpenClawRecoveryService } from "../../dist/apps/api/modules/openclaw-recovery/service.js";
import {
  appendRecoveryEvent,
  buildDefaultRecoveryState,
  createRecoveryEvent,
  listRecoveryBackupsPage,
  listRecoveryEventsPage,
  writeRecoveryState,
} from "../../dist/apps/api/modules/openclaw-recovery/store.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-recovery-"));
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  const projectRoot = path.join(root, "tracevane");
  fs.mkdirSync(projectRoot, { recursive: true });
  const missingPluginPath = path.join(root, "missing-plugin-path");
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
          load: {
            paths: [projectRoot, missingPluginPath],
          },
          entries: {
            tracevane: {
              enabled: true,
              config: {
                keep: "plugin-config",
              },
            },
            alpha: {
              enabled: true,
              config: {},
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
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.70",
    port: 3760,
    autoStart: false,
    openclawRoot,
    openclawConfigFile,
    projectRoot,
    webDistDir: path.join(root, "tracevane/apps/web-vue/dist"),
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

function listenProbeServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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
      path: "plugins.entries.tracevane.config.keep",
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
  assert.equal(repaired.plugins.entries.tracevane.config.keep, "plugin-config");
  assert.equal(repaired.plugins.entries.alpha.enabled, true);
  assert.equal(repaired.plugins.providerParams.keep, true);
  assert.equal(repaired.channels.customProvider.extensionField, "preserve");

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert.equal(backup.agents.defaults.llm, "legacy-bad-key");
});

test("recovery backups restore runtime env sidecars with openclaw config", () => {
  const config = makeConfig();
  const secretPath = path.join(config.openclawRoot, "tracevane-local-secrets.json");
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  openclawConfig.secrets = {
    providers: {
      "tracevane-local": {
        source: "file",
        path: secretPath,
        mode: "json",
      },
    },
  };
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(openclawConfig, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OPENCLAW_GATEWAY_TOKEN=before-env\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=before-systemd\n",
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "before-secret", keep: true }, null, 2)}\n`,
    "utf8",
  );

  const backupPath = createOpenClawConfigBackup(config);
  const mutated = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  mutated.gateway = { auth: { token: "after-config" } };
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(mutated, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OPENCLAW_GATEWAY_TOKEN=after-env\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=after-systemd\n",
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "after-secret", keep: false }, null, 2)}\n`,
    "utf8",
  );

  restoreOpenClawRecoveryBackup(config, backupPath);

  const restored = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const restoredSecret = JSON.parse(fs.readFileSync(secretPath, "utf8"));
  assert.equal(restored.agents.defaults.llm, "legacy-bad-key");
  assert.equal(
    fs.readFileSync(path.join(config.openclawRoot, ".env"), "utf8"),
    "OPENCLAW_GATEWAY_TOKEN=before-env\n",
  );
  assert.equal(
    fs.readFileSync(path.join(config.openclawRoot, "gateway.systemd.env"), "utf8"),
    "OPENCLAW_GATEWAY_TOKEN=before-systemd\n",
  );
  assert.deepEqual(restoredSecret, {
    gatewayAuthToken: "before-secret",
    keep: true,
  });
});

test("gateway deep probe validates the Tracevane control route without breaking light probe", async () => {
  const { server, port } = await listenProbeServer((request, response) => {
    if (request.url === "/tracevane") {
      response.writeHead(401);
      response.end("auth required");
      return;
    }
    response.writeHead(404);
    response.end("root not found");
  });

  try {
    const light = await probeOpenClawGateway(port, 500);
    const deep = await probeOpenClawGatewayDeep({
      port,
      timeoutMs: 500,
      controlUiBasePath: "/tracevane",
    });

    assert.equal(light, true);
    assert.equal(deep.ok, true);
    assert.equal(deep.connected, true);
    assert.deepEqual(
      deep.checks.map((check) => [check.path, check.ok, check.statusCode]),
      [["/", true, 404], ["/tracevane", true, 401]],
    );
  } finally {
    await closeServer(server);
  }
});

test("gateway deep probe reports connected route failures without forcing process takeover", async () => {
  const { server, port } = await listenProbeServer((request, response) => {
    response.writeHead(request.url === "/tracevane" ? 404 : 200);
    response.end("ok");
  });

  try {
    const deep = await probeOpenClawGatewayDeep({
      port,
      timeoutMs: 500,
      controlUiBasePath: "/tracevane",
    });

    assert.equal(deep.ok, false);
    assert.equal(deep.connected, true);
    assert.match(deep.error, /\/tracevane returned HTTP 404/);
  } finally {
    await closeServer(server);
  }
});

test("gateway service status parser detects service hosting repair cases", () => {
  const healthy = parseOpenClawGatewayStatus(JSON.stringify({
    service: {
      loaded: true,
      command: {
        sourcePath: "/tmp/openclaw-gateway.service",
        programArguments: ["node", "openclaw", "gateway", "--port", "31879"],
      },
      runtime: {
        status: "running",
        state: "active",
        subState: "running",
        pid: 1234,
      },
      configAudit: { ok: true, issues: [] },
    },
    gateway: { port: 31879 },
    rpc: { ok: true },
  }));
  const failed = parseOpenClawGatewayStatus(JSON.stringify({
    service: {
      loaded: false,
      command: {
        sourcePath: "/tmp/missing-openclaw-gateway.service",
        programArguments: ["node", "openclaw", "status"],
      },
      runtime: {
        status: "failed",
        state: "failed",
        subState: "dead",
        pid: null,
      },
      configAudit: {
        ok: false,
        issues: [{ message: "service args do not match config" }],
      },
    },
    gateway: { port: 9999 },
    rpc: { ok: false },
  }));

  assert.equal(
    assessOpenClawGatewayServiceStatus(healthy, {
      expectedPort: 31879,
      sourcePathExists: true,
    }).needsRepair,
    false,
  );

  const assessment = assessOpenClawGatewayServiceStatus(failed, {
    expectedPort: 31879,
    sourcePathExists: false,
  });
  assert.equal(assessment.needsRepair, true);
  assert.equal(assessment.shouldInstall, true);
  assert.equal(assessment.shouldStart, true);
  assert.ok(assessment.reasons.includes("service_not_loaded"));
  assert.ok(assessment.reasons.includes("service_command_missing_gateway"));
  assert.ok(assessment.reasons.includes("gateway_port_mismatch"));
});

test("tracevane web bundle inspection detects missing and rebuilt static assets", () => {
  const config = makeConfig();

  const missing = inspectTracevaneWebBundle(config);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["webDistDir", "index.html", "assets"]);

  const assetsDir = path.join(config.webDistDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, "index.html"), "<div id=\"app\"></div>\n", "utf8");
  fs.writeFileSync(path.join(assetsDir, "index-test.js"), "console.log('ok');\n", "utf8");

  const ready = inspectTracevaneWebBundle(config);
  assert.equal(ready.ok, true);
  assert.equal(ready.assetCount, 1);
  assert.deepEqual(ready.missing, []);
});

test("recovery history and config backup lists are paginated", () => {
  const config = makeConfig();
  const backupsDir = path.join(config.openclawRoot, "tracevane", "recovery", "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  for (let index = 0; index < 15; index += 1) {
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "repair_started",
        severity: "info",
        title: `event ${index}`,
        summary: "test event",
        status: "succeeded",
        occurredAt: `2026-06-05T00:00:${String(index).padStart(2, "0")}.000Z`,
      }),
    );
  }
  for (let index = 0; index < 12; index += 1) {
    fs.writeFileSync(
      path.join(
        backupsDir,
        `openclaw-20260605T0000${String(index).padStart(2, "0")}000Z.json`,
      ),
      "{}\n",
      "utf8",
    );
  }

  const eventPage = listRecoveryEventsPage(config, 2, 5);
  const backupPage = listRecoveryBackupsPage(config, 2, 5);

  assert.equal(eventPage.events.length, 5);
  assert.equal(eventPage.pagination.page, 2);
  assert.equal(eventPage.pagination.totalEntries, 15);
  assert.equal(eventPage.pagination.hasPreviousPage, true);
  assert.equal(eventPage.pagination.hasNextPage, true);
  assert.equal(backupPage.backups.length, 5);
  assert.equal(backupPage.pagination.page, 2);
  assert.equal(backupPage.pagination.totalEntries, 12);
});

test("plugin repair disables bad entries and removes missing absolute load paths", () => {
  const config = makeConfig();
  const changedKeys = [
    ...pruneMissingOpenClawPluginLoadPaths(config),
    ...repairOpenClawPluginConfigFromFindings(config, [
      {
        path: "plugins.entries.alpha",
        message: "plugin alpha failed to load",
      },
      {
        path: "plugins.entries.tracevane",
        message: "plugin tracevane failed to load",
      },
    ]),
  ];

  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));

  assert.ok(changedKeys.includes("plugins.load.paths"));
  assert.ok(changedKeys.includes("plugins.entries.alpha.enabled"));
  assert.equal(repaired.plugins.entries.alpha.enabled, false);
  assert.equal(repaired.plugins.entries.tracevane.enabled, true);
  assert.deepEqual(repaired.plugins.load.paths, [config.projectRoot]);
});

test("recovery repair migrates gateway auth token to env SecretRef and syncs runtime env files", () => {
  const config = makeConfig();
  const secretPath = path.join(config.openclawRoot, "tracevane-local-secrets.json");
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        gateway: {
          auth: {
            mode: "token",
            token: "plain-token-123",
          },
        },
        secrets: {
          providers: {
            "tracevane-local": {
              source: "file",
              path: secretPath,
              mode: "json",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "stale-secret", keep: "yes" }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OTHER=1\nOPENCLAW_GATEWAY_TOKEN=stale-env\nOPENCLAW_DISCORD_BOT_TOKEN=discord\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=stale-systemd\nOPENCLAW_DISCORD_BOT_TOKEN=discord\n",
    "utf8",
  );

  const changedKeys = repairOpenClawGatewayAuthSecretRefDrift(config);
  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const env = fs.readFileSync(path.join(config.openclawRoot, ".env"), "utf8");
  const systemdEnv = fs.readFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "utf8",
  );
  const secrets = JSON.parse(fs.readFileSync(secretPath, "utf8"));

  assert.ok(changedKeys.includes("gateway.auth.token"));
  assert.ok(changedKeys.includes("env.OPENCLAW_GATEWAY_TOKEN"));
  assert.ok(changedKeys.includes("gateway.systemd.env.OPENCLAW_GATEWAY_TOKEN"));
  assert.ok(changedKeys.includes("env.OPENCLAW_DISCORD_BOT_TOKEN"));
  assert.ok(changedKeys.includes("gateway.systemd.env.OPENCLAW_DISCORD_BOT_TOKEN"));
  assert.ok(changedKeys.includes("secrets.providers.tracevane-local.gatewayAuthToken"));
  assert.deepEqual(repaired.gateway.auth.token, {
    source: "env",
    provider: "default",
    id: "OPENCLAW_GATEWAY_TOKEN",
  });
  assert.match(env, /OPENCLAW_GATEWAY_TOKEN=plain-token-123/);
  assert.match(systemdEnv, /OPENCLAW_GATEWAY_TOKEN=plain-token-123/);
  assert.doesNotMatch(env, /OPENCLAW_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(systemdEnv, /OPENCLAW_DISCORD_BOT_TOKEN/);
  assert.equal(secrets.gatewayAuthToken, undefined);
  assert.equal(secrets.keep, "yes");
});

test("recovery repair prunes deprecated OpenClaw plugin residue conservatively", () => {
  const config = makeConfig();
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        plugins: {
          allow: ["tracevane", "discord", "acpx", "codex"],
          entries: {
            tracevane: { enabled: true },
            discord: { enabled: true },
            acpx: { enabled: true },
            codex: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
          feishu: { enabled: true },
        },
        bindings: [
          {
            agentId: "main",
            match: { channel: "discord" },
          },
          {
            type: "acp",
            agentId: "main",
            match: { channel: "feishu" },
            acp: { backend: "acpx" },
          },
          {
            type: "acp",
            agentId: "main",
            match: { channel: "feishu" },
            acp: { backend: "codex" },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const pluginDir = path.join(config.openclawRoot, "plugins");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "installs.json"),
    `${JSON.stringify(
      {
        hostContractVersion: "0.1.70",
        installs: {
          discord: { version: "0.1.70" },
          codex: { version: "2026.6.8" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const changedKeys = pruneDeprecatedOpenClawPluginResidue(config);
  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const backups = fs.readdirSync(path.join(pluginDir, "legacy-backups"));

  assert.ok(changedKeys.includes("plugins.allow"));
  assert.ok(changedKeys.includes("plugins.entries.discord"));
  assert.ok(changedKeys.includes("plugins.entries.acpx"));
  assert.ok(changedKeys.includes("channels.discord"));
  assert.ok(changedKeys.includes("bindings.deprecatedPlugin"));
  assert.ok(changedKeys.includes("plugins.installs.legacyIndex"));
  assert.deepEqual(repaired.plugins.allow, ["tracevane", "codex"]);
  assert.equal(repaired.plugins.entries.tracevane.enabled, true);
  assert.equal(repaired.plugins.entries.codex.enabled, true);
  assert.equal(repaired.plugins.entries.discord, undefined);
  assert.equal(repaired.plugins.entries.acpx, undefined);
  assert.equal(repaired.channels.discord, undefined);
  assert.equal(repaired.channels.feishu.enabled, true);
  assert.equal(repaired.bindings.length, 1);
  assert.equal(repaired.bindings[0].acp.backend, "codex");
  assert.equal(fs.existsSync(path.join(pluginDir, "installs.json")), false);
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^installs-.*\.json\.bak$/);
});

test("recovery keeps current plugin install index when no deprecated plugin residue is present", () => {
  const config = makeConfig();
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        plugins: {
          allow: ["tracevane", "codex"],
          entries: {
            tracevane: { enabled: true },
            codex: { enabled: true },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const pluginDir = path.join(config.openclawRoot, "plugins");
  fs.mkdirSync(pluginDir, { recursive: true });
  const installIndex = path.join(pluginDir, "installs.json");
  fs.writeFileSync(
    installIndex,
    `${JSON.stringify(
      {
        hostContractVersion: "2026.6.8",
        installs: {
          codex: { version: "2026.6.8" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const changedKeys = pruneDeprecatedOpenClawPluginResidue(config);

  assert.deepEqual(changedKeys, []);
  assert.equal(fs.existsSync(installIndex), true);
  assert.equal(fs.existsSync(path.join(pluginDir, "legacy-backups")), false);
});

test("CLI bootstrap restores openclaw from install manifest when PATH entry is missing", async () => {
  if (process.platform === "win32") return;
  const config = makeConfig();
  const fakeCli = path.join(config.projectRoot, "fake-openclaw.mjs");
  fs.writeFileSync(
    fakeCli,
    "console.log('OpenClaw 2099.1.1 (fake)');\n",
    "utf8",
  );
  writeOpenClawRecoveryInstallManifest(config, {
    version: 1,
    updatedAt: "2026-06-05T00:00:00.000Z",
    cliPath: path.join(config.projectRoot, "missing-openclaw"),
    cliRealPath: fakeCli,
    cliVersion: "2099.1.1",
    nodePath: process.execPath,
    packageManager: "unknown",
    packageName: "openclaw",
    packageSpec: "openclaw@2099.1.1",
    npmPrefix: "",
    installKind: "npm-global",
    projectRoot: config.projectRoot,
  });

  const commands = [];
  const originalPath = process.env.PATH;
  process.env.PATH = path.join(config.projectRoot, "empty-bin");
  try {
    const result = await ensureOpenClawCliAvailable(
      config,
      { allowCliReinstall: false, cliReinstallTimeoutMs: 1 },
      commands,
    );

    assert.equal(result.ok, true);
    assert.equal(result.action, "shim");
    assert.equal(commands.at(-1).ok, true);
    assert.equal(commands.some((command) => command.error.includes("ENOENT")), true);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("CLI bootstrap shim executes shell wrapper manifests directly", () => {
  if (process.platform === "win32") return;
  const config = makeConfig();
  const fakeCli = path.join(config.projectRoot, "fake-openclaw");
  fs.writeFileSync(
    fakeCli,
    "#!/bin/sh\necho 'OpenClaw 2099.2.0 (fake-shell)'\n",
    { encoding: "utf8", mode: 0o755 },
  );
  fs.chmodSync(fakeCli, 0o755);

  const shimPath = createOpenClawCliShim(config, {
    version: 1,
    updatedAt: "2026-06-05T00:00:00.000Z",
    cliPath: fakeCli,
    cliRealPath: fakeCli,
    cliVersion: "2099.2.0",
    nodePath: process.execPath,
    packageManager: "npm",
    packageName: "openclaw",
    packageSpec: "openclaw@2099.2.0",
    npmPrefix: "",
    installKind: "path",
    projectRoot: config.projectRoot,
  });

  const output = execFileSync(shimPath, ["--version"], { encoding: "utf8" });

  assert.match(output, /OpenClaw 2099\.2\.0/);
  assert.doesNotMatch(fs.readFileSync(shimPath, "utf8"), new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("gateway runtime discovery parses listeners and only trusts OpenClaw gateway processes", () => {
  const lsof = [
    "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
    "node 1234 binbin 23u IPv4 1 0t0 TCP 127.0.0.1:31879 (LISTEN)",
    "nginx 4321 root 6u IPv4 2 0t0 TCP *:31879 (LISTEN)",
  ].join("\n");
  const ss = [
    "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
    "LISTEN 0 511 127.0.0.1:31879 0.0.0.0:* users:((\"node\",pid=1234,fd=23))",
  ].join("\n");

  assert.deepEqual(
    parseLsofListeners(lsof, 31879).map((listener) => listener.pid),
    [1234, 4321],
  );
  assert.deepEqual(
    parseSsListeners(ss, 31879).map((listener) => listener.pid),
    [1234],
  );
  assert.deepEqual(
    isOpenClawGatewayProcess({
      pid: 1234,
      command: "node",
      process: {
        pid: 1234,
        ppid: 1,
        command: "node",
        args: "/opt/openclaw/dist/index.js gateway --port 31879",
      },
    }),
    { safe: true, reason: "openclaw-gateway" },
  );
  assert.equal(
    isOpenClawGatewayProcess({
      pid: 4321,
      command: "nginx",
      process: {
        pid: 4321,
        ppid: 1,
        command: "nginx",
        args: "nginx: master process",
      },
    }).safe,
    false,
  );
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
