import { requestJson } from "../../shared/api";
import type {
  AgentBindingInput,
  AgentBindingMutationResponse,
  AgentCreatePayload,
  AgentDeletePayload,
  AgentDetailPayload,
  AgentDocName,
  AgentDocumentPayload,
  AgentDocumentSavePayload,
  AgentDocumentSaveResponse,
  AgentSessionMutationResponse,
  AgentsMutationResponse,
  AgentsSummaryPayload,
  AgentUpdatePayload,
} from "../../../../../types/agents";

function jsonRequest<T>(
  input: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<T> {
  return requestJson<T>(input, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function fetchAgentsSummary(): Promise<AgentsSummaryPayload> {
  return requestJson<AgentsSummaryPayload>("/api/agents");
}

export function fetchAgentDetail(agentId: string): Promise<AgentDetailPayload> {
  return requestJson<AgentDetailPayload>(
    `/api/agents/${encodeURIComponent(agentId)}`,
  );
}

export function createAgent(
  payload: AgentCreatePayload,
): Promise<AgentsMutationResponse> {
  return jsonRequest<AgentsMutationResponse>("/api/agents", "POST", payload);
}

export function updateAgent(
  agentId: string,
  payload: AgentUpdatePayload,
): Promise<AgentsMutationResponse> {
  return jsonRequest<AgentsMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    "PUT",
    payload,
  );
}

export function deleteAgent(
  agentId: string,
  payload?: AgentDeletePayload,
): Promise<AgentsMutationResponse> {
  return requestJson<AgentsMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    },
  );
}

export function createAgentBinding(
  agentId: string,
  payload: AgentBindingInput,
): Promise<AgentBindingMutationResponse> {
  return jsonRequest<AgentBindingMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/bindings`,
    "POST",
    payload,
  );
}

export function updateAgentBinding(
  agentId: string,
  bindingId: string,
  payload: AgentBindingInput,
): Promise<AgentBindingMutationResponse> {
  return jsonRequest<AgentBindingMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/bindings/${encodeURIComponent(bindingId)}`,
    "PUT",
    payload,
  );
}

export function deleteAgentBinding(
  agentId: string,
  bindingId: string,
): Promise<AgentBindingMutationResponse> {
  return requestJson<AgentBindingMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/bindings/${encodeURIComponent(bindingId)}`,
    { method: "DELETE" },
  );
}

export function deleteAgentSession(
  agentId: string,
  sessionId: string,
): Promise<AgentSessionMutationResponse> {
  return requestJson<AgentSessionMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export function clearAgentSessions(
  agentId: string,
): Promise<AgentSessionMutationResponse> {
  return requestJson<AgentSessionMutationResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/sessions`,
    {
      method: "DELETE",
    },
  );
}

export function fetchAgentDocument(
  agentId: string,
  docName: AgentDocName,
): Promise<AgentDocumentPayload> {
  return requestJson<AgentDocumentPayload>(
    `/api/agents/${encodeURIComponent(agentId)}/docs/${encodeURIComponent(docName)}`,
  );
}

export function saveAgentDocument(
  agentId: string,
  docName: AgentDocName,
  payload: AgentDocumentSavePayload,
): Promise<AgentDocumentSaveResponse> {
  return jsonRequest<AgentDocumentSaveResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/docs/${encodeURIComponent(docName)}`,
    "PUT",
    payload,
  );
}
