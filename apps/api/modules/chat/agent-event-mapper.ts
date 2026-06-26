import type {
  ChatLifecycleSignal,
  ChatStreamEvent,
  ChatToolCard,
  ChatProcessBlock,
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

function resolveAgentAssistantText(data: Record<string, unknown>): { text: string; deltaText: string | null } {
  const text = typeof data.text === 'string'
    ? data.text
    : typeof data.accumulatedText === 'string'
      ? data.accumulatedText
    : typeof data.delta === 'string'
      ? data.delta
      : summarizeUnknown(data.text, 4_000) || '';
  const deltaText = typeof data.delta === 'string'
    ? data.delta
    : null;
  return {
    text,
    deltaText,
  };
}


function resolveAgentProcessBlock(input: {
  stream: string;
  runId: string | null;
  emittedAt: string;
  data: Record<string, unknown>;
}): ChatProcessBlock | null {
  const kindSource = normalizeString(input.data.kind || input.data.type || input.data.itemType || input.stream).toLowerCase();
  const kind: ChatProcessBlock['kind'] = kindSource === 'reasoning' ? 'reasoning' : 'thinking';
  const text = normalizeString(
    input.data.text
      ?? input.data.thinking
      ?? input.data.reasoning
      ?? input.data.summary
      ?? input.data.delta
      ?? input.data.message,
  );
  if (!input.runId || !text) return null;
  const id = normalizeString(
    input.data.id
      ?? input.data.itemId
      ?? input.data.blockId
      ?? `${kind}-${input.runId}-${input.emittedAt}`,
  );
  return { id, kind, text };
}

function mapAgentToolLikeEvent(params: {
  sessionKey: string;
  runId: string | null;
  emittedAt: string;
  phase: string;
  toolCallId: string;
  name: string;
  argsSource?: unknown;
  resultSource?: unknown;
  isError?: boolean;
  previousToolCard?: ChatToolCard | null;
  collectToolArtifacts?: (sessionKey: string, raw: unknown, toolCallId?: string | null) => ChatToolArtifactItem[];
}): Extract<ChatStreamEvent, { kind: 'agent_tool_call' | 'agent_tool_result' }> {
  const normalizedPhase = normalizeString(params.phase).toLowerCase();
  const terminal = normalizedPhase === 'result' || normalizedPhase === 'end';
  const argsPreview = summarizeUnknown(params.argsSource, 220);
  const resultPreview = summarizeUnknown(params.resultSource, 260);
  const computedStatus = terminal ? (params.isError ? 'error' : 'completed') : 'running';
  const artifacts = terminal || normalizedPhase === 'update' || normalizedPhase === 'delta'
    ? params.collectToolArtifacts?.(params.sessionKey, params.resultSource ?? {}, params.toolCallId) || params.previousToolCard?.artifacts || []
    : params.previousToolCard?.artifacts || [];
  const tool: ChatToolCard = {
    toolCallId: params.toolCallId,
    runId: params.runId,
    name: params.name,
    status: pickStatus(params.previousToolCard?.status, computedStatus),
    startedAt: params.previousToolCard?.startedAt || params.emittedAt,
    updatedAt: normalizeDate(params.emittedAt) || params.previousToolCard?.updatedAt || params.emittedAt,
    argsPreview: pickPreview(params.previousToolCard?.argsPreview, argsPreview),
    resultPreview: statusRank(computedStatus) > statusRank(params.previousToolCard?.status)
      ? (normalizeString(resultPreview) || pickPreview(params.previousToolCard?.resultPreview, resultPreview))
      : pickPreview(params.previousToolCard?.resultPreview, resultPreview),
    isError: params.previousToolCard?.isError || params.isError === true || pickStatus(params.previousToolCard?.status, computedStatus) === 'error',
    artifacts: artifacts.length ? artifacts : undefined,
  };
  return normalizedPhase === 'start'
    ? {
      kind: 'agent_tool_call',
      sessionKey: params.sessionKey,
      runId: params.runId,
      emittedAt: params.emittedAt,
      tool,
    }
    : {
      kind: 'agent_tool_result',
      sessionKey: params.sessionKey,
      runId: params.runId,
      emittedAt: params.emittedAt,
      partial: !terminal,
      tool,
    };
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
    const { text, deltaText } = resolveAgentAssistantText(data);
    if (!runId || !text) return null;
    const textPreview = summarizeUnknown(text, 220) || text;
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


  if (stream === 'reasoning' || stream === 'thinking' || stream === 'process') {
    const block = resolveAgentProcessBlock({ stream, runId, emittedAt, data });
    if (!block || !runId) return null;
    return {
      kind: 'agent_process',
      sessionKey,
      runId,
      emittedAt,
      block,
    };
  }

  if (stream === 'tool') {
    const phase = normalizeString(data.phase).toLowerCase() || 'update';
    const toolCallId = normalizeString(data.toolCallId, `tool-${Math.random().toString(36).slice(2)}`);
    const name = normalizeString(data.name, 'tool');
    const resultSource = phase === 'start'
      ? null
      : (
        phase === 'update'
          ? (data.partialResult ?? data.result ?? data.output ?? data.text ?? data.error)
          : (data.result ?? data.output ?? data.text ?? data.error ?? data.partialResult)
      );
    return mapAgentToolLikeEvent({
      sessionKey,
      runId,
      emittedAt,
      phase: phase === 'result' ? 'end' : phase,
      toolCallId,
      name,
      argsSource: data.args,
      resultSource,
      isError: data.isError === true || normalizeString(data.status).toLowerCase() === 'failed',
      previousToolCard,
      collectToolArtifacts: name !== 'tracevane_delivery' ? collectToolArtifacts : undefined,
    });
  }

  if (stream === 'item') {
    const toolCallId = normalizeString(data.toolCallId || data.itemId);
    if (!toolCallId) return null;
    const phase = normalizeString(data.phase).toLowerCase() || 'update';
    const status = normalizeString(data.status).toLowerCase();
    return mapAgentToolLikeEvent({
      sessionKey,
      runId,
      emittedAt,
      phase: phase === 'end' ? 'end' : phase,
      toolCallId,
      name: normalizeString(data.name || data.title || data.kind, 'tool'),
      argsSource: data.meta ? { title: data.title, meta: data.meta } : data.title,
      resultSource: data.progressText ?? data.summary ?? data.error,
      isError: status === 'failed' || status === 'blocked' || Boolean(data.error),
      previousToolCard,
      collectToolArtifacts,
    });
  }

  if (stream === 'command_output') {
    const toolCallId = normalizeString(data.toolCallId || data.itemId);
    if (!toolCallId) return null;
    const phase = normalizeString(data.phase).toLowerCase() || 'delta';
    const status = normalizeString(data.status).toLowerCase();
    const exitCode = typeof data.exitCode === 'number' ? data.exitCode : null;
    return mapAgentToolLikeEvent({
      sessionKey,
      runId,
      emittedAt,
      phase: phase === 'end' ? 'end' : 'update',
      toolCallId,
      name: normalizeString(data.name || data.title, 'command'),
      resultSource: data.output ?? data.summary ?? data.error,
      isError: status === 'failed' || (exitCode != null && exitCode !== 0),
      previousToolCard,
      collectToolArtifacts,
    });
  }

  return null;
}
