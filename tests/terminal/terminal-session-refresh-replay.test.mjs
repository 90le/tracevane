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

test("terminal service exposes launch profile catalog for IDE workspace launchers", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);

  try {
    const catalog = await service.listWorkspaceProfiles();
    const byId = Object.fromEntries(
      catalog.profiles.map((profile) => [profile.id, profile]),
    );

    assert.equal(byId["local-shell"]?.targetKind, "local");
    assert.equal(byId["local-shell"]?.launchable, true);
    assert.equal(byId["local-shell"]?.cwd, tempDir);
    assert.equal(byId["agent-codex"]?.kind, "agent");
    assert.equal(byId["marketplace-clawhub"]?.kind, "marketplace");
    assert.equal(byId["marketplace-skillhub"]?.kind, "marketplace");
    assert.equal(byId["remote-ssh"]?.targetKind, "ssh");
    assert.equal(byId["remote-ssh"]?.launchable, false);
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service attach responses include authoritative session descriptors", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);

  try {
    const attached = service.attachGatewayClient(
      {
        sid: "term-descriptor-contract",
        profileId: "agent-codex",
        targetKind: "local",
        cwd: tempDir,
        pinned: true,
      },
      { connId: "conn-live", emit: () => true },
    );
    const attachSessionEvent = attached.events.find(
      (event) => event.type === "session",
    );

    assert.equal(attached.descriptor?.sessionId, attached.sid);
    assert.equal(attached.descriptor?.status, "running");
    assert.equal(attached.descriptor?.profileId, "agent-codex");
    assert.equal(attached.descriptor?.targetKind, "local");
    assert.equal(attached.descriptor?.cwd, tempDir);
    assert.equal(attached.descriptor?.pinned, true);
    assert.equal(attachSessionEvent?.descriptor?.sessionId, attached.sid);
    assert.equal(attachSessionEvent?.descriptor?.profileId, "agent-codex");

    const liveSessions = await service.listWorkspaceSessions();
    const liveDescriptor = liveSessions.sessions.find(
      (session) => session.sessionId === attached.sid,
    );
    assert.equal(liveDescriptor?.profileId, "agent-codex");

    const streamed = service.attachStreamClient(
      { sid: attached.sid },
      {
        streamId: "stream-live",
        emit() {
          return true;
        },
      },
    );

    assert.equal(streamed.descriptor?.sessionId, attached.sid);
    assert.equal(streamed.descriptor?.status, "running");
    assert.equal(streamed.descriptor?.profileId, "agent-codex");

    const persisted = await service.listPersistedSessions();
    const persistedDescriptor = persisted.sessions.find(
      (session) => session.sessionId === attached.sid,
    );
    assert.equal(persistedDescriptor?.profileId, "agent-codex");
    assert.equal(persistedDescriptor?.cwd, tempDir);
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service starts new pty sessions in requested resource cwd", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const resourceDir = path.join(tempDir, "resource-folder");
  fs.mkdirSync(resourceDir, { recursive: true });
  const service = createTestService(tempDir);
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      {
        sid: "term-resource-cwd",
        cwd: resourceDir,
      },
      {
        connId: "conn-resource",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    assert.equal(attached.descriptor?.cwd, resourceDir);

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: "pwd\r",
        ackMode: "none",
      },
      { connId: "conn-resource" },
    );

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output"
          && String(event.data || "").includes(resourceDir),
      ));
  } finally {
    service.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("terminal service treats requested resource files as parent cwd", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const resourceDir = path.join(tempDir, "resource-folder");
  const resourceFile = path.join(resourceDir, "notes.txt");
  fs.mkdirSync(resourceDir, { recursive: true });
  fs.writeFileSync(resourceFile, "open from file parent\n", "utf8");
  const service = createTestService(tempDir);
  const liveEvents = [];

  try {
    const attached = service.attachGatewayClient(
      {
        sid: "term-resource-file-cwd",
        cwd: resourceFile,
      },
      {
        connId: "conn-resource-file",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    assert.equal(attached.descriptor?.cwd, resourceDir);

    service.sendGatewayInput(
      {
        sid: attached.sid,
        data: "pwd\r",
        ackMode: "none",
      },
      { connId: "conn-resource-file" },
    );

    await waitFor(() =>
      liveEvents.some(
        (event) =>
          event.type === "output"
          && String(event.data || "").includes(resourceDir),
      ));
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

test("terminal service consumes leaked gateway resize controls before pty input", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-"));
  const service = createTestService(tempDir);
  const liveEvents = [];
  const invalidResize = JSON.stringify({
    type: "resize",
    cols: null,
    rows: null,
  });
  const validResize = JSON.stringify({
    type: "resize",
    cols: 120,
    rows: 40,
  });
  const batchedResizeControls =
    `${invalidResize}${invalidResize}\n${JSON.stringify({
      type: "resize",
      cols: 132,
      rows: 44,
    })}`;

  try {
    const attached = service.attachGatewayClient(
      { sid: "term-leaked-gateway-resize" },
      {
        connId: "conn-live",
        emit(event) {
          liveEvents.push(event);
          return true;
        },
      },
    );

    const invalidAck = service.sendGatewayInput(
      {
        sid: attached.sid,
        data: invalidResize,
        ackMode: "none",
      },
      { connId: "conn-live" },
    );

    assert.equal(invalidAck.ok, true);
    assert.equal(invalidAck.events, undefined);

    const resizeAck = service.sendGatewayInput(
      {
        sid: attached.sid,
        data: validResize,
      },
      { connId: "conn-live" },
    );

    assert.equal(resizeAck.ok, true);

    const batchedAck = service.sendGatewayInput(
      {
        sid: attached.sid,
        data: batchedResizeControls,
      },
      { connId: "conn-live" },
    );

    assert.equal(batchedAck.ok, true);

    const ledger = await service.listSessionLedger(attached.sid);
    const inputPayloads = ledger
      .filter((event) => event.type === "input")
      .map((event) => String(event.detail?.data || ""));
    const resizeEvents = ledger.filter((event) => event.type === "resize");

    assert.equal(
      inputPayloads.some((payload) => payload.includes('"type":"resize"')),
      false,
    );
    assert.equal(
      liveEvents.some(
        (event) =>
          event.type === "output"
          && String(event.data || "").includes('"type":"resize"'),
      ),
      false,
    );
    assert.deepEqual(resizeEvents.at(-1)?.detail, { cols: 132, rows: 44 });
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
