import { parseJsonBody, sendJson } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';
import type {
  ConfigPatchPayload,
  ConfigUpdatePayload,
} from '../../../../types/config.js';

export function registerConfigRoutes(router: StudioRouter, ctx: StudioApiContext): void {
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

  router.get('/api/config/providers/:providerId/secret', (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.config.getProviderSecret(params.providerId));
    } catch (error) {
      sendJson(res, 404, {
        error: 'provider_secret_not_found',
        message: error instanceof Error ? error.message : 'Provider secret not found',
      });
    }
  });

  router.get('/api/config/channel-secret/:channelId/:accountId', (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.config.getChannelSecret(params.channelId, params.accountId));
    } catch (error) {
      sendJson(res, 404, {
        error: 'channel_secret_not_found',
        message: error instanceof Error ? error.message : 'Channel secret not found',
      });
    }
  });
}
