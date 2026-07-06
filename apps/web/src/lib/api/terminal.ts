import { apiRequest } from "./client";
import type {
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalGatewayAttachPayload,
  TerminalInstallRequestId,
  TerminalInstallResponse,
  TerminalProfileCatalogResponse,
  TerminalSessionDescriptor,
  TerminalSessionSummaryResponse,
} from "../../features/cli-agents/types";

/**
 * Typed transport bindings for the Terminal HTTP API
 * (`apps/api/modules/terminal/routes.ts`) the CLI Agent management page uses.
 *
 * Bound here:
 *  - GET  /api/terminal/profiles               → terminal profile/shell catalog
 *  - GET  /api/terminal/sessions               → persisted session roster
 *  - POST /api/terminal/sessions               → create a PTY session descriptor
 *  - GET  /api/terminal/sessions/:id           → single session descriptor
 *  - POST /api/terminal/end                    → end a live session by sid (write)
 *  - POST /api/terminal/sessions/:id/rename    → rename a persisted session (write)
 *  - POST /api/terminal/sessions/:id/delete    → delete a persisted session (write)
 *
 * NOT bound here (reused / out of scope):
 *  - GET /api/terminal/status   → already wrapped by `useTerminalStatusQuery`
 *    in the Dashboard data layer (`@/lib/query/dashboard`); the workbench reuses it.
 *  - SSE stream / gateway attach / install streaming → live-PTY transport that
 *    belongs to the terminal surface, not this CLI management page.
 *
 * Response shapes come from the shared contract (`types/terminal.ts`).
 */

const BASE = "/api/terminal";

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}


/** GET /api/terminal/profiles — available terminal profiles and shell launchers. */
export function getTerminalProfiles(
  signal?: AbortSignal,
): Promise<TerminalProfileCatalogResponse> {
  return apiRequest<TerminalProfileCatalogResponse>(`${BASE}/profiles`, {
    signal,
  });
}

/** GET /api/terminal/sessions — persisted terminal session roster. */
export function getTerminalSessions(
  options?: AbortSignal | { signal?: AbortSignal; manageableOnly?: boolean },
): Promise<TerminalSessionSummaryResponse> {
  const signal = options instanceof AbortSignal ? options : options?.signal;
  const manageableOnly = !(options instanceof AbortSignal) && Boolean(options?.manageableOnly);
  const query = manageableOnly ? "?manageable=1" : "";
  return apiRequest<TerminalSessionSummaryResponse>(`${BASE}/sessions${query}`, {
    signal,
  });
}

/** POST /api/terminal/sessions — create a new detached PTY session. */
export function createTerminalSession(
  payload: TerminalGatewayAttachPayload,
): Promise<TerminalSessionDescriptor> {
  return apiRequest<TerminalSessionDescriptor>(`${BASE}/sessions`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** GET /api/terminal/sessions/:sessionId — single persisted session descriptor. */
export function getTerminalSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<TerminalSessionDescriptor> {
  return apiRequest<TerminalSessionDescriptor>(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}`,
    { signal },
  );
}

/** POST /api/terminal/install — install one supported CLI or all missing CLIs. */
export function installTerminalCli(
  cli: TerminalInstallRequestId,
): Promise<TerminalInstallResponse> {
  return apiRequest<TerminalInstallResponse>(`${BASE}/install`, {
    method: "POST",
    body: jsonBody({ cli }),
  });
}

/** POST /api/terminal/end — end a live session by `sid`. */
export function endTerminalSession(
  payload: TerminalEndPayload,
): Promise<TerminalEndResponse> {
  return apiRequest<TerminalEndResponse>(`${BASE}/end`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/** POST /api/terminal/sessions/:sessionId/rename — rename a persisted session. */
export function renameTerminalSession(
  sessionId: string,
  title: string,
): Promise<TerminalSessionDescriptor> {
  return apiRequest<TerminalSessionDescriptor>(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/rename`,
    { method: "POST", body: jsonBody({ title }) },
  );
}

/**
 * POST /api/terminal/sessions/:sessionId/delete — delete a persisted session.
 * The route answers 409 when the session is still active (must be ended first).
 */
export function deleteTerminalSession(sessionId: string): Promise<{
  success: boolean;
  reason?: string;
}> {
  return apiRequest<{ success: boolean; reason?: string }>(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}/delete`,
    { method: "POST", body: jsonBody({}) },
  );
}
