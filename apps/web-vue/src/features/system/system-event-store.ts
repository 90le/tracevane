import { computed, ref } from "vue";
import { buildSystemEventTimeline } from "./system-event-timeline";
import type {
  PersistedSystemEventPayload,
  SystemEventItem,
  SystemEventKind,
} from "./system-event-types";

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

const allowedKinds = new Set<SystemEventKind>([
  "diagnostic_issue",
  "device_trust_pending",
  "release_update_available",
  "repair_succeeded",
  "repair_failed",
  "upgrade_started",
  "upgrade_failed",
  "device_trust_approved",
  "device_trust_approve_failed",
  "helper_repair_succeeded",
  "helper_repair_failed",
  "config_change",
]);

function deriveSourceModule(record: PersistedSystemEventPayload): string {
  if (typeof record.sourceModule === "string" && record.sourceModule.trim()) {
    return record.sourceModule;
  }

  if (typeof record.sourceEntity === "string") {
    const [, module] = record.sourceEntity.split(":");
    if (module && module.trim()) {
      return module;
    }
  }

  return "system";
}

function toSystemEventItem(
  record: PersistedSystemEventPayload,
): SystemEventItem {
  const kind = allowedKinds.has(record.kind as SystemEventKind)
    ? (record.kind as SystemEventKind)
    : "diagnostic_issue";

  return {
    id: record.id,
    kind,
    category: record.category,
    severity: record.severity,
    occurredAt: record.occurredAt,
    title: record.title,
    summary: record.summary,
    sourceModule: deriveSourceModule(record),
    details: record.details,
  };
}

function hydrate(nextEvents: PersistedSystemEventPayload[]): void {
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
