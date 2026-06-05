export type SystemRuntimeSectionKey =
  | "overview"
  | "recovery"
  | "events";

export interface SystemRuntimeSectionEntry {
  key: SystemRuntimeSectionKey;
  label: string;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export interface SystemRuntimeCoverageSeed {
  section: SystemRuntimeSectionKey;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export const SYSTEM_RUNTIME_DOMAIN_MANIFEST: ReadonlyArray<SystemRuntimeSectionEntry> =
  [
    {
      key: "overview",
      label: "总览",
      routePath: "/system",
      runtimeSurface: "runtime-overview",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/service.ts",
      testFile: "tests/system/system-runtime-summary.test.mjs",
    },
    {
      key: "recovery",
      label: "自愈",
      routePath: "/system/recovery",
      runtimeSurface: "runtime-recovery",
      frontendFile: "apps/web-vue/src/features/system/SystemRecoveryPage.vue",
      backendFile: "apps/api/modules/openclaw-recovery/service.ts",
      testFile: "tests/system/openclaw-recovery-daemon.test.mjs",
    },
    {
      key: "events",
      label: "事件历史",
      routePath: "/system/events",
      runtimeSurface: "runtime-events",
      frontendFile: "apps/web-vue/src/features/system/SystemEventCenterPage.vue",
      backendFile: "apps/api/modules/system/event-summary.ts",
      testFile: "tests/system/system-event-summary.test.mjs",
    },
  ];

export const SYSTEM_RUNTIME_SECTION_KEYS: ReadonlyArray<SystemRuntimeSectionKey> =
  SYSTEM_RUNTIME_DOMAIN_MANIFEST.map((section) => section.key);

export const SYSTEM_RUNTIME_COVERAGE_SEED: ReadonlyArray<SystemRuntimeCoverageSeed> =
  SYSTEM_RUNTIME_DOMAIN_MANIFEST.map((section) => ({
    section: section.key,
    routePath: section.routePath,
    runtimeSurface: section.runtimeSurface,
    frontendFile: section.frontendFile,
    backendFile: section.backendFile,
    testFile: section.testFile,
  }));

export function getSystemRuntimeDomainEntry(
  sectionKey: SystemRuntimeSectionKey,
): SystemRuntimeSectionEntry {
  const entry = SYSTEM_RUNTIME_DOMAIN_MANIFEST.find(
    (section) => section.key === sectionKey,
  );

  if (!entry) {
    throw new Error(`Unknown system runtime section: ${sectionKey}`);
  }

  return entry;
}
