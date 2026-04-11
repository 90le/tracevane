import type {
  ChatLifecycleSignal,
  ChatStreamEvent,
  ChatToolCard,
  ChatToolArtifactItem,
} from '../../../../types/chat.js';
import { normalizeDate, normalizeString, summarizeUnknown } from './shared.js';

function statusRank(status: ChatToolCard['status'] | null | undefined): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

function pickStatus(previous: ChatToolCard['status'] | null | undefined, next: ChatToolCard['status']): ChatToolCard['status'] {
  return statusRank(next) >= statusRank(previous) ? next : (previous || next);
}

function pickPreview(previous: string | null | undefined, next: string | null | undefined): string | null {
  const current = normalizeString(previous) || null;
  const incoming = normalizeString(next) || null;
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.length >= current.length ? incoming : current;
}

export interface MapGatewayAgentEventParams {
  sessionKey: string;
  payload: Record<string, unknown>;
  previousToolCard?: ChatToolCard | null;
  collectToolArtifacts?: (sessionKey: string, raw: unknown, toolCallId?: string | null) => ChatToolArtifactItem[];
}

export function mapGatewayAgentEventPayload({
  sessionKey,
  payload,
  previousToolCard = null,
  collectToolArtifacts,
}: MapGatewayAgentEventParams): ChatStreamEvent | null {
  const stream = normalizeString(payload.stream).toLowerCase();
  const runId = normalizeString(payload.runId) || null;
  const emittedAt = normalizeDate(payload.ts) || new Date().toISOString();
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : {};

  if (stream === 'lifecycle') {
    const phase = normalizeString(data.phase).toLowerCase();
    if (phase !== 'start' && phase !== 'end' && phase !== 'error') return null;
    const lifecycle: ChatLifecycleSignal = {
      phase: phase as ChatLifecycleSignal['phase'],
      runId,
      emittedAt,
      errorMessage: normalizeString(data.error) || null,
    };
    return {
      kind: 'agent_lifecycle',
      sessionKey,
      runId,
      emittedAt,
      lifecycle,
    };
  }

  if (stream === 'assistant') {
    const text = typeof data.text === 'string' ? data.text : summarizeUnknown(data.text, 4_000);
    if (!runId || !text) return null;
    const textPreview = summarizeUnknown(text, 220) || text;
    const deltaText = summarizeUnknown(data.delta, 180);
    return {
      kind: 'agent_assistant',
      sessionKey,
      runId,
      emittedAt,
      text,
      textPreview,
      deltaText,
    };
  }

  if (stream === 'tool') {
    const phase = normalizeString(data.phase).toLowerCase() || 'update';
    const toolCallId = normalizeString(data.toolCallId, `tool-${Math.random().toString(36).slice(2)}`);
    const name = normalizeString(data.name, 'tool');
    const argsPreview = summarizeUnknown(data.args, 220);
    const resultSource = phase === 'start'
      ? null
      : (
        phase === 'update'
          ? (data.partialResult ?? data.result ?? data.output ?? data.text ?? data.error)
          : (data.result ?? data.output ?? data.text ?? data.error ?? data.partialResult)
      );
    const resultPreview = summarizeUnknown(resultSource, 260);
    const isError = data.isError === true;
    const computedStatus = phase === 'result' ? (isError ? 'error' : 'completed') : 'running';
    const shouldCollectArtifacts = name !== 'studio_delivery';
    const artifacts = phase === 'start'
      ? previousToolCard?.artifacts || []
      : shouldCollectArtifacts
        ? collectToolArtifacts?.(sessionKey, resultSource ?? data, toolCallId) || previousToolCard?.artifacts || []
        : previousToolCard?.artifacts || [];
    const tool: ChatToolCard = {
      toolCallId,
      runId,
      name,
      status: pickStatus(previousToolCard?.status, computedStatus),
      startedAt: previousToolCard?.startedAt || emittedAt,
      updatedAt: normalizeDate(emittedAt) || previousToolCard?.updatedAt || emittedAt,
      argsPreview: pickPreview(previousToolCard?.argsPreview, argsPreview),
      resultPreview: statusRank(computedStatus) > statusRank(previousToolCard?.status)
        ? (normalizeString(resultPreview) || pickPreview(previousToolCard?.resultPreview, resultPreview))
        : pickPreview(previousToolCard?.resultPreview, resultPreview),
      isError: previousToolCard?.isError || isError || pickStatus(previousToolCard?.status, computedStatus) === 'error',
      artifacts: artifacts.length ? artifacts : undefined,
    };
    return phase === 'start'
      ? {
        kind: 'agent_tool_call',
        sessionKey,
        runId,
        emittedAt,
        tool,
      }
      : {
        kind: 'agent_tool_result',
        sessionKey,
        runId,
        emittedAt,
        partial: phase !== 'result',
        tool,
      };
  }

  return null;
}
