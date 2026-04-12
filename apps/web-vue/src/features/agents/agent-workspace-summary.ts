import type { AgentsSummaryPayload } from "../../../../../types/agents";

export interface AgentRosterSummary {
  order: AgentsSummaryPayload["agents"];
  defaultRailAgents: AgentsSummaryPayload["agents"];
  regularRailAgents: AgentsSummaryPayload["agents"];
}

export interface AgentWorkspaceSummary {
  selectedAgentId: string;
  hasSelection: boolean;
  stageCounts: {
    bindings: number;
    docs: number;
    sessions: number;
  };
}

function parseLastActiveAt(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAgentRosterSummary(input: {
  agents: AgentsSummaryPayload["agents"];
  defaultAgentId?: string | null;
}): AgentRosterSummary {
  const order = [...(input.agents || [])].sort(
    (left, right) =>
      parseLastActiveAt(right.lastActiveAt) -
      parseLastActiveAt(left.lastActiveAt),
  );
  const defaultRailAgents = order.filter(
    (agent) =>
      agent.isDefault ||
      (input.defaultAgentId && agent.id === input.defaultAgentId),
  );
  const regularRailAgents = order.filter(
    (agent) => !defaultRailAgents.some((item) => item.id === agent.id),
  );
  return {
    order,
    defaultRailAgents,
    regularRailAgents,
  };
}

export function buildAgentWorkspaceSummary(input: {
  selectedAgentId?: string | null;
  detail?: {
    bindings?: Array<unknown>;
    docs?: Array<unknown>;
    recentSessions?: Array<unknown>;
  } | null;
}): AgentWorkspaceSummary {
  const selectedAgentId = String(input.selectedAgentId || "").trim();
  return {
    selectedAgentId,
    hasSelection: Boolean(selectedAgentId),
    stageCounts: {
      bindings: input.detail?.bindings?.length || 0,
      docs: input.detail?.docs?.length || 0,
      sessions: input.detail?.recentSessions?.length || 0,
    },
  };
}
