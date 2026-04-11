import { parseJsonBody, sendJson } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';
import type { CronJobInput } from '../../../../types/cron.js';
import { isCronServiceError } from './service.js';

function sendCronError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (isCronServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, {
      error: shape.code,
      message: shape.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected cron service failure';
  sendJson(res, 500, {
    error: 'cron_service_failed',
    message,
  });
}

export function registerCronRoutes(router: StudioRouter, ctx: StudioApiContext): void {
  router.get('/api/cron', (_req, res) => {
    try {
      sendJson(res, 200, ctx.services.cron.getSummary());
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.post('/api/cron', async (req, res) => {
    try {
      const payload = await parseJsonBody<CronJobInput>(req);
      sendJson(res, 201, ctx.services.cron.createJob(payload));
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.get('/api/cron/:id', (_req, res, routeCtx, params) => {
    try {
      const detail = routeCtx.services.cron.getDetail(params.id);
      if (!detail) {
        sendJson(res, 404, {
          error: 'cron_job_not_found',
          message: `Cron job '${params.id}' not found`,
        });
        return;
      }
      sendJson(res, 200, detail);
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.put('/api/cron/:id', async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<CronJobInput>(req);
      sendJson(res, 200, routeCtx.services.cron.updateJob(params.id, payload));
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.delete('/api/cron/:id', (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.cron.deleteJob(params.id));
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.post('/api/cron/:id/toggle', async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<{ enabled?: boolean }>(req);
      sendJson(res, 200, routeCtx.services.cron.toggleJob(params.id, payload.enabled !== false));
    } catch (error) {
      sendCronError(res, error);
    }
  });

  router.post('/api/cron/:id/run', async (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, await routeCtx.services.cron.runJob(params.id));
    } catch (error) {
      sendCronError(res, error);
    }
  });
}
