import type { ChatMessageBlock, ChatMessageItem } from '../types/chat.js';

export function normalizeChatMessageBlocks(
  message: Pick<ChatMessageItem, 'text' | 'blocks' | 'resources'>,
): ChatMessageBlock[] {
  const explicitBlocks = message.blocks?.filter(Boolean) || [];
  if (explicitBlocks.length) {
    return explicitBlocks;
  }

  const blocks: ChatMessageBlock[] = [];
  const text = String(message.text || '').trim();
  if (text) {
    blocks.push({
      type: 'text',
      text,
    });
  }

  for (const resource of message.resources || []) {
    if (!resource?.id) {
      continue;
    }
    blocks.push({
      type: 'resource',
      resourceId: resource.id,
      display: 'card',
    });
  }

  return blocks;
}
