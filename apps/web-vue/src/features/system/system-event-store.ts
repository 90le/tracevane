import { computed, ref } from "vue";
import type { SystemEventRecord } from "../../../../../types/system";
import { buildSystemEventTimeline } from "./system-event-timeline";
import type { SystemEventItem } from "./system-event-types";

const events = ref<SystemEventItem[]>([]);
const selectedEventId = ref<string>("");

const groups = computed(() => buildSystemEventTimeline(events.value));

const selectedEvent = computed<SystemEventItem | null>(() => {
  if (!selectedEventId.value) {
    return null;
  }
  return (
    events.value.find((event) => event.id === selectedEventId.value) || null
  );
});

function toSystemEventItem(record: SystemEventRecord): SystemEventItem {
  const kind = (record.kind || "diagnostic_issue") as SystemEventItem["kind"];
  return {
    id: record.id,
    kind,
    category: record.category,
    severity: record.severity,
    occurredAt: record.occurredAt,
    title: record.title,
    summary: record.summary,
    sourceModule: record.sourceModule || "system",
  };
}

function hydrate(nextEvents: SystemEventRecord[]): void {
  events.value = (nextEvents || []).map(toSystemEventItem);

  if (!events.value.length) {
    selectedEventId.value = "";
    return;
  }

  if (!events.value.some((event) => event.id === selectedEventId.value)) {
    selectedEventId.value = events.value[0].id;
  }
}

export function useSystemEventStore() {
  return {
    events,
    selectedEventId,
    groups,
    selectedEvent,
    hydrate,
  };
}
