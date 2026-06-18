import type {
  ChannelConnectorContextBudgetSummary,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorGatewayModel,
  ChannelConnectorUsageSummary,
} from "./command-router.js";

export interface ChannelConnectorContextBudgetHistoryEntry {
  text?: string | null;
  attachmentSummaries?: string[] | null;
}

export interface ChannelConnectorContextBudgetInput {
  model: string | null;
  modelCatalog?: ChannelConnectorGatewayModel[] | null;
  usageSummary?: ChannelConnectorUsageSummary | null;
  history?: ChannelConnectorContextBudgetHistoryEntry[] | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveIntegerOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function modelLookupKeys(model: ChannelConnectorGatewayModel): string[] {
  return [
    model.id,
    ...(model.aliases || []),
  ]
    .map((item) => normalizeString(item).toLowerCase())
    .filter(Boolean);
}

function resolveModelFromCatalog(
  requestedModel: string | null,
  catalog: readonly ChannelConnectorGatewayModel[],
): ChannelConnectorGatewayModel | null {
  const requested = normalizeString(requestedModel).toLowerCase();
  if (!requested) return catalog.length === 1 ? catalog[0] || null : null;
  const requestedTail = requested.includes("/") ? requested.split("/").pop() || requested : requested;
  return catalog.find((model) => {
    const keys = modelLookupKeys(model);
    return keys.includes(requested) || keys.includes(requestedTail);
  }) || null;
}

function estimateHistoryTokens(history: readonly ChannelConnectorContextBudgetHistoryEntry[]): number | null {
  let characterCount = 0;
  let attachmentCount = 0;
  for (const entry of history) {
    characterCount += Array.from(normalizeString(entry.text)).length;
    attachmentCount += Array.isArray(entry.attachmentSummaries) ? entry.attachmentSummaries.length : 0;
  }
  if (!characterCount && !attachmentCount && !history.length) return null;
  return Math.max(0, Math.ceil(characterCount / 4) + history.length * 8 + attachmentCount * 32);
}

function defaultAutoCompactLimit(contextWindow: number | null, maxOutputTokens: number | null): number | null {
  if (!contextWindow) return null;
  const softLimit = Math.floor(contextWindow * 0.9);
  if (!maxOutputTokens) return softLimit;
  return Math.max(1, Math.min(softLimit, contextWindow - maxOutputTokens));
}

export function resolveChannelConnectorContextBudget(
  input: ChannelConnectorContextBudgetInput,
): ChannelConnectorContextBudgetSummary {
  const catalog = Array.isArray(input.modelCatalog) ? input.modelCatalog : [];
  const matched = resolveModelFromCatalog(input.model, catalog);
  const contextWindow = positiveIntegerOrNull(matched?.contextWindow);
  const maxOutputTokens = positiveIntegerOrNull(matched?.maxOutputTokens);
  const autoCompactTokenLimit = defaultAutoCompactLimit(contextWindow, maxOutputTokens);
  const usageTotal = positiveIntegerOrNull(input.usageSummary?.totalTokens);
  const estimatedTokens = estimateHistoryTokens(input.history || []);
  const usedTokens = usageTotal ?? estimatedTokens;
  const usageSource: ChannelConnectorContextBudgetSummary["usageSource"] = usageTotal !== null
    ? "gateway-runtime-window"
    : estimatedTokens !== null
      ? "history-estimate"
      : "none";
  const remainingTokens = contextWindow !== null && usedTokens !== null
    ? Math.max(0, contextWindow - usedTokens)
    : null;
  const usedPercent = contextWindow !== null && usedTokens !== null
    ? roundPercent((usedTokens / contextWindow) * 100)
    : null;
  const remainingPercent = contextWindow !== null && remainingTokens !== null
    ? roundPercent((remainingTokens / contextWindow) * 100)
    : null;
  const shouldCompact = usedTokens !== null && autoCompactTokenLimit !== null
    ? usedTokens >= autoCompactTokenLimit
    : null;
  const modelId = normalizeString(input.model) || null;
  return {
    modelId,
    matchedModelId: matched?.id || null,
    contextWindow,
    maxOutputTokens,
    autoCompactTokenLimit,
    usedTokens,
    remainingTokens,
    usedPercent,
    remainingPercent,
    usageSource,
    estimatedTokens,
    shouldCompact,
    compactStrategy: "agent-native-first",
    note: contextWindow
      ? null
      : matched
        ? "Gateway model is missing contextWindow metadata."
        : modelId
          ? "Current model was not found in Gateway /models metadata."
          : "Current session has no resolved model.",
  };
}

export function formatChannelConnectorContextBudget(
  budget: ChannelConnectorContextBudgetSummary,
): string[] {
  const lines = ["Context budget:"];
  const modelLabel = budget.matchedModelId || budget.modelId || "default";
  if (!budget.contextWindow) {
    lines.push(`Model ${modelLabel}: context window unknown.`);
    if (budget.note) lines.push(`Note: ${budget.note}`);
    lines.push("Compact plan: native-first with a live persistent Agent session; Tracevane fallback otherwise.");
    return lines;
  }

  if (budget.usedTokens === null) {
    lines.push(`Window: ${budget.contextWindow} tokens; no usage/history estimate yet.`);
  } else {
    const source = budget.usageSource === "gateway-runtime-window"
      ? "Gateway usage"
      : budget.usageSource === "history-estimate"
        ? "history estimate"
        : "none";
    lines.push(`Used: ${budget.usedTokens} / ${budget.contextWindow} tokens (${budget.usedPercent ?? 0}% used, ${budget.remainingPercent ?? 0}% left)`);
    lines.push(`Remaining: ${budget.remainingTokens ?? 0} tokens; source: ${source}.`);
  }
  if (budget.maxOutputTokens) lines.push(`Max output reserve: ${budget.maxOutputTokens} tokens.`);
  if (budget.autoCompactTokenLimit) {
    lines.push(`Auto compact threshold: ${budget.autoCompactTokenLimit} tokens.`);
  }
  lines.push(`Compact plan: ${budget.shouldCompact ? "threshold reached; " : ""}native-first with live persistent Agent session; Tracevane fallback otherwise.`);
  return lines;
}
