import { apiRequest } from "./client";

const BASE = "/api/ide-workbench";

export interface IdeWorkbenchLayoutRecord {
  workspaceKey: string;
  layout: unknown;
  terminalLayouts: Record<string, unknown>;
  updatedAt: string;
}

export interface IdeWorkbenchLayoutPayload {
  layout?: unknown;
  terminalLayouts?: Record<string, unknown>;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export async function getIdeWorkbenchLayout(
  workspaceKey: string,
  signal?: AbortSignal,
): Promise<IdeWorkbenchLayoutRecord | null> {
  try {
    return await apiRequest<IdeWorkbenchLayoutRecord>(
      `${BASE}/layouts/${encodeURIComponent(workspaceKey)}`,
      { signal },
    );
  } catch {
    return null;
  }
}

export function putIdeWorkbenchLayout(
  workspaceKey: string,
  payload: IdeWorkbenchLayoutPayload,
): Promise<IdeWorkbenchLayoutRecord> {
  return apiRequest<IdeWorkbenchLayoutRecord>(
    `${BASE}/layouts/${encodeURIComponent(workspaceKey)}`,
    { method: "PUT", body: jsonBody(payload) },
  );
}
