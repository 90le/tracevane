import {
  TRACEVANE_TERMINAL_GATEWAY_EVENT,
  TRACEVANE_TERMINAL_GATEWAY_METHODS,
  type TerminalGatewayAckResponse,
  type TerminalGatewayAttachResponse,
  type TerminalGatewayEvent,
} from "../../../../../../types/terminal";
import { connectGatewayRpcClient, GatewayRpcClientError, type GatewayRpcClient } from "./gatewayRpcClient";
import {
  computeReconnectDelayMs,
  TERMINAL_RECONNECT_MAX_ATTEMPTS,
  type TerminalTransportFailure,
  type TerminalTransportFailureKind,
} from "./terminalTransportChain";
import {
  normalizeProfileId,
  normalizeRelativeCwd,
  normalizeShellName,
  type CreateWorkbenchTerminalOptions,
} from "./terminalClient";
import type {
  WorkbenchTerminalDimensions,
  WorkbenchTerminalTransport,
  WorkbenchTerminalTransportHandlers,
} from "./terminalTransport";

const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_CONSECUTIVE_HEARTBEAT_FAILURES = 2;

/**
 * Terminal realtime transport over the OpenClaw host gateway RPC channel.
 * Used in gateway single-port mode where raw plugin WebSocket upgrades never
 * reach the terminal service. Session attach/input/resize/heartbeat/detach
 * map to the `tracevane.terminal.*` gateway methods registered in
 * `index.ts`; output/session/closed events arrive as `tracevane.terminal`
 * gateway events. Payload shapes come from `types/terminal.ts`.
 *
 * Abnormal drops (WS close, heartbeat lease loss) re-attach with bounded
 * exponential backoff (`terminalTransportChain.ts`), resuming the pinned
 * session via lastSeq/instanceId. Initial-attach failures carry a structured
 * `TerminalTransportFailure` so the fallback chain can switch to the HTTP/SSE
 * compat channel (`terminalSseTransport.ts`).
 */
export function createGatewayTerminalTransport(
  sid: string,
  options: CreateWorkbenchTerminalOptions,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  let closed = false;
  let attached = false;
  let everAttached = false;
  let openedSent = false;
  let client: GatewayRpcClient | null = null;
  let removeEventListener: (() => void) | null = null;
  let heartbeatTimer: number | null = null;
  let consecutiveHeartbeatFailures = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: number | null = null;
  let lastSeq = 0;
  let instanceId = "";

  const stopHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const teardownClient = (): void => {
    stopHeartbeat();
    if (removeEventListener) {
      removeEventListener();
      removeEventListener = null;
    }
    const current = client;
    client = null;
    current?.close();
  };

  const toFailure = (
    error: unknown,
    fallbackKind: TerminalTransportFailureKind,
  ): TerminalTransportFailure => ({
    kind: error instanceof GatewayRpcClientError ? error.kind : fallbackKind,
    message: error instanceof Error ? error.message : String(error),
  });

  const fail = (message: string, failure?: TerminalTransportFailure): void => {
    if (closed) return;
    closed = true;
    attached = false;
    clearReconnectTimer();
    teardownClient();
    handlers.onError(message, failure);
    handlers.onClose();
  };

  const emitTerminalEvent = (event: TerminalGatewayEvent): void => {
    if (closed || !event || event.sid !== sid) return;
    switch (event.type) {
      case "session":
        instanceId = event.instanceId || instanceId;
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
        stopHeartbeat();
        handlers.onEvent({ type: "closed", sid: event.sid, reason: event.reason });
        return;
      case "error":
        handlers.onEvent({ type: "error", sid: event.sid, message: event.message });
        return;
    }
  };

  const emitAckEvents = (ack: TerminalGatewayAckResponse | undefined): void => {
    if (ack?.instanceId) instanceId = ack.instanceId;
    for (const event of ack?.events ?? []) emitTerminalEvent(event);
  };

  const startHeartbeat = (leaseTtlMs: number): void => {
    stopHeartbeat();
    const intervalMs = Math.max(
      MIN_HEARTBEAT_INTERVAL_MS,
      Math.floor((leaseTtlMs || 35_000) / 3),
    );
    heartbeatTimer = window.setInterval(() => {
      const current = client;
      if (closed || !attached || !current) return;
      current
        .request<TerminalGatewayAckResponse>(TRACEVANE_TERMINAL_GATEWAY_METHODS.heartbeat, {
          sid,
          lastSeq,
          instanceId: instanceId || null,
        })
        .then((ack) => {
          consecutiveHeartbeatFailures = 0;
          emitAckEvents(ack);
        })
        .catch((error) => {
          consecutiveHeartbeatFailures += 1;
          if (consecutiveHeartbeatFailures < MAX_CONSECUTIVE_HEARTBEAT_FAILURES) return;
          // Lease lost or gateway unreachable: re-attach (bounded backoff)
          // instead of killing the pane outright; a fresh attach re-registers
          // the subscriber lease and replays from lastSeq.
          scheduleReconnect(
            `终端网关心跳失败，会话租约已失效：${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }, intervalMs);
  };

  /**
   * Bounded exponential-backoff re-attach for abnormal drops (WS close,
   * heartbeat lease loss). The session is pinned server-side, so re-attaching
   * with the same sid plus lastSeq/instanceId resumes with gap-free replay.
   * Gives up (fail) after TERMINAL_RECONNECT_MAX_ATTEMPTS attempts.
   */
  const scheduleReconnect = (reason: string): void => {
    if (closed) return;
    attached = false;
    teardownClient();
    if (reconnectAttempts >= TERMINAL_RECONNECT_MAX_ATTEMPTS) {
      fail(
        `终端网关连接已断开，自动重连 ${TERMINAL_RECONNECT_MAX_ATTEMPTS} 次后仍未恢复：${reason}`,
        toFailure(reason, "network"),
      );
      return;
    }
    const delayMs = computeReconnectDelayMs(reconnectAttempts);
    reconnectAttempts += 1;
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void attachOnce();
    }, delayMs);
  };

  const attachOnce = async (): Promise<void> => {
    try {
      const connected = await connectGatewayRpcClient({
        onClose: (reason) => {
          // Abnormal gateway drop after a successful connect: re-attach with
          // backoff instead of tearing the pane down.
          if (closed) return;
          scheduleReconnect(reason);
        },
      });
      if (closed) {
        connected.close();
        return;
      }
      client = connected;
      removeEventListener = connected.addEventListener(
        TRACEVANE_TERMINAL_GATEWAY_EVENT,
        (payload) => emitTerminalEvent(payload as TerminalGatewayEvent),
      );
      const attach = await connected.request<TerminalGatewayAttachResponse>(
        TRACEVANE_TERMINAL_GATEWAY_METHODS.attach,
        {
          sid,
          rootId: options.rootId,
          workspaceId: options.rootId,
          cwd: normalizeRelativeCwd(options.cwd),
          profileId: normalizeProfileId(options.profileId),
          shell: normalizeShellName(options.shell),
          targetKind: "local",
          cols: options.cols ?? 80,
          rows: options.rows ?? 24,
          pinned: true,
          resume: true,
          lastSeq,
          instanceId: instanceId || null,
        },
      );
      if (closed) return;
      attached = true;
      everAttached = true;
      reconnectAttempts = 0;
      consecutiveHeartbeatFailures = 0;
      // Fire onOpen before replaying attach events so the pane's session-event
      // handling (backend badge/message) lands after the generic "running".
      // Only the first attach reports onOpen; reconnects resume silently.
      if (!openedSent) {
        openedSent = true;
        handlers.onOpen();
      }
      for (const event of attach.events ?? []) emitTerminalEvent(event);
      startHeartbeat(attach.leaseTtlMs);
    } catch (error) {
      if (closed) return;
      if (everAttached) {
        // A reconnect attempt failed: keep backing off within the bound.
        scheduleReconnect(error instanceof Error ? error.message : String(error));
        return;
      }
      // Initial attach failure: surface the structured reason so the
      // fallback chain can switch to the HTTP/SSE compat channel.
      const failure = toFailure(error, "network");
      fail(failure.message, failure);
    }
  };

  void attachOnce();

  return {
    sendInput(data: string): void {
      const current = client;
      if (closed || !attached || !current || !data) return;
      current.notify(TRACEVANE_TERMINAL_GATEWAY_METHODS.input, {
        sid,
        data,
        lastSeq,
        instanceId: instanceId || null,
        ackMode: "none",
      });
    },
    resize(dimensions: WorkbenchTerminalDimensions): void {
      const current = client;
      if (closed || !attached || !current) return;
      const cols = Math.trunc(dimensions.cols) || 0;
      const rows = Math.trunc(dimensions.rows) || 0;
      if (!cols || !rows) return;
      current
        .request<TerminalGatewayAckResponse>(TRACEVANE_TERMINAL_GATEWAY_METHODS.resize, {
          sid,
          cols,
          rows,
          lastSeq,
          instanceId: instanceId || null,
        })
        .then((ack) => emitAckEvents(ack))
        .catch(() => {
          // Raw-WS parity: resize failures are silent; the heartbeat surfaces
          // a dead session with a structured error.
        });
    },
    close(): void {
      if (closed) return;
      closed = true;
      attached = false;
      clearReconnectTimer();
      const current = client;
      if (current) {
        try {
          current.notify(TRACEVANE_TERMINAL_GATEWAY_METHODS.detach, { sid });
        } catch {
          // best-effort detach; the server also prunes by lease
        }
      }
      teardownClient();
    },
  };
}
