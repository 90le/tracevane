import {
  buildAgentRosterSummary,
  buildAgentWorkspaceSummary,
} from "./api";

export interface AgentsOverviewRecipe {
  buildAgentRosterSummary: typeof buildAgentRosterSummary;
  buildAgentWorkspaceSummary: typeof buildAgentWorkspaceSummary;
}

export function buildAgentsOverviewRecipe(): AgentsOverviewRecipe {
  return {
    buildAgentRosterSummary,
    buildAgentWorkspaceSummary,
  };
}
