import { parseJsonBody, sendJson } from '../../core/http.js';
import type { StudioApiContext } from '../../core/context.js';
import type { StudioRouter } from '../../core/router.js';
import type {
  SkillConfigUpdatePayload,
  SkillsMaintenancePayload,
  SkillsMarketplaceInstallPayload,
  SkillsMarketplaceSourceId,
  SkillsMarketplaceSort,
  SkillsPreflightPayload,
} from '../../../../types/skills.js';

function parseMarketplaceSource(value: string | null): SkillsMarketplaceSourceId {
  return value === 'clawhub' ? 'clawhub' : 'skillhub-tencent';
}

function parseMarketplaceSort(value: string | null): SkillsMarketplaceSort | undefined {
  if (value === 'downloads' || value === 'stars' || value === 'installs' || value === 'newest' || value === 'featured') {
    return value;
  }
  return undefined;
}

export function registerSkillsRoutes(router: StudioRouter, ctx: StudioApiContext): void {
  router.get('/api/skills', async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const refresh = url.searchParams.get('refresh') === '1';
    sendJson(res, 200, await ctx.services.skills.getSummary({ refresh }));
  });

  router.get('/api/skills/:slug/config', async (_req, res, routeCtx, params) => {
    sendJson(res, 200, await routeCtx.services.skills.getSkillConfig(params.slug));
  });

  router.put('/api/skills/:slug/config', async (req, res, routeCtx, params) => {
    const body = await parseJsonBody<SkillConfigUpdatePayload>(req);
    sendJson(res, 200, await routeCtx.services.skills.saveSkillConfig(params.slug, body));
  });

  router.get('/api/skills/:slug/secret', async (_req, res, routeCtx, params) => {
    sendJson(res, 200, await routeCtx.services.skills.getSkillSecret(params.slug));
  });

  router.post('/api/skills/:slug/toggle', async (req, res, routeCtx, params) => {
    const body = await parseJsonBody<{ enabled?: boolean }>(req);
    const enabled = body.enabled !== false;
    sendJson(res, 200, await routeCtx.services.skills.toggleSkill({ slug: params.slug, enabled }));
  });

  router.get('/api/marketplace/sources', async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.skills.getMarketplaceSources());
  });

  router.get('/api/marketplace/skills', async (req, res, routeCtx) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const sourceId = parseMarketplaceSource(url.searchParams.get('source'));
    const sort = parseMarketplaceSort(url.searchParams.get('sort'));
    const page = Number(url.searchParams.get('page') || 1);
    const pageSize = Number(url.searchParams.get('pageSize') || 24);

    sendJson(res, 200, await routeCtx.services.skills.getMarketplace({
      sourceId,
      query: url.searchParams.get('q') || '',
      sort,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 24,
    }));
  });

  router.post('/api/marketplace/preflight', async (req, res, routeCtx) => {
    const body = await parseJsonBody<SkillsPreflightPayload>(req);
    sendJson(res, 200, await routeCtx.services.skills.preflightMarketplaceSkill(body));
  });

  router.post('/api/marketplace/install', async (req, res, routeCtx) => {
    const body = await parseJsonBody<SkillsMarketplaceInstallPayload>(req);
    sendJson(res, 200, await routeCtx.services.skills.installMarketplaceSkill(body));
  });

  router.post('/api/skills/:slug/update', async (req, res, routeCtx, params) => {
    const body = await parseJsonBody<Omit<SkillsMaintenancePayload, 'slug'>>(req);
    sendJson(res, 200, await routeCtx.services.skills.updateInstalledSkill({
      slug: params.slug,
      sourceId: body.sourceId,
    }));
  });

  router.delete('/api/skills/:slug', async (_req, res, routeCtx, params) => {
    sendJson(res, 200, await routeCtx.services.skills.uninstallSkill({ slug: params.slug }));
  });
}
