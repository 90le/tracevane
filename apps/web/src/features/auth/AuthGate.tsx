import * as React from "react";

import { setOnAuthRequired } from "@/lib/api/client";
import { LoadingState } from "@/design/ui/state";

import {
  getAuthStatus,
  logoutAuth,
  probeAuthSession,
  type AuthStatusPayload,
} from "./api";
import { UnlockPage } from "./UnlockPage";

/**
 * Session-auth gate for the standalone server. On mount it fetches
 * `/api/auth/status`:
 *  - unreachable / 404 (older backend, OpenClaw gateway) → no gate, render
 *    children immediately (dev default);
 *  - `required: false` → same;
 *  - `required: true` without a valid session cookie → {@link UnlockPage}
 *    INSTEAD of the app shell;
 *  - `required: true` with a live session → children.
 *
 * `unlocked` is tracked in state: the `onAuthRequired` client hook flips an
 * unlocked gate back to locked when any API call later 401s with
 * `auth_required` (session cookie expired mid-session). Because the status
 * contract has no mandatory session flag, a backend that omits
 * `authenticated` is detected with one cheap probe of a gated endpoint
 * (`/api/system/health`): 200 means the cookie is valid, 401 means locked.
 */

interface AuthContextValue {
  /** True when the server enforces the session gate. */
  required: boolean;
  /** Clears the session server-side and reloads into the locked gate. */
  lock: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthGate>");
  return ctx;
}

type GateState =
  | { kind: "loading" }
  | { kind: "open" }
  | { kind: "locked"; status: AuthStatusPayload }
  | { kind: "unlocked"; status: AuthStatusPayload };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<GateState>({ kind: "loading" });

  // Flip back to locked when any API call reports the session is gone.
  React.useEffect(() => {
    setOnAuthRequired(() => {
      setState((prev) =>
        prev.kind === "unlocked"
          ? { kind: "locked", status: prev.status }
          : prev,
      );
    });
    return () => setOnAuthRequired(null);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      let status: AuthStatusPayload;
      try {
        status = await getAuthStatus();
      } catch {
        if (!cancelled) setState({ kind: "open" });
        return;
      }
      if (cancelled) return;
      if (!status.required) {
        setState({ kind: "open" });
        return;
      }
      if (status.authenticated === true) {
        setState({ kind: "unlocked", status });
        return;
      }
      if (status.authenticated === false) {
        setState({ kind: "locked", status });
        return;
      }
      try {
        await probeAuthSession();
        if (!cancelled) setState({ kind: "unlocked", status });
      } catch {
        if (!cancelled) setState({ kind: "locked", status });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lock = React.useCallback(() => {
    void logoutAuth()
      .catch(() => {
        /* server unreachable — reload into the gate either way */
      })
      .finally(() => window.location.reload());
  }, []);

  const contextValue = React.useMemo<AuthContextValue>(
    () => ({
      required: state.kind === "locked" || state.kind === "unlocked",
      lock,
    }),
    [state.kind, lock],
  );

  if (state.kind === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <LoadingState title="正在检查访问状态…" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {state.kind === "locked" ? <UnlockPage status={state.status} /> : children}
    </AuthContext.Provider>
  );
}
