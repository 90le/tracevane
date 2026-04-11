import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
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
const studioPackageVersion = (() => {
  try {
    const raw = fs.readFileSync(path.join(studioRootDir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : '0.1.21';
  } catch {
    return '0.1.21';
  }
})();

const studioDevContext = createStudioContext({
  config: createStandaloneStudioConfig({
    port: studioApiPort,
  }),
  logger: console,
});
const studioDevRequestHandler = createStudioRequestHandler(studioDevContext);

function syncStudioDevConfig(reason: string): void {
  const previousGatewayPort = studioDevContext.config.gatewayPort;
  const changed = syncStandaloneStudioConfig(studioDevContext.config);
  const nextGatewayPort = studioDevContext.config.gatewayPort;

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

syncStudioDevConfig('startup');

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

export default defineConfig({
  plugins: [
    vue(),
    !useExternalApi && {
      name: 'openclaw-studio-dev-api',
      configureServer(server) {
        const openclawConfigFile = studioDevContext.config.openclawConfigFile;
        const handleOpenClawConfigChange = (file: string) => {
          if (file !== openclawConfigFile) return;
          syncStudioDevConfig('openclaw.json changed');
          server.ws.send({ type: 'full-reload' });
        };

        server.watcher.add(openclawConfigFile);
        server.watcher.on('add', handleOpenClawConfigChange);
        server.watcher.on('change', handleOpenClawConfigChange);
        server.watcher.on('unlink', handleOpenClawConfigChange);

        server.httpServer?.on('upgrade', (req, socket, head) => {
          const handled = studioDevContext.services.chat.handleUpgrade(req, socket, head)
            || studioDevContext.services.terminal.handleUpgrade(req, socket, head);
          if (!handled) return;
        });

        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '';
          if (!url.startsWith('/api/')) {
            next();
            return;
          }

          const handled = await studioDevRequestHandler(
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
