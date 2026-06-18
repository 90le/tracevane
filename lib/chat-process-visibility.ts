import type { ChatProcessBlock } from '../types/chat.js';

export interface ChatProcessVisibilityPreferences {
  showToolPreviews: boolean;
  showThinkingBlocks: boolean;
}

export const CHAT_PROCESS_VISIBILITY_DEFAULTS: ChatProcessVisibilityPreferences = {
  showToolPreviews: true,
  showThinkingBlocks: false,
};

export const CHAT_PROCESS_VISIBILITY_STORAGE_KEYS = {
  showToolPreviews: 'tracevane.chat.show-tool-previews',
  showThinkingBlocks: 'tracevane.chat.show-thinking-blocks',
} as const;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function cloneChatProcessBlocks(blocks: ChatProcessBlock[] | undefined): ChatProcessBlock[] {
  if (!blocks?.length) {
    return [];
  }
  return blocks
    .filter((block): block is ChatProcessBlock => Boolean(block && typeof block === 'object'))
    .map((block, index) => {
      const text = normalizeString(block.text);
      if (!text) {
        return null;
      }
      return {
        id: normalizeString(block.id) || `${block.kind || 'thinking'}-${index + 1}`,
        kind: block.kind === 'reasoning' ? 'reasoning' : 'thinking',
        text,
      } satisfies ChatProcessBlock;
    })
    .filter((block): block is ChatProcessBlock => Boolean(block));
}

export function applyChatProcessVisibility<TToolHint>(params: {
  toolHints: TToolHint[];
  processBlocks: ChatProcessBlock[] | undefined;
  visibility: ChatProcessVisibilityPreferences;
}): {
  toolHints: TToolHint[];
  processBlocks: ChatProcessBlock[];
} {
  return {
    toolHints: params.visibility.showToolPreviews ? params.toolHints.slice() : [],
    processBlocks: params.visibility.showThinkingBlocks
      ? cloneChatProcessBlocks(params.processBlocks)
      : [],
  };
}
