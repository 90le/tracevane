import { watch, type Ref } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";

export interface TerminalRouteSyncOptions {
  activeSessionId: Ref<string | null>;
  router: Router;
  route: RouteLocationNormalizedLoaded;
}

function normalizeSessionId(sessionId: unknown): string {
  return typeof sessionId === "string" ? sessionId.trim() : "";
}

export function bindTerminalRouteSync(options: TerminalRouteSyncOptions): void {
  watch(
    () => options.route.params.sessionId,
    (sessionId) => {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return;
      if (options.activeSessionId.value === normalized) return;
      options.activeSessionId.value = normalized;
    },
    { immediate: true },
  );

  watch(options.activeSessionId, (sessionId) => {
    const normalized = normalizeSessionId(sessionId);
    const currentRouteSessionId = normalizeSessionId(
      options.route.params.sessionId,
    );

    if (normalized === currentRouteSessionId) {
      return;
    }

    if (!normalized) {
      void options.router.replace("/terminal");
      return;
    }

    void options.router.replace(`/terminal/${encodeURIComponent(normalized)}`);
  });
}
