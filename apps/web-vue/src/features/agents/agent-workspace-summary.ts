import type { AgentsSummaryPayload } from "../../../../../types/agents";

export interface AgentRosterSummary {
  order: AgentsSummaryPayload["agents"];
  defaultRailAgents: AgentsSummaryPayload["agents"];
  regularRailAgents: AgentsSummaryPayload["agents"];
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
