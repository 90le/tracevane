import { sendJson, sendSseEvent, startSse } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';

export function registerDashboardRoutes(router: StudioRouter, ctx: StudioApiContext): void {
  router.get('/api/dashboard/summary', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.dashboard.getSummary());
  });

  router.get('/api/stream/dashboard', async (_req, res, routeCtx) => {
    startSse(res);
    routeCtx.sseClients.add(res);

    sendSseEvent(res, 'summary', await routeCtx.services.dashboard.getSummary());

    const timer = setInterval(async () => {
      sendSseEvent(res, 'summary', await routeCtx.services.dashboard.getSummary());
    }, 5000);

    const cleanup = () => {
      clearInterval(timer);
      routeCtx.sseClients.delete(res);
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);
  });
}
