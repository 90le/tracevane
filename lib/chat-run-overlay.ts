import type { ChatMessageItem, ChatProcessBlock, ChatRunOverlay } from '../types/chat.js';

export interface ChatMessageGroup {
  id: string;
  role: ChatMessageItem['role'];
  messages: ChatMessageItem[];
  runId: string | null;
}

export interface ChatRenderableMessageGroup {
  type: 'message_group';
  id: string;
  group: ChatMessageGroup;
}

export interface ChatRenderableRunOverlay {
  type: 'run_overlay';
  id: string;
  overlay: ChatRunOverlay;
  anchorMessageIds: string[];
  processBlocks: ChatProcessBlock[];
}

export type ChatRenderableItem = ChatRenderableMessageGroup | ChatRenderableRunOverlay;

interface OverlayPresence {
  runIds: Set<string>;
  toolCallIds: Set<string>;
  overlayRunIdByToolCallId: Map<string, string>;
}

type TimelineUnit =
  | { type: 'message'; message: ChatMessageItem }
  | { type: 'run_overlay'; overlay: ChatRunOverlay; anchorMessageIds: string[]; processBlocks: ChatProcessBlock[] };

function normalizeRole(role: ChatMessageItem['role'] | string): ChatMessageItem['role'] {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'user') return 'user';
  if (normalized === 'assistant') return 'assistant';
  if (normalized === 'system') return 'system';
  if (normalized === 'tool' || normalized === 'toolresult' || normalized === 'tool_result' || normalized === 'toolcall' || normalized === 'tool_call') {
    return 'tool';
  }
  return 'unknown';
}

function hasProcessContent(message: ChatMessageItem): boolean {
  return Boolean(message.toolCalls?.length || message.processBlocks?.length);
}

function isCanonicalToolStepMessage(message: ChatMessageItem): boolean {
  return normalizeRole(message.role) === 'assistant'
    && hasProcessContent(message)
    && (
      message.stopReason === 'toolUse'
      || !String(message.text || '').trim()
    );
}

export function buildChatMessageGroups(messages: ChatMessageItem[]): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];

  for (const message of messages) {
    const normalizedRole = normalizeRole(message.role);
    const normalizedMessage = normalizedRole === message.role
      ? message
      : { ...message, role: normalizedRole };
    const last = groups[groups.length - 1] || null;
    const canMerge = Boolean(
      last
      && last.role === normalizedRole
      && last.messages.length < 6
      && normalizedMessage.source !== 'stream'
      && !last.messages.some((item) => item.source === 'stream')
      && !isCanonicalToolStepMessage(normalizedMessage)
      && !last.messages.some((item) => isCanonicalToolStepMessage(item))
    );

    if (canMerge && last) {
      last.messages.push(normalizedMessage);
      last.runId = last.runId || normalizedMessage.runId;
      continue;
    }

    groups.push({
      id: `${normalizedMessage.id}:${groups.length}`,
      role: normalizedRole,
      messages: [normalizedMessage],
      runId: normalizedMessage.runId,
    });
  }

  return groups;
}

function hasVisibleOverlayContent(overlay: ChatRunOverlay): boolean {
  return Boolean(overlay.previewText.trim() || overlay.toolCalls.length);
}

function collectOverlayPresence(overlays: ChatRunOverlay[]): OverlayPresence {
  const runIds = new Set<string>();
  const toolCallIds = new Set<string>();
  const overlayRunIdByToolCallId = new Map<string, string>();
  for (const overlay of overlays) {
    if (overlay.runId) {
      runIds.add(overlay.runId);
    }
    for (const toolCall of overlay.toolCalls) {
      if (toolCall.toolCallId) {
        toolCallIds.add(toolCall.toolCallId);
        overlayRunIdByToolCallId.set(toolCall.toolCallId, overlay.runId);
      }
    }
  }
  return {
    runIds,
    toolCallIds,
    overlayRunIdByToolCallId,
  };
}

function overlaySort(left: ChatRunOverlay, right: ChatRunOverlay): number {
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return (left.startedAt || '').localeCompare(right.startedAt || '');
}

function normalizeDisplayRole(role: string | null | undefined): string {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'toolresult' || normalized === 'tool_result') return 'tool';
  return normalized;
}

function parseTimelineTimestamp(value: string | null | undefined): number {
  return Date.parse(value || '') || 0;
}

function collectOverlayAnchorMessageIds(messages: ChatMessageItem[], overlay: ChatRunOverlay): string[] {
  return messages
    .filter((message) => message.runId === overlay.runId && normalizeDisplayRole(message.role) === 'assistant')
    .map((message) => message.id);
}

function overlayTimelineTimestamp(overlay: ChatRunOverlay): number {
  return parseTimelineTimestamp(
    overlay.firstToolStartedAt
    || overlay.firstAssistantSeenAt
    || overlay.finalCreatedAt
    || overlay.startedAt
    || overlay.updatedAt,
  );
}

function flushMessageChunk(chunk: ChatMessageItem[], renderables: ChatRenderableItem[]): void {
  if (!chunk.length) {
    return;
  }
  const groups = buildChatMessageGroups(chunk);
  for (const group of groups) {
    renderables.push({
      type: 'message_group',
      id: group.id,
      group,
    });
  }
}

function cloneProcessBlocks(processBlocks: ChatProcessBlock[] | undefined): ChatProcessBlock[] {
  return (processBlocks || []).map((item) => ({ ...item }));
}

function messageHasVisibleNonProcessContent(message: ChatMessageItem): boolean {
  return Boolean(
    String(message.text || '').trim()
    || message.toolCalls?.length
    || message.blocks?.length
    || message.resources?.length
    || message.media?.length
    || message.aborted
    || message.omitted
    || message.truncated,
  );
}

function shouldSuppressToolCalls(message: ChatMessageItem, overlayPresence: OverlayPresence): boolean {
  if (message.runId && overlayPresence.runIds.has(message.runId)) {
    return true;
  }
  return Boolean(message.toolCalls?.some((toolCall) => overlayPresence.toolCallIds.has(toolCall.toolCallId)));
}

export function buildChatRenderableTimeline(params: {
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
}): ChatRenderableItem[] {
  const canonicalToolStepToolCallIds = new Set(
    params.messages
      .filter((message) => isCanonicalToolStepMessage(message))
      .flatMap((message) => (message.toolCalls || []).map((toolCall) => toolCall.toolCallId))
      .filter(Boolean),
  );

  const overlays = params.overlays
    .filter(hasVisibleOverlayContent)
    .filter((overlay) => {
      if (overlay.lifecycle === 'running' || overlay.lifecycle === 'queued') {
        return true;
      }
      if (!overlay.toolCalls.length) {
        return true;
      }
      return !overlay.toolCalls.every((toolCall) => canonicalToolStepToolCallIds.has(toolCall.toolCallId));
    })
    .slice()
    .sort(overlaySort);
  const overlayPresence = collectOverlayPresence(overlays);
  const processBlocksByOverlayRunId = new Map<string, ChatProcessBlock[]>();
  const displayMessages = params.messages.flatMap((message) => {
    if (isCanonicalToolStepMessage(message)) {
      return [{
        ...message,
        processBlocks: cloneProcessBlocks(message.processBlocks),
        toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall })),
      }];
    }
    const hasCoveredToolCalls = Boolean(message.toolCalls?.some((toolCall) => overlayPresence.toolCallIds.has(toolCall.toolCallId)));
    const overlayRunId = hasCoveredToolCalls
      ? message.toolCalls
        ?.map((toolCall) => overlayPresence.overlayRunIdByToolCallId.get(toolCall.toolCallId) || null)
        .find(Boolean) || null
      : null;
    if (overlayRunId && message.processBlocks?.length) {
      const current = processBlocksByOverlayRunId.get(overlayRunId) || [];
      processBlocksByOverlayRunId.set(overlayRunId, [
        ...current,
        ...cloneProcessBlocks(message.processBlocks),
      ]);
    }
    const nextMessage = shouldSuppressToolCalls(message, overlayPresence)
      ? {
        ...message,
        toolCalls: undefined,
        processBlocks: overlayRunId ? undefined : cloneProcessBlocks(message.processBlocks),
      }
      : message;
    if (overlayRunId && !messageHasVisibleNonProcessContent(nextMessage)) {
      return [];
    }
    return [nextMessage];
  });
  const units: TimelineUnit[] = [
    ...displayMessages.map((message) => ({ type: 'message', message }) as TimelineUnit),
    ...overlays.map((overlay) => ({
      type: 'run_overlay',
      overlay,
      anchorMessageIds: collectOverlayAnchorMessageIds(displayMessages, overlay),
      processBlocks: processBlocksByOverlayRunId.get(overlay.runId) || [],
    }) as TimelineUnit),
  ].sort((left, right) => {
    const leftTs = left.type === 'message'
      ? parseTimelineTimestamp(left.message.createdAt)
      : overlayTimelineTimestamp(left.overlay);
    const rightTs = right.type === 'message'
      ? parseTimelineTimestamp(right.message.createdAt)
      : overlayTimelineTimestamp(right.overlay);
    if (leftTs !== rightTs) {
      return leftTs - rightTs;
    }
    if (left.type === right.type) {
      return 0;
    }
    return left.type === 'message' ? -1 : 1;
  });

  const renderables: ChatRenderableItem[] = [];
  let messageChunk: ChatMessageItem[] = [];
  for (const unit of units) {
    if (unit.type === 'message') {
      messageChunk.push(unit.message);
      continue;
    }
    flushMessageChunk(messageChunk, renderables);
    messageChunk = [];
    renderables.push({
      type: 'run_overlay',
      id: `run-overlay:${unit.overlay.runId}`,
      overlay: unit.overlay,
      anchorMessageIds: unit.anchorMessageIds,
      processBlocks: cloneProcessBlocks(unit.processBlocks),
    });
  }
  flushMessageChunk(messageChunk, renderables);
  return renderables;
}
