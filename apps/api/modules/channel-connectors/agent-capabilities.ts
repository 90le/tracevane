import type {
  ChannelConnectorAgentId,
  ChannelConnectorThinkingSupport,
} from "../../../../types/channel-connectors.js";

function normalizeModel(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function opencodeObservedReasoningModel(model: string): boolean {
  return /^claude(?:-|_|\b)/i.test(model);
}

export function resolveChannelConnectorThinkingSupport(input: {
  agent: ChannelConnectorAgentId;
  model?: string | null;
}): ChannelConnectorThinkingSupport {
  const model = normalizeModel(input.model);
  if (input.agent === "codex") {
    return {
      parserSupported: true,
      parserLabel: "ready",
      liveStatus: "model-dependent",
      liveLabel: "model-dependent",
      liveNote: "Codex parser reads native reasoning summaries when the CLI/app-server emits them.",
    };
  }
  if (input.agent === "claude-code") {
    return {
      parserSupported: true,
      parserLabel: "ready",
      liveStatus: "not-observed",
      liveLabel: "not observed",
      liveNote: "Claude Code 2.1.86 through Studio Gateway did not emit a native thinking item in live smoke.",
    };
  }
  if (input.agent === "opencode") {
    if (model && opencodeObservedReasoningModel(model)) {
      return {
        parserSupported: true,
        parserLabel: "ready",
        liveStatus: "observed",
        liveLabel: "observed",
        liveNote: "OpenCode 1.17.0 emitted native reasoning with Claude-family models in live smoke.",
      };
    }
    if (model === "gpt-5.4-mini") {
      return {
        parserSupported: true,
        parserLabel: "ready",
        liveStatus: "not-observed",
        liveLabel: "not observed",
        liveNote: "OpenCode 1.17.0 did not emit native reasoning with gpt-5.4-mini in live smoke.",
      };
    }
    return {
      parserSupported: true,
      parserLabel: "ready",
      liveStatus: "model-dependent",
      liveLabel: "model-dependent",
      liveNote: "OpenCode reasoning output depends on the selected model and provider stream.",
    };
  }
  return {
    parserSupported: false,
    parserLabel: "unsupported",
    liveStatus: "unsupported",
    liveLabel: "unsupported",
    liveNote: "This Agent is not implemented in the native Channel Connectors runtime yet.",
  };
}

export function formatChannelConnectorThinkingSupport(
  support: ChannelConnectorThinkingSupport,
): string {
  return `parser=${support.parserLabel} / live=${support.liveLabel}`;
}
