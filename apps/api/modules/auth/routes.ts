import { parseJsonBody, sendJson } from '../../core/http.js';
import type { TracevaneApiContext } from '../../core/context.js';
import type { TracevaneRouter } from '../../core/router.js';

export interface TracevaneAuthRouteOptions {
  /**
   * Whether the current exposure actually gates /api/** requests. Gateway
   * exposure is covered by the OpenClaw host auth, so the unlock screen only
   * applies to the standalone server path.
   */
  authRequired: boolean;
}

function sendInvalidCredential(res: Parameters<typeof sendJson>[0]): void {
  sendJson(res, 401, {
    error: {
      code: 'auth_invalid_credential',
      message: '访问令牌或密码不正确',
    },
  });
}

export function registerAuthRoutes(
  router: TracevaneRouter,
  ctx: TracevaneApiContext,
  options: TracevaneAuthRouteOptions,
): void {
  router.get('/api/auth/status', (req, res, routeCtx) => {
    const status = routeCtx.services.auth.getStatus();
    sendJson(res, 200, {
      ...status,
      required: options.authRequired,
      authenticated: routeCtx.services.auth.hasValidSession(req),
    });
  });

  router.post('/api/auth/unlock', async (req, res, routeCtx) => {
    const auth = routeCtx.services.auth;
    if (!auth.isEnabled()) {
      sendJson(res, 200, { ok: true });
      return;
    }
    const body = await parseJsonBody<{ credential?: unknown }>(req);
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    if (!auth.verifyCredential(credential)) {
      sendInvalidCredential(res);
      return;
    }
    auth.issueSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/auth/logout', (_req, res, routeCtx) => {
    routeCtx.services.auth.clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/auth/password', async (req, res, routeCtx) => {
    const auth = routeCtx.services.auth;
    if (!auth.isEnabled()) {
      sendJson(res, 400, {
        error: {
          code: 'auth_not_required',
          message: '当前未启用访问认证',
        },
      });
      return;
    }
    const body = await parseJsonBody<{
      currentCredential?: unknown;
      newPassword?: unknown;
    }>(req);
    const currentCredential =
      typeof body?.currentCredential === 'string' ? body.currentCredential : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!auth.hasValidSession(req) && !auth.verifyCredential(currentCredential)) {
      sendInvalidCredential(res);
      return;
    }
    if (!newPassword.trim() || newPassword.length > 128) {
      sendJson(res, 400, {
        error: {
          code: 'auth_invalid_password',
          message: '新密码不能为空，且长度不能超过 128 个字符',
        },
      });
      return;
    }
    auth.setPassword(newPassword);
    // The session secret derives from the password hash, so re-issue the
    // session to keep the current browser logged in after the change.
    auth.issueSessionCookie(res);
    sendJson(res, 200, { ok: true });
  });
}
