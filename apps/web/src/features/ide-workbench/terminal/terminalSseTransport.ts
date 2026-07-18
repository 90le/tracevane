import type { TerminalGatewayEvent } from "../../../../../../types/terminal";
import { apiRequest } from "@/lib/api/client";
import { resolveApiUrl } from "@/lib/runtime";
import {
  normalizeProfileId,
  normalizeRelativeCwd,
  type CreateWorkbenchTerminalOptions,
} from "./terminalClient";
import {
  computeReconnectDelayMs,
  TERMINAL_RECONNECT_MAX_ATTEMPTS,
  type TerminalTransportFailure,
} from "./terminalTransportChain";
import type {
  WorkbenchTerminalDimensions,
  WorkbenchTerminalTransport,
  WorkbenchTerminalTransportHandlers,
} from "./terminalTransport";

/**
 * Terminal realtime transport over plain HTTP: `EventSource` on
 * `GET /api/terminal/sessions/:id/stream` for output/session events, and
 * `POST .../input` / `POST .../resize` for writes (routes in
 * `apps/api/modules/terminal/routes.ts`). This is the OpenClaw gateway
 * single-port compat channel: it works wherever the page itself loaded from,
 * because it needs no WebSocket upgrade and no host device-identity pairing.
 *
 * Stream subscribers carry no server-side lease (cleanup happens on
 * connection close), so there is no client heartbeat here — unlike the
 * gateway-RPC transport. Abnormal stream drops re-open with bounded
 * exponential backoff (`terminalTransportChain.ts`), resuming from
 * lastSeq/instanceId for gap-free replay.
 */
export function createSseTerminalTransport(
  sid: string,
  options: CreateWorkbenchTerminalOptions,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  let closed = false;
  let openedSent = false;
  let attachedOnce = false;
  let source: EventSource | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: number | null = null;
  let lastSeq = 0;
  let instanceId = "";

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const teardownSource = (): void => {
    const current = source;
    source = null;
    if (!current) return;
    try {
      current.close();
    } catch {
      // ignore close races
    }
  };

  const fail = (message: string, failure?: TerminalTransportFailure): void => {
    if (closed) return;
    closed = true;
    clearReconnectTimer();
    teardownSource();
    handlers.onError(message, failure);
    handlers.onClose();
  };

  const buildStreamUrl = (): string => {
    const params = new URLSearchParams({
      profileId: normalizeProfileId(options.profileId),
      targetKind: "local",
      cwd: normalizeRelativeCwd(options.cwd),
      pinned: "1",
      resume: "1",
    });
    if (lastSeq > 0) params.set("lastSeq", String(lastSeq));
    if (instanceId) params.set("instanceId", instanceId);
    return resolveApiUrl(
      `/api/terminal/sessions/${encodeURIComponent(sid)}/stream?${params.toString()}`,
    );
  };

  const handleTerminalEvent = (event: TerminalGatewayEvent): void => {
    if (closed || !event || (event.sid && event.sid !== sid)) return;
    switch (event.type) {
      case "session":
        instanceId = event.instanceId || instanceId;
        attachedOnce = true;
        handlers.onEvent({
          type: "session",
          sid: event.sid,
          instanceId: event.instanceId,
          outputSeq: event.outputSeq,
          descriptor: event.descriptor,
        });
        return;
      case "reset":
        instanceId = event.instanceId || instanceId;
        lastSeq = 0;
        handlers.onEvent({
          type: "reset",
          sid: event.sid,
          instanceId: event.instanceId,
          reason: event.reason,
        });
        return;
      case "output":
        if (event.seq <= lastSeq) return;
        lastSeq = event.seq;
        attachedOnce = true;
        handlers.onEvent({
          type: "output",
          sid: event.sid,
          seq: event.seq,
          data: event.data,
          emittedAtMs: event.emittedAtMs,
        });
        return;
      case "clear":
        handlers.onEvent({
          type: "clear",
          sid: event.sid,
          instanceId: event.instanceId,
          clearedThroughSeq: event.clearedThroughSeq,
        });
        return;
      case "closed":
        handlers.onEvent({ type: "closed", sid: event.sid, reason: event.reason });
        return;
      case "error":
        // The route sends a terminal error event then ends the stream when the
        // attach itself fails (dead session, pty unavailable): treat that as
        // the transport's total failure instead of retrying into the same
        // rejection. Post-attach error events stay informational.
        if (!attachedOnce) {
          fail(event.message || "终端兼容通道连接失败。", {
            kind: "session",
            message: event.message || "终端兼容通道连接失败。",
          });
          return;
        }
        handlers.onEvent({ type: "error", sid: event.sid, message: event.message });
        return;
    }
  };

  const scheduleReconnect = (reason: string): void => {
    if (closed) return;
    teardownSource();
    if (reconnectAttempts >= TERMINAL_RECONNECT_MAX_ATTEMPTS) {
      fail(
        `终端兼容通道连接中断，自动重连 ${TERMINAL_RECONNECT_MAX_ATTEMPTS} 次后仍未恢复：${reason}`,
        { kind: "network", message: reason },
      );
      return;
    }
    const delayMs = computeReconnectDelayMs(reconnectAttempts);
    reconnectAttempts += 1;
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openStream();
    }, delayMs);
  };

  const openStream = (): void => {
    teardownSource();
    let next: EventSource;
    try {
      next = new EventSource(buildStreamUrl());
    } catch (error) {
      scheduleReconnect(error instanceof Error ? error.message : String(error));
      return;
    }
    source = next;
    next.addEventListener("open", () => {
      if (closed || source !== next) return;
      reconnectAttempts = 0;
      if (!openedSent) {
        openedSent = true;
        handlers.onOpen();
      }
    });
    next.addEventListener("terminal", (rawEvent) => {
      if (closed || source !== next) return;
      try {
        handleTerminalEvent(
          JSON.parse(String((rawEvent as MessageEvent<string>).data || "")) as TerminalGatewayEvent,
        );
      } catch {
        // malformed frame; the stream stays alive for subsequent events
      }
    });
    next.addEventListener("error", () => {
      if (closed || source !== next) return;
      // Transport-level drop: EventSource would retry forever on its own
      // schedule, so take over with the bounded backoff chain instead.
      scheduleReconnect("服务器关闭了输出流或网络不可达");
    });
  };

  openStream();

  return {
    sendInput(data: string): void {
      if (closed || !data) return;
      void apiRequest(`/api/terminal/sessions/${encodeURIComponent(sid)}/input`, {
        method: "POST",
        body: JSON.stringify({ data }),
      }).catch(() => {
        // Raw-WS parity: input posted during a reconnect window is dropped
        // silently; persistent failure surfaces through the stream state.
      });
    },
    resize(dimensions: WorkbenchTerminalDimensions): void {
      if (closed) return;
      const cols = Math.trunc(dimensions.cols) || 0;
      const rows = Math.trunc(dimensions.rows) || 0;
      if (!cols || !rows) return;
      void apiRequest(`/api/terminal/sessions/${encodeURIComponent(sid)}/resize`, {
        method: "POST",
        body: JSON.stringify({ cols, rows }),
      }).catch(() => {
        // Raw-WS parity: resize failures are silent.
      });
    },
    close(): void {
      if (closed) return;
      closed = true;
      clearReconnectTimer();
      teardownSource();
      // No explicit detach: the session is pinned server-side for reattach,
      // and the backend prunes the stream subscriber on connection close.
    },
  };
}
