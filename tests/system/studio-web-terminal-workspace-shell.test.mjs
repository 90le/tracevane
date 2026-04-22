import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const terminalViewPath = path.join(
  rootDir,
  "apps/web-vue/src/views/TerminalView.vue",
);
const workspacePagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
);
const inspectorContentPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalInspectorContent.vue",
);
const workspaceCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-workspace.css",
);
const terminalServicePath = path.join(
  rootDir,
  "apps/api/modules/terminal/service.ts",
);
const terminalRoutesPath = path.join(
  rootDir,
  "apps/api/modules/terminal/routes.ts",
);
const terminalConsolePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);
const terminalTabRailPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
);
const terminalSessionExplorerPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionExplorer.vue",
);
const terminalActionPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalActionPanel.vue",
);
const terminalSessionPanePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
);

const terminalView = fs.readFileSync(terminalViewPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");
const workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
const inspectorContent = fs.readFileSync(inspectorContentPath, "utf8");
const terminalService = fs.readFileSync(terminalServicePath, "utf8");
const terminalRoutes = fs.readFileSync(terminalRoutesPath, "utf8");
const terminalConsole = fs.readFileSync(terminalConsolePath, "utf8");
const terminalTabRail = fs.readFileSync(terminalTabRailPath, "utf8");
const terminalSessionExplorer = fs.readFileSync(terminalSessionExplorerPath, "utf8");
const terminalActionPanel = fs.readFileSync(terminalActionPanelPath, "utf8");
const terminalSessionPane = fs.readFileSync(terminalSessionPanePath, "utf8");
const terminalHistoryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-session-history.ts",
);
const terminalHistoryPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionHistoryPanel.vue",
);
const terminalHistory = fs.readFileSync(terminalHistoryPath, "utf8");
const terminalHistoryPanel = fs.readFileSync(terminalHistoryPanelPath, "utf8");
const terminalRouteSyncPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-route-sync.ts",
);
const terminalRouteSync = fs.readFileSync(terminalRouteSyncPath, "utf8");

test("terminal view mounts workspace page instead of console placeholder", () => {
  assert.match(terminalView, /<TerminalWorkspacePage\s*\/>/);
  assert.match(
    terminalView,
    /import\s*\{\s*TerminalWorkspacePage\s*\}\s*from\s*['"]\.\.\/features\/terminal['"]/,
  );
  assert.doesNotMatch(terminalView, /<TerminalConsolePage\s*\/>/);
});

test("terminal service wires descriptor and ledger persistence for session recovery", () => {
  assert.match(terminalService, /createTerminalSessionDescriptorStore/);
  assert.match(terminalService, /createTerminalSessionLedger/);
  assert.match(terminalService, /descriptorStore\.upsert\(/);
  assert.match(terminalService, /ledger\.append\(/);
  assert.match(terminalService, /listPersistedSessions\(\)/);
  assert.match(
    terminalService,
    /getPersistedSession\([\s\S]*sessionId: string[\s\S]*\)/,
  );
  assert.match(
    terminalService,
    /listSessionLedger\([\s\S]*sessionId: string[\s\S]*\)/,
  );
  assert.match(
    terminalService,
    /pruneExpiredGatewaySubscribers[\s\S]*persistSessionDescriptor\(session\)/,
  );
  assert.match(
    terminalService,
    /broadcastGatewayEvent[\s\S]*persistSessionDescriptor\(session\)/,
  );
  assert.match(
    terminalService,
    /session\.handoffContext = payload\.handoffContext/,
  );
  assert.match(terminalService, /markPersistedSessionLost/);
  assert.match(terminalService, /reconcilePersistedDescriptor/);
  assert.match(terminalService, /terminal_session_unavailable/);
});

test("terminal routes expose minimal recovery endpoints for persisted sessions", () => {
  assert.match(terminalRoutes, /\"\/api\/terminal\/sessions\/:sessionId\"/);
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/ledger\"/,
  );
});

test("terminal session pane does not render recent output disclosure above terminal stage", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.doesNotMatch(pane, /terminal-session-output-disclosure/);
  assert.doesNotMatch(pane, /recentOutputSummaryLabel/);
  assert.match(inspectorContent, /terminal-inspector-recent-output/);
  assert.match(workspacePage, /activeSessionRecentOutputLabel/);
  assert.match(inspectorContent, /recentOutput\.tailText/);
  assert.match(inspectorContent, /recentOutput\.lastError/);
  assert.match(terminalConsole, /handoffContext: readRouteHandoffContext\(\)/);
});

test("terminal workspace page composes integrated shell sections and binds state modules", () => {
  assert.equal(fs.existsSync(workspacePagePath), true);
  assert.equal(fs.existsSync(workspaceCssPath), true);

  assert.match(workspacePage, /<section class="terminal-workspace-shell"/);
  assert.match(workspacePage, /<TerminalSessionPane/);
  assert.match(workspacePage, /<TerminalInspectorDrawer/);
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.match(inspectorContent, /<TerminalSessionExplorer/);
  assert.doesNotMatch(workspacePage, /<TerminalTabRail/);
  assert.doesNotMatch(workspacePage, /<TerminalRecentSessionRail/);

  assert.match(
    workspacePage,
    /import \{ createTerminalWorkspaceState \} from '\.\/terminal-workspace-state'/,
  );
  assert.match(
    workspacePage,
    /import \{ buildTerminalActionLayers \} from '\.\/terminal-action-catalog'/,
  );
  assert.match(
    workspacePage,
    /import \{ bindTerminalRouteSync \} from '\.\/terminal-route-sync'/,
  );
  assert.match(workspacePage, /fetchPersistedTerminalSessions/);
  assert.match(workspacePage, /fetchTerminalStatus/);
  assert.doesNotMatch(workspacePage, /installTerminalCli/);
  assert.match(
    workspacePage,
    /workspace\.hydrateSessions\(summary\.sessions \|\| \[\]\)/,
  );
  assert.doesNotMatch(workspacePage, /fetchTerminalSessions\(/);

  assert.match(workspaceCss, /\.terminal-workspace-shell\s*\{/);
});

test("terminal workspace exposes shared inspector content and mobile bottom sheet trigger", () => {
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.match(workspacePage, /terminal-mobile-inspector-trigger/);
  assert.match(workspacePage, /<DialogRoot v-if="compactInspectorMode" v-model:open="mobileInspectorOpen">/);
  assert.match(workspacePage, /terminal-mobile-sheet/);
  assert.match(workspacePage, /closeMobileInspectorIfCompact\(\)/);
  assert.match(inspectorContent, /terminal-inspector-switcher__button/);
  assert.match(inspectorContent, /terminal-summary-inline__chip/);
});

test("terminal workspace loads persisted ledger history and replay affordances", () => {
  assert.match(workspacePage, /fetchPersistedTerminalSessionLedger/);
  assert.match(workspacePage, /buildTerminalSessionHistory/);
  assert.match(workspacePage, /sessionHistoryEntries/);
  assert.match(workspacePage, /loadSessionHistory/);
  assert.match(workspacePage, /handleReplayLastCommand/);
  assert.match(inspectorContent, /<TerminalSessionHistoryPanel/);
  assert.match(terminalHistoryPanel, /replayLastCommand/);
  assert.match(terminalHistory, /buildTerminalSessionHistory/);
});

test("terminal console keeps replay cursor ephemeral so refreshed xterm replays backlog", () => {
  assert.doesNotMatch(terminalConsole, /TERMINAL_RUNTIME_STORAGE_KEY/);
  assert.match(terminalConsole, /Keep replay cursor state in-memory only/);
  assert.match(terminalConsole, /fetchPersistedTerminalSessionLedger/);
  assert.match(terminalConsole, /buildTerminalSessionReplayTranscript/);
  assert.match(terminalConsole, /restorePersistedTranscriptIfNeeded/);
  assert.match(terminalConsole, /skipReplay: skipReplay \|\| undefined/);
  assert.match(terminalConsole, /params\.set\('skipReplay', '1'\)/);
  assert.match(terminalConsole, /handleTerminalKeydown/);
  assert.match(terminalConsole, /window\.addEventListener\('keydown', handleTerminalKeydown, true\)/);
  assert.match(terminalConsole, /addEventListener\('focusin', handleTerminalFocusIn\)/);
  assert.match(terminalConsole, /addEventListener\('focusout', handleTerminalFocusOut\)/);
  assert.doesNotMatch(terminalConsole, /\.onFocus\(/);
  assert.doesNotMatch(terminalConsole, /\.onBlur\(/);
  assert.match(terminalConsole, /sendTerminalShortcut/);
  assert.match(terminalConsole, /defineExpose\(\{\s*clearTerminal,\s*focusTerminal,\s*sendTerminalShortcut,/);
  assert.match(
    terminalConsole,
    /function restoreRuntime\(\): void \{\s*terminalInstanceId = '';\s*lastOutputSeq = 0;\s*transcriptRestoreAttemptedSessionId = '';\s*\}/,
  );
  assert.match(terminalService, /function normalizeSkipReplay/);
  assert.match(terminalService, /skipReplay\?: boolean \| string \| null;/);
});

test("embedded terminal console does not synthesize random session ids before the workspace resolves one", () => {
  assert.match(
    terminalConsole,
    /if \(props\.embedded\) \{\s*return '';\s*\}/,
  );
  assert.match(terminalConsole, /const sid = getSessionId\(\);\s*if \(!sid\) return;/);
  assert.match(
    terminalConsole,
    /if \(props\.embedded\) \{\s*terminalSessionId\.value = '';\s*clearRuntime\(\);\s*connected\.value = false;\s*return;\s*\}/,
  );
});

test("terminal workspace waits for hydrate before mounting the stage console and keeps route-locked sessions active", () => {
  assert.match(
    workspacePage,
    /<TerminalSessionPane\s+v-if="workspaceHydrated"/,
  );
  assert.match(workspacePage, /terminal-workspace-stage-loading/);
  assert.match(workspacePage, /fetchPersistedTerminalSessionDescriptor/);
  assert.match(workspacePage, /async function syncRouteLockedSession/);
  assert.match(workspacePage, /workspace\.setActiveSession\(normalizedSessionId\)/);
  assert.match(workspacePage, /watch\(\s*\(\) => \[workspaceHydrated\.value, route\.params\.sessionId\] as const,/);
  assert.match(workspacePage, /if \(normalizedSessionId\) \{\s*await syncRouteLockedSession\(normalizedSessionId\);/);
  assert.match(workspacePage, /const lockedRouteSessionId = String\(route\.params\.sessionId \|\| ''\)\.trim\(\);/);
  assert.match(workspacePage, /if \(lockedRouteSessionId && lockedRouteSessionId !== sessionId\) \{\s*return;\s*\}/);
  assert.match(workspacePage, /preserveRouteLockedActiveSession/);
  assert.match(workspacePage, /lockedRouteSessionId !== sessionId/);
  assert.match(workspacePage, /if \(!preserveRouteLockedActiveSession\) \{\s*workspace\.setActiveSession\(session\.sessionId\);/);
});

test("terminal workspace UI surfaces are locale-aware", () => {
  assert.match(workspacePage, /useLocalePreference/);
  assert.match(inspectorContent, /useLocalePreference/);
  assert.match(terminalTabRail, /useLocalePreference/);
  assert.match(terminalSessionExplorer, /useLocalePreference/);
  assert.match(terminalActionPanel, /useLocalePreference/);
  assert.match(terminalSessionPane, /useLocalePreference/);
  assert.match(workspacePage, /text\('终端', 'Shell'\)/);
  assert.match(inspectorContent, /text\('刷新状态', 'Refresh Status'\)/);
  assert.match(terminalTabRail, /text\('更多', 'More'\)/);
  assert.match(terminalSessionExplorer, /text\('运行中 \/ 已打开', 'Live \/ Open'\)/);
});

test("terminal workspace state exposes explicit session lifecycle actions", () => {
  const statePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-workspace-state.ts",
  );
  const stateSource = fs.readFileSync(statePath, "utf8");

  assert.match(
    stateSource,
    /openSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(
    stateSource,
    /recentSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(
    stateSource,
    /endedSessions: ComputedRef<TerminalSessionDescriptor\[\]>/,
  );
  assert.match(stateSource, /openTab\(sessionId: string\): void/);
  assert.match(
    stateSource,
    /renameSession\(sessionId: string, title: string\): void/,
  );
  assert.match(stateSource, /endSession\(sessionId: string\): void/);
  assert.match(stateSource, /deleteSession\(sessionId: string\): void/);
});

test("terminal registry exposes rename and delete helpers", () => {
  const registryPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/terminal-session-registry.ts",
  );
  const registrySource = fs.readFileSync(registryPath, "utf8");

  assert.match(
    registrySource,
    /renameSession\(sessionId: string, title: string\): void/,
  );
  assert.match(registrySource, /removeSession\(sessionId\)/);
});

test("terminal workspace no longer renders action and recent rails as fixed side columns", () => {
  assert.doesNotMatch(
    workspacePage,
    /terminal-workspace-main[\s\S]*TerminalActionPanel[\s\S]*TerminalRecentSessionRail/,
  );
});

test("terminal workspace keeps inspector drawer open by default", () => {
  assert.doesNotMatch(workspacePage, /data-testid="terminal-inspector-toggle"/);
  assert.doesNotMatch(workspacePage, /@click="toggleInspector"/);
  assert.match(
    workspacePage,
    /<TerminalInspectorDrawer[^>]*:open="true"[^>]*>/,
  );
  assert.doesNotMatch(workspacePage, /function toggleInspector\(\)/);
});

test("terminal tab strip exposes inline rename edit controls and session actions", () => {
  const tabRailPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
  );
  const tabRail = fs.readFileSync(tabRailPath, "utf8");

  assert.match(tabRail, /editingSessionId/);
  assert.match(tabRail, /renameDraft/);
  assert.match(tabRail, /terminal-tab-rename-input/);
  assert.match(tabRail, /terminal-tab-rename-save/);
  assert.match(tabRail, /terminal-tab-rename-cancel/);
  assert.doesNotMatch(tabRail, /globalThis\.prompt/);
  assert.match(tabRail, /close/);
  assert.match(tabRail, /end/);
  assert.match(tabRail, /delete/);
  assert.match(tabRail, /terminal-tab-end/);
  assert.match(tabRail, /terminal-tab-delete/);
  assert.match(tabRail, /terminal-tab-overflow/);
});

test("terminal session pane hosts integrated tab controls and lifecycle affordances", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(pane, /<TerminalTabRail/);
  assert.match(pane, /@rename=/);
  assert.match(pane, /@close=/);
  assert.match(pane, /@end=/);
  assert.match(pane, /@delete=/);
  assert.match(pane, /endSession/);
  assert.match(pane, /deleteSession/);
  assert.match(pane, /terminal-stage-header-actions/);
  assert.match(pane, /Ctrl\+C/);
  assert.match(pane, /Ctrl\+L/);
  assert.match(pane, /Focus/);
  assert.match(pane, /Force End/);
  assert.match(pane, /ref="consolePage"/);
  assert.match(pane, /sendTerminalShortcut: \(key: string\) => boolean;/);
  assert.match(pane, /function sendShortcut\(key: string\): void/);
  assert.match(pane, /function clearTerminal\(\): void/);
  assert.match(pane, /function endActiveSession\(\): void/);
  assert.doesNotMatch(pane, /terminal-session-actions/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="resolvedActiveSession\?\.sessionId \|\| ''"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:show-toolbar="false"/,
  );
  assert.doesNotMatch(pane, /<TerminalConsolePage\s*\/>/);
  assert.doesNotMatch(pane, /<TerminalConsolePage :key=/);
});

test("terminal api exposes rename and delete session calls", () => {
  const apiPath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/api.ts",
  );
  const apiSource = fs.readFileSync(apiPath, "utf8");

  assert.match(apiSource, /renameTerminalSession/);
  assert.match(apiSource, /deleteTerminalSession/);
});

test("terminal route sync keeps route-driven restore and avoids active-session push feedback", () => {
  assert.match(
    terminalRouteSync,
    /watch\(\s*\(\) => options\.route\.params\.sessionId/,
  );
  assert.doesNotMatch(terminalRouteSync, /watch\(options\.activeSessionId/);
  assert.doesNotMatch(terminalRouteSync, /router\.replace\(`/);
});

test("terminal workspace wires pane actions to session lifecycle handlers", () => {
  assert.doesNotMatch(workspacePage, /<TerminalTabRail/);
  assert.doesNotMatch(workspacePage, /@rename=/);
  assert.doesNotMatch(workspacePage, /@close=/);
  assert.doesNotMatch(workspacePage, /@end=/);
  assert.doesNotMatch(workspacePage, /@delete=/);
  assert.match(workspacePage, /@rename-session=/);
  assert.match(workspacePage, /@end-session=/);
  assert.match(workspacePage, /@delete-session=/);
  assert.match(workspacePage, /renameTerminalSession/);
  assert.match(workspacePage, /deleteTerminalSession/);
  assert.match(workspacePage, /endTerminalSession/);
  assert.match(workspacePage, /@select-session="handleSessionSelect"/);
  assert.match(workspacePage, /@close-session="handleSessionClose"/);
  assert.match(workspacePage, /async function handleSessionSelect\(sessionId: string\): Promise<void>/);
  assert.match(workspacePage, /function handleSessionClose\(sessionId: string\): void/);
  assert.match(workspacePage, /async function navigateToSession\(sessionId: string \| null \| undefined\): Promise<void>/);
  assert.match(workspacePage, /await router\.push\(\{ path: targetPath \}\)/);
});

test("terminal console session attachment sync is surfaced from console to workspace state", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(
    terminalConsole,
    /defineEmits<\{[\s\S]*sessionAttached[\s\S]*\}>\(\)/,
  );
  assert.match(terminalConsole, /emit\('sessionAttached',/);

  assert.match(pane, /@session-attached="emit\('sessionAttached', \$event\)"/);
  assert.match(
    pane,
    /\(e: 'sessionAttached', session: TerminalSessionDescriptor\): void;/,
  );

  assert.match(workspacePage, /@session-attached="handleSessionAttached"/);
  assert.match(
    workspacePage,
    /function handleSessionAttached\(session: TerminalSessionDescriptor\): void/,
  );
  assert.match(workspacePage, /workspace\.registerSession\(\{/);
  assert.match(workspacePage, /title: preservedTitle \|\| session\.title/);
  assert.match(workspacePage, /workspace\.setActiveSession\(session\.sessionId\)/);
});

test("terminal workspace maps inspector action triggers to real terminal commands", () => {
  assert.match(workspacePage, /function findActionItem\(actionKey: string\): TerminalActionItem \| null/);
  assert.match(
    workspacePage,
    /async function handleActionTrigger\(actionKey: string\): Promise<void>/,
  );
  assert.match(workspacePage, /openCommandSession\(\{/);
  assert.match(workspacePage, /item\.recommendedTitle \|\| item\.labelZh/);
  assert.match(workspacePage, /workspace\.setQueuedCommand\(sessionId, ensureCommandLineBreak\(options\.command\)\)/);
});

test("terminal workspace restores richer cli and skills inspector with command-injection install UX", () => {
  assert.match(inspectorContent, /terminal-inspector-summary-card/);
  assert.match(inspectorContent, /terminal-inspector-switcher/);
  assert.match(inspectorContent, /terminal-inspector-tooling/);
  assert.match(inspectorContent, /terminal-binary-grid/);
  assert.match(inspectorContent, /terminal-missing-deps/);
  assert.match(inspectorContent, /\$emit\('launchCli', 'claude'\)/);
  assert.match(inspectorContent, /\$emit\('launchCli', 'bash'\)/);
  assert.match(workspacePage, /launchableCliIds/);
  assert.match(workspacePage, /getInstallCommand\(/);
  assert.match(workspacePage, /queueInstallCommand\(/);
  assert.match(workspacePage, /openCommandSession\(\{/);
  assert.match(workspacePage, /fetchTerminalStatus\(/);
  assert.match(workspacePage, /terminalStatus\.value\?\.binaries/);
  assert.match(workspacePage, /terminalStatus\.value\?\.installTargets/);
  assert.doesNotMatch(workspacePage, /terminal-inspector-tooling-detection/);
  assert.match(inspectorContent, /terminal-install-feedback/);
  assert.match(workspacePage, /已在新标签注入/);
  assert.match(workspacePage, /refreshStatusLater\(/);
  assert.doesNotMatch(workspacePage, /streamTerminalInstall\(/);
  assert.doesNotMatch(workspacePage, /installTerminalCli\(/);
});

test("terminal workspace passes tab and active session state into integrated session pane", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(workspacePage, /:tabs="workspace\.tabs\.value"/);
  assert.match(workspacePage, /@rename-session=\"renameSession\"/);
  assert.doesNotMatch(workspacePage, /globalThis\.prompt/);
  assert.match(
    workspacePage,
    /:active-session-id="workspace\.activeSessionId\.value"/,
  );
  assert.match(
    workspacePage,
    /:active-session="workspace\.sessions\.value\[workspace\.activeSessionId\.value \|\| ''\] \|\| null"/,
  );
  assert.match(pane, /tabs: TerminalSessionDescriptor\[\]/);
  assert.match(pane, /activeSessionId: string \| null/);
  assert.match(pane, /activeSession: TerminalSessionDescriptor \| null/);
  assert.match(pane, /const resolvedActiveSession = computed\(\(\) =>/);
  assert.match(pane, /props\.activeSession \?\? activeSession\.value/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="resolvedActiveSession\?\.sessionId \|\| ''"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:show-toolbar="false"/,
  );
});
