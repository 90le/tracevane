export type SystemEventSectionKey =
  | "summary"
  | "filters"
  | "timeline"
  | "detail";

export interface SystemEventSectionEntry {
  key: SystemEventSectionKey;
  label: string;
  routePath: string;
  eventSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export interface SystemEventCoverageSeed {
  sectionKey: SystemEventSectionKey;
  routePath: string;
  eventSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export const SYSTEM_EVENT_DOMAIN_MANIFEST: ReadonlyArray<SystemEventSectionEntry> =
  [
    {
      key: "summary",
      label: "事件总览",
      routePath: "/system/events",
      eventSurface: "system-event-summary",
      frontendFile:
        "apps/web-vue/src/features/system/system-event-selectors.ts",
      backendFile: "apps/api/modules/system/service.ts",
      testFile: "tests/system/system-event-selectors.test.mjs",
    },
    {
      key: "filters",
      label: "筛选器",
      routePath: "/system/events",
      eventSurface: "system-event-filters",
      frontendFile: "apps/web-vue/src/features/system/SystemEventFilterBar.vue",
      backendFile: "apps/api/modules/system/routes.ts",
      testFile: "tests/system/studio-web-system-event-center.test.mjs",
    },
    {
      key: "timeline",
      label: "事件时间线",
      routePath: "/system/events",
      eventSurface: "system-event-timeline",
      frontendFile: "apps/web-vue/src/features/system/system-event-timeline.ts",
      backendFile: "apps/api/modules/system/event-normalizer.ts",
      testFile: "tests/system/system-event-timeline.test.mjs",
    },
    {
      key: "detail",
      label: "事件详情",
      routePath: "/system/events",
      eventSurface: "system-event-detail",
      frontendFile:
        "apps/web-vue/src/features/system/SystemEventDetailPanel.vue",
      backendFile: "apps/api/modules/system/event-normalizer.ts",
      testFile: "tests/system/studio-web-system-event-center.test.mjs",
    },
  ];

export const SYSTEM_EVENT_COVERAGE_SEED: ReadonlyArray<SystemEventCoverageSeed> =
  SYSTEM_EVENT_DOMAIN_MANIFEST.map((section) => ({
    sectionKey: section.key,
    routePath: section.routePath,
    eventSurface: section.eventSurface,
    frontendFile: section.frontendFile,
    backendFile: section.backendFile,
    testFile: section.testFile,
  }));

export function getSystemEventDomainEntry(
  sectionKey: SystemEventSectionKey,
): SystemEventSectionEntry {
  const entry = SYSTEM_EVENT_DOMAIN_MANIFEST.find(
    (section) => section.key === sectionKey,
  );

  if (!entry) {
    throw new Error(`Unknown system event section: ${sectionKey}`);
  }

  return entry;
}
