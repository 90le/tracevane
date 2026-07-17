/**
 * Minimal browser bridge to the OpenClaw host gateway RPC control channel.
 *
 * In gateway single-port mode the Tracevane UI is served by the OpenClaw
 * gateway itself, so raw plugin WebSocket upgrades never reach the terminal
 * service. Realtime traffic has to flow over the host gateway WebSocket as
 * RPC frames (`{type:"req"|"res"|"event"}`), the same channel the OpenClaw
 * Control UI uses. This client implements just enough of that protocol for
 * the terminal transport:
 *
 *  - open `ws(s)://<gateway-origin>/` (same origin the UI was served from)
 *  - answer the host `connect.challenge` with a token-authenticated `connect`
 *    request (protocol range and frame shape mirror the backend gateway
 *    client in `apps/api/modules/platforms/openclaw-gateway-*.ts`)
 *  - correlate `req`/`res` frames by id and dispatch `event` frames by name
 *
 * Auth token sources follow the Control UI conventions: `?token=`/`?password=`
 * query params, then the persisted Control UI settings entry in localStorage.
 * Hosts that demand a device-identity signature for `ui` clients reject the
 * handshake with a structured error which the terminal pane surfaces instead
 * of hanging in a silent "connecting" state.
 */

const GATEWAY_CONNECT_TIMEOUT_MS = 10_000;
const GATEWAY_REQUEST_TIMEOUT_MS = 15_000;
const CONTROL_UI_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";
const LEGACY_TOKEN_STORAGE_KEYS = ["openclaw-gateway-token", "gatewayToken"];
const GATEWAY_BROWSER_CLIENT_ID = "openclaw-control-ui";

interface GatewayAuthSecret {
  token: string | null;
  password: string | null;
}

export interface GatewayRpcClient {
  readonly closed: boolean;
  request<T>(method: string, params: Record<string, unknown>): Promise<T>;
  notify(method: string, params: Record<string, unknown>): void;
  addEventListener(
    event: string,
    handler: (payload: unknown) => void,
  ): () => void;
  close(): void;
}

export interface ConnectGatewayRpcClientOptions {
  onClose?: (reason: string) => void;
}

function readBrowserGatewayAuthSecret(): GatewayAuthSecret {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = String(params.get("token") || "").trim();
    const password = String(params.get("password") || "").trim();
    if (token || password) return { token: token || null, password: password || null };
  } catch {
    // fall through to stored credentials
  }
  try {
    const raw = window.localStorage.getItem(CONTROL_UI_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { token?: unknown } | null;
      const token = typeof parsed?.token === "string" ? parsed.token.trim() : "";
      if (token) return { token, password: null };
    }
  } catch {
    // settings entry missing or malformed; try legacy keys
  }
  for (const key of LEGACY_TOKEN_STORAGE_KEYS) {
    try {
      const value = String(window.localStorage.getItem(key) || "").trim();
      if (value) return { token: value, password: null };
    } catch {
      // storage may be unavailable; keep looking
    }
  }
  return { token: null, password: null };
}

function createGatewayWebSocketUrl(secret: GatewayAuthSecret): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/`);
  if (secret.token) {
    url.searchParams.set("token", secret.token);
  } else if (secret.password) {
    url.searchParams.set("password", secret.password);
  }
  return url.toString();
}

function buildConnectParams(secret: GatewayAuthSecret): Record<string, unknown> {
  return {
    minProtocol: 3,
    maxProtocol: 5,
    client: {
      id: GATEWAY_BROWSER_CLIENT_ID,
      version: "tracevane",
      platform: "web",
      mode: "ui",
    },
    role: "operator",
    scopes: ["operator.read", "operator.write"],
    auth: secret.token
      ? { token: secret.token }
      : secret.password
        ? { password: secret.password }
        : undefined,
    locale: typeof navigator !== "undefined" && navigator.language ? navigator.language : "zh-CN",
    userAgent: "tracevane-web",
  };
}

function readFrameError(error: unknown, fallback: string): string {
  const shape = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    message?: unknown;
    details?: { code?: unknown };
  };
  const code = String(shape.details?.code ?? shape.code ?? "").toUpperCase();
  const message = String(shape.message ?? "").trim();
  const combined = `${code} ${message}`.toLowerCase();
  if (combined.includes("device") || combined.includes("pairing")) {
    return "OpenClaw 网关注册要求设备身份/配对（device identity），浏览器终端无法完成设备签名握手；请改用 Tracevane standalone 直连模式，或在宿主侧允许 token-only 的 UI 连接。";
  }
  if (combined.includes("unauthorized") || combined.includes("token") || combined.includes("password") || combined.includes("auth")) {
    return "OpenClaw 网关鉴权失败：请确认网关 token 有效（先在 OpenClaw Control UI 登录，或用 ?token=<gateway-token> 打开本页面后重试）。";
  }
  return message || fallback;
}

function readCloseError(code: number): string {
  if (code === 1008) {
    return "OpenClaw 网关拒绝连接（1008 unauthorized）：请检查网关 token 是否有效。";
  }
  return `无法连接 OpenClaw 网关 WebSocket（关闭码 ${code || "未知"}）。`;
}

export function connectGatewayRpcClient(
  options: ConnectGatewayRpcClientOptions = {},
): Promise<GatewayRpcClient> {
  const secret = readBrowserGatewayAuthSecret();
  // No stored/URL token: still attempt the connect — hosts with
  // `gateway.auth.mode: "none"` accept unauthenticated UI clients, and
  // auth-enforcing hosts answer with a structured unauthorized error that the
  // terminal pane surfaces (never a silent forever-connecting state).

  return new Promise<GatewayRpcClient>((resolve, reject) => {
    let settled = false;
    let closed = false;
    let counter = 0;
    const pending = new Map<
      string,
      {
        resolve: (payload: unknown) => void;
        reject: (error: Error) => void;
        timer: number;
      }
    >();
    const eventListeners = new Map<string, Set<(payload: unknown) => void>>();
    const nextId = (prefix: string): string =>
      `${prefix}-${Date.now().toString(36)}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
    const connectId = nextId("connect");

    let socket: WebSocket;
    try {
      socket = new WebSocket(createGatewayWebSocketUrl(secret));
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const rejectPending = (message: string): void => {
      for (const entry of pending.values()) {
        window.clearTimeout(entry.timer);
        entry.reject(new Error(message));
      }
      pending.clear();
    };

    const connectTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore close races
      }
      reject(new Error("连接 OpenClaw 网关超时：connect 握手未完成。"));
    }, GATEWAY_CONNECT_TIMEOUT_MS);

    const client: GatewayRpcClient = {
      get closed() {
        return closed;
      },
      request<T>(method: string, params: Record<string, unknown>): Promise<T> {
        return new Promise<T>((resolveRequest, rejectRequest) => {
          if (closed || socket.readyState !== WebSocket.OPEN) {
            rejectRequest(new Error("OpenClaw 网关连接已关闭。"));
            return;
          }
          const id = nextId("req");
          const timer = window.setTimeout(() => {
            pending.delete(id);
            rejectRequest(new Error(`网关 RPC 请求超时：${method}`));
          }, GATEWAY_REQUEST_TIMEOUT_MS);
          pending.set(id, {
            resolve: (payload) => resolveRequest(payload as T),
            reject: rejectRequest,
            timer,
          });
          socket.send(JSON.stringify({ type: "req", id, method, params }));
        });
      },
      notify(method: string, params: Record<string, unknown>): void {
        if (closed || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "req", id: nextId("notify"), method, params }));
      },
      addEventListener(event: string, handler: (payload: unknown) => void): () => void {
        let listeners = eventListeners.get(event);
        if (!listeners) {
          listeners = new Set();
          eventListeners.set(event, listeners);
        }
        listeners.add(handler);
        return () => {
          listeners.delete(handler);
        };
      },
      close(): void {
        if (closed) return;
        closed = true;
        window.clearTimeout(connectTimer);
        rejectPending("OpenClaw 网关连接已关闭。");
        try {
          socket.close();
        } catch {
          // ignore close races
        }
      },
    };

    socket.addEventListener("message", (messageEvent) => {
      let frame: {
        type?: unknown;
        id?: unknown;
        ok?: unknown;
        event?: unknown;
        payload?: unknown;
        error?: unknown;
      } | null = null;
      try {
        frame = JSON.parse(String(messageEvent.data || ""));
      } catch {
        return;
      }
      if (!frame || typeof frame !== "object") return;

      if (frame.type === "event") {
        const eventName = String(frame.event || "");
        if (eventName === "connect.challenge") {
          if (!settled && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: "req",
                id: connectId,
                method: "connect",
                params: buildConnectParams(secret),
              }),
            );
          }
          return;
        }
        const listeners = eventListeners.get(eventName);
        if (!listeners) return;
        for (const handler of Array.from(listeners)) {
          try {
            handler(frame.payload);
          } catch {
            // listener errors must not break the frame loop
          }
        }
        return;
      }

      if (frame.type !== "res") return;
      const id = String(frame.id || "");
      if (id === connectId && !settled) {
        settled = true;
        window.clearTimeout(connectTimer);
        if (frame.ok) {
          resolve(client);
          return;
        }
        try {
          socket.close();
        } catch {
          // ignore close races
        }
        reject(new Error(readFrameError(frame.error, "OpenClaw 网关连接被拒绝。")));
        return;
      }
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      window.clearTimeout(entry.timer);
      if (frame.ok) {
        entry.resolve(frame.payload);
      } else {
        entry.reject(new Error(readFrameError(frame.error, "网关 RPC 调用失败。")));
      }
    });

    socket.addEventListener("close", (closeEvent) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(connectTimer);
        rejectPending("OpenClaw 网关连接在握手前关闭。");
        reject(new Error(readCloseError(closeEvent.code)));
        return;
      }
      if (closed) return;
      closed = true;
      const reason = `OpenClaw 网关连接已断开（关闭码 ${closeEvent.code}）。`;
      rejectPending(reason);
      options.onClose?.(reason);
    });

    socket.addEventListener("error", () => {
      if (settled) return; // a close event follows and reports the final state
      settled = true;
      window.clearTimeout(connectTimer);
      rejectPending("OpenClaw 网关 WebSocket 连接失败。");
      reject(new Error("OpenClaw 网关 WebSocket 连接失败。"));
    });
  });
}
