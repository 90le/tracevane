import { getTracevaneRuntime, isGatewayExposure } from "@/lib/runtime";
import {
  createTerminalWebSocketUrl,
  parseTerminalEvent,
  type CreateWorkbenchTerminalOptions,
  type WorkbenchTerminalEvent,
} from "./terminalClient";
import { createGatewayTerminalTransport } from "./terminalGatewayTransport";
import { createSseTerminalTransport } from "./terminalSseTransport";
import {
  createTerminalTransportFallbackChain,
  type TerminalFallbackNotice,
  type TerminalTransportFailure,
} from "./terminalTransportChain";

export interface WorkbenchTerminalDimensions {
  cols: number;
  rows: number;
}

export interface WorkbenchTerminalTransportHandlers {
  onOpen: () => void;
  onEvent: (event: WorkbenchTerminalEvent) => void;
  onClose: () => void;
  onError: (message: string, failure?: TerminalTransportFailure) => void;
  /**
   * Non-blocking one-line status notice (currently: the gateway-RPC → SSE
   * compat-channel fallback). Never an error state; the prominent error
   * banner stays reserved for total failure via onError.
   */
  onNotice?: (notice: TerminalFallbackNotice) => void;
}

/**
 * Mode-agnostic terminal realtime channel. Standalone mode uses the raw
 * `/ws/terminal` WebSocket; OpenClaw gateway single-port mode tunnels the
 * session through host gateway RPC (`terminalGatewayTransport.ts`).
 */
export interface WorkbenchTerminalTransport {
  sendInput: (data: string) => void;
  resize: (dimensions: WorkbenchTerminalDimensions) => void;
  close: () => void;
}

/** Re-exported so transport implementations share one definition. */
export type { TerminalFallbackNotice, TerminalTransportFailure } from "./terminalTransportChain";

function createRawWebSocketTerminalTransport(
  sid: string,
  options: CreateWorkbenchTerminalOptions,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  let closed = false;
  const socket = new WebSocket(createTerminalWebSocketUrl(sid, options));

  socket.addEventListener("open", () => {
    if (closed) return;
    socket.send(
      JSON.stringify({
        type: "resize",
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
      }),
    );
    handlers.onOpen();
  });
  socket.addEventListener("message", (event) => {
    if (closed) return;
    const payload = parseTerminalEvent(event);
    if (payload) handlers.onEvent(payload);
  });
  socket.addEventListener("close", () => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  });
  socket.addEventListener("error", () => {
    if (closed) return;
    handlers.onError("终端 WebSocket 连接失败", {
      kind: "network",
      message: "终端 WebSocket 连接失败",
    });
  });

  return {
    sendInput(data: string): void {
      if (closed || !data || socket.readyState !== WebSocket.OPEN) return;
      socket.send(data);
    },
    resize(dimensions: WorkbenchTerminalDimensions): void {
      if (closed || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", ...dimensions }));
    },
    close(): void {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {
        // ignore close races
      }
    },
  };
}

function createFailedTerminalTransport(
  message: string,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  const timer = window.setTimeout(() => {
    handlers.onError(message, { kind: "disabled", message });
    handlers.onClose();
  }, 0);
  return {
    sendInput: () => {},
    resize: () => {},
    close: () => window.clearTimeout(timer),
  };
}

/**
 * Picks the realtime transport from the injected runtime config:
 * `realtimeTransport: "gateway-rpc"` (gateway exposure) tunnels through the
 * OpenClaw host gateway, with an automatic fallback to the HTTP/SSE compat
 * channel (`terminalSseTransport.ts`) when the host rejects the RPC attach
 * (auth/pairing/protocol) — see `terminalTransportChain.ts`; `"raw-ws"` keeps
 * the direct WebSocket; `"disabled"` or `features.terminalRealtime === false`
 * yields a structured error state.
 */
export function connectWorkbenchTerminal(
  sid: string,
  options: CreateWorkbenchTerminalOptions,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  const runtime = getTracevaneRuntime();
  if (runtime?.features && runtime.features.terminalRealtime === false) {
    return createFailedTerminalTransport(
      "服务端已禁用终端实时通道（features.terminalRealtime=false）。",
      handlers,
    );
  }
  const transportKind =
    runtime?.realtimeTransport ?? (isGatewayExposure() ? "gateway-rpc" : "raw-ws");
  if (transportKind === "disabled") {
    return createFailedTerminalTransport(
      "服务端已禁用终端实时通道（realtimeTransport=disabled）。",
      handlers,
    );
  }
  if (transportKind === "gateway-rpc") {
    return createTerminalTransportFallbackChain<WorkbenchTerminalEvent>({
      createPrimary: (chainHandlers) =>
        createGatewayTerminalTransport(sid, options, chainHandlers),
      createFallback: (chainHandlers) =>
        createSseTerminalTransport(sid, options, chainHandlers),
      handlers,
    });
  }
  return createRawWebSocketTerminalTransport(sid, options, handlers);
}
