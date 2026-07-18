import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket as WsWebSocket } from "ws";

/**
 * Contract test: the web terminal's OpenClaw gateway-RPC client
 * (`apps/web/src/features/ide-workbench/terminal/gatewayRpcClient.ts` and
 * `terminalGatewayTransport.ts`) driven against a mock OpenClaw host gateway
 * WebSocket server. The mock speaks the host frame protocol the client
 * implements:
 *
 *   server → client  {type:"event", event:"connect.challenge", payload}
 *   client → server  {type:"req", id, method:"connect",
 *                     params:{minProtocol,maxProtocol,client,role,scopes,auth,...}}
 *   server → client  {type:"res", id, ok:true|false, payload|error}
 *   client → server  {type:"req", id, method:"tracevane.terminal.*", params}
 *   server → client  {type:"event", event:"tracevane.terminal", payload:<TerminalGatewayEvent>}
 *
 * Browser-global shim (documented, minimal — the client modules are browser
 * code and only touch these globals):
 *   - window.location          → points at the mock server's 127.0.0.1 port
 *   - window.localStorage      → Map-backed stub; the gateway token is seeded
 *                                via the Control UI settings key
 *                                ("openclaw.control.settings.v1")
 *   - window.setTimeout/clearTimeout → delegated to node's real timers
 *                                (drives the client's 10s connect / 15s request
 *                                timeouts; tests settle long before those fire)
 *   - window.setInterval/clearInterval → MANUAL registry: heartbeat ticks are
 *                                fired by the test via tickIntervals(), so the
 *                                lease/3 interval (clamped to >= 5s) is asserted
 *                                as a value instead of being waited out
 *   - globalThis.WebSocket     → the `ws` package client (addEventListener /
 *                                readyState / OPEN compatible)
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");

// tsx must resolve the web app's `@/*` alias (apps/web/tsconfig.json), not the
// repo-root tsconfig. Must be set before the tsx ESM hooks initialize.
process.env.TSX_TSCONFIG_PATH = path.join(rootDir, "apps/web/tsconfig.json");
await import("tsx/esm");

const CONTROL_UI_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";

const localStorageData = new Map();
const intervalRegistry = new Map(); // handle -> { fn, ms }
let nextIntervalHandle = 1;

const windowShim = {
  location: { protocol: "http:", host: "127.0.0.1:1", search: "" },
  localStorage: {
    getItem: (key) => (localStorageData.has(key) ? localStorageData.get(key) : null),
    setItem: (key, value) => localStorageData.set(key, String(value)),
    removeItem: (key) => localStorageData.delete(key),
    clear: () => localStorageData.clear(),
  },
  setTimeout: (fn, ms, ...args) => globalThis.setTimeout(fn, ms, ...args),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  setInterval: (fn, ms) => {
    const handle = nextIntervalHandle++;
    intervalRegistry.set(handle, { fn, ms });
    return handle;
  },
  clearInterval: (handle) => {
    intervalRegistry.delete(handle);
  },
};
Object.defineProperty(globalThis, "window", { value: windowShim, configurable: true });
globalThis.WebSocket = WsWebSocket;

const { connectGatewayRpcClient } = await import(
  pathToFileURL(
    path.join(rootDir, "apps/web/src/features/ide-workbench/terminal/gatewayRpcClient.ts"),
  ).href
);
const { createGatewayTerminalTransport } = await import(
  pathToFileURL(
    path.join(rootDir, "apps/web/src/features/ide-workbench/terminal/terminalGatewayTransport.ts"),
  ).href
);

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function waitFor(condition, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(10);
  }
  assert.fail(`Timed out waiting for: ${label}`);
}

function seedGatewayToken(token) {
  localStorageData.clear();
  windowShim.location.search = "";
  if (token != null) {
    localStorageData.set(CONTROL_UI_SETTINGS_STORAGE_KEY, JSON.stringify({ token }));
  }
}

function tickIntervals() {
  const entries = Array.from(intervalRegistry.values());
  assert.ok(entries.length > 0, "expected at least one registered interval to tick");
  for (const entry of entries) entry.fn();
}

/**
 * Mock OpenClaw gateway. Records everything the client sends and answers per
 * the configurable handlers. A method handler returns:
 *   - a payload object          → {type:"res", id, ok:true, payload}
 *   - { error: {code,message} } → {type:"res", id, ok:false, error}
 *   - undefined                 → no response (fire-and-forget)
 */
async function startMockGateway(t, options = {}) {
  const {
    expectedToken = null,
    minProtocol = 3,
    maxProtocol = 5,
    closeBeforeChallengeCode = null,
    handlers = new Map(),
  } = options;

  const state = {
    upgradeUrls: [],
    connectParams: [],
    requests: [], // non-"connect" req frames: { id, method, params }
    sockets: new Set(),
  };

  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const { port } = wss.address();
  windowShim.location.host = `127.0.0.1:${port}`;

  const sendFrame = (socket, frame) => {
    socket.send(JSON.stringify(frame));
  };

  wss.on("connection", (socket, request) => {
    state.sockets.add(socket);
    state.upgradeUrls.push(String(request.url || ""));
    socket.on("close", () => state.sockets.delete(socket));

    if (closeBeforeChallengeCode != null) {
      socket.close(closeBeforeChallengeCode);
      return;
    }
    sendFrame(socket, { type: "event", event: "connect.challenge", payload: {} });

    socket.on("message", (data) => {
      let frame;
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!frame || frame.type !== "req") return;

      if (frame.method === "connect") {
        state.connectParams.push(frame.params);
        const clientMin = Number(frame.params?.minProtocol ?? 0);
        const clientMax = Number(frame.params?.maxProtocol ?? 0);
        if (clientMin > maxProtocol || clientMax < minProtocol) {
          sendFrame(socket, {
            type: "res",
            id: frame.id,
            ok: false,
            error: {
              code: "protocol_mismatch",
              message: `unsupported protocol version: client ${clientMin}-${clientMax}, server ${minProtocol}-${maxProtocol}`,
            },
          });
          return;
        }
        const authToken = frame.params?.auth?.token ?? null;
        if (expectedToken != null && authToken !== expectedToken) {
          sendFrame(socket, {
            type: "res",
            id: frame.id,
            ok: false,
            error: { code: "unauthorized", message: "invalid gateway token" },
          });
          return;
        }
        sendFrame(socket, {
          type: "res",
          id: frame.id,
          ok: true,
          payload: { type: "hello", protocol: Math.min(clientMax, maxProtocol) },
        });
        return;
      }

      state.requests.push({ id: frame.id, method: frame.method, params: frame.params });
      const handler = handlers.get(frame.method);
      if (!handler) return;
      const result = handler(frame.params, frame);
      if (result === undefined) return;
      if (result && typeof result === "object" && result.error) {
        sendFrame(socket, { type: "res", id: frame.id, ok: false, error: result.error });
        return;
      }
      sendFrame(socket, { type: "res", id: frame.id, ok: true, payload: result });
    });
  });

  const gateway = {
    port,
    state,
    handlers,
    requestsByMethod(method) {
      return state.requests.filter((entry) => entry.method === method);
    },
    broadcastTerminalEvent(payload) {
      for (const socket of state.sockets) {
        sendFrame(socket, { type: "event", event: "tracevane.terminal", payload });
      }
    },
    async close() {
      for (const socket of state.sockets) {
        try {
          socket.terminate();
        } catch {
          // already closed
        }
      }
      await new Promise((resolve) => wss.close(() => resolve()));
    },
  };
  t.after(() => gateway.close());
  return gateway;
}

function createTransportRecorder() {
  const calls = [];
  return {
    calls,
    eventsOfType(type) {
      return calls.filter((call) => call.kind === "event" && call.event.type === type);
    },
    handlers: {
      onOpen: () => calls.push({ kind: "open" }),
      onEvent: (event) => calls.push({ kind: "event", event }),
      onClose: () => calls.push({ kind: "close" }),
      onError: (message) => calls.push({ kind: "error", message }),
    },
  };
}

test("gateway handshake + attach + input echo + event broadcast + ack replay", async (t) => {
  seedGatewayToken("gw-secret");
  const attachEvents = [
    {
      type: "session",
      sid: "sid-1",
      instanceId: "inst-1",
      outputSeq: 2,
      descriptor: { sessionId: "sid-1", status: "running" },
    },
    { type: "output", sid: "sid-1", seq: 1, data: "hello " },
    { type: "output", sid: "sid-1", seq: 2, data: "world" },
  ];
  const gateway = await startMockGateway(t, {
    expectedToken: "gw-secret",
    handlers: new Map([
      [
        "tracevane.terminal.attach",
        (params) => ({ sid: params.sid, leaseTtlMs: 35_000, events: attachEvents }),
      ],
      [
        "tracevane.terminal.resize",
        (params) => ({
          ok: true,
          sid: params.sid,
          instanceId: "inst-1",
          events: [{ type: "output", sid: params.sid, seq: 4, data: "resized" }],
        }),
      ],
    ]),
  });

  const recorder = createTransportRecorder();
  const transport = createGatewayTerminalTransport(
    "sid-1",
    { rootId: "root-1", cwd: ".", cols: 100, rows: 30, profileId: null, shell: null },
    recorder.handlers,
  );

  // --- handshake contract ---
  await waitFor(() => gateway.state.connectParams.length === 1, "connect request");
  assert.match(gateway.state.upgradeUrls[0], /\?token=gw-secret/);
  const connectParams = gateway.state.connectParams[0];
  assert.equal(connectParams.minProtocol, 3);
  assert.equal(connectParams.maxProtocol, 5);
  assert.equal(connectParams.client.id, "openclaw-control-ui");
  assert.equal(connectParams.client.mode, "ui");
  assert.equal(connectParams.role, "operator");
  assert.deepEqual(connectParams.scopes, ["operator.read", "operator.write"]);
  assert.deepEqual(connectParams.auth, { token: "gw-secret" });

  // --- attach contract ---
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.attach").length === 1,
    "attach request",
  );
  const attach = gateway.requestsByMethod("tracevane.terminal.attach")[0];
  assert.deepEqual(attach.params, {
    sid: "sid-1",
    rootId: "root-1",
    workspaceId: "root-1",
    cwd: "", // normalizeRelativeCwd(".") → ""
    profileId: "local-shell", // normalizeProfileId(null) fallback
    shell: null,
    targetKind: "local",
    cols: 100,
    rows: 30,
    pinned: true,
    resume: true,
    lastSeq: 0,
    instanceId: null,
  });

  // onOpen fires before the attach-event replay. The client re-maps each
  // gateway event onto the workbench event shape (note: output events gain an
  // explicit `emittedAtMs` key, undefined when the server omits it).
  await waitFor(() => recorder.eventsOfType("output").length === 2, "attach event replay");
  assert.equal(recorder.calls[0].kind, "open");
  const replayed = recorder.calls.slice(1).map((call) => call.event);
  assert.deepEqual(replayed, [
    {
      type: "session",
      sid: "sid-1",
      instanceId: "inst-1",
      outputSeq: 2,
      descriptor: { sessionId: "sid-1", status: "running" },
    },
    { type: "output", sid: "sid-1", seq: 1, data: "hello ", emittedAtMs: undefined },
    { type: "output", sid: "sid-1", seq: 2, data: "world", emittedAtMs: undefined },
  ]);

  // Heartbeat scheduled at leaseTtlMs/3 (35s → ~11.6s), registered on the
  // manual-interval shim.
  assert.equal(intervalRegistry.size, 1);
  assert.equal(Array.from(intervalRegistry.values())[0].ms, Math.floor(35_000 / 3));

  // --- input → server echo broadcast ---
  transport.sendInput("ls\n");
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.input").length === 1,
    "input notify",
  );
  const input = gateway.requestsByMethod("tracevane.terminal.input")[0];
  assert.match(input.id, /^notify-/); // notify frames carry an id but expect no res
  assert.deepEqual(input.params, {
    sid: "sid-1",
    data: "ls\n",
    lastSeq: 2,
    instanceId: "inst-1",
    ackMode: "none",
  });

  gateway.broadcastTerminalEvent({ type: "output", sid: "sid-1", seq: 3, data: "ls\n" });
  await waitFor(() => recorder.eventsOfType("output").length === 3, "echo output event");

  // Replay / dedup guard: seq <= lastSeq is dropped, foreign sids are dropped.
  gateway.broadcastTerminalEvent({ type: "output", sid: "sid-1", seq: 3, data: "ls\n" });
  gateway.broadcastTerminalEvent({ type: "output", sid: "other-sid", seq: 9, data: "nope" });
  await sleep(150);
  assert.equal(recorder.eventsOfType("output").length, 3);

  // --- resize ack replay path ---
  transport.resize({ cols: 120, rows: 40 });
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.resize").length === 1,
    "resize request",
  );
  const resize = gateway.requestsByMethod("tracevane.terminal.resize")[0];
  assert.deepEqual(resize.params, {
    sid: "sid-1",
    cols: 120,
    rows: 40,
    lastSeq: 3,
    instanceId: "inst-1",
  });
  await waitFor(() => recorder.eventsOfType("output").length === 4, "resize ack replay");
  assert.equal(recorder.eventsOfType("output")[3].event.data, "resized");

  // Zero-dimension resize is a client-side no-op (raw-WS parity guard).
  transport.resize({ cols: 0, rows: 40 });
  await sleep(150);
  assert.equal(gateway.requestsByMethod("tracevane.terminal.resize").length, 1);

  // --- close → best-effort detach notify, heartbeat stopped ---
  transport.close();
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.detach").length === 1,
    "detach notify",
  );
  assert.deepEqual(gateway.requestsByMethod("tracevane.terminal.detach")[0].params, {
    sid: "sid-1",
  });
  assert.equal(intervalRegistry.size, 0);
});

test("token-rejected connect maps to structured auth error (no hang)", async (t) => {
  seedGatewayToken("wrong-token");
  await startMockGateway(t, { expectedToken: "right-token" });

  const startedAt = Date.now();
  await assert.rejects(() => connectGatewayRpcClient(), /鉴权失败/);
  assert.ok(
    Date.now() - startedAt < 5_000,
    "auth rejection must surface immediately, not fall through to the 10s connect timeout",
  );
});

test("gateway close code 1008 before handshake maps to structured error", async (t) => {
  seedGatewayToken("gw-secret");
  await startMockGateway(t, { closeBeforeChallengeCode: 1008 });

  await assert.rejects(() => connectGatewayRpcClient(), /1008/);
});

test("protocol mismatch (server maxProtocol below client min) maps to structured error", async (t) => {
  seedGatewayToken("gw-secret");
  await startMockGateway(t, { expectedToken: "gw-secret", minProtocol: 1, maxProtocol: 2 });

  const startedAt = Date.now();
  await assert.rejects(
    () => connectGatewayRpcClient(),
    /unsupported protocol version: client 3-5, server 1-2/,
  );
  assert.ok(Date.now() - startedAt < 5_000, "protocol mismatch must not hang");
});

test("heartbeat ack replay + lease loss triggers gap-free re-attach and recovery", async (t) => {
  seedGatewayToken("gw-secret");
  let heartbeatBehavior = "replay";
  const gateway = await startMockGateway(t, {
    expectedToken: "gw-secret",
    handlers: new Map([
      [
        "tracevane.terminal.attach",
        (params) => ({
          sid: params.sid,
          leaseTtlMs: 12_000,
          events: [
            { type: "session", sid: params.sid, instanceId: "inst-9", outputSeq: 0 },
          ],
        }),
      ],
      [
        "tracevane.terminal.heartbeat",
        (params) => {
          if (heartbeatBehavior === "fail") {
            return { error: { code: "session_lost", message: "lease expired" } };
          }
          return {
            ok: true,
            sid: params.sid,
            instanceId: "inst-9",
            outputSeq: 6,
            events: [{ type: "output", sid: params.sid, seq: 6, data: "hb-replay" }],
          };
        },
      ],
    ]),
  });

  const recorder = createTransportRecorder();
  const transport = createGatewayTerminalTransport(
    "sid-9",
    { rootId: "root-1", cwd: "sub/dir", cols: 80, rows: 24 },
    recorder.handlers,
  );

  await waitFor(() => recorder.calls.some((call) => call.kind === "open"), "transport open");

  // leaseTtlMs 12s → /3 = 4s → clamped up to the 5s minimum.
  assert.equal(intervalRegistry.size, 1);
  assert.equal(Array.from(intervalRegistry.values())[0].ms, 5_000);

  // Tick 1: heartbeat carries lastSeq/instanceId; ack events replay to the pane.
  tickIntervals();
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.heartbeat").length === 1,
    "heartbeat request",
  );
  assert.deepEqual(gateway.requestsByMethod("tracevane.terminal.heartbeat")[0].params, {
    sid: "sid-9",
    lastSeq: 0,
    instanceId: "inst-9",
  });
  await waitFor(() => recorder.eventsOfType("output").length === 1, "heartbeat ack replay");
  assert.equal(recorder.eventsOfType("output")[0].event.data, "hb-replay");

  // Tick 2 (first failure): swallowed below MAX_CONSECUTIVE_HEARTBEAT_FAILURES.
  heartbeatBehavior = "fail";
  tickIntervals();
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.heartbeat").length === 2,
    "first failing heartbeat",
  );
  await sleep(150);
  assert.equal(recorder.calls.filter((call) => call.kind === "error").length, 0);
  assert.equal(recorder.calls.filter((call) => call.kind === "close").length, 0);

  // Tick 3 (second consecutive failure): the lease is presumed lost, so the
  // transport re-attaches with gap-free resume params instead of tearing the
  // pane down (bounded backoff; first retry lands ~1s later).
  tickIntervals();
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.attach").length === 2,
    "gap-free re-attach after lease loss",
  );
  const reattach = gateway.requestsByMethod("tracevane.terminal.attach")[1];
  assert.equal(reattach.params.sid, "sid-9");
  assert.equal(reattach.params.lastSeq, 6);
  assert.equal(reattach.params.instanceId, "inst-9");

  // Recovery is silent: no error/close, heartbeat keeps ticking.
  await sleep(300);
  assert.equal(recorder.calls.filter((call) => call.kind === "error").length, 0);
  assert.equal(recorder.calls.filter((call) => call.kind === "close").length, 0);
  assert.equal(intervalRegistry.size, 1);

  // The recovered transport still sends input.
  heartbeatBehavior = "replay";
  const inputCountBefore = gateway.requestsByMethod("tracevane.terminal.input").length;
  transport.sendInput("echo still-alive\n");
  await waitFor(
    () => gateway.requestsByMethod("tracevane.terminal.input").length === inputCountBefore + 1,
    "input works after silent recovery",
  );
});
