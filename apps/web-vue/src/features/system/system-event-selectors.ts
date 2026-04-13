import type { SystemEventSummaryPayload } from "../../../../../types/system";
import type { SystemEventCenterSummaryCardRecipe } from "./system-event-center-recipe";
import type { SystemEventItem } from "./system-event-types";

export interface SystemEventSummaryItem {
  label: string;
  value: string;
}

export function buildSystemEventSummaryItems(params: {
  summary: SystemEventSummaryPayload | null;
  filteredEvents: SystemEventItem[];
  summaryCards: SystemEventCenterSummaryCardRecipe[];
  text: (zh: string, en: string) => string;
}): SystemEventSummaryItem[] {
  const { summary, filteredEvents, summaryCards, text } = params;
  const cards = summaryCards?.length
    ? summaryCards
    : [
        { key: "current", label: text("当前事件", "Current Events") },
        { key: "failures", label: text("最近失败", "Recent Failures") },
        { key: "pending", label: text("待处理审计", "Pending Audit") },
        { key: "recoveries", label: text("最近恢复", "Recent Recoveries") },
      ];

  return cards.map((card) => {
    if (card.key === "current") {
      return {
        label: card.label,
        value: String(filteredEvents.length),
      };
    }

    if (card.key === "failures") {
      return {
        label: card.label,
        value: String(summary?.recentFailures.count || 0),
      };
    }

    if (card.key === "pending") {
      return {
        label: card.label,
        value: String(summary?.pendingAuditItems.count || 0),
      };
    }

    return {
      label: card.label,
      value: String(summary?.recentRecoveries.count || 0),
    };
  });
}
