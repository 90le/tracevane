export type TerminalWorkspaceSectionKey =
  | "shell"
  | "tabs"
  | "actions"
  | "recent";

export interface TerminalWorkspaceSectionEntry {
  key: TerminalWorkspaceSectionKey;
  label: string;
  routePath: string;
  workspaceSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export interface TerminalWorkspaceCoverageSeed {
  section: TerminalWorkspaceSectionKey;
  routePath: string;
  workspaceSurface: string;
  frontendFile: string;
  backendFile: string;
  testFile: string;
}

export const TERMINAL_WORKSPACE_MANIFEST: ReadonlyArray<TerminalWorkspaceSectionEntry> =
  [
    {
      key: "shell",
      label: "终端壳层",
      routePath: "/terminal",
      workspaceSurface: "terminal-shell",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
      backendFile: "apps/api/modules/terminal/service.ts",
      testFile: "tests/terminal/terminal-workspace-state.test.mjs",
    },
    {
      key: "tabs",
      label: "标签页",
      routePath: "/terminal",
      workspaceSurface: "terminal-tabs",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalWorkspaceTabs.vue",
      backendFile: "apps/api/modules/terminal/routes.ts",
      testFile: "tests/terminal/terminal-workspace-tabs.test.mjs",
    },
    {
      key: "actions",
      label: "动作栏",
      routePath: "/terminal",
      workspaceSurface: "terminal-actions",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalWorkspaceActions.vue",
      backendFile: "apps/api/modules/terminal/service.ts",
      testFile: "tests/terminal/terminal-workspace-actions.test.mjs",
    },
    {
      key: "recent",
      label: "最近会话",
      routePath: "/terminal",
      workspaceSurface: "terminal-recent",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalWorkspaceRecentList.vue",
      backendFile: "apps/api/modules/terminal/service.ts",
      testFile: "tests/terminal/terminal-workspace-recent.test.mjs",
    },
  ];

export const TERMINAL_WORKSPACE_SECTION_KEYS: ReadonlyArray<TerminalWorkspaceSectionKey> =
  TERMINAL_WORKSPACE_MANIFEST.map((section) => section.key);

export const TERMINAL_WORKSPACE_COVERAGE_SEED: ReadonlyArray<TerminalWorkspaceCoverageSeed> =
  TERMINAL_WORKSPACE_MANIFEST.map((section) => ({
    section: section.key,
    routePath: section.routePath,
    workspaceSurface: section.workspaceSurface,
    frontendFile: section.frontendFile,
    backendFile: section.backendFile,
    testFile: section.testFile,
  }));

export function getTerminalWorkspaceEntry(
  sectionKey: TerminalWorkspaceSectionKey,
): TerminalWorkspaceSectionEntry {
  const entry = TERMINAL_WORKSPACE_MANIFEST.find(
    (section) => section.key === sectionKey,
  );

  if (!entry) {
    throw new Error(`Unknown terminal workspace section: ${sectionKey}`);
  }

  return entry;
}
