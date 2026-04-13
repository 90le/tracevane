export type SystemEventDomainId = "event-center" | "audit-timeline";

export interface SystemEventDomainEntry {
  id: SystemEventDomainId;
  label: string;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testPattern: string;
}

export interface SystemEventCoverageSeed {
  domainId: SystemEventDomainId;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testPattern: string;
}

export const SYSTEM_EVENT_DOMAIN_MANIFEST: ReadonlyArray<SystemEventDomainEntry> =
  [
    {
      id: "event-center",
      label: "事件中心",
      routePath: "/system",
      runtimeSurface: "system-event-center",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/service.ts",
      testPattern: "studio-web-system-*.test.mjs",
    },
    {
      id: "audit-timeline",
      label: "审计时间线",
      routePath: "/system",
      runtimeSurface: "system-audit-timeline",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/routes.ts",
      testPattern: "system-*.test.mjs",
    },
  ];

export const SYSTEM_EVENT_COVERAGE_SEED: ReadonlyArray<SystemEventCoverageSeed> =
  SYSTEM_EVENT_DOMAIN_MANIFEST.map((domain) => ({
    domainId: domain.id,
    routePath: domain.routePath,
    runtimeSurface: domain.runtimeSurface,
    frontendFile: domain.frontendFile,
    backendFile: domain.backendFile,
    testPattern: domain.testPattern,
  }));

export function getSystemEventDomainEntry(
  domainId: SystemEventDomainId,
): SystemEventDomainEntry {
  const entry = SYSTEM_EVENT_DOMAIN_MANIFEST.find(
    (domain) => domain.id === domainId,
  );

  if (!entry) {
    throw new Error(`Unknown system event domain: ${domainId}`);
  }

  return entry;
}
