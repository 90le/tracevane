import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { createStandaloneStudioConfig, createStudioContext, createStudioRequestHandler, syncStandaloneStudioConfig } from '../api/index.js';

function normalizePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : fallback;
}

const useExternalApi = process.env.STUDIO_USE_EXTERNAL_API === '1';
const studioApiPort = normalizePort(process.env.STUDIO_API_PORT, useExternalApi ? 3761 : 3760);
const studioWebPort = normalizePort(process.env.STUDIO_WEB_PORT, 5176);
const studioBasePath = process.env.STUDIO_BASE_PATH || '';
const webConfigDir = path.dirname(fileURLToPath(import.meta.url));
const studioRootDir = path.resolve(webConfigDir, '..', '..');
const STUDIO_PACKAGE_VERSION_FALLBACK = '0.1.68';
const studioPackageVersionOverride = process.env.OPENCLAW_STUDIO_BUILD_VERSION?.trim() || '';
const studioPackageVersion = (() => {
  if (studioPackageVersionOverride) return studioPackageVersionOverride;
  try {
    const raw = fs.readFileSync(path.join(studioRootDir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : STUDIO_PACKAGE_VERSION_FALLBACK;
  } catch {
    return STUDIO_PACKAGE_VERSION_FALLBACK;
  }
})();

let studioDevContext: ReturnType<typeof createStudioContext> | null = null;
let studioDevRequestHandler: ReturnType<typeof createStudioRequestHandler> | null = null;

function getStudioDevContext(): ReturnType<typeof createStudioContext> {
  if (!studioDevContext) {
    studioDevContext = createStudioContext({
      config: createStandaloneStudioConfig({
        port: studioApiPort,
      }),
      logger: console,
    });
  }
  return studioDevContext;
}

function getStudioDevRequestHandler(): ReturnType<typeof createStudioRequestHandler> {
  if (!studioDevRequestHandler) {
    studioDevRequestHandler = createStudioRequestHandler(getStudioDevContext());
  }
  return studioDevRequestHandler;
}

function syncStudioDevConfig(reason: string): void {
  const context = getStudioDevContext();
  const previousGatewayPort = context.config.gatewayPort;
  const changed = syncStandaloneStudioConfig(context.config);
  const nextGatewayPort = context.config.gatewayPort;

  if (changed) {
    console.info(
      `[openclaw-studio-dev-api] ${reason}: gateway port ${previousGatewayPort} -> ${nextGatewayPort}`
    );
    return;
  }

  console.info(
    `[openclaw-studio-dev-api] ${reason}: gateway port ${nextGatewayPort}`
  );
}

function studioManualChunk(id: string): string | undefined {
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
  const katexModulePath = toViteFsModulePath(path.join(studioRootDir, 'node_modules', 'katex', 'dist', 'katex.mjs'));

  return {
    name: 'openclaw-studio-katex-optimized-dep-fallback',
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
      name: 'openclaw-studio-dev-api',
      configureServer(server) {
        const context = getStudioDevContext();
        syncStudioDevConfig('startup');
        const openclawConfigFile = context.config.openclawConfigFile;
        const handleOpenClawConfigChange = (file: string) => {
          if (file !== openclawConfigFile) return;
          syncStudioDevConfig('openclaw.json changed');
        };

        server.watcher.add(openclawConfigFile);
        server.watcher.on('add', handleOpenClawConfigChange);
        server.watcher.on('change', handleOpenClawConfigChange);
        server.watcher.on('unlink', handleOpenClawConfigChange);

        server.httpServer?.on('upgrade', (req, socket, head) => {
          const currentContext = getStudioDevContext();
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

          const handled = await getStudioDevRequestHandler()(
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
    port: studioWebPort,
    strictPort: true,
    proxy: useExternalApi ? {
      '/api': {
        target: `http://127.0.0.1:${studioApiPort}`,
        changeOrigin: false,
      },
      '/ws': {
        target: `ws://127.0.0.1:${studioApiPort}`,
        ws: true,
        changeOrigin: false,
      },
    } : undefined,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: studioManualChunk,
      },
    },
  },
  base: studioBasePath,
  define: {
    'import.meta.env.STUDIO_BASE_PATH': JSON.stringify(studioBasePath),
    'import.meta.env.STUDIO_APP_VERSION': JSON.stringify(studioPackageVersion),
  },
});
