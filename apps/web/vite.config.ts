import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  createStandaloneTracevaneConfig,
  createTracevaneContext,
  createTracevaneRequestHandler,
  syncStandaloneTracevaneConfig,
} from "../api/index.js";

function normalizePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : fallback;
}

const useExternalApi = process.env.TRACEVANE_USE_EXTERNAL_API === "1";
const tracevaneApiPort = normalizePort(
  process.env.TRACEVANE_API_PORT,
  useExternalApi ? 3761 : 3760,
);
const tracevaneWebPort = normalizePort(process.env.TRACEVANE_WEB_PORT, 5176);
const tracevaneBasePath = process.env.TRACEVANE_BASE_PATH || "";
const tracevaneSmokeDisableWatch = process.env.TRACEVANE_SMOKE_DISABLE_WATCH === "1";
const webConfigDir = path.dirname(fileURLToPath(import.meta.url));
const tracevaneRootDir = path.resolve(webConfigDir, "..", "..");
const TRACEVANE_PACKAGE_VERSION_FALLBACK = "0.1.71";
const tracevanePackageVersionOverride =
  process.env.TRACEVANE_BUILD_VERSION?.trim() || "";
const tracevanePackageVersion = (() => {
  if (tracevanePackageVersionOverride) return tracevanePackageVersionOverride;
  try {
    const raw = fs.readFileSync(
      path.join(tracevaneRootDir, "package.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim()
      ? parsed.version.trim()
      : TRACEVANE_PACKAGE_VERSION_FALLBACK;
  } catch {
    return TRACEVANE_PACKAGE_VERSION_FALLBACK;
  }
})();

let tracevaneDevContext: ReturnType<typeof createTracevaneContext> | null =
  null;
let tracevaneDevRequestHandler: ReturnType<
  typeof createTracevaneRequestHandler
> | null = null;

function getTracevaneDevContext(): ReturnType<typeof createTracevaneContext> {
  if (!tracevaneDevContext) {
    tracevaneDevContext = createTracevaneContext({
      config: createStandaloneTracevaneConfig({
        port: tracevaneApiPort,
      }),
      logger: console,
    });
  }
  return tracevaneDevContext;
}

function getTracevaneDevRequestHandler(): ReturnType<
  typeof createTracevaneRequestHandler
> {
  if (!tracevaneDevRequestHandler) {
    tracevaneDevRequestHandler = createTracevaneRequestHandler(
      getTracevaneDevContext(),
    );
  }
  return tracevaneDevRequestHandler;
}

function syncTracevaneDevConfig(reason: string): void {
  const context = getTracevaneDevContext();
  const previousGatewayPort = context.config.gatewayPort;
  const changed = syncStandaloneTracevaneConfig(context.config);
  const nextGatewayPort = context.config.gatewayPort;

  if (changed) {
    console.info(
      `[tracevane-dev-api] ${reason}: gateway port ${previousGatewayPort} -> ${nextGatewayPort}`,
    );
    return;
  }

  console.info(
    `[tracevane-dev-api] ${reason}: gateway port ${nextGatewayPort}`,
  );
}

function tracevaneManualChunk(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;

  if (id.includes("/@xterm/") || id.includes("/xterm")) return "vendor-xterm";
  if (id.includes("/katex/")) return "vendor-katex";


  return undefined;
}

function toViteFsModulePath(filePath: string): string {
  const normalized = filePath.split(path.sep).join("/");
  return normalized.startsWith("/")
    ? `/@fs${normalized}`
    : `/@fs/${normalized}`;
}

function createKatexOptimizedDepFallbackPlugin(): Plugin {
  const katexModulePath = toViteFsModulePath(
    path.join(tracevaneRootDir, "node_modules", "katex", "dist", "katex.mjs"),
  );

  return {
    name: "tracevane-katex-optimized-dep-fallback",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = (req.url || "").split("?")[0];
        if (requestPath !== "/node_modules/.vite/deps/katex.js") {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(
          [
            `import katexDefault from ${JSON.stringify(katexModulePath)};`,
            `export * from ${JSON.stringify(katexModulePath)};`,
            "export default katexDefault;",
            "",
          ].join("\n"),
        );
      });
    },
  };
}

export default defineConfig({
  cacheDir:
    process.env.TRACEVANE_VITE_CACHE_DIR ||
    path.join(webConfigDir, "node_modules", ".vite"),
  resolve: {
    alias: [
      {
        find: /^@xterm\/xterm$/,
        replacement: path.resolve(
          tracevaneRootDir,
          "node_modules",
          "@xterm",
          "xterm",
          "lib",
          "xterm.js",
        ),
      },
      { find: "@", replacement: path.resolve(webConfigDir, "src") },
    ],
  },
  optimizeDeps: {
    entries: [
      "index.html",
      "src/features/file-manager/FilePreviewPanel.tsx",
      "src/features/file-manager/code-editor/CodeEditor.tsx",
    ],
    exclude: ["katex", "monaco-editor", "dockview-react"],
    ignoreOutdatedRequests: true,
  },
  plugins: [
    createKatexOptimizedDepFallbackPlugin(),
    react(),
    tailwindcss(),
    !useExternalApi && {
      name: "tracevane-dev-api",
      configureServer(server) {
        const context = getTracevaneDevContext();
        syncTracevaneDevConfig("startup");
        const openclawConfigFile = context.config.openclawConfigFile;
        const handleOpenClawConfigChange = (file: string) => {
          if (file !== openclawConfigFile) return;
          syncTracevaneDevConfig("openclaw.json changed");
        };

        server.watcher.add(openclawConfigFile);
        server.watcher.on("add", handleOpenClawConfigChange);
        server.watcher.on("change", handleOpenClawConfigChange);
        server.watcher.on("unlink", handleOpenClawConfigChange);

        server.httpServer?.on("upgrade", (req, socket, head) => {
          const currentContext = getTracevaneDevContext();
          const handled =
            currentContext.services.terminal.handleUpgrade(req, socket, head) ||
            currentContext.services.lsp.handleUpgrade(req, socket, head) ||
            currentContext.services.debug.handleUpgrade(req, socket, head);
          if (!handled) return;
        });

        server.middlewares.use(async (req, res, next) => {
          const url = req.url || "";
          if (!url.startsWith("/api/")) {
            next();
            return;
          }

          const handled = await getTracevaneDevRequestHandler()(
            req as IncomingMessage,
            res as ServerResponse,
          );
          if (!handled) next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: tracevaneWebPort,
    strictPort: true,
    watch: {
      ignored: tracevaneSmokeDisableWatch
        ? ["**/*"]
        : [
            path.join(tracevaneRootDir, "tracevane-terminal-focus-*.ts"),
            path.join(tracevaneRootDir, "tests/ide-workbench/*-smoke-*"),
            path.join(tracevaneRootDir, "tmp/.tracevane-*-smoke-*/**"),
            path.join(tracevaneRootDir, "tmp/.tracevane-ide-smoke-*/**"),
            path.join(tracevaneRootDir, "tmp/.tracevane-debug-smoke-*/**"),
            "**/tracevane-terminal-focus-*.ts",
            "**/tests/ide-workbench/*-smoke-*",
            "**/tmp/.tracevane-*-smoke-*/**",
            "**/tmp/.tracevane-ide-smoke-*/**",
            "**/tmp/.tracevane-debug-smoke-*/**",
          ],
    },
    proxy: useExternalApi
      ? {
          "/api": {
            target: `http://127.0.0.1:${tracevaneApiPort}`,
            changeOrigin: false,
          },
          "/ws": {
            target: `ws://127.0.0.1:${tracevaneApiPort}`,
            ws: true,
            changeOrigin: false,
          },
        }
      : undefined,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: tracevaneManualChunk,
      },
    },
  },
  base: tracevaneBasePath,
  define: {
    "import.meta.env.TRACEVANE_BASE_PATH": JSON.stringify(tracevaneBasePath),
    "import.meta.env.TRACEVANE_APP_VERSION": JSON.stringify(
      tracevanePackageVersion,
    ),
  },
});
