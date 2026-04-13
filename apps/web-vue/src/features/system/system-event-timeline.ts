import type {
  SystemEventItem,
  SystemEventTimelineGroup,
} from "./system-event-types";

function getEventDate(occurredAt: string): string {
  return occurredAt.slice(0, 10);
}

export function buildSystemEventTimeline(
  events: SystemEventItem[],
): SystemEventTimelineGroup[] {
  const sorted = [...events].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );

  const groups = new Map<string, SystemEventItem[]>();
  for (const event of sorted) {
    const date = getEventDate(event.occurredAt);
    const current = groups.get(date);
    if (current) {
      current.push(event);
    } else {
      groups.set(date, [event]);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, items }));
}
