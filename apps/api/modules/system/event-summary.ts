import type { SystemEventRecord } from "./event-types.js";

export interface SystemEventSummaryCard {
  count: number;
  items: SystemEventRecord[];
}

export interface SystemEventSummaryCards {
  recentFailures: SystemEventSummaryCard;
  pendingAuditItems: SystemEventSummaryCard;
  recentRecoveries: SystemEventSummaryCard;
}

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByOccurredAtDesc(
  events: SystemEventRecord[],
): SystemEventRecord[] {
  return [...events].sort(
    (left, right) => toTime(right.occurredAt) - toTime(left.occurredAt),
  );
}

function buildCard(
  events: SystemEventRecord[],
  maxItems: number,
): SystemEventSummaryCard {
  const sorted = sortByOccurredAtDesc(events);
  return {
    count: sorted.length,
    items: sorted.slice(0, maxItems),
  };
}

export function buildSystemEventSummaryCards(
  events: SystemEventRecord[],
  options: { maxItems?: number } = {},
): SystemEventSummaryCards {
  const maxItems =
    Number.isFinite(options.maxItems) && Number(options.maxItems) > 0
      ? Math.floor(Number(options.maxItems))
      : 5;
  const recentFailures = events.filter(
    (event) => event.severity === "error" || event.status === "failed",
  );
  const pendingAuditItems = events.filter(
    (event) => event.category === "audit" || event.status === "pending",
  );
  const recentRecoveries = events.filter(
    (event) =>
      event.category === "recovery" ||
      event.severity === "success" ||
      event.kind === "repair_succeeded",
  );

  return {
    recentFailures: buildCard(recentFailures, maxItems),
    pendingAuditItems: buildCard(pendingAuditItems, maxItems),
    recentRecoveries: buildCard(recentRecoveries, maxItems),
  };
}
