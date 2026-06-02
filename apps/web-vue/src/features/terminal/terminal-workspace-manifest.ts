export type TerminalWorkspaceSectionKey =
  | "shell"
  | "tabs"
  | "actions"
  | "profiles"
  | "transport";

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
      frontendFile: "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
      backendFile: "apps/api/modules/terminal/routes.ts",
      testFile: "tests/terminal/terminal-session-selectors.test.mjs",
    },
    {
      key: "actions",
      label: "命令菜单",
      routePath: "/terminal",
      workspaceSurface: "terminal-command-menu",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalInspectorContent.vue",
      backendFile: "apps/api/modules/terminal/service.ts",
      testFile: "tests/terminal/terminal-action-catalog.test.mjs",
    },
    {
      key: "profiles",
      label: "启动配置",
      routePath: "/terminal",
      workspaceSurface: "terminal-profiles",
      frontendFile:
        "apps/web-vue/src/features/terminal/TerminalInspectorContent.vue",
      backendFile: "apps/api/modules/terminal/routes.ts",
      testFile: "tests/terminal/terminal-profiles.test.mjs",
    },
    {
      key: "transport",
      label: "实时传输",
      routePath: "/terminal",
      workspaceSurface: "terminal-transport",
      frontendFile:
        "apps/web-vue/src/features/terminal/terminal-transport.ts",
      backendFile: "apps/api/modules/terminal/service.ts",
      testFile: "tests/terminal/terminal-transport.test.mjs",
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
