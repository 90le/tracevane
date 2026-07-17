import fs from "node:fs";
import http from "node:http";
import type { Duplex } from "node:stream";
import path from "node:path";
import {
  sendBinary,
  sendJson,
  sendNoContent,
  sendText,
  setCorsHeaders,
} from "./core/http.js";
import type { TracevaneClientRuntimeConfig } from "../../types/api.js";
import type { TracevaneApiContext } from "./core/context.js";
import { TracevaneRouter } from "./core/router.js";
import { buildTracevaneClientRuntimeConfig } from "./runtime-config.js";
import { registerAgentsRoutes } from "./modules/agents/routes.js";
import { registerChannelConnectorsRoutes } from "./modules/channel-connectors/routes.js";
import { registerChannelsRoutes } from "./modules/channels/routes.js";
import { registerConfigRoutes } from "./modules/config/routes.js";
import { registerCronRoutes } from "./modules/cron/routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/routes.js";
import { registerDebugRoutes } from "./modules/debug/routes.js";
import { registerFilesRoutes } from "./modules/files/routes.js";
import { registerGitRoutes } from "./modules/git/routes.js";
import { registerIdeWorkbenchRoutes } from "./modules/ide-workbench/routes.js";
import { registerLspRoutes } from "./modules/lsp/routes.js";
import { handleModelGatewayRealtimeUnsupportedUpgrade } from "./modules/model-gateway/realtime.js";
import { registerModelGatewayRoutes } from "./modules/model-gateway/routes.js";
import { registerOpenClawRecoveryRoutes } from "./modules/openclaw-recovery/routes.js";
import { registerOpenClawGatewayRoutes } from "./modules/platforms/openclaw-gateway-routes.js";
import { registerSkillsRoutes } from "./modules/skills/routes.js";
import { registerSystemRoutes } from "./modules/system/routes.js";
import { registerTerminalRoutes } from "./modules/terminal/routes.js";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

export function createTracevaneRouter(
  ctx: TracevaneApiContext,
): TracevaneRouter {
  const router = new TracevaneRouter();
  registerDashboardRoutes(router, ctx);
  registerDebugRoutes(router, ctx);
  registerFilesRoutes(router, ctx);
  registerGitRoutes(router, ctx);
  registerIdeWorkbenchRoutes(router, ctx);
  registerLspRoutes(router, ctx);
  registerAgentsRoutes(router, ctx);
  registerChannelConnectorsRoutes(router);
  registerChannelsRoutes(router, ctx);
  registerModelGatewayRoutes(router);
  registerOpenClawRecoveryRoutes(router);
  registerOpenClawGatewayRoutes(router);
  registerConfigRoutes(router, ctx);
  registerCronRoutes(router, ctx);
  registerSkillsRoutes(router, ctx);
  registerTerminalRoutes(router, ctx);
  registerSystemRoutes(router, ctx);
  return router;
}

function safeStaticPath(root: string, pathname: string): string | null {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const absolutePath = path.resolve(root, `.${normalized}`);
  return absolutePath.startsWith(root) ? absolutePath : null;
}

function serializeRuntimeConfig(config: TracevaneClientRuntimeConfig): string {
  return JSON.stringify(config).replace(/</g, "\\u003c");
}

function buildHtmlBaseHref(
  runtimeConfig: TracevaneClientRuntimeConfig | null | undefined,
): string {
  const appBasePath = String(runtimeConfig?.appBasePath || "").trim();
  if (!appBasePath) return "";
  const normalized =
    appBasePath === "/" ? "/" : `${appBasePath.replace(/\/+$/g, "")}/`;
  return `    <base href="${normalized}">`;
}

function injectRuntimeConfig(
  html: string,
  runtimeConfig: TracevaneClientRuntimeConfig | null | undefined,
): string {
  if (!runtimeConfig) return html;
  const baseTag = buildHtmlBaseHref(runtimeConfig);
  const runtimeScript = `    <script>window.__TRACEVANE_RUNTIME__ = ${serializeRuntimeConfig(runtimeConfig)};</script>`;
  return html.includes("<head>")
    ? html.replace(
        "<head>",
        `<head>\n${baseTag ? `${baseTag}\n` : ""}${runtimeScript}`,
      )
    : `${baseTag ? `${baseTag}\n` : ""}${runtimeScript}\n${html}`;
}

function serveStaticAsset(
  ctx: TracevaneApiContext,
  reqPath: string,
  res: http.ServerResponse,
  runtimeConfig?: TracevaneClientRuntimeConfig | null,
): boolean {
  if (!fs.existsSync(ctx.config.webDistDir)) return false;

  const requestedPath = safeStaticPath(ctx.config.webDistDir, reqPath);
  const fallbackPath = path.join(ctx.config.webDistDir, "index.html");
  const filePath =
    requestedPath && fs.existsSync(requestedPath)
      ? requestedPath
      : fallbackPath;
  if (!fs.existsSync(filePath)) return false;

  const extname = path.extname(filePath);
  const contentType = CONTENT_TYPES[extname] || "application/octet-stream";
  if (path.basename(filePath) === "index.html") {
    const raw = fs.readFileSync(filePath, "utf-8");
    sendText(res, 200, injectRuntimeConfig(raw, runtimeConfig), contentType);
    return true;
  }
  sendBinary(res, 200, fs.readFileSync(filePath), contentType);
  return true;
}

export interface TracevaneHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

function normalizeBasePath(basePath: string | null | undefined): string {
  if (!basePath || basePath === "/") return "";
  return basePath.startsWith("/")
    ? basePath.replace(/\/+$/g, "")
    : `/${basePath.replace(/\/+$/g, "")}`;
}

function stripConfiguredBasePath(
  req: http.IncomingMessage,
  basePath: string | null | undefined,
): void {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) return;

  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "127.0.0.1"}`,
  );
  if (url.pathname === normalizedBasePath) {
    url.pathname = "/";
    req.url = url.pathname + url.search;
    return;
  }
  if (!url.pathname.startsWith(`${normalizedBasePath}/`)) return;

  url.pathname = url.pathname.slice(normalizedBasePath.length) || "/";
  req.url = url.pathname + url.search;
}

export interface TracevaneRequestHandlerOptions {
  stripBasePath?: string | null;
  runtimeConfig?: TracevaneClientRuntimeConfig | null;
}

export interface TracevaneUpgradeHandlerOptions {
  stripBasePath?: string | null;
}

function normalizeRequestPath(
  req: http.IncomingMessage,
  options: TracevaneRequestHandlerOptions = {},
): void {
  if (options.stripBasePath !== undefined) {
    stripConfiguredBasePath(req, options.stripBasePath);
    return;
  }

  stripConfiguredBasePath(req, process.env.TRACEVANE_BASE_PATH || "");
}

// Raw WebSocket realtime endpoints served by createTracevaneUpgradeHandler in
// standalone mode (terminal `/ws/terminal`, LSP `/ws/lsp`, debug `/ws/debug`;
// see the handleUpgrade implementations under apps/api/modules/). The OpenClaw
// gateway never forwards socket upgrades to plugin HTTP routes, so in gateway
// exposure these endpoints cannot work and must fail fast instead of hanging
// or being answered with the SPA fallback.
const GATEWAY_RAW_WEBSOCKET_PATHS = new Set([
  "/ws/terminal",
  "/ws/lsp",
  "/ws/debug",
]);

function isWebSocketUpgradeRequest(req: http.IncomingMessage): boolean {
  const upgrade = req.headers.upgrade;
  return typeof upgrade === "string" && upgrade.trim().toLowerCase() === "websocket";
}

function isGatewayRawWebSocketPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/g, "") || "/";
  return GATEWAY_RAW_WEBSOCKET_PATHS.has(normalized);
}

function sendGatewayRawWebSocketUnsupported(
  res: http.ServerResponse,
  pathname: string,
): void {
  sendJson(res, 501, {
    error: {
      code: "realtime_transport_unsupported",
      message:
        "Raw WebSocket realtime endpoints are unavailable when Tracevane is exposed through the OpenClaw gateway; use the gateway RPC realtime transport instead.",
      retryable: false,
      source: "tracevane",
      details: {
        endpoint: pathname,
        realtimeTransport: "gateway-rpc",
        feasibility: "blocked-gateway-single-port-no-raw-websocket-upgrade",
        alternatives: [
          "Terminal realtime is available through the Tracevane terminal gateway RPC methods.",
          "Run the Tracevane standalone server when raw WebSocket realtime (terminal, LSP, debug) is required.",
        ],
      },
    },
  });
}

function shouldRejectGatewayRawWebSocket(
  req: http.IncomingMessage,
  pathname: string,
  runtimeConfig: TracevaneClientRuntimeConfig | null | undefined,
): boolean {
  if (runtimeConfig?.exposureKind !== "gateway") return false;
  return isWebSocketUpgradeRequest(req) || isGatewayRawWebSocketPath(pathname);
}

export function createTracevaneUpgradeHandler(
  ctx: TracevaneApiContext,
  options: TracevaneUpgradeHandlerOptions = {},
) {
  return function handleTracevaneUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean {
    normalizeRequestPath(req, { stripBasePath: options.stripBasePath });

    const handled =
      handleModelGatewayRealtimeUnsupportedUpgrade(req, socket, head) ||
      ctx.services.terminal.handleUpgrade(req, socket, head) ||
      ctx.services.lsp.handleUpgrade(req, socket, head) ||
      ctx.services.debug.handleUpgrade(req, socket, head);
    if (!handled) {
      try {
        socket.destroy();
      } catch {}
    }
    return handled;
  };
}

export function createTracevaneRequestHandler(
  ctx: TracevaneApiContext,
  options: TracevaneRequestHandlerOptions = {},
) {
  const router = createTracevaneRouter(ctx);

  return async function handleTracevaneRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> {
    normalizeRequestPath(req, options);

    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "127.0.0.1"}`,
    );
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      sendNoContent(res);
      return true;
    }

    if (
      shouldRejectGatewayRawWebSocket(req, url.pathname, options.runtimeConfig)
    ) {
      sendGatewayRawWebSocketUnsupported(res, url.pathname);
      return true;
    }

    const handled = await router.handle(req, res, ctx);
    if (handled) return true;

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      if (serveStaticAsset(ctx, url.pathname, res, options.runtimeConfig))
        return true;
    }

    return false;
  };
}

export async function handleTracevaneRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: TracevaneApiContext,
  options: TracevaneRequestHandlerOptions = {},
): Promise<boolean> {
  return createTracevaneRequestHandler(ctx, options)(req, res);
}

export function createTracevaneServer(
  ctx: TracevaneApiContext,
): TracevaneHttpServer {
  const requestHandler = createTracevaneRequestHandler(ctx, {
    runtimeConfig: buildTracevaneClientRuntimeConfig(ctx.config, "standalone"),
  });
  const upgradeHandler = createTracevaneUpgradeHandler(ctx);
  let server: http.Server | null = null;

  return {
    async start(): Promise<void> {
      if (server) return;

      server = http.createServer(async (req, res) => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "127.0.0.1"}`,
        );
        const handled = await requestHandler(req, res);
        if (handled) return;

        sendJson(res, 404, {
          error: "not_found",
          message: `No route matched ${req.method || "GET"} ${url.pathname}`,
        });
      });

      server.on(
        "upgrade",
        (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
          upgradeHandler(req, socket, head);
        },
      );

      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(ctx.config.port, () => resolve());
      });

      ctx.logger.info(
        `tracevane: HTTP server listening on port ${ctx.config.port}`,
      );
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
      await ctx.services.terminal.dispose();
      ctx.services.debug.dispose();
      ctx.logger.info("tracevane: HTTP server stopped");
    },

    isRunning(): boolean {
      return server !== null;
    },
  };
}
