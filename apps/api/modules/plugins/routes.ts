import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  PluginBulkTogglePayload,
  PluginBulkUninstallPayload,
  PluginBulkUpdatePayload,
  PluginInstallPayload,
  PluginPreflightPayload,
  PluginUninstallPayload,
  PluginUpdatePayload,
  PluginUploadInstallPayload,
  PluginUploadPreflightPayload,
} from "../../../../types/plugins.js";

export function registerPluginsRoutes(
  router: StudioRouter,
  ctx: StudioApiContext,
): void {
  router.get("/api/plugins/summary", (_req, res) => {
    sendJson(res, 200, ctx.services.plugins.getSummary());
  });

  router.post("/api/plugins/:id/toggle", async (req, res, routeCtx, params) => {
    const payload = await parseJsonBody<{ enabled?: boolean }>(req);
    sendJson(res, 200, routeCtx.services.plugins.togglePlugin(params.id, payload.enabled !== false));
  });

  router.post("/api/plugins/bulk-toggle", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginBulkTogglePayload>(req);
    sendJson(res, 200, routeCtx.services.plugins.bulkTogglePlugins(payload));
  });

  router.post("/api/plugins/install", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginInstallPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.installPlugin(payload));
  });

  router.post("/api/plugins/preflight", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginPreflightPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.preflightPlugin(payload));
  });

  router.post("/api/plugins/upload/preflight", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginUploadPreflightPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.preflightUploadedPluginArchive(payload));
  });

  router.post("/api/plugins/upload/install", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginUploadInstallPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.installUploadedPluginArchive(payload));
  });

  router.post("/api/plugins/update", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginUpdatePayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.updatePlugins(payload));
  });

  router.post("/api/plugins/bulk-update", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginBulkUpdatePayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.bulkUpdatePlugins(payload));
  });

  router.post("/api/plugins/uninstall", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginUninstallPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.uninstallPlugin(payload));
  });

  router.post("/api/plugins/bulk-uninstall", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<PluginBulkUninstallPayload>(req);
    sendJson(res, 200, await routeCtx.services.plugins.bulkUninstallPlugins(payload));
  });
}
