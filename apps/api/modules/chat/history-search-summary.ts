import { normalizeDate } from "./shared.js";
import type { ChatHistorySearchMatch } from "../../../../types/chat.js";

export interface ChatHistorySearchSummary {
  query: string;
  totalMatches: number;
  day: string | null;
  roleFilter: string;
  contentFilter: string;
  days: Array<{ day: string; count: number }>;
}

export function groupHistoryMatchesByDay(
  matches: ChatHistorySearchMatch[],
): Map<string, ChatHistorySearchMatch[]> {
  const grouped = new Map<string, ChatHistorySearchMatch[]>();

  for (const match of matches) {
    const day =
      match.day ||
      (normalizeDate(match.createdAt) || "").slice(0, 10) ||
      "unknown";
    const bucket = grouped.get(day) || [];
    bucket.push(match);
    grouped.set(day, bucket);
  }

  return new Map(
    [...grouped.entries()].sort((left, right) =>
      right[0].localeCompare(left[0]),
    ),
  );
}

export function buildHistorySearchSummary(input: {
  query: string;
  day: string | null;
  roleFilter: string;
  contentFilter: string;
  matches: ChatHistorySearchMatch[];
}): ChatHistorySearchSummary {
  const grouped = groupHistoryMatchesByDay(input.matches);
  return {
    query: input.query,
    totalMatches: input.matches.length,
    day: input.day,
    roleFilter: input.roleFilter,
    contentFilter: input.contentFilter,
    days: [...grouped.entries()].map(([day, items]) => ({
      day,
      count: items.length,
    })),
  };
}
