import { watch, type Ref } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { fetchPersistedTerminalSessionDescriptor } from "./api";
import type { TerminalSessionDescriptor } from "./terminal-session-registry";

export interface TerminalRouteSyncOptions {
  activeSessionId: Ref<string | null>;
  setActiveSession(sessionId: string | null): void;
  registerSession(session: TerminalSessionDescriptor): void;
  resolveSessionDescriptor?: (
    sessionId: string,
  ) => Promise<TerminalSessionDescriptor | null>;
  router: Router;
  route: RouteLocationNormalizedLoaded;
}

function normalizeSessionId(sessionId: unknown): string {
  return typeof sessionId === "string" ? sessionId.trim() : "";
}

function readQueryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function bindTerminalRouteSync(options: TerminalRouteSyncOptions): void {
  watch(
    () => options.route.params.sessionId,
    (sessionId) => {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return;
      if (options.activeSessionId.value === normalized) return;

      const query = (options.route.query || {}) as Record<string, unknown>;
      options.registerSession({
        sessionId: normalized,
        title: normalized,
        status: "detached",
        source: "linked_context",
        canResume: true,
        controlState: "observer",
        updatedAt: new Date().toISOString(),
        handoffContext: {
          fromModule: readQueryString(query.fromModule) || "terminal",
          fromRoute: readQueryString(query.fromRoute) || "/terminal",
          triggerType: readQueryString(query.triggerType) || "route-sync",
          triggerLabel:
            readQueryString(query.triggerLabel) || "Terminal session",
          targetEntity: readQueryString(query.targetEntity) || normalized,
          recommendedCommand: readQueryString(query.recommendedCommand),
          relatedEventId: readQueryString(query.relatedEventId) || null,
        },
        recentOutputSummary: null,
      });
      options.setActiveSession(normalized);

      const resolver =
        options.resolveSessionDescriptor ||
        (async (sessionId: string) => {
          try {
            return await fetchPersistedTerminalSessionDescriptor(sessionId);
          } catch {
            return null;
          }
        });

      void resolver(normalized)
        .then((descriptor) => {
          if (!descriptor) return;
          options.registerSession({
            ...descriptor,
            sessionId: normalized,
          });
        })
        .catch(() => {
          // keep fallback shell when descriptor fetch fails
        });
    },
    { immediate: true },
  );
}
