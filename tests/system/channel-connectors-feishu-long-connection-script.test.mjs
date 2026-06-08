import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-channel-connectors-feishu-long-connection.mjs");
const execFileAsync = promisify(execFile);

function feishuRuntime(overrides = {}) {
  return {
    version: 1,
    feishuConnections: {
      "feishu-key": {
        key: "feishu-key",
        appId: "cli_test",
        accountId: "cli_test",
        apiUrl: "https://open.feishu.cn",
        bindingIds: ["feishu-live"],
        connected: true,
        state: "connected",
        lastError: null,
        lastConnectedAt: "2026-06-08T10:00:00.000Z",
        lastDisconnectedAt: null,
        lastReceivedAt: null,
        lastUnhealthyAt: null,
        pingTimeoutSeconds: 0,
        connectedIdleRenewAfterMs: 0,
        zeroInboundRenewAfterMs: 0,
        zeroInboundRenewals: 0,
        watchdogRestartAfterMs: 180000,
        lifecycleReceivedMessages: 0,
        lifecycleLastReceivedAt: null,
        suppressZeroInboundRenewal: false,
        lastWatchdogRestartAt: null,
        lastWatchdogRestartReason: null,
        reconnects: 0,
        receivedMessages: 0,
        ...overrides,
      },
    },
  };
}

function writeFixture(root, runtime, logText = "") {
  const runtimePath = path.join(root, "runtime.json");
  const logPath = path.join(root, "channel-connectors.log");
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2));
  fs.writeFileSync(logPath, logText);
  return { runtimePath, logPath };
}

async function runScript(args, root) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: root,
    },
    encoding: "utf8",
  });
  return result.stdout;
}

async function runScriptFailure(args, root) {
  try {
    await runScript(args, root);
  } catch (error) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      code: error.code,
    };
  }
  throw new Error("expected script to fail");
}

test("Feishu long-connection smoke passes clean SDK-owned runtime", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime());

  const output = await runScript([
    "--runtime", runtimePath,
    "--log", logPath,
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.connections, 1);
  assert.equal(parsed.summary.violations, 0);
  assert.equal(parsed.connections[0].pingTimeoutSeconds, 0);
  assert.equal(parsed.connections[0].connectedIdleRenewAfterMs, 0);
  assert.equal(parsed.connections[0].zeroInboundRenewAfterMs, 0);
  assert.equal(parsed.connections[0].watchdogRestartAfterMs, 180000);
});

test("Feishu long-connection smoke rejects proactive rebuild defaults", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    pingTimeoutSeconds: 10,
    connectedIdleRenewAfterMs: 300000,
    zeroInboundRenewAfterMs: 30000,
    watchdogRestartAfterMs: 20000,
  }));

  const failed = await runScriptFailure([
    "--runtime", runtimePath,
    "--log", logPath,
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(failed.stdout);
  assert.equal(parsed.ok, false);
  const types = parsed.violations.map((item) => item.type);
  assert.ok(types.includes("ping_timeout_enabled"));
  assert.ok(types.includes("connected_idle_renewal_enabled"));
  assert.ok(types.includes("zero_inbound_renewal_enabled"));
  assert.ok(types.includes("watchdog_too_fast"));
});

test("Feishu long-connection smoke rejects old unstable log patterns", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu SDK warn {"args":["[\\"[ws]\\",\\"no pong/inbound within 10s of last ping, terminating to trigger reconnect\\"]"]}',
    '2026-06-08T10:00:01.000Z Feishu WebSocket watchdog restarting client {"key":"feishu-key","reason":"watchdog_connected_idle_303709"}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime(), logText);

  const failed = await runScriptFailure([
    "--runtime", runtimePath,
    "--log", logPath,
    "--since", "2026-06-08T09:59:00.000Z",
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(failed.stdout);
  assert.equal(parsed.ok, false);
  const types = parsed.violations.map((item) => item.type);
  assert.ok(types.includes("sdk_ping_timeout"));
  assert.ok(types.includes("watchdog_connected_idle"));
});
