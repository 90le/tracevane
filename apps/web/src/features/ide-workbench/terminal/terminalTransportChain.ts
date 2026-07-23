/**
 * Pure, browser-free decision logic for the terminal realtime transport
 * fallback chain (gateway-RPC primary → HTTP/SSE compat channel) and the
 * bounded reconnect backoff both transports share. Kept dependency-free on
 * purpose so the chain behavior is testable under plain Node
 * (`terminalTransportChain.test.mjs`, run with `node --experimental-strip-types`).
 */

/** Structured classification of a terminal transport failure. */
export type TerminalTransportFailureKind =
  | "auth"
  | "pairing"
  | "protocol"
  | "network"
  | "session"
  | "disabled";

export interface TerminalTransportFailure {
  kind: TerminalTransportFailureKind;
  message: string;
  detail?: string;
}

/** One-line non-blocking pane notice plus its title-attr detail. */
export interface TerminalFallbackNotice {
  message: string;
  detail?: string;
}

export const TERMINAL_RECONNECT_MAX_ATTEMPTS = 5;
export const TERMINAL_RECONNECT_BASE_DELAY_MS = 1_000;
export const TERMINAL_RECONNECT_MAX_DELAY_MS = 15_000;

export type TerminalRealtimeTransportSetting =
  | "gateway-rpc"
  | "raw-ws"
  | "disabled";

/**
 * OpenClaw gateway events are host-scheduled and can delay interactive PTY
 * output. Its same-origin HTTP/SSE stream is flushed immediately, so gateway
 * exposure uses that channel while standalone mode keeps the raw WebSocket.
 */
export function resolveTerminalTransportChannel(
  configured: TerminalRealtimeTransportSetting | undefined,
  gatewayExposure: boolean,
): "sse" | "raw-ws" | "disabled" {
  const setting = configured ?? (gatewayExposure ? "gateway-rpc" : "raw-ws");
  if (setting === "disabled") return "disabled";
  return setting === "gateway-rpc" ? "sse" : "raw-ws";
}

/**
 * Exponential backoff for abnormal-close re-attach: 1s → 2s → 4s → 8s → 15s
 * (capped). `attemptIndex` is zero-based (first retry waits 1s).
 */
export function computeReconnectDelayMs(attemptIndex: number): number {
  const attempt = Math.max(0, Math.trunc(attemptIndex) || 0);
  return Math.min(
    TERMINAL_RECONNECT_MAX_DELAY_MS,
    TERMINAL_RECONNECT_BASE_DELAY_MS * 2 ** attempt,
  );
}

/**
 * True when a gateway-RPC failure happening before the first successful
 * attach should fall back to the HTTP/SSE compat channel: structured
 * auth/pairing/protocol rejections from the host, plus pre-attach network
 * failures (a proxy that blocks the WS upgrade but forwards plain HTTP is
 * exactly the single-port scenario SSE survives). Session-level failures
 * after a successful attach and explicit feature disables never fall back.
 */
export function isGatewayFallbackEligible(
  failure: TerminalTransportFailure,
): boolean {
  return (
    failure.kind === "auth" ||
    failure.kind === "pairing" ||
    failure.kind === "protocol" ||
    failure.kind === "network"
  );
}

const FALLBACK_GUIDANCE_BY_KIND: Record<TerminalTransportFailureKind, string> = {
  auth: "请先在 OpenClaw Control UI 登录（或用 ?token=<gateway-token> 打开本页面），或改用 Tracevane 独立模式直连。",
  pairing:
    "请在 OpenClaw 控制端批准本设备的配对请求（设备身份签名），或在宿主侧允许 token-only 的 UI 连接，或改用 Tracevane 独立模式直连。",
  protocol: "请确认 OpenClaw 宿主版本支持当前网关协议（必要时升级宿主），或改用 Tracevane 独立模式直连。",
  network: "宿主可能未放行 WebSocket 升级，或网关连接不稳定；已自动改用 HTTP/SSE 兼容通道，如持续失败请检查宿主代理配置。",
  session: "终端会话级错误不会触发通道切换，请直接查看错误信息。",
  disabled: "服务端已禁用终端实时通道。",
};

/**
 * Builds the pane notice for a fallback switch: the one-line message stays
 * short ("已切换为兼容通道"), while `detail` (rendered as the notice's title
 * attr) carries the detected reason plus actionable guidance so the failure
 * is never silently swallowed.
 */
export function buildCompatChannelNotice(
  failure: TerminalTransportFailure,
): TerminalFallbackNotice {
  const reason = String(failure.message || "").trim() || "网关通道不可用";
  const guidance = FALLBACK_GUIDANCE_BY_KIND[failure.kind] || FALLBACK_GUIDANCE_BY_KIND.protocol;
  return {
    message: "已切换为兼容通道",
    detail: `网关通道失败原因：${reason} ${guidance}`,
  };
}

/** Minimal structural view of a workbench terminal transport (see terminalTransport.ts). */
export interface TerminalChainTransport {
  sendInput(data: string): void;
  resize(dimensions: { cols: number; rows: number }): void;
  close(): void;
}

/** Minimal structural view of the transport handler set (see terminalTransport.ts). */
export interface TerminalChainHandlers<TEvent> {
  onOpen: () => void;
  onEvent: (event: TEvent) => void;
  onClose: () => void;
  onError: (message: string, failure?: TerminalTransportFailure) => void;
  onNotice?: (notice: TerminalFallbackNotice) => void;
}

export type TerminalChainTransportFactory<TEvent> = (
  handlers: TerminalChainHandlers<TEvent>,
) => TerminalChainTransport;

/**
 * Wires a primary transport with an automatic fallback: while the primary has
 * not opened yet, a fallback-eligible failure (structured auth/pairing/
 * protocol rejection, or a pre-attach network failure) transparently starts
 * the fallback transport behind the same handler set, emits a one-line
 * notice, and swallows the primary's trailing close. Once the primary has
 * opened, failures and closes pass straight through (normal detach and
 * post-attach errors never trigger the fallback). The returned transport has
 * a stable identity across the switch, so callers can hold a single ref.
 */
export function createTerminalTransportFallbackChain<TEvent>(options: {
  createPrimary: TerminalChainTransportFactory<TEvent>;
  createFallback: TerminalChainTransportFactory<TEvent>;
  handlers: TerminalChainHandlers<TEvent>;
}): TerminalChainTransport {
  const { createPrimary, createFallback, handlers } = options;
  let closed = false;
  let primaryOpened = false;
  let fellBack = false;
  let active: TerminalChainTransport | null = null;

  const startFallback = (failure: TerminalTransportFailure): void => {
    if (closed || fellBack) return;
    fellBack = true;
    handlers.onNotice?.(buildCompatChannelNotice(failure));
    try {
      active = createFallback(handlers);
    } catch (error) {
      handlers.onError(
        error instanceof Error ? error.message : String(error),
        { kind: "network", message: String(error) },
      );
      handlers.onClose();
    }
  };

  const primaryHandlers: TerminalChainHandlers<TEvent> = {
    onOpen: () => {
      if (closed) return;
      primaryOpened = true;
      handlers.onOpen();
    },
    onEvent: (event) => {
      if (closed) return;
      handlers.onEvent(event);
    },
    onClose: () => {
      if (closed) return;
      // The failed primary always reports onError then onClose; once the
      // fallback took over, its close must not reach the pane.
      if (!fellBack) handlers.onClose();
    },
    onError: (message, failure) => {
      if (closed) return;
      const classified =
        failure ?? ({ kind: "session", message } satisfies TerminalTransportFailure);
      if (!primaryOpened && isGatewayFallbackEligible(classified)) {
        startFallback(classified);
        return;
      }
      handlers.onError(message, failure);
    },
    onNotice: (notice) => {
      if (closed) return;
      handlers.onNotice?.(notice);
    },
  };

  try {
    active = createPrimary(primaryHandlers);
  } catch (error) {
    // Synchronous construction failures (e.g. URL build) are pre-open
    // network-class failures: try the compat channel before giving up.
    startFallback({
      kind: "network",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    sendInput(data: string): void {
      active?.sendInput(data);
    },
    resize(dimensions: { cols: number; rows: number }): void {
      active?.resize(dimensions);
    },
    close(): void {
      if (closed) return;
      closed = true;
      active?.close();
    },
  };
}
