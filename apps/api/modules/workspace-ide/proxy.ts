import type http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { sendJson } from "../../core/http.js";
import {
  WorkspaceIdeProviderError,
  assertLoopbackProviderUrl,
  type WorkspaceIdeProviderSession,
} from "./provider-service.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface WorkspaceIdeProviderProxyRequest {
  session: WorkspaceIdeProviderSession;
  path: string;
  search?: string;
  method: string;
  headers: http.IncomingHttpHeaders;
  body?: AsyncIterable<Uint8Array> | null;
}

export interface WorkspaceIdeProviderProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface WorkspaceIdeProviderProxyFetch {
  (input: string | URL, init?: RequestInit): Promise<Response>;
}

export function buildWorkspaceIdeProviderProxyUrl(
  session: WorkspaceIdeProviderSession,
  targetPath: string,
  search = "",
): URL {
  assertLoopbackProviderUrl(session.baseUrl);
  const base = new URL(session.baseUrl);
  const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  if (normalizedPath.includes("\0")) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_proxy_path_invalid",
      "IDE provider proxy path must not contain null bytes.",
    );
  }
  base.pathname = normalizeProxyPath(normalizedPath);
  base.search = search.startsWith("?") ? search : search ? `?${search}` : "";
  return base;
}

export function filterWorkspaceIdeProviderProxyHeaders(
  headers: http.IncomingHttpHeaders,
): Headers {
  const next = new Headers();
  for (const [key, rawValue] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    if (normalizedKey === "host") continue;
    if (rawValue === undefined) continue;
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue);
    next.set(key, value);
  }
  return next;
}

export async function proxyWorkspaceIdeProviderHttpRequest(
  request: WorkspaceIdeProviderProxyRequest,
  fetchImpl: WorkspaceIdeProviderProxyFetch = fetch,
): Promise<WorkspaceIdeProviderProxyResponse> {
  const targetUrl = buildWorkspaceIdeProviderProxyUrl(
    request.session,
    request.path,
    request.search,
  );
  const method = request.method.toUpperCase();
  const response = await fetchImpl(targetUrl, {
    method,
    headers: filterWorkspaceIdeProviderProxyHeaders(request.headers),
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    duplex: request.body ? "half" : undefined,
    redirect: "manual",
  } as RequestInit & { duplex?: "half" });
  const body = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    headers: responseHeadersToObject(response.headers),
    body,
  };
}

export async function handleWorkspaceIdeProviderProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  request: Omit<WorkspaceIdeProviderProxyRequest, "method" | "headers" | "body">,
  fetchImpl: WorkspaceIdeProviderProxyFetch = fetch,
): Promise<void> {
  try {
    const response = await proxyWorkspaceIdeProviderHttpRequest(
      {
        ...request,
        method: req.method || "GET",
        headers: req.headers,
        body: req,
      },
      fetchImpl,
    );
    res.statusCode = response.status;
    for (const [key, value] of Object.entries(response.headers)) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }
    res.end(Buffer.from(response.body));
  } catch (error) {
    if (error instanceof WorkspaceIdeProviderError) {
      sendJson(res, 400, { error: error.code, message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "IDE provider proxy failed";
    sendJson(res, 502, { error: "workspace_ide_provider_proxy_failed", message });
  }
}

function normalizeProxyPath(pathname: string): string {
  const normalized = new URL(`http://127.0.0.1${pathname}`).pathname;
  return normalized || "/";
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const next: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) next[key] = value;
  });
  return next;
}


export interface WorkspaceIdeProviderUpgradeProxyOptions {
  session: WorkspaceIdeProviderSession;
  path: string;
  search?: string;
  req: http.IncomingMessage;
  socket: Duplex;
  head: Buffer;
  connect?: WorkspaceIdeProviderNetConnect;
}

export interface WorkspaceIdeProviderNetConnect {
  (options: net.NetConnectOpts): Duplex;
}

export function proxyWorkspaceIdeProviderUpgrade(
  options: WorkspaceIdeProviderUpgradeProxyOptions,
): boolean {
  const targetUrl = buildWorkspaceIdeProviderProxyUrl(
    options.session,
    options.path,
    options.search || "",
  );
  const port = Number.parseInt(targetUrl.port || "80", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_proxy_port_invalid",
      "IDE provider WebSocket proxy requires a valid provider port.",
    );
  }

  const upstream = (options.connect || net.connect)({
    host: targetUrl.hostname,
    port,
  });

  const fail = (): void => {
    try {
      options.socket.destroy();
    } catch {}
    try {
      upstream.destroy();
    } catch {}
  };

  upstream.once("error", fail);
  options.socket.once("error", fail);
  upstream.once("connect", () => {
    upstream.write(buildWorkspaceIdeProviderUpgradeRequest(options.req, targetUrl));
    if (options.head.byteLength > 0) upstream.write(options.head);
    options.socket.pipe(upstream);
    upstream.pipe(options.socket);
  });
  return true;
}

export function handleWorkspaceIdeProviderUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
  sessions: { getSession(sessionId: string): WorkspaceIdeProviderSession | null | undefined },
  connect?: WorkspaceIdeProviderNetConnect,
): boolean {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const match = requestUrl.pathname.match(/^\/api\/workspace\/ide-provider-sessions\/([^/]+)\/proxy$/);
  if (!match) return false;
  const session = sessions.getSession(decodeURIComponent(match[1] || ""));
  if (!session || session.status !== "ready") {
    writeUpgradeFailure(socket, !session ? 404 : 409, !session ? "Not Found" : "Conflict");
    return true;
  }
  try {
    return proxyWorkspaceIdeProviderUpgrade({
      session,
      req,
      socket,
      head,
      path: requestUrl.searchParams.get("path") || "/",
      search: requestUrl.searchParams.get("search") || "",
      connect,
    });
  } catch {
    writeUpgradeFailure(socket, 400, "Bad Request");
    return true;
  }
}

function buildWorkspaceIdeProviderUpgradeRequest(req: http.IncomingMessage, targetUrl: URL): string {
  const headers: string[] = [];
  const pathWithSearch = `${targetUrl.pathname || "/"}${targetUrl.search || ""}`;
  headers.push(`${req.method || "GET"} ${pathWithSearch} HTTP/1.1`);
  const filtered = filterWorkspaceIdeProviderProxyHeaders(req.headers);
  filtered.set("host", targetUrl.host);
  filtered.forEach((value, key) => {
    headers.push(`${key}: ${value}`);
  });
  headers.push("connection: Upgrade");
  headers.push("upgrade: websocket");
  headers.push("", "");
  return headers.join("\r\n");
}

function writeUpgradeFailure(socket: Duplex, statusCode: number, statusText: string): void {
  try {
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } finally {
    try {
      socket.destroy();
    } catch {}
  }
}
