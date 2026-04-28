import type http from 'node:http';
import fs from 'node:fs';

export const STUDIO_CHAT_DEV_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5176',
  'http://localhost:5176',
] as const;

function appendVaryHeader(res: http.ServerResponse, value: string): void {
  const current = String(res.getHeader('Vary') || '').trim();
  if (!current) {
    res.setHeader('Vary', value);
    return;
  }

  const parts = current.split(',').map((item) => item.trim()).filter(Boolean);
  if (!parts.includes(value)) parts.push(value);
  res.setHeader('Vary', parts.join(', '));
}

function setNoSniffHeader(res: http.ServerResponse): void {
  if (!res.hasHeader('X-Content-Type-Options')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}

export function isStudioChatApiPath(pathname: string): boolean {
  return pathname === '/api/chat/health' || pathname.startsWith('/api/chat/');
}

export function isStudioChatWsPath(pathname: string): boolean {
  return pathname === '/ws/chat';
}

export function resolveStudioChatCorsOrigin(req: http.IncomingMessage): string | null {
  const host = String(req.headers.host || '127.0.0.1').trim();
  const requestedOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const sameOriginHttp = `http://${host}`;
  const sameOriginHttps = `https://${host}`;

  if (!requestedOrigin) return sameOriginHttp;

  const allowedOrigins = new Set<string>([
    sameOriginHttp,
    sameOriginHttps,
    ...STUDIO_CHAT_DEV_ALLOWED_ORIGINS,
  ]);

  return allowedOrigins.has(requestedOrigin) ? requestedOrigin : null;
}

export function setCorsHeaders(
  res: http.ServerResponse,
  options: { allowOrigin?: string | null } = {}
): void {
  const allowOrigin = options.allowOrigin === undefined ? '*' : options.allowOrigin;

  if (!res.hasHeader('Access-Control-Allow-Origin') && allowOrigin !== null) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    if (allowOrigin !== '*') appendVaryHeader(res, 'Origin');
  }
  if (!res.hasHeader('Access-Control-Allow-Methods')) {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (!res.hasHeader('Access-Control-Allow-Headers')) {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

export function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setNoSniffHeader(res);
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(res: http.ServerResponse, statusCode: number, payload: string, contentType = 'text/plain; charset=utf-8'): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  setNoSniffHeader(res);
  res.end(payload);
}

export function sendBinary(
  res: http.ServerResponse,
  statusCode: number,
  payload: Buffer,
  contentType = 'application/octet-stream',
  headers: Record<string, string> = {},
): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(payload.byteLength));
  setNoSniffHeader(res);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(payload);
}

function normalizeDownloadFileName(value: string): string {
  return value.replace(/[\r\n\0-\x1f\x7f]+/g, ' ').trim() || 'download';
}

function escapeContentDispositionFallback(value: string): string {
  return normalizeDownloadFileName(value)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim() || 'download';
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(normalizeDownloadFileName(value))
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildContentDisposition(
  fileName: string,
  disposition: 'inline' | 'attachment',
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
  },
): void {
  if (res.writableEnded) return;
  const stat = fs.statSync(options.filePath);
  setCorsHeaders(res);
  res.statusCode = options.statusCode || 200;
  res.setHeader('Content-Type', options.contentType || 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  setNoSniffHeader(res);
  for (const [key, value] of Object.entries(options.headers || {})) {
    res.setHeader(key, value);
  }

  const stream = fs.createReadStream(options.filePath);
  stream.on('error', () => {
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end();
    }
  });
  stream.pipe(res);
}

export function sendNoContent(res: http.ServerResponse, statusCode = 204): void {
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

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function startSse(res: http.ServerResponse): void {
  setCorsHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

export function sendSseEvent(res: http.ServerResponse, event: string, payload: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
