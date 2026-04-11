import type {
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatProcessBlock,
  ChatToolArtifactItem,
} from '../../../../../types/chat';
import {
  deriveChatDisplayMessage as deriveBaseChatDisplayMessage,
  deriveChatPreview,
  deriveChatSessionTitle,
  type BaseChatDisplayMessage,
  type ChatDisplayBlock,
  type ChatDisplayRenderMode,
  type ChatDisplayResourceItem,
} from '../../../../../lib/chat-display';
import {
  parseStructuredChatText,
  sanitizeToolSummary,
  type ChatDisplayToolHintItem,
} from '../../../../../lib/chat-tool-hints';
import { cloneChatProcessBlocks } from '../../../../../lib/chat-process-visibility';
import { filterMainChatToolItems } from '../../../../../lib/chat-tool-visibility';

export interface ChatDisplayToolHint extends ChatDisplayToolHintItem {
  summary: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  artifacts?: ChatToolArtifactItem[];
}

export interface ChatDisplayMessage extends BaseChatDisplayMessage {
  toolHints: ChatDisplayToolHint[];
  processBlocks: ChatProcessBlock[];
}

export type {
  ChatDisplayBlock,
  ChatDisplayRenderMode,
  ChatDisplayResourceItem,
};

export {
  deriveChatPreview,
  deriveChatSessionTitle,
};

export { sanitizeToolSummary };

export function deriveChatDisplayMessage(
  message: Pick<ChatMessageItem, 'text' | 'runId' | 'role' | 'resources' | 'blocks' | 'toolCalls' | 'processBlocks'>,
): ChatDisplayMessage {
  const base = deriveBaseChatDisplayMessage(message);
  const explicitToolHints = mapToolCallsToToolHints(message.toolCalls);
  const explicitProcessBlocks = cloneChatProcessBlocks(message.processBlocks);
  const hasExplicitBlocks = Boolean(message.blocks?.length);
  if (hasExplicitBlocks || message.role !== 'assistant') {
    return {
      ...base,
      toolHints: explicitToolHints,
      processBlocks: explicitProcessBlocks,
    };
  }

  const parsed = parseStructuredChatText(message.text || '');
  if (explicitToolHints.length) {
    if (!parsed?.structured) {
      return {
        ...base,
        toolHints: explicitToolHints,
        processBlocks: explicitProcessBlocks,
      };
    }
    const markdownSource = parsed.text.trim();
    const blocks: ChatDisplayBlock[] = [];
    if (markdownSource) {
      blocks.push({
        type: 'markdown',
        markdownSource,
        copySource: markdownSource,
      });
    }
    for (const item of base.resourceItems) {
      blocks.push({
        type: 'resource',
        item,
        display: 'card',
      });
    }
    return {
      ...base,
      blocks,
      markdownSource,
      copySource: markdownSource,
      plainTextFallback: markdownSource || base.plainTextFallback,
      renderMode: markdownSource
        ? 'markdown'
        : base.resourceItems.length
          ? 'plain-text'
          : 'empty',
      hasStructuredBlocks: parsed.structured,
      toolHints: explicitToolHints,
      processBlocks: mergeProcessBlocks(explicitProcessBlocks, parsed.processBlocks),
    };
  }
  if (!parsed?.structured) {
    return {
      ...base,
      toolHints: [],
      processBlocks: explicitProcessBlocks,
    };
  }

  const markdownSource = parsed.text.trim();
  const blocks: ChatDisplayBlock[] = [];
  if (markdownSource) {
    blocks.push({
      type: 'markdown',
      markdownSource,
      copySource: markdownSource,
    });
  }
  for (const item of base.resourceItems) {
    blocks.push({
      type: 'resource',
      item,
      display: 'card',
    });
  }

  return {
    ...base,
    blocks,
    markdownSource,
    copySource: markdownSource,
    plainTextFallback: markdownSource,
    renderMode: markdownSource
      ? 'markdown'
      : base.resourceItems.length
        ? 'plain-text'
        : 'empty',
    hasStructuredBlocks: parsed.structured,
    toolHints: filterMainChatToolItems(parsed.toolHints),
    processBlocks: mergeProcessBlocks(explicitProcessBlocks, parsed.processBlocks),
  };
}

function mergeProcessBlocks(...groups: Array<ChatProcessBlock[] | undefined>): ChatProcessBlock[] {
  const merged: ChatProcessBlock[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const block of cloneChatProcessBlocks(group)) {
      const key = `${block.kind}:${block.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(block);
    }
  }
  return merged;
}

function mapToolCallsToToolHints(toolCalls: ChatMessageToolCallItem[] | undefined): ChatDisplayToolHint[] {
  return (toolCalls || []).map((tool) => ({
    id: tool.toolCallId,
    name: tool.name,
    status: tool.status,
    summary: sanitizeToolSummary(tool.resultPreview || tool.argsPreview),
    argsPreview: tool.argsPreview,
    resultPreview: tool.resultPreview,
    artifacts: tool.artifacts?.length ? tool.artifacts.map((item) => ({ ...item })) : undefined,
  }));
}
