import { parseJsonBody, sendJson } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';
import type {
  ChannelAccessUpdatePayload,
  ChannelAccountCredentialsPayload,
  ChannelAccountInput,
  ChannelBindingInput,
  ChannelPairingApprovePayload,
  ChannelSettingsInput,
} from '../../../../types/channels.js';
import { isChannelServiceError } from './service.js';

function handleChannelError(ctx: StudioApiContext, res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (isChannelServiceError(error)) {
    sendJson(res, error.statusCode, {
      error: error.code,
      message: error.message,
    });
    return;
  }

  ctx.logger.error('studio: channels route failed', error);
  sendJson(res, 500, {
    error: 'channels_internal_error',
    message: error instanceof Error ? error.message : 'Unexpected channels failure',
  });
}

export function registerChannelsRoutes(router: StudioRouter, ctx: StudioApiContext): void {
  router.get('/api/channels', (_req, res) => {
    sendJson(res, 200, ctx.services.channels.getSummary());
  });

  router.post('/api/channels', async (req, res) => {
    try {
      const body = await parseJsonBody<{ type?: string; enabled?: boolean }>(req);
      sendJson(res, 201, ctx.services.channels.createChannel(String(body.type || ''), body.enabled !== false));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.put('/api/channels/:type', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelSettingsInput>(req);
      sendJson(res, 200, ctx.services.channels.updateChannel(params.type, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.delete('/api/channels/:type', (_req, res, _context, params) => {
    try {
      sendJson(res, 200, ctx.services.channels.deleteChannel(params.type));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.post('/api/channels/:type/accounts', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelAccountInput>(req);
      sendJson(res, 201, ctx.services.channels.createAccount(params.type, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.put('/api/channels/:type/accounts/:accountId', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelAccountInput>(req);
      sendJson(res, 200, ctx.services.channels.updateAccount(params.type, params.accountId, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.get('/api/channels/:type/accounts/:accountId/credentials', (_req, res, _context, params) => {
    try {
      const payload: ChannelAccountCredentialsPayload = ctx.services.channels.getAccountCredentials(params.type, params.accountId);
      sendJson(res, 200, payload);
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.delete('/api/channels/:type/accounts/:accountId', (_req, res, _context, params) => {
    try {
      sendJson(res, 200, ctx.services.channels.deleteAccount(params.type, params.accountId));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.get('/api/channels/:type/accounts/:accountId/access', async (_req, res, _context, params) => {
    try {
      sendJson(res, 200, await ctx.services.channels.getAccountAccess(params.type, params.accountId));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.put('/api/channels/:type/accounts/:accountId/access', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelAccessUpdatePayload>(req);
      sendJson(res, 200, await ctx.services.channels.updateAccountAccess(params.type, params.accountId, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.get('/api/channels/:type/pairing', async (req, res, _context, params) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const accountId = requestUrl.searchParams.get('accountId');
      sendJson(res, 200, await ctx.services.channels.getPairing(params.type, accountId));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.post('/api/channels/:type/pairing/approve', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelPairingApprovePayload>(req);
      sendJson(res, 200, await ctx.services.channels.approvePairing(params.type, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.post('/api/channels/bindings', async (req, res) => {
    try {
      const body = await parseJsonBody<ChannelBindingInput>(req);
      sendJson(res, 201, ctx.services.channels.createBinding(body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.put('/api/channels/bindings/:bindingId', async (req, res, _context, params) => {
    try {
      const body = await parseJsonBody<ChannelBindingInput>(req);
      sendJson(res, 200, ctx.services.channels.updateBinding(params.bindingId, body));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });

  router.delete('/api/channels/bindings/:bindingId', (_req, res, _context, params) => {
    try {
      sendJson(res, 200, ctx.services.channels.deleteBinding(params.bindingId));
    } catch (error) {
      handleChannelError(ctx, res, error);
    }
  });
}
