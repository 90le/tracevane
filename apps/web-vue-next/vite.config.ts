import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// 后端 standalone 端口（无 auth，dev 联调用）。
// 可用 STUDIO_API_PORT 覆盖（如用 scripts/restart-dev.sh 的 3761）。
const API_TARGET = process.env.STUDIO_API_TARGET || 'http://localhost:3760';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@web-vue/shared': fileURLToPath(new URL('../web-vue/src/shared', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // REST + SSE 流：禁缓冲，保持长连接（terminal/dashboard stream 需要）
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // SSE 关键：不缓冲，立即转发
        ws: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // 流式响应禁用压缩缓冲
            const ct = proxyRes.headers['content-type'] || '';
            if (ct.includes('text/event-stream') || ct.includes('ndjson')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
