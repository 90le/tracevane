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
          options.setActiveSession(normalized);
        })
        .catch(() => {
          // Do not synthesize a route-only session. Missing descriptors should
          // stay missing so deleted sessions are not resurrected on refresh.
        });
    },
    { immediate: true },
  );
}
