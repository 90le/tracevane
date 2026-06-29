import type http from "node:http";
import fs from "node:fs";

function appendVaryHeader(res: http.ServerResponse, value: string): void {
  const current = String(res.getHeader("Vary") || "").trim();
  if (!current) {
    res.setHeader("Vary", value);
    return;
  }

  const parts = current
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.includes(value)) parts.push(value);
  res.setHeader("Vary", parts.join(", "));
}

function setNoSniffHeader(res: http.ServerResponse): void {
  if (!res.hasHeader("X-Content-Type-Options")) {
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}

export function setCorsHeaders(
  res: http.ServerResponse,
  options: { allowOrigin?: string | null } = {},
): void {
  const allowOrigin =
    options.allowOrigin === undefined ? "*" : options.allowOrigin;

  if (!res.hasHeader("Access-Control-Allow-Origin") && allowOrigin !== null) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    if (allowOrigin !== "*") appendVaryHeader(res, "Origin");
  }
  if (!res.hasHeader("Access-Control-Allow-Methods")) {
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  }
  if (!res.hasHeader("Access-Control-Allow-Headers")) {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

export function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  setNoSniffHeader(res);
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(
  res: http.ServerResponse,
  statusCode: number,
  payload: string,
  contentType = "text/plain; charset=utf-8",
): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  setNoSniffHeader(res);
  res.end(payload);
}

export function sendBinary(
  res: http.ServerResponse,
  statusCode: number,
  payload: Buffer,
  contentType = "application/octet-stream",
  headers: Record<string, string> = {},
): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(payload.byteLength));
  setNoSniffHeader(res);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(payload);
}

function normalizeDownloadFileName(value: string): string {
  return value.replace(/[\r\n\0-\x1f\x7f]+/g, " ").trim() || "download";
}

function escapeContentDispositionFallback(value: string): string {
  return (
    normalizeDownloadFileName(value)
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .trim() || "download"
  );
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(normalizeDownloadFileName(value)).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildContentDisposition(
  fileName: string,
  disposition: "inline" | "attachment",
): string {
  return `${disposition}; filename="${escapeContentDispositionFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`;
}

export function sendFileStream(
  res: http.ServerResponse,
  options: {
    filePath: string;
    statusCode?: number;
    contentType?: string;
    headers?: Record<string, string>;
    range?: string | null;
  },
): void {
  if (res.writableEnded) return;
  const stat = fs.statSync(options.filePath);
  const range = parseSingleByteRange(options.range, stat.size);
  setCorsHeaders(res);
  if (options.range && !range) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${stat.size}`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", "0");
    setNoSniffHeader(res);
    res.end();
    return;
  }

  res.statusCode = range ? 206 : options.statusCode || 200;
  res.setHeader(
    "Content-Type",
    options.contentType || "application/octet-stream",
  );
  res.setHeader("Accept-Ranges", "bytes");
  if (range) {
    res.setHeader(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${stat.size}`,
    );
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else {
    res.setHeader("Content-Length", String(stat.size));
  }
  setNoSniffHeader(res);
  for (const [key, value] of Object.entries(options.headers || {})) {
    res.setHeader(key, value);
  }

  const stream = range
    ? fs.createReadStream(options.filePath, {
        start: range.start,
        end: range.end,
      })
    : fs.createReadStream(options.filePath);
  stream.on("error", () => {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end();
    }
  });
  stream.pipe(res);
}

function parseSingleByteRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | null {
  const normalizedHeader = String(header || "").trim();
  if (!normalizedHeader || !normalizedHeader.startsWith("bytes=")) return null;
  if (!Number.isFinite(size) || size <= 0) return null;

  const [rawRange] = normalizedHeader.slice("bytes=".length).split(",");
  const [rawStart = "", rawEnd = ""] = String(rawRange || "")
    .trim()
    .split("-", 2);
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = Number.parseInt(rawStart, 10);
  const end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return {
    start,
    end: Math.min(end, size - 1),
  };
}

export function sendNoContent(
  res: http.ServerResponse,
  statusCode = 204,
): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.end();
}

export async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function startSse(res: http.ServerResponse): void {
  setCorsHeaders(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function sendSseEvent(
  res: http.ServerResponse,
  event: string,
  payload: unknown,
): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
