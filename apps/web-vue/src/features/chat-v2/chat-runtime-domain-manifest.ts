export type ChatRuntimeSectionKey =
  | "shell"
  | "sessions"
  | "history"
  | "inspector";

export interface ChatRuntimeSectionEntry {
  key: ChatRuntimeSectionKey;
  label: string;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testPattern: string;
}

export interface ChatRuntimeCoverageSeed {
  section: ChatRuntimeSectionKey;
  routePath: string;
  runtimeSurface: string;
  frontendFile: string;
  backendFile: string;
  testPattern: string;
}

export const CHAT_RUNTIME_DOMAIN_MANIFEST: ReadonlyArray<ChatRuntimeSectionEntry> =
  [
    {
      key: "shell",
      label: "聊天壳层",
      routePath: "/chat",
      runtimeSurface: "chat-shell",
      frontendFile: "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
      backendFile: "apps/api/modules/chat/routes.ts",
      testPattern: "chat-runtime-*.test.mjs",
    },
    {
      key: "sessions",
      label: "会话目录",
      routePath: "/chat/s/:sessionRef",
      runtimeSurface: "session-list",
      frontendFile: "apps/web-vue/src/features/chat-v2/SessionListPanel.vue",
      backendFile: "apps/api/modules/chat/service.ts",
      testPattern: "chat-session-*.test.mjs",
    },
    {
      key: "history",
      label: "历史恢复",
      routePath: "/chat/history/:sessionRef",
      runtimeSurface: "history-recovery",
      frontendFile:
        "apps/web-vue/src/features/chat-v2/chat-runtime-recovery.ts",
      backendFile: "apps/api/modules/chat/history-snapshot.ts",
      testPattern: "history-*.test.mjs",
    },
    {
      key: "inspector",
      label: "检查面板",
      routePath: "/chat/workbench",
      runtimeSurface: "inspector-panel",
      frontendFile: "apps/web-vue/src/features/chat-v2/InspectorPanel.vue",
      backendFile: "apps/api/modules/chat/transcript.ts",
      testPattern: "chat-tool-*.test.mjs",
    },
  ];

export const CHAT_RUNTIME_SECTION_KEYS: ReadonlyArray<ChatRuntimeSectionKey> =
  CHAT_RUNTIME_DOMAIN_MANIFEST.map((section) => section.key);

export const CHAT_RUNTIME_COVERAGE_SEED: ReadonlyArray<ChatRuntimeCoverageSeed> =
  CHAT_RUNTIME_DOMAIN_MANIFEST.map((section) => ({
    section: section.key,
    routePath: section.routePath,
    runtimeSurface: section.runtimeSurface,
    frontendFile: section.frontendFile,
    backendFile: section.backendFile,
    testPattern: section.testPattern,
  }));

export function getChatRuntimeDomainEntry(
  sectionKey: ChatRuntimeSectionKey,
): ChatRuntimeSectionEntry {
  const entry = CHAT_RUNTIME_DOMAIN_MANIFEST.find(
    (section) => section.key === sectionKey,
  );

  if (!entry) {
    throw new Error(`Unknown chat runtime section: ${sectionKey}`);
  }

  return entry;
}
