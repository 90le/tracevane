import type { ChatToolCard } from '../types/chat.js';

const MAIN_CHAT_HIDDEN_TOOL_NAMES = new Set([
  'studio_delivery',
]);

function normalizeToolName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function shouldHideToolFromMainChat(name: string | null | undefined): boolean {
  return MAIN_CHAT_HIDDEN_TOOL_NAMES.has(normalizeToolName(name));
}

export function filterMainChatToolItems<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => !shouldHideToolFromMainChat(item.name));
}

export function groupVisibleToolCardsByRun(toolCards: ChatToolCard[]): Record<string, ChatToolCard[]> {
  const grouped: Record<string, ChatToolCard[]> = {};
  for (const tool of filterMainChatToolItems(toolCards)) {
    if (!tool.runId) continue;
    if (!grouped[tool.runId]) grouped[tool.runId] = [];
    grouped[tool.runId].push(tool);
  }
  for (const runId of Object.keys(grouped)) {
    grouped[runId] = grouped[runId].slice().sort((left, right) => {
      const leftTs = Date.parse(left.startedAt || left.updatedAt || '') || 0;
      const rightTs = Date.parse(right.startedAt || right.updatedAt || '') || 0;
      if (leftTs !== rightTs) return leftTs - rightTs;
      return left.toolCallId.localeCompare(right.toolCallId);
    });
  }
  return grouped;
}
