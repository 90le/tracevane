import { parseJsonBody, sendJson } from '../../core/http.js';
import type { TracevaneApiContext } from '../../core/context.js';
import type { TracevaneRouter } from '../../core/router.js';
import type {
  ConfigPatchPayload,
  ConfigUpdatePayload,
} from '../../../../types/config.js';

export function registerConfigRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get('/api/config', (_req, res) => {
    sendJson(res, 200, ctx.services.config.getSummary());
  });

  router.put('/api/config', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<ConfigUpdatePayload>(req);
    sendJson(res, 200, routeCtx.services.config.saveConfig(payload));
  });

  router.post('/api/config', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<ConfigUpdatePayload>(req);
    sendJson(res, 200, routeCtx.services.config.saveConfig(payload));
  });

  router.patch('/api/config', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<ConfigPatchPayload>(req);
    sendJson(res, 200, routeCtx.services.config.patchConfig(payload));
  });
}
