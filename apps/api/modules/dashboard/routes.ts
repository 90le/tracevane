import { sendJson, sendSseEvent, startSse } from "../../core/http.js";
import type { IncomingMessage } from "node:http";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";

function resolveDashboardLanguage(req: IncomingMessage): string | undefined {
  const requestUrl = new URL(
    req.url || "/",
    `http://${req.headers.host || "127.0.0.1"}`,
  );
  const locale = String(requestUrl.searchParams.get("locale") || "")
    .trim()
    .toLowerCase();
  if (locale === "en" || locale.startsWith("en-")) {
    return "en";
  }
  if (locale === "zh" || locale.startsWith("zh-")) {
    return "zh";
  }
  return req.headers["accept-language"];
}

export function registerDashboardRoutes(
  router: StudioRouter,
  ctx: StudioApiContext,
): void {
  router.get("/api/dashboard/summary", async (req, res, routeCtx) => {
    const acceptLanguage = resolveDashboardLanguage(req);
    const summary =
      await routeCtx.services.dashboard.getSummary(acceptLanguage);
    sendJson(res, 200, summary);
  });

  router.get("/api/stream/dashboard", async (req, res, routeCtx) => {
    startSse(res);
    routeCtx.sseClients.add(res);

    let timer: NodeJS.Timeout | null = null;
    const cleanup = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      routeCtx.sseClients.delete(res);
    };

    res.on("close", cleanup);
    res.on("finish", cleanup);

    const acceptLanguage = resolveDashboardLanguage(req);
    try {
      sendSseEvent(
        res,
        "summary",
        await routeCtx.services.dashboard.getSummary(acceptLanguage),
      );
    } catch (error) {
      sendSseEvent(res, "error", {
        message:
          error instanceof Error
            ? error.message
            : "Failed to refresh dashboard summary",
      });
      cleanup();
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    timer = setInterval(async () => {
      try {
        void routeCtx.services.dashboard
          .refreshSummary(acceptLanguage)
          .catch(() => undefined);
        sendSseEvent(
          res,
          "summary",
          await routeCtx.services.dashboard.getSummary(acceptLanguage),
        );
      } catch (error) {
        sendSseEvent(res, "error", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to refresh dashboard summary",
        });
      }
    }, 5000);
  });
}
