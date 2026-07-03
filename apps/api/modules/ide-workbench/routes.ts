import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type { IdeWorkbenchLayoutPayload } from "./service.js";

export function registerIdeWorkbenchRoutes(
  router: TracevaneRouter,
  ctx: TracevaneApiContext,
): void {
  router.get("/api/ide-workbench/layouts/:workspaceKey", async (_req, res, routeCtx, params) => {
    const record = routeCtx.services.ideWorkbench.getLayout(params.workspaceKey);
    sendJson(res, record ? 200 : 404, record ?? { error: "not_found" });
  });

  router.put("/api/ide-workbench/layouts/:workspaceKey", async (req, res, routeCtx, params) => {
    try {
      const body = await parseJsonBody<IdeWorkbenchLayoutPayload>(req);
      sendJson(res, 200, routeCtx.services.ideWorkbench.putLayout(params.workspaceKey, body));
    } catch (error) {
      sendJson(res, 400, {
        error: "ide_workbench_layout_save_failed",
        message: error instanceof Error ? error.message : "ide_workbench_layout_save_failed",
      });
    }
  });

  void ctx;
}
