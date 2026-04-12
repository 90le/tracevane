export type ChatRuntimeDomainId = "chat" | "sessions";

export interface ChatRuntimeDomainDefinition {
  id: ChatRuntimeDomainId;
  label: string;
  routePath: string;
  webEntry: string;
  apiModule: string;
  testPattern: string;
}

export interface ChatRuntimeDomainCoverageSeed {
  domainId: ChatRuntimeDomainId;
  routePath: string;
  webEntryFile: string;
  apiModuleDir: string;
  testPattern: string;
}

export const CHAT_RUNTIME_DOMAIN_MANIFEST: ReadonlyArray<ChatRuntimeDomainDefinition> =
  [
    {
      id: "chat",
      label: "会话运行",
      routePath: "/chat",
      webEntry: "ChatView.vue",
      apiModule: "chat",
      testPattern: "chat-runtime-*.test.mjs",
    },
    {
      id: "sessions",
      label: "会话目录",
      routePath: "/chat/s/:sessionRef",
      webEntry: "chat-v2/SessionListPanel.vue",
      apiModule: "chat",
      testPattern: "chat-session-*.test.mjs",
    },
  ];

export const CHAT_RUNTIME_DOMAIN_IDS: ReadonlyArray<ChatRuntimeDomainId> =
  CHAT_RUNTIME_DOMAIN_MANIFEST.map((domain) => domain.id);

export const CHAT_RUNTIME_DOMAIN_COVERAGE_SEED: ReadonlyArray<ChatRuntimeDomainCoverageSeed> =
  CHAT_RUNTIME_DOMAIN_MANIFEST.map((domain) => ({
    domainId: domain.id,
    routePath: domain.routePath,
    webEntryFile: domain.webEntry.includes("/")
      ? `apps/web-vue/src/features/${domain.webEntry}`
      : `apps/web-vue/src/views/${domain.webEntry}`,
    apiModuleDir: `apps/api/modules/${domain.apiModule}`,
    testPattern: domain.testPattern,
  }));

export function getChatRuntimeDomainEntry(
  domainId: ChatRuntimeDomainId,
): ChatRuntimeDomainDefinition {
  const entry = CHAT_RUNTIME_DOMAIN_MANIFEST.find(
    (domain) => domain.id === domainId,
  );

  if (!entry) {
    throw new Error(`Unknown chat runtime domain: ${domainId}`);
  }

  return entry;
}
