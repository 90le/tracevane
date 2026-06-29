import type http from "node:http";
import { Readable } from "node:stream";
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

export function bufferToReadableStream(buffer: Buffer): Readable {
  return Readable.from(buffer);
}
