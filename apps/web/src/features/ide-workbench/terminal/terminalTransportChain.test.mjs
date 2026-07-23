/**
 * Scratch Node test for the terminal transport fallback chain logic
 * (`terminalTransportChain.ts`, pure/no-browser module). Mocks the two
 * transports and proves the chain picks the SSE compat channel when the
 * gateway-RPC attach rejects with a structured failure, and that normal
 * detach / post-attach failures never trigger the fallback.
 *
 * Run from the repo root:
 *   node --experimental-strip-types --test \
 *     apps/web/src/features/ide-workbench/terminal/terminalTransportChain.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompatChannelNotice,
  computeReconnectDelayMs,
  createTerminalTransportFallbackChain,
  isGatewayFallbackEligible,
  resolveTerminalTransportChannel,
} from "./terminalTransportChain.ts";

function createMockFactory(name, created) {
  return (handlers) => {
    const record = { name, handlers, inputs: [], resizes: [], closed: false };
    created.push(record);
    return {
      sendInput: (data) => record.inputs.push(data),
      resize: (dimensions) => record.resizes.push(dimensions),
      close: () => {
        record.closed = true;
      },
    };
  };
}

function createOuterHandlers(calls) {
  return {
    onOpen: () => calls.push(["open"]),
    onEvent: (event) => calls.push(["event", event]),
    onClose: () => calls.push(["close"]),
    onError: (message, failure) => calls.push(["error", message, failure?.kind]),
    onNotice: (notice) => calls.push(["notice", notice.message, notice.detail]),
  };
}

test("falls back to the SSE channel when gateway-RPC attach rejects (pairing)", () => {
  const created = [];
  const calls = [];
  const chain = createTerminalTransportFallbackChain({
    createPrimary: createMockFactory("gateway-rpc", created),
    createFallback: createMockFactory("sse", created),
    handlers: createOuterHandlers(calls),
  });

  assert.equal(created.length, 1, "only the primary transport starts");
  assert.equal(created[0].name, "gateway-rpc");

  // Host rejects the attach: device-identity/pairing required.
  created[0].handlers.onError("宿主要求设备配对", {
    kind: "pairing",
    message: "宿主要求设备配对",
  });

  assert.equal(created.length, 2, "fallback transport starts automatically");
  assert.equal(created[1].name, "sse");
  const notice = calls.find((call) => call[0] === "notice");
  assert.ok(notice, "fallback emits a one-line notice");
  assert.equal(notice[1], "已切换为兼容通道");
  assert.match(notice[2], /宿主要求设备配对/, "notice detail keeps the detected reason");
  assert.match(notice[2], /配对/, "notice detail carries pairing guidance");
  assert.match(notice[2], /独立模式/, "notice detail suggests standalone mode");
  assert.equal(
    calls.filter((call) => call[0] === "error").length,
    0,
    "structured attach rejection never reaches the error banner",
  );

  // The failed primary's trailing close is swallowed (no pane teardown).
  created[0].handlers.onClose();
  assert.equal(calls.filter((call) => call[0] === "close").length, 0);

  // The chain keeps a stable identity: writes now flow to the SSE transport.
  chain.sendInput("ls\n");
  chain.resize({ cols: 120, rows: 30 });
  assert.deepEqual(created[1].inputs, ["ls\n"]);
  assert.deepEqual(created[1].resizes, [{ cols: 120, rows: 30 }]);
  assert.deepEqual(created[0].inputs, [], "dead primary receives no further input");

  chain.close();
  assert.equal(created[1].closed, true, "close reaches the active fallback");
});

test("falls back on auth and protocol attach rejections too", () => {
  for (const kind of ["auth", "protocol", "network"]) {
    const created = [];
    const calls = [];
    createTerminalTransportFallbackChain({
      createPrimary: createMockFactory("gateway-rpc", created),
      createFallback: createMockFactory("sse", created),
      handlers: createOuterHandlers(calls),
    });
    created[0].handlers.onError(`failure:${kind}`, { kind, message: `failure:${kind}` });
    assert.equal(created[1]?.name, "sse", `${kind} failure falls back`);
    assert.equal(calls.filter((call) => call[0] === "error").length, 0);
  }
});

test("post-attach failures and normal detach never fall back", () => {
  const created = [];
  const calls = [];
  createTerminalTransportFallbackChain({
    createPrimary: createMockFactory("gateway-rpc", created),
    createFallback: createMockFactory("sse", created),
    handlers: createOuterHandlers(calls),
  });

  created[0].handlers.onOpen();
  created[0].handlers.onError("会话级错误", { kind: "session", message: "会话级错误" });
  assert.equal(created.length, 1, "no fallback after a successful attach");
  assert.equal(calls.filter((call) => call[0] === "error").length, 1, "error passes through");

  // Normal detach: a bare close with no preceding error.
  created[0].handlers.onClose();
  assert.equal(created.length, 1, "normal detach does not fall back");
  assert.equal(calls.filter((call) => call[0] === "close").length, 1, "close passes through");
});

test("session/disabled failures are not fallback-eligible even before open", () => {
  for (const kind of ["session", "disabled"]) {
    const created = [];
    const calls = [];
    createTerminalTransportFallbackChain({
      createPrimary: createMockFactory("gateway-rpc", created),
      createFallback: createMockFactory("sse", created),
      handlers: createOuterHandlers(calls),
    });
    created[0].handlers.onError(`failure:${kind}`, { kind, message: `failure:${kind}` });
    assert.equal(created.length, 1, `${kind} failure stays a total failure`);
    assert.equal(calls.filter((call) => call[0] === "error").length, 1);
  }
});

test("a closed chain ignores late primary callbacks", () => {
  const created = [];
  const calls = [];
  const chain = createTerminalTransportFallbackChain({
    createPrimary: createMockFactory("gateway-rpc", created),
    createFallback: createMockFactory("sse", created),
    handlers: createOuterHandlers(calls),
  });
  chain.close();
  created[0].handlers.onError("迟到的配对拒绝", { kind: "pairing", message: "迟到的配对拒绝" });
  created[0].handlers.onClose();
  assert.equal(created.length, 1, "no fallback after the user closed the pane");
  assert.deepEqual(calls, [], "no callbacks reach the pane after close");
});

test("computeReconnectDelayMs backs off 1s → 15s and stays capped", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((attempt) => computeReconnectDelayMs(attempt)),
    [1000, 2000, 4000, 8000, 15000],
  );
  assert.equal(computeReconnectDelayMs(5), 15000);
  assert.equal(computeReconnectDelayMs(100), 15000);
  assert.equal(computeReconnectDelayMs(-3), 1000);
});

test("isGatewayFallbackEligible only matches structured pre-attach failures", () => {
  for (const kind of ["auth", "pairing", "protocol", "network"]) {
    assert.equal(isGatewayFallbackEligible({ kind, message: "x" }), true, kind);
  }
  for (const kind of ["session", "disabled"]) {
    assert.equal(isGatewayFallbackEligible({ kind, message: "x" }), false, kind);
  }
});

test("buildCompatChannelNotice keeps reason and adds actionable guidance", () => {
  const pairing = buildCompatChannelNotice({ kind: "pairing", message: "需要设备身份签名" });
  assert.equal(pairing.message, "已切换为兼容通道");
  assert.match(pairing.detail, /需要设备身份签名/);
  assert.match(pairing.detail, /配对请求/);

  const auth = buildCompatChannelNotice({ kind: "auth", message: "token 无效" });
  assert.match(auth.detail, /token 无效/);
  assert.match(auth.detail, /Control UI/);

  const fallback = buildCompatChannelNotice({ kind: "network", message: "" });
  assert.match(fallback.detail, /网关通道不可用/, "empty reason gets a sane default");
});

test("OpenClaw gateway exposure selects immediate SSE output", () => {
  assert.equal(resolveTerminalTransportChannel("gateway-rpc", true), "sse");
  assert.equal(resolveTerminalTransportChannel(undefined, true), "sse");
  assert.equal(resolveTerminalTransportChannel("raw-ws", true), "raw-ws");
  assert.equal(resolveTerminalTransportChannel(undefined, false), "raw-ws");
  assert.equal(resolveTerminalTransportChannel("disabled", true), "disabled");
});
