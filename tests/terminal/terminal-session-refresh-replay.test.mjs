import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "tsx/esm";

const terminalService =
  await import("../../apps/api/modules/terminal/service.ts");

function createTestService(tempDir) {
  const configFile = path.join(tempDir, "openclaw-config.json");
  fs.writeFileSync(configFile, JSON.stringify({}), "utf8");

  return terminalService.createTerminalService({
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
}

async function waitFor(check, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for terminal output");
}

test("terminal service replays backlog for refresh-like reattach without lastSeq", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const marker = "refresh-proof-0422";
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-refresh-replay" },
      {
        connId: "conn-live",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: `printf '${marker}\\n'\r`,
      },
      { connId: "conn-live" },
    );

    await waitFor(async () => {
      const ledger = await service.listSessionLedger(attached.sid);
      return ledger.some(
        (event) =>
          event.type === "output"
          && String(event.detail?.data || "").includes(marker),
      );
    });

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ));

    const latestSeq = Math.max(
      0,
      ...liveEvents
        .filter((event) => event.type === "output")
        .map((event) => Number(event.seq || 0)),
    );

    service.detachGatewayClient(
      { sid: attached.sid },
      { connId: "conn-live" },
    );

    const refreshed = service.attachGatewayClient(
      { sid: attached.sid },
      { connId: "conn-refresh", emit: () => true },
    );
    const refreshBacklog = refreshed.events
      .filter((event) => event.type === "output")
      .map((event) => String(event.data || ""))
      .join("");

    assert.match(refreshBacklog, /refresh-proof-0422/);

    const deltaOnly = service.attachGatewayClient(
      { sid: attached.sid, lastSeq: latestSeq },
      { connId: "conn-delta", emit: () => true },
    );
    const deltaBacklog = deltaOnly.events
      .filter((event) => event.type === "output")
      .map((event) => String(event.data || ""))
      .join("");

    assert.doesNotMatch(deltaBacklog, /refresh-proof-0422/);

    const transcriptOnly = service.attachGatewayClient(
      { sid: attached.sid, skipReplay: true },
      { connId: "conn-transcript", emit: () => true },
    );

    assert.equal(
      transcriptOnly.events.some((event) => event.type === "output"),
      false,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service requires explicit resume before reopening a persisted ended session id", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-explicit-resume" },
      { connId: "conn-live", emit: () => true },
    );

    const ended = await service.endSession({ sid: attached.sid });
    assert.equal(ended.success, true);

    assert.throws(
      () =>
        service.attachGatewayClient(
          { sid: attached.sid },
          { connId: "conn-rejected", emit: () => true },
        ),
      /terminal_session_unavailable/,
    );

    const resumed = service.attachGatewayClient(
      { sid: attached.sid, resume: true },
      { connId: "conn-resume", emit: () => true },
    );

    assert.equal(resumed.sid, attached.sid);
    assert.equal(
      resumed.events.some((event) => event.type === "session"),
      true,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service keeps fast gateway input off the full ack replay path", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const marker = "fast-input-proof-0503";
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-fast-input" },
      {
        connId: "conn-live",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    const ack = service.sendGatewayInput(
      {
        sid: attached.sid,
        data: `printf '${marker}\\n'\r`,
        ackMode: "none",
      },
      { connId: "conn-live" },
    );

    assert.equal(ack.ok, true);
    assert.equal(ack.sid, attached.sid);
    assert.equal(ack.events, undefined);

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ));

    const ledger = await service.listSessionLedger(attached.sid);
    assert.equal(
      ledger.some(
        (event) =>
          event.type === "input"
          && String(event.detail?.data || "").includes(marker),
      ),
      true,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service can suppress gateway output while streaming over http", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const marker = "http-stream-proof-0507";
  const gatewayEvents = [];
  const streamEvents = [];

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-http-stream", outputMode: "http-stream" },
      {
        connId: "conn-live",
        emit(event) {
          gatewayEvents.push(event);
          return true;
        },
      },
    );
    const streamed = service.attachStreamClient(
      { sid: attached.sid },
      {
        streamId: "stream-live",
        emit(event) {
          streamEvents.push(event);
          return true;
        },
      },
    );

    assert.equal(streamed.sid, attached.sid);

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: `printf '${marker}\\n'\r`,
        ackMode: "none",
      },
      { connId: "conn-live" },
    );

    await waitFor(() =>
      streamEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ));

    assert.equal(
      gatewayEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ),
      false,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service rejects http stream attach before a session exists", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);

  try {
    assert.throws(
      () =>
        service.attachStreamClient(
          { sid: "term-stream-without-session" },
          {
            streamId: "stream-orphan",
            emit() {
              return true;
            },
          },
        ),
      /terminal_session_not_found/,
    );

    const sessions = await service.listPersistedSessions();
    assert.equal(
      sessions.sessions.some(
        (session) => session.sessionId === "term-stream-without-session",
      ),
      false,
    );
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service clear removes replay backlog for refreshed clients", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const marker = "clear-proof-0422";
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-clear-replay" },
      {
        connId: "conn-live",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: `printf '${marker}\\n'\r`,
      },
      { connId: "conn-live" },
    );

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output" && String(event.data || "").includes(marker),
      ));

    const clearAck = service.clearGatewaySession(
      { sid: attached.sid },
      { connId: "conn-live" },
    );
    assert.equal(clearAck.ok, true);
    assert.ok(Number(clearAck.outputSeq) > 0);
    assert.equal(
      liveEvents.some((event) => event.type === "clear"),
      true,
    );

    const refreshed = service.attachGatewayClient(
      { sid: attached.sid },
      { connId: "conn-refresh", emit: () => true },
    );
    const refreshBacklog = refreshed.events
      .filter((event) => event.type === "output")
      .map((event) => String(event.data || ""))
      .join("");

    assert.equal(
      refreshed.events.some((event) => event.type === "clear"),
      true,
    );
    assert.doesNotMatch(refreshBacklog, /clear-proof-0422/);

    const ledger = await service.listSessionLedger(attached.sid);
    const clearEvent = ledger.find((event) => event.type === "clear");
    assert.ok(clearEvent);
    assert.equal(typeof clearEvent.detail?.outputSeq, "number");
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
