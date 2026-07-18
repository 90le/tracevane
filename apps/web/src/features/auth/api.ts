import { apiRequest } from "@/lib/api/client";

/**
 * Typed bindings for the standalone server's session-auth endpoints
 * (`/api/auth/*`). These are ungated by definition — they are how a locked
 * client learns that auth is required and exchanges a credential for the
 * HttpOnly session cookie. All other `/api/*` routes return
 * 401 `auth_required` while locked.
 */

/** Payload of `GET /api/auth/status`. */
export interface AuthStatusPayload {
  /** True when the server enforces the session gate (standalone auth on). */
  required: boolean;
  /** True when a user password is configured (password unlock available). */
  hasPassword: boolean;
  /** Credential kinds the server accepts at `/api/auth/unlock`. */
  methods: Array<"token" | "password">;
  /**
   * Optional session flag: true when the current request already carries a
   * valid session cookie. Not every backend emits it — when absent the auth
   * gate probes a gated endpoint instead (see `./AuthGate.tsx`).
   */
  authenticated?: boolean;
}

/** GET /api/auth/status — whether the session gate is on and how to unlock. */
export function getAuthStatus(signal?: AbortSignal): Promise<AuthStatusPayload> {
  return apiRequest<AuthStatusPayload>("/api/auth/status", { signal });
}

/**
 * POST /api/auth/unlock — exchange a password or access token for the
 * HttpOnly session cookie. Resolves on 200 `{ ok: true }`; rejects with an
 * `ApiError` coded `auth_invalid_credential` on a wrong credential.
 */
export function unlockWithCredential(credential: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/unlock", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

/** POST /api/auth/logout — clear the session cookie (re-locks the client). */
export function logoutAuth(): Promise<unknown> {
  return apiRequest("/api/auth/logout", { method: "POST" });
}

/**
 * POST /api/auth/password — set or change the user password. Requires the
 * current session cookie plus the current credential (token or current
 * password). On success the server re-issues the session cookie, so the
 * current browser stays unlocked while other sessions are invalidated.
 */
export function changeAuthPassword(
  currentCredential: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentCredential, newPassword }),
  });
}

/**
 * One-shot probe of a cheap gated endpoint, used by the auth gate when the
 * status payload omits the `authenticated` flag: resolves when the current
 * session cookie is valid, rejects with 401 `auth_required` when locked.
 */
export function probeAuthSession(): Promise<unknown> {
  return apiRequest("/api/system/health");
}
