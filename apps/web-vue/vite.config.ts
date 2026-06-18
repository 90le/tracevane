import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { createStandaloneTracevaneConfig, createTracevaneContext, createTracevaneRequestHandler, syncStandaloneTracevaneConfig } from '../api/index.js';

function normalizePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : fallback;
}

const useExternalApi = process.env.TRACEVANE_USE_EXTERNAL_API === '1';
const tracevaneApiPort = normalizePort(process.env.TRACEVANE_API_PORT, useExternalApi ? 3761 : 3760);
const tracevaneWebPort = normalizePort(process.env.TRACEVANE_WEB_PORT, 5176);
const tracevaneBasePath = process.env.TRACEVANE_BASE_PATH || '';
const webConfigDir = path.dirname(fileURLToPath(import.meta.url));
const tracevaneRootDir = path.resolve(webConfigDir, '..', '..');
const TRACEVANE_PACKAGE_VERSION_FALLBACK = '0.1.70';
const tracevanePackageVersionOverride = process.env.TRACEVANE_BUILD_VERSION?.trim() || '';
const tracevanePackageVersion = (() => {
  if (tracevanePackageVersionOverride) return tracevanePackageVersionOverride;
  try {
    const raw = fs.readFileSync(path.join(tracevaneRootDir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : TRACEVANE_PACKAGE_VERSION_FALLBACK;
  } catch {
    return TRACEVANE_PACKAGE_VERSION_FALLBACK;
  }
})();

let tracevaneDevContext: ReturnType<typeof createTracevaneContext> | null = null;
let tracevaneDevRequestHandler: ReturnType<typeof createTracevaneRequestHandler> | null = null;

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

function getTracevaneDevRequestHandler(): ReturnType<typeof createTracevaneRequestHandler> {
  if (!tracevaneDevRequestHandler) {
    tracevaneDevRequestHandler = createTracevaneRequestHandler(getTracevaneDevContext());
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
      `[tracevane-dev-api] ${reason}: gateway port ${previousGatewayPort} -> ${nextGatewayPort}`
    );
    return;
  }

  console.info(
    `[tracevane-dev-api] ${reason}: gateway port ${nextGatewayPort}`
  );
}

function tracevaneManualChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('/@xterm/') || id.includes('/xterm')) return 'vendor-xterm';
  if (id.includes('/katex/')) return 'vendor-katex';

  if (
    id.includes('/highlight.js/')
    || id.includes('/dompurify/')
    || id.includes('/html-to-image/')
    || id.includes('/rehype-')
    || id.includes('/remark-')
    || id.includes('/unified/')
    || id.includes('/micromark')
    || id.includes('/mdast-')
    || id.includes('/hast-')
  ) {
    return 'vendor-markdown';
  }

  if (
    id.includes('/reka-ui/')
    || id.includes('/aria-hidden/')
    || id.includes('/@floating-ui/')
  ) {
    return 'vendor-ui';
  }

  if (
    id.includes('/motion-v/')
    || id.includes('/framer-motion/')
    || id.includes('/motion-dom/')
    || id.includes('/motion-utils/')
  ) {
    return 'vendor-motion';
  }

  return undefined;
}

function toViteFsModulePath(filePath: string): string {
  const normalized = filePath.split(path.sep).join('/');
  return normalized.startsWith('/') ? `/@fs${normalized}` : `/@fs/${normalized}`;
}

function createKatexOptimizedDepFallbackPlugin(): Plugin {
  const katexModulePath = toViteFsModulePath(path.join(tracevaneRootDir, 'node_modules', 'katex', 'dist', 'katex.mjs'));

  return {
    name: 'tracevane-katex-optimized-dep-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = (req.url || '').split('?')[0];
        if (requestPath !== '/node_modules/.vite/deps/katex.js') {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end([
          `import katexDefault from ${JSON.stringify(katexModulePath)};`,
          `export * from ${JSON.stringify(katexModulePath)};`,
          'export default katexDefault;',
          '',
        ].join('\n'));
      });
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    exclude: ['katex'],
  },
  plugins: [
    createKatexOptimizedDepFallbackPlugin(),
    vue(),
    ui({
      ui: {
        colors: {
          primary: 'cyan',
          neutral: 'slate',
        },
      },
      theme: {
        colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'],
        defaultVariants: {
          color: 'neutral',
          size: 'sm',
        },
      },
    }),
    !useExternalApi && {
      name: 'tracevane-dev-api',
      configureServer(server) {
        const context = getTracevaneDevContext();
        syncTracevaneDevConfig('startup');
        const openclawConfigFile = context.config.openclawConfigFile;
        const handleOpenClawConfigChange = (file: string) => {
          if (file !== openclawConfigFile) return;
          syncTracevaneDevConfig('openclaw.json changed');
        };

        server.watcher.add(openclawConfigFile);
        server.watcher.on('add', handleOpenClawConfigChange);
        server.watcher.on('change', handleOpenClawConfigChange);
        server.watcher.on('unlink', handleOpenClawConfigChange);

        server.httpServer?.on('upgrade', (req, socket, head) => {
          const currentContext = getTracevaneDevContext();
          const handled = currentContext.services.chat.handleUpgrade(req, socket, head)
            || currentContext.services.terminal.handleUpgrade(req, socket, head);
          if (!handled) return;
        });

        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
          if (!url.startsWith('/api/')) {
            next();
            return;
          }

          const handled = await getTracevaneDevRequestHandler()(
            req as IncomingMessage,
            res as ServerResponse
          );
          if (!handled) next();
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: tracevaneWebPort,
    strictPort: true,
    proxy: useExternalApi ? {
      '/api': {
        target: `http://127.0.0.1:${tracevaneApiPort}`,
        changeOrigin: false,
      },
      '/ws': {
        target: `ws://127.0.0.1:${tracevaneApiPort}`,
        ws: true,
        changeOrigin: false,
      },
    } : undefined,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: tracevaneManualChunk,
      },
    },
  },
  base: tracevaneBasePath,
  define: {
    'import.meta.env.TRACEVANE_BASE_PATH': JSON.stringify(tracevaneBasePath),
    'import.meta.env.TRACEVANE_APP_VERSION': JSON.stringify(tracevanePackageVersion),
  },
});
