import * as React from "react";

import { isGatewayExposure } from "@/lib/runtime";
import { applyDebugGatewayEvent, setDebugGatewayConnectionState } from "./debugStore";
import { createDebugWebSocketUrl, DEBUG_GATEWAY_UNAVAILABLE_MESSAGE, parseDebugGatewayEvent } from "./debugClient";

export function DebugGatewayBridge({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (isGatewayExposure()) {
      // Debug realtime rides a raw WebSocket (/ws/debug); OpenClaw gateway
      // single-port mode never forwards WS upgrades to plugin routes, and no
      // gateway RPC bridge exists for debug. Report unavailable instead of
      // looping on a connection that can never succeed.
      setDebugGatewayConnectionState("unavailable", DEBUG_GATEWAY_UNAVAILABLE_MESSAGE);
      return;
    }
    let socket: WebSocket | null = null;
    let disposed = false;
    setDebugGatewayConnectionState("connecting", "正在连接 Debug Gateway…");
    try {
      socket = new WebSocket(createDebugWebSocketUrl());
    } catch (error) {
      setDebugGatewayConnectionState("error", error instanceof Error ? error.message : String(error));
      return;
    }
    socket.addEventListener("open", () => {
      if (disposed || !socket) return;
      setDebugGatewayConnectionState("connected", "Debug Gateway 已连接");
      socket.send(JSON.stringify({ type: "list" }));
    });
    socket.addEventListener("message", (event) => {
      const parsed = parseDebugGatewayEvent(event.data);
      if (parsed) applyDebugGatewayEvent(parsed);
    });
    socket.addEventListener("close", () => {
      if (disposed) return;
      setDebugGatewayConnectionState("disconnected", "Debug Gateway 连接已断开");
    });
    socket.addEventListener("error", () => {
      if (disposed) return;
      setDebugGatewayConnectionState("error", "Debug Gateway 连接错误");
    });
    return () => {
      disposed = true;
      try { socket?.close(1000, "debug bridge disposed"); } catch {}
    };
  }, [enabled]);

  return null;
}
