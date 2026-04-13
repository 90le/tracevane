export type SystemRuntimeSectionKey =
  | "overview"
  | "release"
  | "gateway"
  | "bootstrap"
  | "diagnostics"
  | "environment";

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
      key: "release",
      label: "发布信息",
      routePath: "/system",
      runtimeSurface: "runtime-release",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/service.ts",
      testFile: "tests/system/install-script-release-metadata.test.mjs",
    },
    {
      key: "gateway",
      label: "网关状态",
      routePath: "/system",
      runtimeSurface: "runtime-gateway",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/routes.ts",
      testFile: "tests/system/dashboard-service.test.mjs",
    },
    {
      key: "bootstrap",
      label: "启动状态",
      routePath: "/system",
      runtimeSurface: "runtime-bootstrap",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/bootstrap.ts",
      testFile: "tests/system/bootstrap.test.mjs",
    },
    {
      key: "diagnostics",
      label: "诊断",
      routePath: "/system",
      runtimeSurface: "runtime-diagnostics",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/device-trust.ts",
      testFile: "tests/system/device-trust.test.mjs",
    },
    {
      key: "environment",
      label: "运行环境",
      routePath: "/system",
      runtimeSurface: "runtime-environment",
      frontendFile: "apps/web-vue/src/features/system/SystemControlPage.vue",
      backendFile: "apps/api/modules/system/dreaming-shared.ts",
      testFile: "tests/system/dreaming-config.test.mjs",
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
