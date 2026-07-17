import {
  TRACEVANE_TERMINAL_GATEWAY_EVENT,
  TRACEVANE_TERMINAL_GATEWAY_METHODS,
  type TerminalGatewayAckResponse,
  type TerminalGatewayAttachResponse,
  type TerminalGatewayEvent,
} from "../../../../../../types/terminal";
import { connectGatewayRpcClient, type GatewayRpcClient } from "./gatewayRpcClient";
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
 */
export function createGatewayTerminalTransport(
  sid: string,
  options: CreateWorkbenchTerminalOptions,
  handlers: WorkbenchTerminalTransportHandlers,
): WorkbenchTerminalTransport {
  let closed = false;
  let attached = false;
  let client: GatewayRpcClient | null = null;
  let removeEventListener: (() => void) | null = null;
  let heartbeatTimer: number | null = null;
  let consecutiveHeartbeatFailures = 0;
  let lastSeq = 0;
  let instanceId = "";

  const stopHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
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

  const fail = (message: string): void => {
    if (closed) return;
    closed = true;
    attached = false;
    teardownClient();
    handlers.onError(message);
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
          fail(
            `终端网关心跳失败，会话租约已失效：${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }, intervalMs);
  };

  void (async () => {
    try {
      const connected = await connectGatewayRpcClient({
        onClose: (reason) => {
          if (closed) return;
          closed = true;
          attached = false;
          teardownClient();
          handlers.onClose();
          void reason;
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
        },
      );
      if (closed) return;
      attached = true;
      // Fire onOpen before replaying attach events so the pane's session-event
      // handling (backend badge/message) lands after the generic "running".
      handlers.onOpen();
      for (const event of attach.events ?? []) emitTerminalEvent(event);
      startHeartbeat(attach.leaseTtlMs);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  })();

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
