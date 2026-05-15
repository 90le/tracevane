import fs from 'node:fs';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import {
  isStudioChatApiPath,
  resolveStudioChatCorsOrigin,
  sendJson,
  sendNoContent,
  sendText,
  setCorsHeaders,
} from './core/http.js';
import type { StudioClientRuntimeConfig } from '../../types/api.js';
import type { StudioApiContext } from './core/context.js';
import { StudioRouter } from './core/router.js';
import { buildStudioClientRuntimeConfig } from './runtime-config.js';
import { registerAgentsRoutes } from './modules/agents/routes.js';
import { registerChatRoutes } from './modules/chat/routes.js';
import { registerChannelsRoutes } from './modules/channels/routes.js';
import { registerCodexStackRoutes } from './modules/codex-stack/routes.js';
import { registerConfigRoutes } from './modules/config/routes.js';
import { registerCronRoutes } from './modules/cron/routes.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import { registerFilesRoutes } from './modules/files/routes.js';
import { registerPluginsRoutes } from './modules/plugins/routes.js';
import { registerSkillsRoutes } from './modules/skills/routes.js';
import { registerSystemRoutes } from './modules/system/routes.js';
import { registerTerminalRoutes } from './modules/terminal/routes.js';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function createStudioRouter(ctx: StudioApiContext): StudioRouter {
  const router = new StudioRouter();
  registerDashboardRoutes(router, ctx);
  registerFilesRoutes(router, ctx);
  registerAgentsRoutes(router, ctx);
  registerChatRoutes(router, ctx);
  registerChannelsRoutes(router, ctx);
  registerCodexStackRoutes(router);
  registerConfigRoutes(router, ctx);
  registerCronRoutes(router, ctx);
  registerPluginsRoutes(router, ctx);
  registerSkillsRoutes(router, ctx);
  registerTerminalRoutes(router, ctx);
  registerSystemRoutes(router, ctx);
  return router;
}

function safeStaticPath(root: string, pathname: string): string | null {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = path.resolve(root, `.${normalized}`);
  return absolutePath.startsWith(root) ? absolutePath : null;
}

function serializeRuntimeConfig(config: StudioClientRuntimeConfig): string {
  return JSON.stringify(config).replace(/</g, '\\u003c');
}

function buildHtmlBaseHref(runtimeConfig: StudioClientRuntimeConfig | null | undefined): string {
  const appBasePath = String(runtimeConfig?.appBasePath || '').trim();
  if (!appBasePath) return '';
  const normalized = appBasePath === '/'
    ? '/'
    : `${appBasePath.replace(/\/+$/g, '')}/`;
  return `    <base href="${normalized}">`;
}

function injectRuntimeConfig(html: string, runtimeConfig: StudioClientRuntimeConfig | null | undefined): string {
  if (!runtimeConfig) return html;
  const baseTag = buildHtmlBaseHref(runtimeConfig);
  const runtimeScript = `    <script>window.__OPENCLAW_STUDIO_RUNTIME__ = ${serializeRuntimeConfig(runtimeConfig)};</script>`;
  return html.includes('<head>')
    ? html.replace('<head>', `<head>\n${baseTag ? `${baseTag}\n` : ''}${runtimeScript}`)
    : `${baseTag ? `${baseTag}\n` : ''}${runtimeScript}\n${html}`;
}

function serveStaticAsset(
  ctx: StudioApiContext,
  reqPath: string,
  res: http.ServerResponse,
  runtimeConfig?: StudioClientRuntimeConfig | null
): boolean {
  if (!fs.existsSync(ctx.config.webDistDir)) return false;

  const requestedPath = safeStaticPath(ctx.config.webDistDir, reqPath);
  const fallbackPath = path.join(ctx.config.webDistDir, 'index.html');
  const filePath = requestedPath && fs.existsSync(requestedPath) ? requestedPath : fallbackPath;
  if (!fs.existsSync(filePath)) return false;

  const extname = path.extname(filePath);
  const contentType = CONTENT_TYPES[extname] || 'application/octet-stream';
  const raw = fs.readFileSync(filePath, 'utf-8');
  const body = path.basename(filePath) === 'index.html'
    ? injectRuntimeConfig(raw, runtimeConfig)
    : raw;
  sendText(res, 200, body, contentType);
  return true;
}

export interface StudioHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

function normalizeBasePath(basePath: string | null | undefined): string {
  if (!basePath || basePath === '/') return '';
  return basePath.startsWith('/') ? basePath.replace(/\/+$/g, '') : `/${basePath.replace(/\/+$/g, '')}`;
}

function stripConfiguredBasePath(req: http.IncomingMessage, basePath: string | null | undefined): void {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) return;

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === normalizedBasePath) {
    url.pathname = '/';
    req.url = url.pathname + url.search;
    return;
  }
  if (!url.pathname.startsWith(`${normalizedBasePath}/`)) return;

  url.pathname = url.pathname.slice(normalizedBasePath.length) || '/';
  req.url = url.pathname + url.search;
}

export interface StudioRequestHandlerOptions {
  stripBasePath?: string | null;
  runtimeConfig?: StudioClientRuntimeConfig | null;
}

export interface StudioUpgradeHandlerOptions {
  stripBasePath?: string | null;
}

function normalizeRequestPath(req: http.IncomingMessage, options: StudioRequestHandlerOptions = {}): void {
  if (options.stripBasePath !== undefined) {
    stripConfiguredBasePath(req, options.stripBasePath);
    return;
  }

  const basePath = process.env.STUDIO_BASE_PATH || '';
  if (!basePath || basePath === '/') return;

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname.startsWith(basePath)) {
    // Remove base path prefix: /x/studio/api/... -> /api/...
    url.pathname = url.pathname.slice(basePath.length) || '/';
    req.url = url.pathname + url.search;
  }
}

export function createStudioUpgradeHandler(
  ctx: StudioApiContext,
  options: StudioUpgradeHandlerOptions = {}
) {
  return function handleStudioUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): boolean {
    normalizeRequestPath(req, { stripBasePath: options.stripBasePath });

    const handled = ctx.services.chat.handleUpgrade(req, socket, head)
      || ctx.services.terminal.handleUpgrade(req, socket, head);
    if (!handled) {
      try { socket.destroy(); } catch {}
    }
    return handled;
  };
}

export function createStudioRequestHandler(
  ctx: StudioApiContext,
  options: StudioRequestHandlerOptions = {}
) {
  const router = createStudioRouter(ctx);

  return async function handleStudioRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<boolean> {
    normalizeRequestPath(req, options);

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const isChatApi = isStudioChatApiPath(url.pathname);
    if (isChatApi) {
      const allowOrigin = resolveStudioChatCorsOrigin(req);
      if (req.headers.origin && !allowOrigin) {
        setCorsHeaders(res, {
          allowOrigin: `http://${req.headers.host || '127.0.0.1'}`,
        });
        sendJson(res, 403, {
          error: {
            code: 'auth_failure',
            message: 'Chat origin not allowed',
            retryable: false,
            source: 'studio',
          },
        });
        return true;
      }
      setCorsHeaders(res, { allowOrigin });
    } else {
      setCorsHeaders(res);
    }

    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return true;
    }

    const handled = await router.handle(req, res, ctx);
    if (handled) return true;

    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (serveStaticAsset(ctx, url.pathname, res, options.runtimeConfig)) return true;
    }

    return false;
  };
}

export async function handleStudioRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: StudioApiContext,
  options: StudioRequestHandlerOptions = {}
): Promise<boolean> {
  return createStudioRequestHandler(ctx, options)(req, res);
}

export function createStudioServer(ctx: StudioApiContext): StudioHttpServer {
  const requestHandler = createStudioRequestHandler(ctx, {
    runtimeConfig: buildStudioClientRuntimeConfig(ctx.config, 'standalone'),
  });
  const upgradeHandler = createStudioUpgradeHandler(ctx);
  let server: http.Server | null = null;

  return {
    async start(): Promise<void> {
      if (server) return;

      server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        const handled = await requestHandler(req, res);
        if (handled) return;

        sendJson(res, 404, {
          error: 'not_found',
          message: `No route matched ${req.method || 'GET'} ${url.pathname}`,
        });
      });

      server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
        upgradeHandler(req, socket, head);
      });

      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(ctx.config.port, () => resolve());
      });

      ctx.logger.info(`studio: HTTP server listening on port ${ctx.config.port}`);
    },

    async stop(): Promise<void> {
      if (!server) return;
      for (const client of ctx.sseClients) {
        client.end();
      }
      ctx.sseClients.clear();

      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      server = null;
      ctx.services.chat.dispose();
      ctx.services.terminal.dispose();
      ctx.logger.info('studio: HTTP server stopped');
    },

    isRunning(): boolean {
      return server !== null;
    },
  };
}
