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
        pongTimeoutMs: 210000,
        pingIntervalMs: 0,
        sentPings: 0,
        lastPingAt: null,
        receivedPongs: 0,
        lastPongAt: null,
        controlFrames: 0,
        lastControlFrameAt: null,
        lastControlFrameType: null,
        reconnectingRecycleAfterMs: 10000,
        lastReconnectingAt: null,
        reconnectingRecycles: 0,
        lastReconnectingRecycleAt: null,
        lastReconnectingRecycleReason: null,
        connectedIdleRenewAfterMs: 0,
        verifiedIngressSilentRenewAfterMs: 0,
        verifiedIngressSilentRenewals: 0,
        lastVerifiedIngressSilentRenewAt: null,
        dispatcherVerificationConfigured: true,
        dispatcherEncryptConfigured: false,
        dispatcherCallbacks: 0,
        lastDispatcherCallbackAt: null,
        lastDispatcherEventType: null,
        lifecycleDispatcherCallbacks: 0,
        lifecycleLastDispatcherCallbackAt: null,
        zeroInboundRenewAfterMs: 0,
        zeroInboundRenewMax: 0,
        zeroInboundRenewals: 0,
        watchdogRestartAfterMs: 0,
        ingressVerified: false,
        ingressState: "warming",
        ingressSilentForMs: 0,
        transportVerified: false,
        rawEventFrames: 0,
        lifecycleRawEventFrames: 0,
        lastRawEventFrameAt: null,
        lastRawEventFrameType: null,
        rawEventHandlerErrors: 0,
        lastRawEventHandlerError: null,
        ingressUnverifiedAfterMs: 15000,
        ingressUnverifiedRenewMax: 5,
        ingressUnverifiedRenewals: 0,
        ingressUnverifiedRenewDelayMs: 15000,
        lastIngressUnverifiedRenewAt: null,
        lockAcquired: true,
        lockOwnerPid: process.pid,
        lockPath: "/tmp/feishu.lock",
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
  assert.equal(parsed.connections[0].pongTimeoutMs, 210000);
  assert.equal(parsed.connections[0].sentPings, 0);
  assert.equal(parsed.connections[0].receivedPongs, 0);
  assert.equal(parsed.connections[0].transportVerified, false);
  assert.equal(parsed.connections[0].reconnectingRecycleAfterMs, 10000);
  assert.equal(parsed.connections[0].reconnectingRecycles, 0);
  assert.equal(parsed.connections[0].connectedIdleRenewAfterMs, 0);
  assert.equal(parsed.connections[0].verifiedIngressSilentRenewAfterMs, 0);
  assert.equal(parsed.connections[0].dispatcherVerificationConfigured, true);
  assert.equal(parsed.connections[0].dispatcherEncryptConfigured, false);
  assert.equal(parsed.connections[0].dispatcherCallbacks, 0);
  assert.equal(parsed.connections[0].lifecycleDispatcherCallbacks, 0);
  assert.equal(parsed.connections[0].lifecycleLastDispatcherCallbackAt, null);
  assert.equal(parsed.connections[0].zeroInboundRenewAfterMs, 0);
  assert.equal(parsed.connections[0].zeroInboundRenewMax, 0);
  assert.equal(parsed.connections[0].ingressUnverifiedAfterMs, 15000);
  assert.equal(parsed.connections[0].ingressUnverifiedRenewMax, 5);
  assert.equal(parsed.connections[0].ingressUnverifiedRenewDelayMs, 15000);
  assert.equal(parsed.connections[0].watchdogRestartAfterMs, 0);
});

test("Feishu long-connection smoke rejects unsafe proactive rebuild defaults", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    pingTimeoutSeconds: 3,
    connectedIdleRenewAfterMs: 300000,
    verifiedIngressSilentRenewAfterMs: 30000,
    ingressUnverifiedAfterMs: 10000,
    ingressUnverifiedRenewMax: 6,
    zeroInboundRenewAfterMs: 30000,
    zeroInboundRenewMax: 2,
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
  assert.ok(types.includes("ping_timeout_mismatch"));
  assert.ok(types.includes("connected_idle_renewal_enabled"));
  assert.ok(types.includes("verified_ingress_silent_renewal_too_fast"));
  assert.ok(types.includes("ingress_unverified_renewal_too_fast"));
  assert.ok(types.includes("ingress_unverified_renewal_too_many"));
  assert.ok(types.includes("zero_inbound_renewal_enabled"));
  assert.ok(types.includes("watchdog_too_fast"));
});

test("Feishu long-connection smoke rejects old ingress-unverified renewal logs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const runtimeRestartAt = new Date(Date.now() + 1_000).toISOString();
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu WebSocket watchdog restarting client {"key":"feishu-key","reason":"watchdog_ingress_unverified_61000"}',
    '2026-06-08T10:00:00.001Z Feishu WebSocket ingress-unverified renewal threshold elapsed {"key":"feishu-key","connectedForMs":61000,"ingressUnverifiedAfterMs":60000,"ingressUnverifiedRenewDelayMs":60000,"ingressUnverifiedRenewals":1,"ingressUnverifiedRenewMax":3}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    ingressVerified: false,
    ingressState: "warming",
    ingressUnverifiedAfterMs: 60000,
    ingressUnverifiedRenewMax: 3,
    ingressUnverifiedRenewals: 1,
    ingressUnverifiedRenewDelayMs: 120000,
    lastIngressUnverifiedRenewAt: runtimeRestartAt,
    lastWatchdogRestartAt: runtimeRestartAt,
    lastWatchdogRestartReason: "watchdog_ingress_unverified_61000",
  }), logText);

  const failed = await runScriptFailure([
    "--runtime", runtimePath,
    "--log", logPath,
    "--since", "2026-06-08T09:59:00.000Z",
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(failed.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.summary.logEvents, 2);
  assert.equal(parsed.summary.logEventsByType.watchdog_ingress_unverified, 2);
  assert.ok(parsed.violations.some((item) => item.type === "watchdog_ingress_unverified"));
});

test("Feishu long-connection smoke rejects unsafe ingress-unverified renewal logs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.001Z Feishu WebSocket ingress-unverified renewal threshold elapsed {"key":"feishu-key","connectedForMs":11000,"ingressUnverifiedAfterMs":10000,"ingressUnverifiedRenewDelayMs":10000,"ingressUnverifiedRenewals":1,"ingressUnverifiedRenewMax":3}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    ingressUnverifiedAfterMs: 10000,
    ingressUnverifiedRenewMax: 3,
  }), logText);

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
  assert.ok(types.includes("ingress_unverified_renewal_too_fast"));
  assert.ok(types.includes("watchdog_ingress_unverified"));
});

test("Feishu long-connection smoke rejects old verified-ingress silent renewal logs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const runtimeRestartAt = new Date(Date.now() + 1_000).toISOString();
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu WebSocket watchdog restarting client {"key":"feishu-key","reason":"watchdog_verified_ingress_silent_121000"}',
    '2026-06-08T10:00:00.001Z Feishu WebSocket verified-ingress silent renewal threshold elapsed {"key":"feishu-key","silentForMs":121000,"renewAfterMs":120000,"verifiedIngressSilentRenewals":1}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    verifiedIngressSilentRenewAfterMs: 120000,
    verifiedIngressSilentRenewals: 1,
    lastVerifiedIngressSilentRenewAt: runtimeRestartAt,
    lastWatchdogRestartAt: runtimeRestartAt,
    lastWatchdogRestartReason: "watchdog_verified_ingress_silent_121000",
  }), logText);

  const failed = await runScriptFailure([
    "--runtime", runtimePath,
    "--log", logPath,
    "--since", "2026-06-08T09:59:00.000Z",
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(failed.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.summary.logEventsByType.watchdog_verified_ingress_silent, 2);
  assert.ok(parsed.violations.some((item) => item.type === "watchdog_verified_ingress_silent"));
});

test("Feishu long-connection smoke rejects unsafe verified-ingress silent renewal logs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.001Z Feishu WebSocket verified-ingress silent renewal threshold elapsed {"key":"feishu-key","silentForMs":31000,"renewAfterMs":30000,"verifiedIngressSilentRenewals":1}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    verifiedIngressSilentRenewAfterMs: 30000,
  }), logText);

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
  assert.ok(types.includes("verified_ingress_silent_renewal_too_fast"));
  assert.ok(types.includes("watchdog_verified_ingress_silent"));
});

test("Feishu long-connection smoke rejects delayed startup delivery-silence renewal", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu WebSocket watchdog restarting client {"key":"feishu-key","reason":"watchdog_zero_inbound_91000"}',
    '2026-06-08T10:00:00.001Z Feishu WebSocket zero-inbound startup renewal threshold elapsed {"key":"feishu-key","connectedForMs":91000,"zeroInboundRenewAfterMs":90000,"zeroInboundRenewals":1,"zeroInboundRenewMax":1}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    zeroInboundRenewAfterMs: 90000,
    zeroInboundRenewMax: 1,
  }), logText);

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
  assert.ok(types.includes("zero_inbound_renewal_enabled"));
  assert.ok(types.includes("watchdog_zero_inbound"));
  assert.equal(parsed.summary.logEvents, 2);
});

test("Feishu long-connection smoke rejects old fast zero-inbound renewal logs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.001Z Feishu WebSocket zero-inbound startup renewal threshold elapsed {"key":"feishu-key","connectedForMs":31000,"zeroInboundRenewAfterMs":30000,"zeroInboundRenewals":1,"zeroInboundRenewMax":1}',
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
  assert.ok(parsed.violations.map((item) => item.type).includes("watchdog_zero_inbound"));
});

test("Feishu long-connection smoke records bounded startup ingress validation without treating it as old watchdog churn", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.001Z Feishu WebSocket startup ingress validation missing; recycling client {"key":"feishu-key","reason":"startup_ingress_unverified_15000ms","connectedForMs":16000,"ingressUnverifiedAfterMs":15000,"ingressUnverifiedRenewDelayMs":15000,"ingressUnverifiedRenewals":1,"ingressUnverifiedRenewMax":5}',
    '2026-06-08T10:00:00.002Z Feishu WebSocket startup ingress validation cycle ended; recreating client {"key":"feishu-key","reason":"startup_ingress_unverified_15000ms","reconnectingForMs":0,"reconnectingRecycles":1,"state":"connected"}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    ingressUnverifiedRenewals: 1,
    ingressUnverifiedRenewDelayMs: 120000,
    lastIngressUnverifiedRenewAt: "2026-06-08T10:00:00.001Z",
    reconnectingRecycles: 1,
    lastReconnectingRecycleAt: "2026-06-08T10:00:00.002Z",
    lastReconnectingRecycleReason: "startup_ingress_unverified_15000ms",
  }), logText);

  const output = await runScript([
    "--runtime", runtimePath,
    "--log", logPath,
    "--since", "2026-06-08T09:59:00.000Z",
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.logEventsByType.startup_ingress_unverified, 2);
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

test("Feishu long-connection smoke records SDK reconnect recycle without treating it as old watchdog churn", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu WebSocket reconnecting exceeded limit; recycling client {"key":"feishu-key","reason":"sdk_reconnecting_timeout_10000ms","reconnectingForMs":12000,"reconnectingRecycles":1}',
    '2026-06-08T10:00:01.000Z Feishu WebSocket connection ended; recreating client {"key":"feishu-key","delayMs":1000,"error":"sdk_reconnecting_timeout_10000ms"}',
    "",
  ].join("\n");
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    reconnectingRecycles: 1,
    lastReconnectingRecycleAt: "2026-06-08T10:00:00.000Z",
    lastReconnectingRecycleReason: "sdk_reconnecting_timeout_10000ms",
  }), logText);

  const output = await runScript([
    "--runtime", runtimePath,
    "--log", logPath,
    "--since", "2026-06-08T09:59:00.000Z",
    "--duration-ms", "0",
    "--json",
  ], root);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.logEventsByType.sdk_reconnect_recycle, 1);
  assert.equal(parsed.summary.violations, 0);
  assert.equal(parsed.connections[0].reconnectingRecycles, 1);
  assert.equal(parsed.connections[0].lastReconnectingRecycleReason, "sdk_reconnecting_timeout_10000ms");
});

test("Feishu long-connection smoke rejects dispatcher-level event failures", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const logText = [
    '2026-06-08T10:00:00.000Z Feishu SDK warn {"args":["no im.message.receive_v1 handle"]}',
    '2026-06-08T10:00:01.000Z Feishu SDK warn {"args":["verification failed event"]}',
    '2026-06-08T10:00:02.000Z Feishu SDK error {"args":["[ws] invoke event failed, message_type: event; message_id: mid; trace_id: tid; error: boom"]}',
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
  assert.ok(types.includes("sdk_event_no_handler"));
  assert.ok(types.includes("sdk_event_verification_failed"));
  assert.ok(types.includes("sdk_event_invoke_failed"));
});

test("Feishu long-connection smoke rejects unverified ingress when required", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-long-smoke-"));
  const { runtimePath, logPath } = writeFixture(root, feishuRuntime({
    ingressVerified: false,
    ingressState: "warming",
  }));

  const failed = await runScriptFailure([
    "--runtime", runtimePath,
    "--log", logPath,
    "--duration-ms", "0",
    "--require-ingress-verified",
    "--json",
  ], root);
  const parsed = JSON.parse(failed.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.violations.map((item) => item.type).includes("feishu_ingress_unverified"));
});
