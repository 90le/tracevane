import type { ModelGatewayProviderReasoning } from "../../../../types/model-gateway.js";

type JsonRecord = Record<string, unknown>;

type ReasoningEffortMode =
  | NonNullable<ModelGatewayProviderReasoning["effortValueMode"]>
  | "responses"
  | "anthropic";

const DISABLED_REASONING_EFFORTS = new Set(["none", "off", "disabled"]);

export function applyChatReasoningOptions(
  chatRequest: JsonRecord,
  request: JsonRecord,
  config: ModelGatewayProviderReasoning | null,
  options: { preserveEffort?: boolean } = {},
): void {
  const reasoningEnabled = reasoningRequested(request);
  if (reasoningEnabled === null) return;

  if (options.preserveEffort && reasoningEnabled) {
    const effort = reasoningEffort(request);
    const mapped = effort ? mapReasoningEffort(effort, "passthrough") : null;
    if (mapped) chatRequest.reasoning_effort = mapped;
  }

  if (!config) {
    return;
  }

  const supportsEffort = config.supportsEffort === true;
  const supportsThinking = config.supportsThinking === true || supportsEffort;
  if (supportsThinking) {
    const thinkingParam = config.thinkingParam || "thinking";
    if (thinkingParam === "thinking") {
      chatRequest.thinking = { type: reasoningEnabled ? "enabled" : "disabled" };
    } else if (thinkingParam === "enable_thinking") {
      chatRequest.enable_thinking = reasoningEnabled;
    } else if (thinkingParam === "reasoning_split") {
      chatRequest.reasoning_split = reasoningEnabled;
    }
  }

  const effortParam = config.effortParam || "reasoning_effort";
  if (!reasoningEnabled) {
    if (effortParam === "reasoning.effort") {
      chatRequest.reasoning = { effort: "none" };
    }
    return;
  }

  if (!supportsEffort) return;
  const effort = reasoningEffort(request);
  if (!effort) return;
  const mapped = mapReasoningEffort(effort, config.effortValueMode || "passthrough");
  if (!mapped) return;

  if (effortParam === "reasoning_effort") {
    chatRequest.reasoning_effort = mapped;
  } else if (effortParam === "reasoning.effort") {
    chatRequest.reasoning = { effort: mapped };
  }
}

export function applyResponsesReasoningOptions(
  responsesRequest: JsonRecord,
  request: JsonRecord,
): void {
  const effort = reasoningEffort(request);
  if (!effort || reasoningEffortDisabled(effort)) return;
  const mapped = mapReasoningEffort(effort, "responses");
  if (mapped) responsesRequest.reasoning = { effort: mapped };
}

export function applyAnthropicReasoningOptions(
  anthropicRequest: JsonRecord,
  request: JsonRecord,
): void {
  const effort = reasoningEffort(request);
  if (!effort || reasoningEffortDisabled(effort)) return;
  const mapped = mapReasoningEffort(effort, "anthropic");
  if (!mapped) return;

  anthropicRequest.thinking = { type: "adaptive" };
  const outputConfig: JsonRecord = isRecord(anthropicRequest.output_config)
    ? { ...anthropicRequest.output_config }
    : {};
  outputConfig.effort = mapped;
  anthropicRequest.output_config = outputConfig;
}

export function normalizeAnthropicReasoningOptions(anthropicRequest: JsonRecord): boolean {
  const thinking = isRecord(anthropicRequest.thinking) ? anthropicRequest.thinking : null;
  const type = stringOrNull(thinking?.type)?.toLowerCase();
  if (type !== "enabled") return false;

  const effort = reasoningEffort(anthropicRequest);
  const mapped = effort ? mapReasoningEffort(effort, "anthropic") : null;
  anthropicRequest.thinking = { type: "adaptive" };
  const outputConfig: JsonRecord = isRecord(anthropicRequest.output_config)
    ? { ...anthropicRequest.output_config }
    : {};
  outputConfig.effort = mapped || effortFromBudgetTokens(thinking?.budget_tokens) || "high";
  anthropicRequest.output_config = outputConfig;
  return true;
}

export function reasoningEffort(request: JsonRecord): string | null {
  const reasoning = isRecord(request.reasoning) ? request.reasoning : null;
  const outputConfig = isRecord(request.output_config) ? request.output_config : null;
  return stringOrNull(reasoning?.effort)
    || stringOrNull(request.reasoning_effort)
    || stringOrNull(request.reasoningEffort)
    || stringOrNull(outputConfig?.effort)
    || null;
}

export function reasoningRequested(request: JsonRecord): boolean | null {
  const effort = reasoningEffort(request);
  if (effort) return !reasoningEffortDisabled(effort);

  const thinking = request.thinking;
  if (typeof thinking === "boolean") return thinking;
  if (isRecord(thinking)) {
    const type = stringOrNull(thinking.type)?.toLowerCase();
    if (type === "disabled") return false;
    if (type === "enabled" || type === "adaptive") return true;
  }
  if (typeof request.enable_thinking === "boolean") return request.enable_thinking;
  if (typeof request.reasoning_split === "boolean") return request.reasoning_split;
  if (Object.prototype.hasOwnProperty.call(request, "reasoning")) {
    return request.reasoning !== null && request.reasoning !== undefined;
  }
  return null;
}

export function mapReasoningEffort(effort: string, mode: ReasoningEffortMode): string | null {
  const normalized = effort.trim().toLowerCase();
  if (reasoningEffortDisabled(normalized)) return null;

  if (mode === "deepseek") {
    return normalized === "max" || normalized === "xhigh" ? "max" : "high";
  }
  if (mode === "low_high") {
    return normalized === "minimal" || normalized === "low" ? "low" : "high";
  }
  if (mode === "openrouter") {
    if (normalized === "max" || normalized === "xhigh") return "xhigh";
    return ["high", "medium", "low", "minimal"].includes(normalized) ? normalized : null;
  }
  if (mode === "anthropic") {
    if (normalized === "max" || normalized === "xhigh") return "xhigh";
    if (normalized === "minimal") return "low";
    return ["low", "medium", "high"].includes(normalized) ? normalized : null;
  }
  if (mode === "responses") {
    if (normalized === "max") return "xhigh";
    return ["minimal", "low", "medium", "high", "xhigh"].includes(normalized)
      ? normalized
      : null;
  }
  return ["minimal", "low", "medium", "high", "xhigh", "max"].includes(normalized)
    ? normalized
    : null;
}

function reasoningEffortDisabled(effort: string): boolean {
  return DISABLED_REASONING_EFFORTS.has(effort.trim().toLowerCase());
}

function effortFromBudgetTokens(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 16_384) return "xhigh";
  if (value >= 8_192) return "high";
  if (value >= 2_048) return "medium";
  return "low";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
