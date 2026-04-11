import type { ChatMessageItem } from '../../../../../types/chat';

export interface ChatMessageGroup {
  id: string;
  role: ChatMessageItem['role'];
  messages: ChatMessageItem[];
  runId: string | null;
}

export function buildChatMessageGroups(messages: ChatMessageItem[]): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];

  for (const message of messages) {
    const previous = groups[groups.length - 1] || null;
    const sameRole = previous?.role === message.role;
    const compatible = sameRole
      && previous
      && previous.messages.length < 8
      && !(message.source === 'stream' || previous.messages.some((item) => item.source === 'stream'));

    if (compatible && previous) {
      previous.messages.push(message);
      previous.runId = previous.runId || message.runId;
      continue;
    }

    groups.push({
      id: `${message.id}:${groups.length}`,
      role: message.role,
      messages: [message],
      runId: message.runId,
    });
  }

  return groups;
}
