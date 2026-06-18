export type ManagementDomainId =
  | "config"
  | "agents"
  | "channels"
  | "skills"
  | "files"
  | "cron";

export interface ManagementDomainDefinition {
  id: ManagementDomainId;
  label: string;
  routePath: string;
  webView: string;
  apiModule: string;
  testPattern: string;
}

export interface ManagementDomainCoverageSeed {
  domainId: ManagementDomainId;
  routePath: string;
  webViewFile: string;
  apiModuleDir: string;
  testPattern: string;
}

export const MANAGEMENT_DOMAIN_MANIFEST: ReadonlyArray<ManagementDomainDefinition> =
  [
    {
      id: "config",
      label: "配置",
      routePath: "/config",
      webView: "ConfigView.vue",
      apiModule: "config",
      testPattern: "tracevane-web-config-*.test.mjs",
    },
    {
      id: "agents",
      label: "智能体",
      routePath: "/agents",
      webView: "AgentsView.vue",
      apiModule: "agents",
      testPattern: "tracevane-web-agents-*.test.mjs",
    },
    {
      id: "channels",
      label: "频道",
      routePath: "/channels",
      webView: "ChannelsView.vue",
      apiModule: "channels",
      testPattern: "tracevane-web-channels-*.test.mjs",
    },
    {
      id: "skills",
      label: "技能",
      routePath: "/skills",
      webView: "SkillsView.vue",
      apiModule: "skills",
      testPattern: "tracevane-web-skills-*.test.mjs",
    },
    {
      id: "files",
      label: "文件",
      routePath: "/files",
      webView: "FilesView.vue",
      apiModule: "files",
      testPattern: "tracevane-web-files-*.test.mjs",
    },
    {
      id: "cron",
      label: "定时任务",
      routePath: "/cron",
      webView: "CronView.vue",
      apiModule: "cron",
      testPattern: "tracevane-web-cron-*.test.mjs",
    },
  ];

export const MANAGEMENT_DOMAIN_IDS: ReadonlyArray<ManagementDomainId> =
  MANAGEMENT_DOMAIN_MANIFEST.map((domain) => domain.id);

export const MANAGEMENT_DOMAIN_COVERAGE_SEED: ReadonlyArray<ManagementDomainCoverageSeed> =
  MANAGEMENT_DOMAIN_MANIFEST.map((domain) => ({
    domainId: domain.id,
    routePath: domain.routePath,
    webViewFile: `apps/web-vue/src/views/${domain.webView}`,
    apiModuleDir: `apps/api/modules/${domain.apiModule}`,
    testPattern: domain.testPattern,
  }));

export function getManagementDomainEntry(
  domainId: ManagementDomainId,
): ManagementDomainDefinition {
  const entry = MANAGEMENT_DOMAIN_MANIFEST.find(
    (domain) => domain.id === domainId,
  );

  if (!entry) {
    throw new Error(`Unknown management domain: ${domainId}`);
  }

  return entry;
}
