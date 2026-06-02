import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const transportModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-transport.ts");

test("terminal transport plan prefers direct socket before gateway rpc fallback", () => {
  const direct = transportModule.resolveTerminalTransportPlan({
    realtimeTransport: "gateway-rpc",
    realtimeEnabled: true,
    directSocketUrl: "ws://127.0.0.1:6123/ws/terminal",
    directSocketActive: false,
    directSocketFailed: false,
    httpStreamFailed: false,
  });

  assert.equal(direct.mode, "direct-ws");
  assert.equal(direct.useDirectSocket, true);
  assert.equal(direct.useGatewayRpc, false);

  const gateway = transportModule.resolveTerminalTransportPlan({
    realtimeTransport: "gateway-rpc",
    realtimeEnabled: true,
    directSocketUrl: "ws://127.0.0.1:6123/ws/terminal",
    directSocketActive: false,
    directSocketFailed: true,
    httpStreamFailed: false,
  });

  assert.equal(gateway.mode, "gateway-rpc");
  assert.equal(gateway.useGatewayRpc, true);
  assert.equal(gateway.useHttpStream, true);
});

test("terminal transport builds raw and direct websocket urls with replay cursor", () => {
  assert.equal(
    transportModule.buildTerminalSocketUrl({
      protocol: "ws:",
      host: "localhost:5176",
      webSocketBasePath: "/studio",
      sid: "term-1",
      lastSeq: 42,
      instanceId: "inst-1",
      skipReplay: true,
      resume: true,
    }),
    "ws://localhost:5176/studio/ws/terminal?sid=term-1&lastSeq=42&instanceId=inst-1&skipReplay=1&resume=1",
  );

  assert.equal(
    transportModule.buildTerminalSocketUrl({
      protocol: "wss:",
      host: "studio.example",
      webSocketBasePath: "",
      directSocketUrl: "wss://studio.example:9443/ws/terminal",
      sid: "term-2",
    }),
    "wss://studio.example:9443/ws/terminal?sid=term-2",
  );

  assert.equal(
    transportModule.buildTerminalSocketUrl({
      protocol: "ws:",
      host: "localhost:5176",
      webSocketBasePath: "/studio",
      sid: "term-3",
      profileId: "agent-codex",
      targetKind: "local",
      cwd: "/workspace",
      pinned: true,
    }),
    "ws://localhost:5176/studio/ws/terminal?sid=term-3&profileId=agent-codex&targetKind=local&cwd=%2Fworkspace&pinned=1",
  );
});
