import { parseJsonBody, sendJson } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';
import type { DreamingToggleRequest } from '../../../../types/dreaming.js';
import type {
  SystemDeviceTrustApproveRequest,
  SystemStudioUpgradeRequest,
  SystemDeviceTrustSettingsPatchRequest,
} from '../../../../types/system.js';

export function registerSystemRoutes(router: StudioRouter, ctx: StudioApiContext): void {
  router.get('/api/system/dreaming', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDreaming());
  });

  router.get('/api/system/dreaming/diary', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDreamingDiary());
  });

  router.get('/api/system/dreaming/compatibility', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDreamingMemoryCompatibility());
  });

  router.post('/api/system/dreaming/compatibility/apply', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.applyDreamingMemoryCompatibility());
  });

  router.get('/api/system/dreaming/rem-harness', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDreamingRemHarnessPreview());
  });

  router.post('/api/system/dreaming/backfill', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.backfillDreamingDiary());
  });

  router.post('/api/system/dreaming/reset-diary', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.resetDreamingDiary());
  });

  router.post('/api/system/dreaming/clear-grounded', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.resetGroundedShortTerm());
  });

  router.post('/api/system/dreaming/repair', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.repairDreaming());
  });

  router.post('/api/system/dreaming/toggle', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<DreamingToggleRequest>(req);
    sendJson(res, 200, await routeCtx.services.system.toggleDreaming(payload || { enabled: false }));
  });

  router.get('/api/system/health', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getHealth());
  });

  router.get('/api/system/diagnostics', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDiagnostics());
  });

  router.get('/api/system/bootstrap', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getBootstrap());
  });

  router.post('/api/system/bootstrap/repair', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.repairBootstrap());
  });

  router.get('/api/system/studio-release', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getStudioRelease());
  });

  router.get('/api/system/studio-upgrade', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getStudioUpgradeStatus());
  });

  router.get('/api/system/runtime-summary', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getRuntimeSummary());
  });

  router.get('/api/system/terminal-handoff', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getTerminalActionSuggestions());
  });

  router.post('/api/system/studio-upgrade', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<SystemStudioUpgradeRequest>(req);
    sendJson(res, 200, await routeCtx.services.system.startStudioUpgrade(payload || {}));
  });

  router.get('/api/system/device-trust', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDeviceTrust());
  });

  router.post('/api/system/device-trust/approve', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<SystemDeviceTrustApproveRequest>(req);
    sendJson(res, 200, await routeCtx.services.system.approveDeviceTrust(payload));
  });

  router.post('/api/system/device-trust/repair-helper', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.repairDeviceTrustHelper());
  });

  router.patch('/api/system/device-trust/settings', async (req, res, routeCtx) => {
    const payload = await parseJsonBody<SystemDeviceTrustSettingsPatchRequest>(req);
    sendJson(res, 200, await routeCtx.services.system.patchDeviceTrustSettings(payload));
  });
}
