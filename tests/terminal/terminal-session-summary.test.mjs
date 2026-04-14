import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "tsx/esm";

const sessionSummary =
  await import("../../apps/api/modules/terminal/session-summary.ts");
const terminalService =
  await import("../../apps/api/modules/terminal/service.ts");
const terminalTypes = await import("../../types/terminal.ts");

test("terminal session summary exposes recoverable status and controller metadata", () => {
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: "term-1",
    status: "running",
    attachedClientId: "client-a",
    observerCount: 2,
  });

  assert.equal(summary.sessionId, "term-1");
  assert.equal(summary.controlState, "controller");
  assert.equal(summary.observerCount, 2);
  assert.equal(summary.canResume, true);
});

test("terminal session summary marks detached session as resumable observer", () => {
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: "term-2",
    status: "detached",
    attachedClientId: null,
    observerCount: 0,
  });

  assert.equal(summary.controlState, "observer");
  assert.equal(summary.canResume, true);
});

test("terminal session summary preserves explicit source and activity time", () => {
  const updatedAt = "2026-04-12T09:08:07.000Z";
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: "term-3",
    title: "Gateway Logs",
    status: "detached",
    source: "system_action",
    attachedClientId: null,
    observerCount: 1,
    updatedAt,
  });

  assert.equal(summary.source, "system_action");
  assert.equal(summary.updatedAt, updatedAt);
  assert.equal(summary.status, "detached");
});

test("terminal session status helper identifies recoverable states", () => {
  assert.equal(typeof terminalTypes.isRecoverableTerminalStatus, "function");
  assert.equal(terminalTypes.isRecoverableTerminalStatus("running"), true);
  assert.equal(terminalTypes.isRecoverableTerminalStatus("detached"), true);
  assert.equal(terminalTypes.isRecoverableTerminalStatus("completed"), false);
  assert.equal(terminalTypes.isRecoverableTerminalStatus("failed"), false);
  assert.equal(terminalTypes.isRecoverableTerminalStatus("lost"), false);
});

test("terminal service session summaries derive detached status from real activity metadata", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const configFile = path.join(tempDir, "openclaw-config.json");
  fs.writeFileSync(configFile, JSON.stringify({}), "utf8");

  const service = terminalService.createTerminalService({
    config: {
      pluginId: "test",
      pluginName: "test",
      version: "0.0.0",
      port: 0,
      autoStart: false,
      openclawRoot: tempDir,
      openclawConfigFile: configFile,
      projectRoot: tempDir,
      webDistDir: tempDir,
      gatewayPort: 0,
      gatewayWsUrl: "ws://127.0.0.1",
      gatewayControlUiBasePath: "/",
      transport: {
        standalone: { enabled: false, port: 0 },
        gateway: { enabled: false, basePath: "/" },
      },
    },
    skills: {
      async getSummary() {
        return {
          skills: [],
          tools: {
            clawhubInstalled: false,
            skillhubInstalled: false,
          },
        };
      },
    },
  });

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-summary" },
      { connId: "conn-a", emit: () => true },
    );
    const running = await service.listWorkspaceSessions();
    const runningSummary = running.sessions.find(
      (item) => item.sessionId === attached.sid,
    );

    assert.ok(runningSummary);
    assert.equal(runningSummary.status, "running");

    service.detachGatewayClient({ sid: attached.sid }, { connId: "conn-a" });
    const detached = await service.listWorkspaceSessions();
    const detachedSummary = detached.sessions.find(
      (item) => item.sessionId === attached.sid,
    );

    assert.ok(detachedSummary);
    assert.equal(detachedSummary.status, "detached");
    assert.match(
      detachedSummary.updatedAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    assert.equal(detachedSummary.source, "manual");
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
