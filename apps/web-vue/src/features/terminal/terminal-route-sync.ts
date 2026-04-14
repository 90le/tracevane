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

export function bindTerminalRouteSync(options: TerminalRouteSyncOptions): void {
  watch(
    () => options.route.params.sessionId,
    (sessionId) => {
      const normalized = normalizeSessionId(sessionId);
      if (!normalized) return;
      if (options.activeSessionId.value === normalized) return;

      options.registerSession({
        sessionId: normalized,
        title: normalized,
        status: "detached",
        source: "linked_context",
        canResume: true,
        controlState: "observer",
        updatedAt: new Date().toISOString(),
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
