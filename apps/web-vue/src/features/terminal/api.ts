import { requestJson, getApiBase, fetchStudioResponse } from "../../shared/api";
import type {
  TerminalActionCatalogResponse,
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalInstallRequestId,
  TerminalInstallResponse,
  TerminalInstallStreamEvent,
  TerminalLaunchPayload,
  TerminalLaunchResponse,
  TerminalSessionSummaryResponse,
  TerminalStatusPayload,
} from "../../../../../types/terminal";
import type { TerminalSessionDescriptor } from "./terminal-session-registry";

export function fetchTerminalStatus(): Promise<TerminalStatusPayload> {
  return requestJson<TerminalStatusPayload>("/api/terminal/status");
}

export function fetchTerminalSessions(): Promise<TerminalSessionSummaryResponse> {
  return requestJson<TerminalSessionSummaryResponse>("/api/terminal/sessions");
}

export function fetchPersistedTerminalSessions(): Promise<TerminalSessionSummaryResponse> {
  return requestJson<TerminalSessionSummaryResponse>(
    "/api/terminal/persisted-sessions",
  );
}

export function fetchPersistedTerminalSessionDescriptor(
  sessionId: string,
): Promise<TerminalSessionDescriptor> {
  return requestJson<TerminalSessionDescriptor>(
    `/api/terminal/sessions/${encodeURIComponent(sessionId.trim())}`,
  );
}

export function fetchTerminalActions(): Promise<TerminalActionCatalogResponse> {
  return requestJson<TerminalActionCatalogResponse>("/api/terminal/actions");
}

export function installTerminalCli(
  cli: TerminalInstallRequestId,
): Promise<TerminalInstallResponse> {
  return requestJson<TerminalInstallResponse>("/api/terminal/install", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cli }),
  });
}

export function fetchTerminalLaunch(
  payload: TerminalLaunchPayload,
): Promise<TerminalLaunchResponse> {
  return requestJson<TerminalLaunchResponse>("/api/terminal/launch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function endTerminalSession(
  payload: TerminalEndPayload,
): Promise<TerminalEndResponse> {
  return requestJson<TerminalEndResponse>("/api/terminal/end", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function streamTerminalInstall(
  cli: TerminalInstallRequestId,
  onEvent: (event: TerminalInstallStreamEvent) => void,
): Promise<void> {
  const apiBase = getApiBase();
  const response = await fetchStudioResponse(
    `${apiBase}/api/terminal/install/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cli }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error(`terminal install stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed) as TerminalInstallStreamEvent);
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer.trim()) as TerminalInstallStreamEvent);
  }
}
