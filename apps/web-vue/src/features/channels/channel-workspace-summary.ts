import type {
  ChannelAccountSummary,
  ChannelSummary,
} from "../../../../../types/channels";
import type {
  ChannelAccountWorkspaceSummary,
  ChannelsOverviewRecipe,
  ChannelWorkspaceSummary,
} from "./channels-overview-recipe";
import {
  buildChannelAccountWorkspaceSummary,
  buildChannelWorkspaceSummary,
} from "./channels-overview-recipe";

export interface ChannelStageSummary {
  headline: string;
  copy: string;
  badges: string[];
}

export function buildChannelStageSummary(params: {
  recipe: ChannelsOverviewRecipe;
  channel: ChannelSummary | null;
  account: ChannelAccountSummary | null;
  fallbackHeadline?: string;
}): ChannelStageSummary {
  const providerSummary: ChannelWorkspaceSummary | null = params.channel
    ? buildChannelWorkspaceSummary(params.recipe, params.channel)
    : null;
  const accountSummary: ChannelAccountWorkspaceSummary | null = params.account
    ? buildChannelAccountWorkspaceSummary(params.recipe, params.account)
    : null;

  return {
    headline: providerSummary?.headline || params.fallbackHeadline || "",
    copy: accountSummary?.copy || providerSummary?.copy || "",
    badges: providerSummary?.badges || [],
  };
}
