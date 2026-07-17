import type { TracevaneClientRuntimeConfig } from "../../../../types/api";

/**
 * Client-side accessor for the runtime config the backend injects as
 * `window.__TRACEVANE_RUNTIME__` (see `apps/api/runtime-config.ts` and the
 * HTML injection in `apps/api/server.ts`). In standalone mode the base paths
 * are empty strings, so the resolve helpers below are no-ops; in gateway mode
 * (OpenClaw serving the UI under `/tracevane`) they prefix same-origin API and
 * WebSocket paths with the gateway base path.
 *
 * Note: this module deliberately avoids `declare global` for
 * `window.__TRACEVANE_RUNTIME__` — feature code (e.g. the terminal client) may
 * declare its own view of the global, and duplicate global declarations with
 * different types fail typecheck.
 */

function normalizeBasePath(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

/** Returns the injected runtime config, or `null` when absent/malformed. */
export function getTracevaneRuntime(): TracevaneClientRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  const candidate = (
    window as Window & { __TRACEVANE_RUNTIME__?: unknown }
  ).__TRACEVANE_RUNTIME__;
  if (!candidate || typeof candidate !== "object") return null;
  const exposureKind = (candidate as { exposureKind?: unknown }).exposureKind;
  if (exposureKind !== "standalone" && exposureKind !== "gateway") return null;
  return candidate as TracevaneClientRuntimeConfig;
}

/** True when the UI is served by the OpenClaw gateway under a base path. */
export function isGatewayExposure(): boolean {
  return getTracevaneRuntime()?.exposureKind === "gateway";
}

/**
 * Prefixes a same-origin absolute API path (e.g. `/api/...`) with the runtime
 * `apiBasePath`. Full URLs (`http(s)://...`, protocol-relative `//...`) and
 * relative paths are returned untouched, as are paths already carrying the
 * base-path prefix.
 */
export function resolveApiUrl(path: string): string {
  const basePath = normalizeBasePath(getTracevaneRuntime()?.apiBasePath);
  if (!basePath) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}

/**
 * Builds an absolute WebSocket URL for a same-origin path (e.g.
 * `/ws/terminal?...`), honoring the runtime `webSocketBasePath` and picking
 * `ws:`/`wss:` from `location.protocol`. Full `ws(s)://` URLs pass through
 * untouched.
 */
export function resolveWebSocketUrl(path: string): string {
  if (/^wss?:\/\//i.test(path)) return path;
  const basePath = normalizeBasePath(getTracevaneRuntime()?.webSocketBasePath);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const resolved =
    basePath && (suffix === basePath || suffix.startsWith(`${basePath}/`))
      ? suffix
      : `${basePath}${suffix}`;
  return `${protocol}//${window.location.host}${resolved}`;
}
