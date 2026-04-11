import type http from 'node:http';

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
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(res: http.ServerResponse, statusCode: number, payload: string, contentType = 'text/plain; charset=utf-8'): void {
  if (res.writableEnded) return;
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.end(payload);
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
