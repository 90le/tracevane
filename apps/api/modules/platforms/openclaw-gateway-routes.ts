import { parseJsonBody, sendJson } from '../../core/http.js';
import type { TracevaneRouter } from '../../core/router.js';
import { isChatServiceError } from '../chat/errors.js';
import {
  requestOpenClawGateway,
  type OpenClawGatewayRequest,
} from './openclaw-gateway.js';

function sendOpenClawGatewayError(
  res: Parameters<typeof sendJson>[0],
  error: unknown,
): void {
  if (isChatServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, { error: shape.error });
    return;
  }

  sendJson(res, 500, {
    error: {
      code: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected OpenClaw gateway failure',
    },
  });
}

export function registerOpenClawGatewayRoutes(router: TracevaneRouter): void {
  router.post('/api/platforms/openclaw/gateway', async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<OpenClawGatewayRequest>(req);
      sendJson(res, 200, await requestOpenClawGateway(routeCtx.config, payload));
    } catch (error) {
      sendOpenClawGatewayError(res, error);
    }
  });
}
