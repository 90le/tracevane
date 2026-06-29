import { apiRequest } from "./client";

const BASE = "/api/workspace";

export type WorkspaceIdeProviderKind =
  | "native-workbench"
  | "openvscode-server"
  | "code-server"
  | "theia";

export type WorkspaceIdeProviderSessionStatus =
  | "starting"
  | "ready"
  | "failed"
  | "stopped";

export interface WorkspaceIdeProviderDescriptor {
  kind: WorkspaceIdeProviderKind;
  embedded: boolean;
}

export interface WorkspaceIdeProvidersResponse {
  defaultKind: WorkspaceIdeProviderKind;
  enabled: boolean;
  providers: WorkspaceIdeProviderDescriptor[];
}

export interface WorkspaceIdeProviderSession {
  id: string;
  kind: WorkspaceIdeProviderKind;
  workspaceRoot: string;
  baseUrl: string;
  status: WorkspaceIdeProviderSessionStatus;
  createdAt: string;
  lastSeenAt?: string;
  failureReason?: string;
}

export interface WorkspaceIdeProviderSessionResponse {
  session: WorkspaceIdeProviderSession;
}

export interface WorkspaceIdeProviderSessionsResponse {
  sessions: WorkspaceIdeProviderSession[];
}

export interface CreateWorkspaceIdeProviderSessionPayload {
  workspaceRoot?: string;
  port?: number;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export function getWorkspaceIdeProviders(
  signal?: AbortSignal,
): Promise<WorkspaceIdeProvidersResponse> {
  return apiRequest<WorkspaceIdeProvidersResponse>(`${BASE}/ide-providers`, {
    signal,
  });
}

export function getWorkspaceIdeProviderSessions(
  signal?: AbortSignal,
): Promise<WorkspaceIdeProviderSessionsResponse> {
  return apiRequest<WorkspaceIdeProviderSessionsResponse>(
    `${BASE}/ide-provider-sessions`,
    { signal },
  );
}

export function createWorkspaceIdeProviderSession(
  kind: WorkspaceIdeProviderKind,
  payload: CreateWorkspaceIdeProviderSessionPayload = {},
): Promise<WorkspaceIdeProviderSessionResponse> {
  return apiRequest<WorkspaceIdeProviderSessionResponse>(
    `${BASE}/ide-providers/${encodeURIComponent(kind)}/sessions`,
    { method: "POST", body: jsonBody(payload) },
  );
}

export function stopWorkspaceIdeProviderSession(
  sessionId: string,
): Promise<WorkspaceIdeProviderSessionResponse> {
  return apiRequest<WorkspaceIdeProviderSessionResponse>(
    `${BASE}/ide-provider-sessions/${encodeURIComponent(sessionId)}/stop`,
    { method: "POST", body: jsonBody({}) },
  );
}

export function buildWorkspaceIdeProviderProxyUrl(
  sessionId: string,
  path = "/",
  search = "",
): string {
  const params = new URLSearchParams({ path });
  if (search) params.set("search", search.startsWith("?") ? search.slice(1) : search);
  return `${BASE}/ide-provider-sessions/${encodeURIComponent(sessionId)}/proxy?${params.toString()}`;
}
