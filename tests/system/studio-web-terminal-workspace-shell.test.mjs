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
const appPath = path.join(
  rootDir,
  "apps/web-vue/src/App.vue",
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
const chatMessageBubbleCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/message-bubble.css",
);
const codeFileEditorPath = path.join(
  rootDir,
  "apps/web-vue/src/features/files/CodeFileEditor.vue",
);
const filesWorkspaceCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/files/files-workspace.css",
);
const terminalServicePath = path.join(
  rootDir,
  "apps/api/modules/terminal/service.ts",
);
const filesServicePath = path.join(
  rootDir,
  "apps/api/modules/files/service.ts",
);
const gitServicePath = path.join(
  rootDir,
  "apps/api/modules/git/service.ts",
);
const gitRoutesPath = path.join(
  rootDir,
  "apps/api/modules/git/routes.ts",
);
const gitTypesPath = path.join(
  rootDir,
  "types/git.ts",
);
const apiContextPath = path.join(
  rootDir,
  "apps/api/core/context.ts",
);
const apiIndexPath = path.join(
  rootDir,
  "apps/api/index.ts",
);
const apiServerPath = path.join(
  rootDir,
  "apps/api/server.ts",
);
const terminalRoutesPath = path.join(
  rootDir,
  "apps/api/modules/terminal/routes.ts",
);
const terminalConsolePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);
const terminalTransportPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-transport.ts",
);
const terminalControlPayloadPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-control-payload.ts",
);
const terminalTabRailPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalTabRail.vue",
);
const terminalSessionPanePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
);
const terminalFilePreviewPanePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalFilePreviewPane.vue",
);
const terminalMarkdownPreviewPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalMarkdownPreview.vue",
);
const terminalFilePreviewPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-file-preview.ts",
);
const terminalResourceExplorerPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalResourceExplorer.vue",
);
const terminalWorkspaceActivityBarPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalWorkspaceActivityBar.vue",
);
const terminalWorkspaceSearchPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalWorkspaceSearchPanel.vue",
);
const terminalGitPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalGitPanel.vue",
);
const terminalGitApiPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/git-api.ts",
);
const terminalResourceTransferPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-resource-transfer.ts",
);
const terminalResourceExplorerStatePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-resource-explorer-state.ts",
);
const terminalResourceDefaultDirectoryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-resource-default-directory.ts",
);
const terminalWorkspaceGroupsPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-workspace-groups.ts",
);
const terminalLaunchMetadataPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-launch-metadata.ts",
);
const studioPluginPath = path.join(
  rootDir,
  "index.ts",
);

const terminalView = fs.readFileSync(terminalViewPath, "utf8");
const appVue = fs.readFileSync(appPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");
const workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
const chatMessageBubbleCss = fs.readFileSync(chatMessageBubbleCssPath, "utf8");
const codeFileEditor = fs.readFileSync(codeFileEditorPath, "utf8");
const filesWorkspaceCss = fs.readFileSync(filesWorkspaceCssPath, "utf8");
const inspectorContent = fs.readFileSync(inspectorContentPath, "utf8");
const terminalService = fs.readFileSync(terminalServicePath, "utf8");
const filesService = fs.readFileSync(filesServicePath, "utf8");
const gitService = fs.readFileSync(gitServicePath, "utf8");
const gitRoutes = fs.readFileSync(gitRoutesPath, "utf8");
const gitTypes = fs.readFileSync(gitTypesPath, "utf8");
const apiContext = fs.readFileSync(apiContextPath, "utf8");
const apiIndex = fs.readFileSync(apiIndexPath, "utf8");
const apiServer = fs.readFileSync(apiServerPath, "utf8");
const terminalRoutes = fs.readFileSync(terminalRoutesPath, "utf8");
const terminalConsole = fs.readFileSync(terminalConsolePath, "utf8");
const terminalTransport = fs.readFileSync(terminalTransportPath, "utf8");
const terminalControlPayload = fs.readFileSync(terminalControlPayloadPath, "utf8");
const terminalTabRail = fs.readFileSync(terminalTabRailPath, "utf8");
const terminalSessionPane = fs.readFileSync(terminalSessionPanePath, "utf8");
const terminalFilePreviewPane = fs.readFileSync(terminalFilePreviewPanePath, "utf8");
const terminalMarkdownPreview = fs.readFileSync(terminalMarkdownPreviewPath, "utf8");
const terminalFilePreview = fs.readFileSync(terminalFilePreviewPath, "utf8");
const terminalResourceExplorer = fs.readFileSync(terminalResourceExplorerPath, "utf8");
const terminalWorkspaceActivityBar = fs.readFileSync(terminalWorkspaceActivityBarPath, "utf8");
const terminalWorkspaceSearchPanel = fs.readFileSync(terminalWorkspaceSearchPanelPath, "utf8");
const terminalGitPanel = fs.readFileSync(terminalGitPanelPath, "utf8");
const terminalGitApi = fs.readFileSync(terminalGitApiPath, "utf8");
const terminalResourceTransfer = fs.readFileSync(terminalResourceTransferPath, "utf8");
const terminalResourceExplorerState = fs.readFileSync(terminalResourceExplorerStatePath, "utf8");
const terminalResourceDefaultDirectory = fs.readFileSync(terminalResourceDefaultDirectoryPath, "utf8");
const terminalWorkspaceGroups = fs.readFileSync(terminalWorkspaceGroupsPath, "utf8");
const terminalLaunchMetadata = fs.readFileSync(terminalLaunchMetadataPath, "utf8");
const studioPluginSource = fs.readFileSync(studioPluginPath, "utf8");
const terminalHistoryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-session-history.ts",
);
const terminalHistory = fs.readFileSync(terminalHistoryPath, "utf8");
const terminalRouteSyncPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-route-sync.ts",
);
const terminalRouteSync = fs.readFileSync(terminalRouteSyncPath, "utf8");
const apiRuntimeConfigPath = path.join(rootDir, "apps/api/runtime-config.ts");
const apiRuntimeConfig = fs.readFileSync(apiRuntimeConfigPath, "utf8");
const webRuntimeConfigPath = path.join(rootDir, "apps/web-vue/src/shared/runtime-config.ts");
const webRuntimeConfig = fs.readFileSync(webRuntimeConfigPath, "utf8");

test("terminal view mounts workspace page instead of console placeholder", () => {
  assert.match(terminalView, /<TerminalWorkspacePage @request-shell-navigation="emit\('requestShellNavigation'\)" \/>/);
  assert.match(terminalView, /defineEmits<\{[\s\S]*requestShellNavigation[\s\S]*\}>\(\)/);
  assert.match(appVue, /<component :is="Component" @request-shell-navigation="toggleSidebar" \/>/);
  assert.match(
    terminalView,
    /import\s*\{\s*TerminalWorkspacePage\s*\}\s*from\s*['"]\.\.\/features\/terminal['"]/,
  );
  assert.match(terminalView, /import\s+['"]\.\.\/features\/terminal\/terminal-workspace\.css['"];/);
  assert.doesNotMatch(terminalView, /<style scoped>/);
  assert.doesNotMatch(terminalView, /<TerminalConsolePage\s*\/>/);
});

test("terminal console styles are owned by terminal workspace css", () => {
  assert.match(terminalConsole, /import '\.\/terminal-workspace\.css';/);
  assert.doesNotMatch(terminalConsole, /<style scoped>/);
  assert.match(workspaceCss, /\.terminal-view-route\s*\{/);
  assert.match(workspaceCss, /\.terminal-console-surface\s*\{/);
  assert.match(workspaceCss, /\.terminal-console-main\s*\{/);
  assert.match(workspaceCss, /\.terminal-container \.xterm/);
  assert.doesNotMatch(workspaceCss, /:deep|:global/);
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
  assert.match(terminalRoutes, /\"\/api\/terminal\/profiles\"/);
  assert.match(terminalRoutes, /\"\/api\/terminal\/sessions\/:sessionId\"/);
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/ledger\"/,
  );
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/stream\"/,
  );
  assert.match(terminalRoutes, /startSse\(res\)/);
  assert.match(terminalRoutes, /sendSseEvent\(res, "terminal", event\)/);
});

test("terminal side panels do not duplicate terminal output history", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.doesNotMatch(pane, /terminal-session-output-disclosure/);
  assert.doesNotMatch(pane, /recentOutputSummaryLabel/);
  assert.doesNotMatch(inspectorContent, /terminal-inspector-recent-output/);
  assert.doesNotMatch(inspectorContent, /recentOutput\.tailText/);
  assert.doesNotMatch(inspectorContent, /recentOutput\.lastError/);
  assert.doesNotMatch(inspectorContent, /terminal-session-item__snippet/);
  assert.doesNotMatch(inspectorContent, /recentOutputSummary\.tailText/);
  assert.doesNotMatch(workspacePage, /activeSessionRecentOutputLabel/);
  assert.match(terminalConsole, /handoffContext: readRouteHandoffContext\(\)/);
});

test("terminal workspace page composes integrated shell sections and binds state modules", () => {
  assert.equal(fs.existsSync(workspacePagePath), true);
  assert.equal(fs.existsSync(workspaceCssPath), true);

  assert.match(workspacePage, /class="terminal-workspace-shell"/);
  assert.match(workspacePage, /terminal-workspace-shell--fullscreen/);
  assert.match(workspacePage, /toggleWorkspaceFullscreen/);
  assert.match(workspacePage, /<TerminalWorkspaceActivityBar/);
  assert.match(workspacePage, /<TerminalResourceExplorer/);
  assert.match(workspacePage, /<TerminalWorkspaceSearchPanel/);
  assert.match(workspacePage, /<TerminalGitPanel/);
  assert.match(workspacePage, /<TerminalSessionPane/);
  assert.match(workspacePage, /<TerminalInspectorDrawer/);
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.doesNotMatch(inspectorContent, /terminal-inspector-session-menu/);
  assert.doesNotMatch(inspectorContent, /<TerminalSessionExplorer/);
  assert.doesNotMatch(workspacePage, /<TerminalTabRail/);
  assert.doesNotMatch(workspacePage, /<TerminalRecentSessionRail/);

  assert.match(
    workspacePage,
    /import \{ createTerminalWorkspaceState, type TerminalPaneLayout \} from '\.\/terminal-workspace-state'/,
  );
  assert.match(
    workspacePage,
    /import \{ buildTerminalActionLayers \} from '\.\/terminal-action-catalog'/,
  );
  assert.match(
    workspacePage,
    /import \{ bindTerminalRouteSync \} from '\.\/terminal-route-sync'/,
  );
  assert.match(workspacePage, /import TerminalResourceExplorer from '\.\/TerminalResourceExplorer\.vue'/);
  assert.match(workspacePage, /import TerminalWorkspaceActivityBar, \{ type TerminalSidebarPanel \} from '\.\/TerminalWorkspaceActivityBar\.vue'/);
  assert.match(workspacePage, /import TerminalWorkspaceSearchPanel from '\.\/TerminalWorkspaceSearchPanel\.vue'/);
  assert.match(workspacePage, /import TerminalGitPanel from '\.\/TerminalGitPanel\.vue'/);
  assert.match(workspacePage, /getTerminalResourceDirectoryAbsolutePath/);
  assert.doesNotMatch(workspacePage, /getTerminalResourceDirectoryPath/);
  assert.match(workspacePage, /type TerminalResourceTransferPayload/);
  assert.match(workspacePage, /createTerminalFilePreviewTab/);
  assert.match(workspacePage, /TerminalFilePreviewTab/);
  assert.match(workspacePage, /ref="sessionPaneRef"/);
  assert.match(workspacePage, /const activeSidebarPanel = ref<TerminalSidebarPanel>\('files'\)/);
  assert.match(workspacePage, /const searchResultCount = ref\(0\)/);
  assert.match(workspacePage, /const gitChangeCount = ref\(0\)/);
  assert.match(workspacePage, /function selectSidebarPanel\(panel: TerminalSidebarPanel\): void/);
  assert.match(workspacePage, /function openSearchPanel\(\): void \{[\s\S]*selectSidebarPanel\('search'\);[\s\S]*\}/);
  assert.match(workspacePage, /function openGitPanel\(\): void \{[\s\S]*selectSidebarPanel\('git'\);[\s\S]*\}/);
  assert.match(workspacePage, /@insert-terminal-paths="handleResourceInsertTerminalPaths"/);
  assert.match(workspacePage, /const sessionPaneRef = ref<InstanceType<typeof TerminalSessionPane> \| null>\(null\)/);
  assert.match(workspacePage, /function handleResourceInsertTerminalPaths\(paths: string\[\]\): void/);
  assert.match(workspacePage, /sessionPaneRef\.value\?\.insertTerminalPaths\(normalizedPaths\)/);
  assert.doesNotMatch(workspacePage, /interface TerminalResourceOpenPayload/);
  assert.match(workspacePage, /fetchPersistedTerminalSessions/);
  assert.match(workspacePage, /fetchTerminalStatus/);
  assert.doesNotMatch(workspacePage, /installTerminalCli/);
  assert.match(
    workspacePage,
    /workspace\.hydrateSessions\(summary\.sessions \|\| \[\]\)/,
  );
  assert.doesNotMatch(workspacePage, /fetchTerminalSessions\(/);

  assert.match(workspaceCss, /\.terminal-workspace-shell\s*\{/);
  assert.match(workspaceCss, /\.terminal-activity-bar\s*\{/);
  assert.match(workspaceCss, /\.terminal-activity-button\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-sidebar-head\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-search\s*,\s*\n\.terminal-git-panel\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-sidebar\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-sidebar-trigger\s*\{/);
  assert.match(workspaceCss, /\.main-content\.terminal-surface-route\s*\{[\s\S]*padding:\s*8px;/);
  assert.match(workspaceCss, /\.main-content\.terminal-surface-route \.shell-layout\s*\{[\s\S]*max-width:\s*none;[\s\S]*padding:\s*0;/);
  assert.match(workspaceCss, /\.main-content\.terminal-surface-route \.shell-main-stage\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*gap:\s*0;/);
  assert.match(workspaceCss, /\.main-content\.terminal-surface-route \.shell-route-stage\s*\{[\s\S]*padding:\s*0;/);
  assert.match(appVue, /<StudioShellTopbar[\s\S]*v-if="!isChatSurface && !isFilesSurface && !isTerminalSurface"/);
  assert.doesNotMatch(workspaceCss, /\.main-content\.terminal-surface-route \.studio-shell-topbar/);
  assert.match(workspaceCss, /\.main-content\.terminal-surface-route \.shell-route-stage\s*\{[\s\S]*padding:\s*0 0 3px;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-tab-rail\s*\{[\s\S]*gap:\s*3px;[\s\S]*padding:\s*3px;/);
  assert.match(workspaceCss, /\.terminal-tab-scroll\s*\{[\s\S]*padding-bottom:\s*0;[\s\S]*margin-bottom:\s*0;[\s\S]*scrollbar-gutter:\s*auto;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-mobile-ide-rail__button\s*\{[\s\S]*min-height:\s*40px;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-tab\s*\{[\s\S]*min-height:\s*40px;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-tab-select\s*\{[\s\S]*min-height:\s*38px;[\s\S]*padding:\s*0 38px 0 8px;/);
  assert.match(workspaceCss, /\.terminal-tab-add,\s*\n\s*\.terminal-tab-overflow__trigger\s*\{[\s\S]*width:\s*40px;[\s\S]*min-height:\s*40px;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-tab-close\s*\{[\s\S]*display:\s*none;/);
  assert.match(workspaceCss, /@media \(max-width: 430px\) \{[\s\S]*\.terminal-tab\s*\{[\s\S]*min-height:\s*38px;/);
  assert.match(workspaceCss, /@media \(max-width: 430px\) \{[\s\S]*\.terminal-tab-add,\s*\n\s*\.terminal-tab-overflow__trigger\s*\{[\s\S]*width:\s*38px;[\s\S]*min-width:\s*38px;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-tab-rail\s*\{[^}]*background:\s*transparent;[^}]*padding:\s*10px;/);
  assert.match(terminalResourceExplorer, /fetchFilesSummary/);
  assert.match(terminalResourceExplorer, /browseDirectory/);
  assert.match(terminalResourceExplorer, /searchFiles/);
  assert.match(terminalResourceExplorer, /uploadFiles/);
  assert.match(terminalResourceExplorer, /buildFileDownloadUrl/);
  assert.match(terminalResourceExplorer, /buildArchiveDownloadUrl/);
  assert.match(terminalResourceExplorer, /createDirectory/);
  assert.match(terminalResourceExplorer, /createFile/);
  assert.match(terminalResourceExplorer, /copyPath/);
  assert.match(terminalResourceExplorer, /movePath/);
  assert.match(terminalResourceExplorer, /renamePath/);
  assert.match(terminalResourceExplorer, /deletePaths/);
  assert.match(terminalResourceExplorer, /RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY/);
  assert.match(terminalResourceExplorer, /workspaceScopeId/);
  assert.match(terminalResourceExplorer, /workspaceFallbackCwd/);
  assert.match(terminalResourceExplorer, /workspaceDefaultScopeId/);
  assert.match(terminalResourceExplorer, /syncWorkspaceDirectoryContext/);
  assert.match(terminalResourceExplorer, /resolveWorkspaceDefaultTarget/);
  assert.match(terminalResourceExplorer, /buildDirectoryPayloadForAbsolutePath/);
  assert.match(terminalResourceExplorer, /readTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceExplorer, /writeTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceExplorer, /clearTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceExplorer, /hasTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceDefaultDirectory, /RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY/);
  assert.match(terminalResourceDefaultDirectory, /TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID/);
  assert.match(terminalResourceDefaultDirectory, /TerminalResourceDefaultDirectoryState/);
  assert.match(terminalResourceDefaultDirectory, /readTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceDefaultDirectory, /writeTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceDefaultDirectory, /clearTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceDefaultDirectory, /hasTerminalResourceDefaultDirectory/);
  assert.match(terminalResourceDefaultDirectory, /absolutePath/);
  assert.match(terminalResourceExplorer, /RESOURCE_EXPLORER_STATE_STORAGE_KEY/);
  assert.match(terminalResourceExplorer, /parseTerminalResourceExplorerSnapshot/);
  assert.match(terminalResourceExplorer, /serializeTerminalResourceExplorerSnapshot/);
  assert.match(terminalResourceExplorer, /function restoreResourceExplorerSnapshot\(/);
  assert.match(terminalResourceExplorer, /const workspaceTarget = resolveWorkspaceDefaultTarget\(\);[\s\S]*roots\.value\.find\(\(root\) => root\.id === workspaceTarget\?\.rootId\)/);
  assert.match(terminalResourceExplorer, /watch\(\s*\(\) => \(\{[\s\S]*expandedPaths: expandedPaths\.value,[\s\S]*selectedPath: selectedPath\.value,[\s\S]*showHidden: showHidden\.value,[\s\S]*persistResourceExplorerSnapshot,/);
  assert.match(terminalResourceExplorerState, /TerminalResourceExplorerSnapshot/);
  assert.match(terminalResourceExplorerState, /TERMINAL_RESOURCE_EXPLORER_EXPANDED_PATH_LIMIT = 64/);
  assert.match(terminalResourceExplorerState, /normalizeExpandedPaths/);
  assert.match(terminalResourceExplorer, /visibleRows/);
  assert.match(terminalResourceExplorer, /expandedPaths/);
  assert.match(terminalResourceExplorer, /handleClipboardPaste/);
  assert.match(terminalResourceExplorer, /handleUploadDrop/);
  assert.match(terminalResourceExplorer, /uploadDirectoryInput/);
  assert.match(terminalResourceExplorer, /webkitdirectory/);
  assert.match(terminalResourceExplorer, /resolveResourceFileIcon\(row\.entry\)/);
  assert.match(terminalResourceExplorer, /function resolveResourceFileIconKind\(entry: FileEntrySummary\): ResourceFileIconKind/);
  assert.match(terminalResourceExplorer, /FileCode2/);
  assert.match(terminalResourceExplorer, /FileImage/);
  assert.match(terminalResourceExplorer, /FileArchive/);
  assert.match(terminalResourceExplorer, /FileTerminal/);
  assert.match(terminalResourceExplorer, /terminal-resource-row__icon--\$\{resolveResourceFileIconKind\(entry\)\}/);
  assert.match(terminalResourceExplorer, /collectUploadCandidatesFromDrop/);
  assert.match(terminalResourceExplorer, /webkitGetAsEntry/);
  assert.match(terminalResourceExplorer, /relativePath: candidate\.relativePath/);
  assert.match(terminalResourceExplorer, /uploadFileCandidates\(\s*candidates: UploadFileCandidate\[\],[\s\S]*destinationDirectoryPath = uploadDirectoryPath\.value/);
  assert.match(terminalResourceExplorer, /directoryPath: targetDirectory/);
  assert.match(terminalResourceExplorer, /refreshDirectoriesAfterUpload\(uploadCandidates, targetDirectory\)/);
  assert.match(terminalResourceExplorer, /refreshDirectoriesAfterUpload\(\s*candidates: UploadFileCandidate\[\],[\s\S]*destinationDirectoryPath = uploadDirectoryPath\.value/);
  assert.match(terminalResourceExplorer, /上传文件夹/);
  assert.match(terminalResourceExplorer, /上传文件夹到此处/);
  assert.match(terminalResourceExplorer, /contextMenuDownloadUrl/);
  assert.match(terminalResourceExplorer, /contextMenuDownloadName/);
  assert.match(terminalResourceExplorer, /contextMenuDownloadPayloads/);
  assert.match(terminalResourceExplorer, /terminal-resource-context-menu__item/);
  assert.match(terminalResourceExplorer, /下载/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-actions/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-action--new-file/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-action--new-folder/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-action--filter/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-action--collapse-all/);
  assert.match(terminalResourceExplorer, /@click\.stop="startCreateFromSelection\('file'\)"/);
  assert.match(terminalResourceExplorer, /@click\.stop="startCreateFromSelection\('directory'\)"/);
  assert.match(terminalResourceExplorer, /@click\.stop="openResourceFilter\(\)"/);
  assert.match(terminalResourceExplorer, /@click\.stop="collapseAllDirectories"/);
  assert.match(terminalResourceExplorer, /event\.key === 'ContextMenu' \|\| \(event\.shiftKey && event\.key === 'F10'\)/);
  assert.match(terminalResourceExplorer, /function openSelectedContextMenuFromKeyboard\(\): void/);
  assert.match(terminalResourceExplorer, /openContextMenuAtPath\(targetPath\)/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-more/);
  assert.match(terminalResourceExplorer, /resourceHeadMoreRef/);
  assert.match(terminalResourceExplorer, /const resourceHeadMoreOpen = ref\(false\)/);
  assert.match(terminalResourceExplorer, /:open="resourceHeadMoreOpen"/);
  assert.match(terminalResourceExplorer, /:aria-expanded="resourceHeadMoreOpen"/);
  assert.match(terminalResourceExplorer, /@click\.prevent\.stop="toggleResourceHeadMore"/);
  assert.match(terminalResourceExplorer, /document\.addEventListener\('pointerdown', closeResourceHeadMoreFromOutside, true\)/);
  assert.match(terminalResourceExplorer, /window\.addEventListener\('resize', closeResourceHeadMore\)/);
  assert.match(terminalResourceExplorer, /function uploadDirectoryFromMenu\(\): void/);
  assert.match(terminalResourceExplorer, /function syncResourceHeadMoreState\(\): void/);
  assert.match(terminalResourceExplorer, /function closeResourceHeadMoreFromOutside\(event: PointerEvent\): void/);
  assert.match(terminalResourceExplorer, /closeResourceHeadMore/);
  assert.match(terminalResourceExplorer, /closeResourceOverlays/);
  assert.match(terminalResourceExplorer, /@keydown\.esc\.stop\.prevent="closeResourceHeadMore"/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-more__summary"[\s\S]*@click\.stop/);
  assert.match(terminalResourceExplorer, /<MoreHorizontal class="terminal-resource-icon"/);
  assert.doesNotMatch(terminalResourceExplorer, /openResourceFilterFromMenu/);
  assert.match(terminalResourceExplorer, /terminal-resource-explorer__identity/);
  assert.match(terminalResourceExplorer, /<span class="sr-only" aria-live="polite">\{\{ uploadFeedback \}\}<\/span>/);
  assert.doesNotMatch(terminalResourceExplorer, /<span v-if="uploadFeedback">\{\{ uploadFeedback \}\}<\/span>/);
  assert.doesNotMatch(terminalResourceExplorer, /terminal-resource-head-more__item--collapse-all/);
  assert.match(terminalResourceExplorer, /terminal-resource-head-more__item--collapse-sidebar/);
  assert.match(terminalResourceExplorer, /<ListCollapse class="terminal-resource-icon"/);
  assert.match(terminalResourceExplorer, /<PanelLeftClose class="terminal-resource-context-menu__icon"/);
  assert.match(terminalResourceExplorer, /hasExpandedDirectories/);
  assert.match(terminalResourceExplorer, /workspaceRootPath/);
  assert.match(terminalResourceExplorer, /isWorkspaceRootSelected/);
  assert.match(terminalResourceExplorer, /const resourceTreeDataRevision = ref\(0\)/);
  assert.match(terminalResourceExplorer, /let visibleRowsCacheKey = '';/);
  assert.match(terminalResourceExplorer, /const visibleRows = computed<ResourceTreeRow\[\]>\(\(\) => resolveVisibleRows\(\)\)/);
  assert.match(terminalResourceExplorer, /function resolveVisibleRows\(\): ResourceTreeRow\[\]/);
  assert.match(terminalResourceExplorer, /resourceFilterActive\.value \? 'filter' : 'tree'/);
  assert.match(terminalResourceExplorer, /if \(visibleRowsCacheKey === cacheKey\) return visibleRowsCache;/);
  assert.match(terminalResourceExplorer, /bumpResourceTreeDataRevision\(\)/);
  assert.match(terminalResourceExplorer, /bumpResourceTreeExpansionRevision\(\)/);
  assert.match(terminalResourceExplorer, /bumpResourceTreeLoadingRevision\(\)/);
  assert.match(terminalResourceExplorer, /flattenTree\(workspaceRootPath\.value, 0\)/);
  assert.match(terminalResourceExplorer, /flattenFilteredTree\(workspaceRootPath\.value, 0, resourceFilterNeedle\.value\)/);
  assert.match(terminalResourceExplorer, /await loadDirectory\(targetPath, \{ root: true \}\);[\s\S]*selectRoot\(\);/);
  assert.match(terminalResourceExplorer, /void loadDirectory\(currentWorkspaceRootPath, \{ root: true \}\)/);
  assert.match(terminalResourceExplorer, /function buildDirectoryLoadChain\(directoryPath: string\): string\[\]/);
  assert.match(terminalResourceExplorer, /function relativeWorkspacePath\(path: string\): string/);
  assert.match(terminalResourceExplorer, /function isWorkspaceRootPath\(path: string \| null \| undefined\): boolean/);
  assert.match(terminalResourceExplorer, /function collapseAllDirectories\(\): void \{[\s\S]*expandedPaths\.value = \{ \[workspaceRootPath\.value\]: true \};/);
  assert.doesNotMatch(terminalResourceExplorer, /function collapseAllDirectoriesFromMenu\(\): void/);
  assert.match(terminalResourceExplorer, /function collapseResourceExplorerFromMenu\(\): void/);
  assert.doesNotMatch(terminalResourceExplorer, /@click="emit\('collapse'\)"/);
  assert.doesNotMatch(terminalResourceExplorer, /@click="collapseAllDirectories"/);
  assert.match(
    terminalResourceExplorer,
    /terminal-resource-head-more__panel[\s\S]*terminal-resource-root-switcher[\s\S]*<select v-model="rootId"/,
  );
  assert.doesNotMatch(terminalResourceExplorer, /terminal-resource-root-select/);
  assert.match(terminalResourceExplorer, /<Eye v-if="showHidden"/);
  assert.doesNotMatch(terminalResourceExplorer, /explorerStatusLabel/);
  assert.doesNotMatch(terminalResourceExplorer, /terminal-resource-controls/);
  assert.doesNotMatch(terminalResourceExplorer, /terminal-resource-action/);
  assert.match(terminalResourceExplorer, /openSelectedInTerminalFromMenu/);
  assert.match(terminalResourceExplorer, /uploadFilesFromMenu/);
  assert.match(terminalResourceExplorer, /Ctrl Enter/);
  assert.match(terminalResourceExplorer, /Ctrl Alt U/);
  assert.match(terminalResourceExplorer, /role="toolbar"/);
  assert.doesNotMatch(terminalResourceExplorer, /class="sr-only">\{\{ text\('打开目录'/);
  assert.match(terminalResourceExplorer, /openEntryContextMenu/);
  assert.match(terminalResourceExplorer, /openRootContextMenu/);
  assert.match(terminalResourceExplorer, /@pointerdown="startResourceLongPress\(\$event, workspaceRootPath\)"/);
  assert.match(terminalResourceExplorer, /@pointerdown="startResourceLongPress\(\$event, row\.entry\.path\)"/);
  assert.match(terminalResourceExplorer, /RESOURCE_CONTEXT_MENU_WIDTH = 272/);
  assert.match(terminalResourceExplorer, /RESOURCE_CONTEXT_MENU_HEIGHT = 460/);
  assert.match(terminalResourceExplorer, /RESOURCE_LONG_PRESS_DELAY_MS = 520/);
  assert.match(terminalResourceExplorer, /RESOURCE_LONG_PRESS_MOVE_TOLERANCE = 12/);
  assert.match(terminalResourceExplorer, /viewportWidth - RESOURCE_CONTEXT_MENU_WIDTH - 8/);
  assert.match(terminalResourceExplorer, /viewportHeight - RESOURCE_CONTEXT_MENU_HEIGHT - 8/);
  assert.match(terminalResourceExplorer, /interface ResourceLongPressState/);
  assert.match(terminalResourceExplorer, /interface ResourceContextMenuPoint/);
  assert.match(terminalResourceExplorer, /let resourceLongPress: ResourceLongPressState \| null = null;/);
  assert.match(terminalResourceExplorer, /let suppressNextResourceClick = false;/);
  assert.doesNotMatch(terminalResourceExplorer, /const menuWidth = 240/);
  assert.doesNotMatch(terminalResourceExplorer, /viewportHeight - 240/);
  assert.match(terminalResourceExplorer, /buildRootPayload/);
  assert.match(terminalResourceExplorer, /pendingOperation/);
  assert.match(terminalResourceExplorer, /startContextCreate/);
  assert.match(terminalResourceExplorer, /startContextRename/);
  assert.match(terminalResourceExplorer, /startContextDelete/);
  assert.match(terminalResourceExplorer, /commitResourceOperation/);
  assert.match(terminalResourceExplorer, /resourceClipboard/);
  assert.match(terminalResourceExplorer, /copyContextResource/);
  assert.match(terminalResourceExplorer, /cutContextResource/);
  assert.match(terminalResourceExplorer, /pasteContextResource/);
  assert.match(terminalResourceExplorer, /handleExplorerKeydown/);
  assert.match(terminalResourceExplorer, /handleResourceDrop/);
  assert.match(terminalResourceExplorer, /handleResourceDragOver/);
  assert.match(terminalResourceExplorer, /types\.includes\('Files'\)[\s\S]*event\.dataTransfer\.dropEffect = 'copy'/);
  assert.match(terminalResourceExplorer, /const candidates = await collectUploadCandidatesFromDrop\(event\);[\s\S]*await uploadFileCandidates\(candidates, destinationDirectoryPath\);/);
  assert.match(terminalResourceExplorer, /parseTerminalResourceTransfer/);
  assert.match(terminalResourceExplorer, /buildCopyName/);
  assert.match(terminalResourceExplorer, /function handleEntryDragStart[\s\S]*selectedPath\.value = entry\.path;[\s\S]*setDragPayload/);
  assert.match(terminalResourceExplorer, /selectedPaths/);
  assert.match(terminalResourceExplorer, /primarySelectedPath/);
  assert.match(terminalResourceExplorer, /selectedRelativePaths/);
  assert.match(terminalResourceExplorer, /resourceFilterQuery/);
  assert.match(terminalResourceExplorer, /resourceFilterOpen/);
  assert.match(terminalResourceExplorer, /resourceSearchResults/);
  assert.match(terminalResourceExplorer, /resourceSearchBusy/);
  assert.match(terminalResourceExplorer, /terminal-resource-filter/);
  assert.match(terminalResourceExplorer, /text\('搜索文件和文件夹', 'Search files and folders'\)/);
  assert.doesNotMatch(terminalResourceExplorer, /过滤已加载文件|Filter loaded files/);
  assert.match(terminalResourceExplorer, /function flattenFilteredTree\(path: string, level: number, needle: string\): ResourceTreeRow\[\]/);
  assert.match(terminalResourceExplorer, /function resourceEntryMatchesFilter\(entry: FileEntrySummary, needle: string\): boolean/);
  assert.match(terminalResourceExplorer, /function handleResourceFilterKeydown\(event: KeyboardEvent\): void/);
  assert.match(terminalResourceExplorer, /function commitResourceFilterSelection\(\): Promise<void>/);
  assert.match(terminalResourceExplorer, /await revealResourcePath\(targetPath, targetKind\);[\s\S]*if \(targetKind === 'file'\) \{[\s\S]*previewEntryFile\(selectedEntryValue\);[\s\S]*\}/);
  assert.match(terminalResourceExplorer, /function scheduleResourceSearch\(\): void/);
  assert.match(terminalResourceExplorer, /function runResourceSearch\(/);
  assert.match(terminalResourceExplorer, /await searchFiles\(searchRootId, query, searchDirectoryPath, true, showHiddenFiles\)/);
  assert.match(terminalResourceExplorer, /selectEntryFromPointer/);
  assert.match(terminalResourceExplorer, /@dblclick="openResourceEntry\(row\.entry\)"/);
  assert.match(terminalResourceExplorer, /function selectRootFromPointer\(event: MouseEvent\): void/);
  assert.match(terminalResourceExplorer, /function handleExplorerClick\(event: MouseEvent\): void/);
  assert.match(terminalResourceExplorer, /function consumeSuppressedResourceClick\(event: MouseEvent\): boolean \{[\s\S]*suppressNextResourceClick = false;[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*return true;/);
  assert.match(terminalResourceExplorer, /interface ResourceNavigationItem/);
  assert.match(
    terminalResourceExplorer,
    /function selectEntry\(entry: FileEntrySummary\): void \{\s*focusEntry\(entry\);\s*\}/,
  );
  assert.match(
    terminalResourceExplorer,
    /function selectEntryFromPointer\(event: MouseEvent, entry: FileEntrySummary\): void \{[\s\S]*event\.shiftKey[\s\S]*return;[\s\S]*event\.metaKey \|\| event\.ctrlKey[\s\S]*return;[\s\S]*selectEntry\(entry\);[\s\S]*if \(shouldPreviewEntryFromPointer\(event, entry\)\) \{[\s\S]*previewEntryFromPointer\(entry\);[\s\S]*\}/,
  );
  assert.match(
    terminalResourceExplorer,
    /function shouldPreviewEntryFromPointer\(event: MouseEvent, entry: FileEntrySummary\): boolean \{[\s\S]*entry\.kind === 'file'[\s\S]*event\.button === 0[\s\S]*!event\.shiftKey[\s\S]*!event\.metaKey[\s\S]*!event\.ctrlKey[\s\S]*!event\.altKey[\s\S]*!isInlineRenaming\(entry\)/,
  );
  assert.match(
    terminalResourceExplorer,
    /function previewEntryFromPointer\(entry: FileEntrySummary\): void \{[\s\S]*if \(!resourceFilterActive\.value\) \{[\s\S]*previewEntryFile\(entry\);[\s\S]*return;[\s\S]*closeResourceFilter\(\);[\s\S]*void revealResourcePath\(targetPath, targetKind\)\.then\(\(\) => \{[\s\S]*previewEntryFile\(entry\);/,
  );
  assert.match(terminalResourceExplorer, /function focusEntry\(entry: FileEntrySummary\): void/);
  assert.match(terminalResourceExplorer, /function openResourceEntry\(entry: FileEntrySummary\): void/);
  assert.match(terminalResourceExplorer, /resourceFilterActive\.value[\s\S]*void revealResourcePath\(entry\.path, entry\.kind\)/);
  assert.match(
    terminalResourceExplorer,
    /if \(entry\.kind === 'directory'\) \{[\s\S]*toggleDirectory\(entry\);[\s\S]*return;[\s\S]*\}[\s\S]*focusEntry\(entry\);[\s\S]*previewEntryFile\(entry\);/,
  );
  assert.match(terminalResourceExplorer, /function getResourceNavigationItems\(\): ResourceNavigationItem\[\]/);
  assert.match(terminalResourceExplorer, /function moveResourceSelection\(delta: number\): void/);
  assert.match(terminalResourceExplorer, /function moveResourceSelectionToEdge\(edge: 'first' \| 'last'\): void/);
  assert.match(terminalResourceExplorer, /function expandSelectedDirectory\(\): void/);
  assert.match(terminalResourceExplorer, /function collapseSelectedDirectoryOrSelectParent\(\): void/);
  assert.match(terminalResourceExplorer, /function previewEntryFile\(entry: FileEntrySummary\): void/);
  assert.match(terminalResourceExplorer, /async function revealResourcePath\(\s*path: string,[\s\S]*findResourceRowElement\(normalized\)\?\.scrollIntoView/);
  assert.match(terminalResourceExplorer, /let suppressRootWatcher = false/);
  assert.match(terminalResourceExplorer, /if \(suppressRootWatcher\) return;/);
  assert.match(terminalResourceExplorer, /async function revealTerminalResource\(payload: TerminalResourceTransferPayload\): Promise<void>/);
  assert.match(terminalResourceExplorer, /await switchResourceRoot\(targetRootId\)/);
  assert.match(terminalResourceExplorer, /async function switchResourceRoot\(nextRootId: string\): Promise<void>/);
  assert.match(terminalResourceExplorer, /defineExpose\(\{\s*revealTerminalResource,\s*\}\)/);
  assert.match(terminalResourceExplorer, /ref="explorerRef"/);
  assert.match(terminalResourceExplorer, /ref="treeRef"/);
  assert.match(terminalResourceExplorer, /:data-resource-path="workspaceRootPath"/);
  assert.match(terminalResourceExplorer, /:data-resource-path="row\.entry\.path"/);
  assert.match(terminalResourceExplorer, /terminal-resource-row--default/);
  assert.match(terminalResourceExplorer, /:aria-current="isDefaultDirectoryPath\(workspaceRootPath\) \? 'location' : undefined"/);
  assert.match(terminalResourceExplorer, /:aria-current="isDefaultDirectoryPath\(row\.entry\.path\) \? 'location' : undefined"/);
  assert.match(terminalResourceExplorer, /searchFiles\(searchRootId, query, searchDirectoryPath, true, showHiddenFiles\)/);
  assert.match(terminalResourceExplorer, /isDefaultDirectoryPayload\(selectedTerminalPayload\)/);
  assert.match(terminalResourceExplorer, /isDefaultDirectoryPayload\(contextMenuTerminalPayload\)/);
  assert.match(terminalResourceExplorer, /function isDefaultDirectoryPath\(path: string \| null \| undefined\): boolean/);
  assert.match(terminalResourceExplorer, /function isDefaultDirectoryPayload\(payload: TerminalResourceTransferPayload \| null \| undefined\): boolean/);
  assert.match(terminalResourceExplorer, /:ref="setOperationInputRef"/);
  assert.doesNotMatch(terminalResourceExplorer, /function startSelectedCreateFromMenu\(kind: 'file' \| 'directory'\): void/);
  assert.match(terminalResourceExplorer, /function startCreateFromSelection\(kind: 'file' \| 'directory'\): void/);
  assert.match(terminalResourceExplorer, /function startRenameFromSelection\(\): void/);
  assert.match(terminalResourceExplorer, /function startDeleteFromSelection\(\): void/);
  assert.match(terminalResourceExplorer, /function openContextMenuAtPath\(path: string\): void/);
  assert.match(terminalResourceExplorer, /function findResourceRowElement\(path: string\): HTMLElement \| null/);
  assert.match(terminalResourceExplorer, /v-if="isInlineRenaming\(row\.entry\)"/);
  assert.match(terminalResourceExplorer, /class="terminal-resource-rename-input"/);
  assert.match(terminalResourceExplorer, /v-if="pendingOperation && pendingOperation\.kind !== 'rename'"/);
  assert.match(terminalResourceExplorer, /function isInlineRenaming\(entry: FileEntrySummary\): boolean/);
  assert.match(terminalResourceExplorer, /function commitInlineRename\(\): void/);
  assert.match(terminalResourceExplorer, /function setOperationInputRef\(input: HTMLInputElement \| null\): void/);
  assert.match(terminalResourceExplorer, /function startRenameOperation\(payload: TerminalResourceTransferPayload\): void \{[\s\S]*contextMenu\.value = null;[\s\S]*focusOperationInput\(\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'ArrowDown'[\s\S]*moveResourceSelection\(1\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'ArrowUp'[\s\S]*moveResourceSelection\(-1\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'Home'[\s\S]*moveResourceSelectionToEdge\('first'\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'End'[\s\S]*moveResourceSelectionToEdge\('last'\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'ArrowRight'[\s\S]*expandSelectedDirectory\(\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'ArrowLeft'[\s\S]*collapseSelectedDirectoryOrSelectParent\(\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'Enter'[\s\S]*openResourceEntry\(entry\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'F2'[\s\S]*startRenameFromSelection\(\);/);
  assert.match(terminalResourceExplorer, /event\.key === 'Delete' \|\| event\.key === 'Backspace'[\s\S]*startDeleteFromSelection\(\);/);
  assert.match(terminalResourceExplorer, /\(event\.ctrlKey \|\| event\.metaKey\) && !event\.altKey && key === 'f'[\s\S]*openResourceFilter\(\);/);
  assert.match(terminalResourceExplorer, /event\.key\.length === 1[\s\S]*openResourceFilter\(event\.key\);/);
  assert.match(terminalResourceExplorer, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.altKey && key === 'n'[\s\S]*startCreateFromSelection\(event\.shiftKey \? 'directory' : 'file'\);/);
  assert.match(terminalResourceExplorer, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.altKey && key === 'u'[\s\S]*event\.shiftKey[\s\S]*uploadDirectoryInput\.value\?\.click\(\);[\s\S]*uploadInput\.value\?\.click\(\);/);
  assert.match(terminalResourceExplorer, /event\.shiftKey && event\.altKey && key === 'c'[\s\S]*copySelectedPath\(\);/);
  assert.match(terminalResourceExplorer, /\(event\.ctrlKey \|\| event\.metaKey\) && !event\.altKey && key === 'enter'[\s\S]*openSelectedInTerminal\(\);/);
  assert.match(terminalResourceExplorer, /event\.shiftKey && key === 'c'[\s\S]*copySelectedRelativePath\(\);/);
  assert.match(
    terminalResourceExplorer,
    /key === 'c'[\s\S]*const pathValues = payloads\.length[\s\S]*selectedAbsolutePaths\.value;[\s\S]*if \(!pathValues\.length\) return;[\s\S]*resourceClipboard\.value = \{ mode: 'copy', payloads \};[\s\S]*copyPathValues\(pathValues\);[\s\S]*text\('已复制路径', 'Copied path'\)/,
  );
  assert.match(terminalResourceExplorer, /Ctrl Alt N/);
  assert.match(terminalResourceExplorer, /Ctrl Alt Shift N/);
  assert.match(terminalResourceExplorer, /Ctrl Alt Shift U/);
  assert.match(terminalResourceExplorer, /Ctrl F/);
  assert.match(terminalResourceExplorer, /Shift Alt C/);
  assert.match(terminalResourceExplorer, /Ctrl Shift C/);
  assert.match(terminalResourceExplorer, />F2<\/kbd>/);
  assert.match(terminalResourceExplorer, />Del<\/kbd>/);
  assert.match(terminalResourceExplorer, /isResourceInteractiveKeyTarget/);
  assert.match(terminalResourceExplorer, /selectPathRange/);
  assert.match(terminalResourceExplorer, /const focusedResourcePayload = ref<TerminalResourceTransferPayload \| null>\(null\);/);
  assert.match(
    terminalResourceExplorer,
    /const selectedPayload = computed<TerminalResourceTransferPayload \| null>\(\(\) => \{[\s\S]*const path = primarySelectedPath\.value;[\s\S]*if \(!path\) \{[\s\S]*return buildRootPayload\(\);[\s\S]*if \(selectedEntry\.value\) \{[\s\S]*return buildEntryPayload\(selectedEntry\.value\);[\s\S]*return getFocusedPayloadForPath\(path\) \|\| buildDirectoryPayloadFromPath\(path\);/,
  );
  assert.match(terminalResourceExplorer, /function selectContextPath\(path: string\): void \{[\s\S]*isWorkspaceRootPath\(normalized\)[\s\S]*selectedPaths\.value = \[\];[\s\S]*selectedPaths\.value = \[normalized\];/);
  assert.match(terminalResourceExplorer, /function openContextMenuAtPoint\(point: ResourceContextMenuPoint, path: string\): void \{[\s\S]*left: clampNumber\(point\.clientX,[\s\S]*top: clampNumber\(point\.clientY,/);
  assert.match(terminalResourceExplorer, /function startResourceLongPress\(event: PointerEvent, path: string\): void \{[\s\S]*event\.pointerType === 'mouse'[\s\S]*timer: window\.setTimeout\(\(\) => \{[\s\S]*selectContextPath\(pending\.path\);[\s\S]*openContextMenuAtPoint\(pending, pending\.path\);[\s\S]*suppressNextResourceClick = true;[\s\S]*\}, RESOURCE_LONG_PRESS_DELAY_MS\),/);
  assert.match(terminalResourceExplorer, /function trackResourceLongPress\(event: PointerEvent\): void \{[\s\S]*RESOURCE_LONG_PRESS_MOVE_TOLERANCE[\s\S]*cancelResourceLongPress\(\);/);
  assert.match(terminalResourceExplorer, /function cancelResourceLongPress\(\): void \{[\s\S]*window\.clearTimeout\(resourceLongPress\.timer\);[\s\S]*window\.removeEventListener\('pointermove', trackResourceLongPress\);/);
  assert.match(terminalResourceExplorer, /onBeforeUnmount\(\(\) => \{[\s\S]*cancelResourceLongPress\(\);/);
  assert.match(terminalResourceExplorer, /function buildDirectoryPayloadFromPath\(path: string\): TerminalResourceTransferPayload \| null/);
  assert.match(terminalResourceExplorer, /function getFocusedPayloadForPath\(path: string\): TerminalResourceTransferPayload \| null/);
  assert.match(
    terminalResourceExplorer,
    /function toTerminalDirectoryPayload\([\s\S]*getTerminalResourceDirectoryAbsolutePath\(payload\)[\s\S]*getTerminalResourceDirectoryPath\(payload\)/,
  );
  assert.doesNotMatch(terminalResourceExplorer, /absolutePath: parentAbsolutePathOf\(payload\.path\)/);
  assert.match(terminalResourceExplorer, /selectedResourcePayloads/);
  assert.match(terminalResourceExplorer, /@drop\.stop\.prevent="handleResourceDrop\(\$event, row\.entry\)"/);
  assert.match(terminalResourceExplorer, /terminal-resource-context-menu/);
  assert.match(terminalResourceExplorer, /terminal-resource-context-menu__form/);
  assert.match(terminalResourceExplorer, /previewContextFile/);
  assert.match(terminalResourceExplorer, /emit\('previewFile'/);
  assert.match(terminalResourceExplorer, /copyContextRelativePath/);
  assert.match(terminalResourceExplorer, /insertSelectedPathsFromMenu/);
  assert.match(terminalResourceExplorer, /insertContextPathsInTerminal/);
  assert.match(terminalResourceExplorer, /contextMenuPathPayloads/);
  assert.match(terminalResourceExplorer, /emit\('insertTerminalPaths', normalizedPaths\)/);
  assert.match(terminalResourceExplorer, /uploadToContextDirectory/);
  assert.match(terminalResourceExplorer, /TERMINAL_RESOURCE_DRAG_MIME/);
  assert.match(terminalResourceTransfer, /shellQuoteTerminalPath/);
  assert.match(terminalResourceTransfer, /getTerminalResourceDirectoryPath/);
  assert.match(terminalResourceTransfer, /getTerminalResourceDirectoryAbsolutePath/);
  assert.match(terminalResourceExplorer, /copyTextToClipboard/);
  assert.match(terminalResourceExplorer, /copyPathValues/);
  assert.match(terminalResourceExplorer, /copySelectedRelativePath/);
  assert.match(terminalResourceExplorer, /emit\('openTerminal'/);
  assert.match(
    terminalResourceExplorer,
    /writeTerminalResourceDefaultDirectory\(globalThis\.localStorage, \{[\s\S]*rootId: rootId\.value,[\s\S]*path: payload\.path,[\s\S]*absolutePath: payload\.absolutePath,[\s\S]*\}, workspaceDefaultScopeId\.value\)/,
  );
  assert.doesNotMatch(workspacePage, /import \{ browseDirectory \} from '\.\.\/files\/api'/);
  assert.match(workspacePage, /import \{ writePendingTerminalLaunchMetadata \} from '\.\/terminal-launch-metadata'/);
  assert.match(workspacePage, /readTerminalResourceDefaultDirectory/);
  assert.match(workspacePage, /TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID/);
  assert.match(workspacePage, /TERMINAL_WORKSPACE_ALL_GROUP_ID/);
  assert.match(workspacePage, /activeWorkspaceDirectoryScopeId/);
  assert.match(workspacePage, /activeWorkspaceDirectoryFallbackCwd/);
  assert.match(workspacePage, /:workspace-scope-id="activeWorkspaceDirectoryScopeId"/);
  assert.match(workspacePage, /:workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"/);
  assert.match(workspacePage, /@workspace-group-change="handleWorkspaceGroupChange"/);
  assert.match(workspacePage, /function normalizeWorkspaceDirectoryScopeId\(scopeId: string \| null \| undefined\): string/);
  assert.match(workspacePage, /function resolveDefaultResourceTerminalCwd\(scopeId = activeWorkspaceDirectoryScopeId\.value\): string \| null/);
  assert.match(workspacePage, /function resolveTerminalLaunchCwd\([\s\S]*targetKind: TerminalSessionDescriptor\['targetKind'\],[\s\S]*\): string \| null/);
  assert.match(workspacePage, /if \(targetKind && targetKind !== 'local'\) return null;/);
  assert.match(workspacePage, /resolveDefaultResourceTerminalCwd\(workspaceGroupId\) \|\|[\s\S]*String\(fallbackCwd \|\| ''\)\.trim\(\)/);
  assert.match(workspacePage, /writePendingTerminalLaunchMetadata\(globalThis\.sessionStorage, sessionId, \{[\s\S]*cwd,[\s\S]*\}\);/);
  assert.match(terminalConsole, /readPendingTerminalLaunchMetadata/);
  assert.match(terminalConsole, /removePendingTerminalLaunchMetadata/);
  assert.match(terminalConsole, /function buildSessionAttachMetadata\(sessionId: string\)/);
  assert.match(
    terminalConsole,
    /const normalizedSessionId = normalizeSessionId\(sessionId\);[\s\S]*props\.sessionDescriptor\?\.sessionId\) === normalizedSessionId/,
  );
  assert.match(
    terminalConsole,
    /readPendingTerminalLaunchMetadata\([\s\S]*globalThis\.sessionStorage,[\s\S]*normalizedSessionId,[\s\S]*\)/,
  );
  assert.match(terminalConsole, /cwd: pendingMetadata\?\.cwd \|\| descriptor\?\.cwd \|\| null/);
  assert.match(terminalLaunchMetadata, /PENDING_LAUNCH_METADATA_STORAGE_KEY/);
  assert.match(terminalLaunchMetadata, /writePendingTerminalLaunchMetadata/);
  assert.match(
    terminalResourceTransfer,
    /function parentTerminalResourcePath\(path: string \| null \| undefined\): string \{[\s\S]*parts\.pop\(\);[\s\S]*return parts\.join\("\/"\);/,
  );
  assert.match(
    workspacePage,
    /function resolveResourceTerminalCwd\([\s\S]*payload: TerminalResourceTransferPayload,[\s\S]*\): string \{[\s\S]*return getTerminalResourceDirectoryAbsolutePath\(payload\);[\s\S]*\}/,
  );
  assert.doesNotMatch(workspacePage, /browseDirectory\(/);
  assert.doesNotMatch(workspacePage, /getTerminalResourceDirectoryPath/);
  assert.match(
    workspacePage,
    /async function handleResourceOpenTerminal\(payload: TerminalResourceTransferPayload\): Promise<void> \{[\s\S]*const cwd = await resolveResourceTerminalCwd\(payload\);[\s\S]*openCommandSession\(\{[\s\S]*cwd,[\s\S]*source: 'manual'/,
  );
  assert.match(
    terminalConsole,
    /function buildSessionAttachMetadata\(sessionId: string\)[\s\S]*cwd: pendingMetadata\?\.cwd \|\| descriptor\?\.cwd \|\| null/,
  );
  assert.match(terminalConsole, /\.\.\.buildSessionAttachMetadata\(sid\)/);
  assert.doesNotMatch(terminalConsole, /buildSessionAttachMetadata\(\)/);
  assert.match(terminalTransport, /if \(input\.cwd\) query\.set\("cwd", input\.cwd\)/);
  assert.match(terminalService, /cwd: resolveLaunchCwd\(metadata\.cwd\)/);
  assert.match(terminalService, /candidateStat\.isFile\(\)[\s\S]*path\.dirname\(candidate\)/);
  assert.doesNotMatch(terminalResourceExplorer, /childDirectoryCount/);
  assert.doesNotMatch(filesService, /countChildDirectories/);
  assert.doesNotMatch(filesService, /includeChildDirectoryCount/);
  assert.doesNotMatch(filesService, /childDirectoryCount/);
  assert.doesNotMatch(terminalResourceExplorer, /entryMetaLabel/);
  assert.doesNotMatch(terminalResourceExplorer, /formatFileSize/);
  assert.doesNotMatch(terminalResourceExplorer, /<strong>\{\{ row\.entry\.name \}\}<\/strong>/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu\s*\{[\s\S]*width:\s*min\(272px,\s*calc\(100vw - 16px\)\);/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu\s*\{[\s\S]*max-height:\s*min\(70dvh,\s*460px\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu\s*\{[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu__form\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu button,\s*\n\.terminal-resource-context-menu__item\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu__divider\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu__danger\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-context-menu__shortcut\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-rename-input\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-row__status--error\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-row--default\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-row__default-marker\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-head-more__panel button\s*\{[\s\S]*grid-template-columns:\s*14px minmax\(0, 1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-resource-row__name\s*\{[\s\S]*font-weight:\s*400;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-row__copy strong/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-action\s*\{/);
  assert.doesNotMatch(workspaceCss, /terminal-resource-action__/);
  assert.match(workspacePage, /@preview-file="handleResourcePreviewFile"/);
  assert.match(workspacePage, /filePreviewTabs/);
  assert.match(workspacePage, /activeFilePreviewId/);
  assert.match(workspacePage, /resourceExplorerOpen/);
  assert.match(workspacePage, /setResourceExplorerOpen/);
  assert.match(terminalWorkspaceGroups, /TERMINAL_WORKSPACE_ALL_GROUP_ID/);
  assert.match(terminalWorkspaceGroups, /buildTerminalWorkspaceGroups/);
  assert.match(terminalWorkspaceGroups, /filterTerminalSessionsByWorkspaceGroup/);
  assert.match(terminalWorkspaceGroups, /resolveTerminalSessionWorkspaceGroupId/);
  assert.match(terminalSessionPane, /buildTerminalWorkspaceGroups/);
  assert.match(terminalSessionPane, /filterTerminalSessionsByWorkspaceGroup/);
  assert.match(terminalSessionPane, /resolveTerminalSessionWorkspaceGroupId/);
  assert.match(terminalSessionPane, /terminal-workspace-groups/);
  assert.match(terminalSessionPane, /:tabs="visibleWorkspaceTabs"/);
  assert.match(terminalSessionPane, /@create="createSessionInWorkspaceGroup"/);
  assert.match(terminalSessionPane, /@reorder="reorderSessionFromWorkspaceGroup"/);
  assert.match(terminalSessionPane, /TERMINAL_WORKSPACE_GROUP_STORAGE_KEY/);
  assert.match(terminalSessionPane, /workspaceGroupRailRef/);
  assert.match(terminalSessionPane, /@keydown="handleWorkspaceGroupKeydown\(\$event, group\)"/);
  assert.match(terminalSessionPane, /function handleWorkspaceGroupKeydown\(event: KeyboardEvent, group: TerminalWorkspaceGroup\): void/);
  assert.match(terminalSessionPane, /function selectRelativeWorkspaceGroup\(group: TerminalWorkspaceGroup, direction: -1 \| 1\): void/);
  assert.match(terminalSessionPane, /function selectWorkspaceGroupAtIndex\(index: number\): void/);
  assert.match(terminalSessionPane, /function focusWorkspaceGroupAtIndex\(index: number\): void/);
  assert.match(terminalSessionPane, /function readWorkspaceGroupPreference\(\): string/);
  assert.match(terminalSessionPane, /function writeWorkspaceGroupPreference\(groupId: string\): void/);
  assert.match(terminalSessionPane, /\(e: 'workspaceGroupChange', payload: \{ id: string; cwd: string \| null \}\): void;/);
  assert.match(terminalSessionPane, /effectiveWorkspaceGroup/);
  assert.match(terminalSessionPane, /emit\('workspaceGroupChange'/);
  assert.match(
    terminalSessionPane,
    /\(e: 'createSession', payload\?: \{ cwd\?: string \| null; workspaceGroupId\?: string \| null \}\): void;/,
  );
  assert.match(workspacePage, /async function createSession\(options: \{ cwd\?: string \| null; workspaceGroupId\?: string \| null \} = \{\}\): Promise<string>/);
  assert.match(workspacePage, /workspaceGroupId: options\.workspaceGroupId \|\| activeWorkspaceDirectoryScopeId\.value/);
  assert.match(workspacePage, /fallbackCwd: options\.cwd \|\| activeWorkspaceDirectoryFallbackCwd\.value/);
  assert.match(workspaceCss, /\.terminal-workspace-groups\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-group\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-group\.active\s*\{/);
  assert.match(terminalResourceTransfer, /items\?: TerminalResourceTransferPayload\[\]/);
  assert.match(terminalResourceTransfer, /normalizeTerminalResourceTransferItem/);
  assert.match(terminalResourceTransfer, /items\.length > 1/);
});

test("terminal workspace side activity exposes real search and source control panels", () => {
  assert.match(terminalWorkspaceActivityBar, /export type TerminalSidebarPanel = 'files' \| 'search' \| 'git'/);
  assert.match(terminalWorkspaceActivityBar, /Files, GitBranch, Search/);
  assert.match(terminalWorkspaceActivityBar, /terminal-activity-button__badge/);
  assert.match(terminalWorkspaceActivityBar, /compactCount/);

  assert.match(workspacePage, /:active-panel="activeSidebarPanel"/);
  assert.match(workspacePage, /:search-count="searchResultCount"/);
  assert.match(workspacePage, /:git-count="gitChangeCount"/);
  assert.match(workspacePage, /@select="selectSidebarPanel"/);
  assert.match(workspacePage, /activeSidebarPanel === 'files'/);
  assert.match(workspacePage, /activeSidebarPanel === 'search'/);
  assert.match(workspacePage, /@click="openSearchPanel"/);
  assert.match(workspacePage, /@click="openGitPanel"/);
  assert.match(workspacePage, /mobileSidebarTitle/);
  assert.match(
    workspacePage,
    /async function handlePreviewRevealResource\(payload: TerminalResourceTransferPayload\): Promise<void> \{[\s\S]*activeSidebarPanel\.value = 'files';[\s\S]*desktopResourceExplorerRef\.value\?\.revealTerminalResource\(payload\)/,
  );

  assert.match(terminalWorkspaceSearchPanel, /searchFiles/);
  assert.match(terminalWorkspaceSearchPanel, /readFileContent/);
  assert.match(terminalWorkspaceSearchPanel, /saveFileContent/);
  assert.match(terminalWorkspaceSearchPanel, /function replaceAllResults\(\): Promise<void>/);
  assert.match(terminalWorkspaceSearchPanel, /searchFiles\(rootId\.value, needle, directoryPath\.value, true, true\)/);
  assert.match(terminalWorkspaceSearchPanel, /SEARCH_DEBOUNCE_MS = 360/);
  assert.match(terminalWorkspaceSearchPanel, /SEARCH_RESULT_BATCH_SIZE = 80/);
  assert.match(terminalWorkspaceSearchPanel, /const filteredResults = computed/);
  assert.match(terminalWorkspaceSearchPanel, /filteredResults\.value\.slice\(0, visibleResultLimit\.value\)/);
  assert.match(terminalWorkspaceSearchPanel, /const replaceableResults = computed\(\(\) =>\s*\n\s*filteredResults\.value\.filter/);
  assert.match(terminalWorkspaceSearchPanel, /function cancelSearch\(\): void/);
  assert.match(terminalWorkspaceSearchPanel, /searchRequestSeq \+= 1/);
  assert.match(terminalWorkspaceSearchPanel, /function isCurrentSearchRequest\(requestSeq: number\): boolean/);
  assert.match(terminalWorkspaceSearchPanel, /function showMoreResults\(\): void/);
  assert.match(terminalWorkspaceSearchPanel, /class="terminal-workspace-search__load-more"/);
  assert.match(terminalWorkspaceSearchPanel, /emit\('resultCountChange', filteredResults\.value\.length\)/);
  assert.match(terminalWorkspaceSearchPanel, /matchesClientPatterns/);
  assert.match(terminalWorkspaceSearchPanel, /includePattern/);
  assert.match(terminalWorkspaceSearchPanel, /excludePattern/);
  assert.match(terminalWorkspaceSearchPanel, /buildSearchExpression/);
  assert.match(terminalWorkspaceSearchPanel, /emit\('previewFile'/);
  assert.match(terminalWorkspaceSearchPanel, /emit\('resultCountChange'/);
  assert.doesNotMatch(terminalWorkspaceSearchPanel, /globalThis\.prompt|window\.prompt/);

  assert.match(terminalGitPanel, /fetchGitStatus/);
  assert.match(terminalGitPanel, /useConfirmDialog/);
  assert.match(terminalGitPanel, /const \{ confirm \} = useConfirmDialog\(\)/);
  assert.match(terminalGitPanel, /initGitRepository/);
  assert.match(terminalGitPanel, /stageGitPaths/);
  assert.match(terminalGitPanel, /unstageGitPaths/);
  assert.match(terminalGitPanel, /commitGitChanges/);
  assert.match(terminalGitPanel, /createGitBranch/);
  assert.match(terminalGitPanel, /checkoutGitTarget/);
  assert.match(terminalGitPanel, /fetchFilesSummary/);
  assert.match(terminalGitPanel, /emit\('previewFile'/);
  assert.match(terminalGitPanel, /emit\('changeCountChange'/);
  assert.match(terminalGitPanel, /repositoryRelativeToRootPath/);
  assert.match(terminalGitPanel, /if \(change\.kind === 'deleted'\) return;/);
  assert.match(terminalGitPanel, /shouldFallbackToProjectRoot/);
  assert.match(terminalGitPanel, /rootId\.value = 'project-root'/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__tabs"/);
  assert.match(terminalGitPanel, /activeView = 'history'/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__commit"/);
  assert.match(terminalGitPanel, /@submit\.prevent="commitChanges"/);
  assert.match(terminalGitPanel, /@click="stageAll"/);
  assert.match(terminalGitPanel, /@click="unstageAll"/);
  assert.match(terminalGitPanel, /@click="previewChangeFromPointer\(\$event, change\)"/);
  assert.match(terminalGitPanel, /@contextmenu\.prevent="openChangeContextMenu\(\$event, change, 'staged'\)"/);
  assert.match(terminalGitPanel, /@pointerdown="startGitChangeLongPress\(\$event, change, 'staged'\)"/);
  assert.match(terminalGitPanel, /@contextmenu\.prevent="openChangeContextMenu\(\$event, change, 'unstaged'\)"/);
  assert.match(terminalGitPanel, /@pointerdown="startGitChangeLongPress\(\$event, change, 'unstaged'\)"/);
  assert.match(terminalGitPanel, /@submit\.prevent="createBranchFromInput\(true\)"/);
  assert.match(terminalGitPanel, /@click="selectBranchFromPointer\(\$event, branch\.name\)"/);
  assert.match(terminalGitPanel, /@contextmenu\.prevent="openBranchContextMenu\(\$event, branch\.name, branch\.current\)"/);
  assert.match(terminalGitPanel, /@pointerdown="startGitBranchLongPress\(\$event, branch\.name, branch\.current\)"/);
  assert.match(terminalGitPanel, /@click="selectCommitFromPointer\(\$event, commit\.hash\)"/);
  assert.match(terminalGitPanel, /@mouseenter="showCommitHoverPreview\(\$event, commit\.hash\)"/);
  assert.match(terminalGitPanel, /@focus="showCommitHoverPreview\(\$event, commit\.hash\)"/);
  assert.match(terminalGitPanel, /@mouseleave="hideCommitHoverPreview"/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__commit-popover"/);
  assert.match(terminalGitPanel, /@contextmenu\.prevent="openCommitContextMenu\(\$event, commit\.hash\)"/);
  assert.match(terminalGitPanel, /@pointerdown="startGitCommitLongPress\(\$event, commit\.hash\)"/);
  assert.doesNotMatch(terminalGitPanel, /@click="checkoutBranch\(branch\.name\)"/);
  assert.doesNotMatch(terminalGitPanel, /@click="checkoutCommit\(commit\.hash\)"/);
  assert.doesNotMatch(terminalGitPanel, /await loadCommitHoverDetail\(commitHash\)/);
  assert.doesNotMatch(terminalGitPanel, /Show Commit Details|查看提交详情/);
  assert.doesNotMatch(terminalGitPanel, /Create Branch From Commit|从此创建分支/);
  assert.doesNotMatch(terminalGitPanel, /terminal-git-panel__commit-detail/);
  assert.doesNotMatch(terminalGitPanel, /@click\.stop="stageChange\(change\)"/);
  assert.doesNotMatch(terminalGitPanel, /@click\.stop="unstageChange\(change\)"/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__branches"/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__commits"/);
  assert.match(terminalGitPanel, /class="terminal-git-panel__change-main"/);
  assert.match(terminalGitPanel, /class="terminal-git-context-menu"/);
  assert.match(terminalGitPanel, /type GitLongPressTarget/);
  assert.match(terminalGitPanel, /interface GitContextMenuPoint/);
  assert.match(terminalGitPanel, /interface GitLongPressState extends GitContextMenuPoint/);
  assert.match(terminalGitPanel, /const GIT_LONG_PRESS_DELAY_MS = 520/);
  assert.match(terminalGitPanel, /const GIT_LONG_PRESS_MOVE_TOLERANCE = 12/);
  assert.match(terminalGitPanel, /let gitLongPress: GitLongPressState \| null = null/);
  assert.match(terminalGitPanel, /let suppressNextGitClick = false/);
  assert.match(terminalGitPanel, /cancelGitLongPress\(\);/);
  assert.match(terminalGitPanel, /function checkoutContextBranch\(\): Promise<void>/);
  assert.match(terminalGitPanel, /function checkoutContextCommit\(\): Promise<void>/);
  assert.match(terminalGitPanel, /function selectBranchFromPointer\(event: MouseEvent, branchName: string\): void/);
  assert.match(terminalGitPanel, /function selectCommitFromPointer\(event: MouseEvent, commitHash: string\): void/);
  assert.match(terminalGitPanel, /function previewChangeFromPointer\(event: MouseEvent, change: GitFileChange\): void/);
  assert.match(terminalGitPanel, /function openChangeContextMenuAt\(point: GitContextMenuPoint, change: GitFileChange, source: GitChangeSource\): void/);
  assert.match(terminalGitPanel, /function openBranchContextMenuAt\(point: GitContextMenuPoint, branchName: string, current: boolean\): void/);
  assert.match(terminalGitPanel, /function openCommitContextMenuAt\(point: GitContextMenuPoint, commitHash: string\): void/);
  assert.match(terminalGitPanel, /function contextMenuPosition\(point: GitContextMenuPoint, width: number, height: number\): \{ x: number; y: number \}/);
  assert.match(terminalGitPanel, /function startGitLongPress\(event: PointerEvent, target: GitLongPressTarget\): void/);
  assert.match(terminalGitPanel, /function openGitLongPressContextMenu\(pending: GitLongPressState\): void/);
  assert.match(terminalGitPanel, /function trackGitLongPress\(event: PointerEvent\): void/);
  assert.match(terminalGitPanel, /function cancelGitLongPress\(\): void/);
  assert.match(terminalGitPanel, /function consumeSuppressedGitClick\(event: MouseEvent\): boolean/);
  assert.match(terminalGitPanel, /function handleGitPanelClick\(event: MouseEvent\): void/);
  assert.match(terminalGitPanel, /function showCommitHoverPreview\(event: MouseEvent \| FocusEvent, commitHash: string\): void/);
  assert.match(terminalGitPanel, /function hideCommitHoverPreview\(\): void/);
  assert.match(terminalGitPanel, /function loadCommitHoverDetail\(commitHash: string\): Promise<void>/);
  assert.match(terminalGitPanel, /function resolveCommitMessage\(commitHash: string\): Promise<string>/);
  assert.match(terminalGitPanel, /function loadDiffPreview\(change: GitFileChange, source: GitChangeSource\): Promise<void>/);
  assert.match(terminalGitPanel, /function classifyDiffLine\(line: string\): GitDiffLineKind/);
  assert.match(terminalGitPanel, /function confirmCheckoutBranch\(branchName: string\): Promise<boolean>/);
  assert.match(terminalGitPanel, /function confirmCheckoutCommit\(commitHash: string\): Promise<boolean>/);
  assert.match(terminalGitPanel, /if \(!await confirmCheckoutBranch\(branchName\)\) return;/);
  assert.match(terminalGitPanel, /if \(!await confirmCheckoutCommit\(commitHash\)\) return;/);
  assert.match(terminalGitPanel, /tone: changeCount > 0 \? 'danger' : 'default'/);
  assert.match(terminalGitPanel, /tone: 'danger'/);
  assert.match(terminalGitPanel, /function stageContextChange\(\): Promise<void>/);
  assert.match(terminalGitPanel, /function unstageContextChange\(\): Promise<void>/);
  assert.match(terminalGitPanel, /function copyContextPath\(\): Promise<void>/);
  assert.match(terminalGitPanel, /function copyContextCommitMessage\(\): Promise<void>/);
  assert.match(terminalGitPanel, /copyTextToClipboard/);
  assert.match(terminalGitPanel, /globalThis\.addEventListener\('keydown', handleGitPanelKeydown\)/);
  assert.match(terminalGitPanel, /globalThis\.addEventListener\('resize', closeGitContextMenu\)/);
  assert.match(terminalGitPanel, /globalThis\.addEventListener\('scroll', closeGitContextMenu, true\)/);
  assert.match(terminalGitPanel, /function handleGitPanelKeydown\(event: KeyboardEvent\): void/);

  assert.match(terminalGitApi, /\/api\/git\/status/);
  assert.match(terminalGitApi, /\/api\/git\/init/);
  assert.match(terminalGitApi, /\/api\/git\/stage/);
  assert.match(terminalGitApi, /\/api\/git\/unstage/);
  assert.match(terminalGitApi, /\/api\/git\/commit/);
  assert.match(terminalGitApi, /\/api\/git\/diff/);
  assert.match(terminalGitApi, /\/api\/git\/commit-detail/);
  assert.match(terminalGitApi, /\/api\/git\/branches/);
  assert.match(terminalGitApi, /\/api\/git\/checkout/);
  assert.match(gitTypes, /export interface GitStatusPayload/);
  assert.match(gitTypes, /export interface GitBranchSummary/);
  assert.match(gitTypes, /export interface GitCommitSummary/);
  assert.match(gitTypes, /export interface GitCommitDetailPayload/);
  assert.match(gitTypes, /export interface GitDiffPayload/);
  assert.match(gitTypes, /export interface GitDiffRequest/);
  assert.match(gitTypes, /export interface GitCommitRequest/);
  assert.match(gitTypes, /export interface GitCheckoutRequest/);
  assert.match(gitTypes, /GitFileChangeKind/);
  assert.match(gitService, /runGit\(resolved\.absolutePath, \["rev-parse", "--show-toplevel"\]\)/);
  assert.match(gitService, /runGit\(repositoryRoot, \["status", "--porcelain=v1", "-b"\]\)/);
  assert.match(gitService, /GIT_STATUS_CHANGE_LIMIT = 500/);
  assert.match(gitService, /GIT_HISTORY_LIMIT = 80/);
  assert.match(gitService, /GIT_BRANCH_LIMIT = 120/);
  assert.match(gitService, /GIT_DIFF_MAX_CHARS = 220_000/);
  assert.match(gitService, /function runGitForDiff/);
  assert.match(gitService, /function truncateGitDiff/);
  assert.match(gitService, /function parseCommitDetail/);
  assert.match(gitService, /function parseChangeLine/);
  assert.match(gitService, /function statusToKind/);
  assert.match(gitService, /function normalizeRepositoryPaths/);
  assert.match(gitService, /function normalizeGitRefName/);
  assert.match(gitService, /function normalizeCommitMessage/);
  assert.match(gitService, /function listBranches/);
  assert.match(gitService, /function listCommits/);
  assert.match(gitService, /runGit\(resolved\.absolutePath, \["init"\]\)/);
  assert.match(gitService, /runGit\(repositoryRoot, normalizedPaths\.length \? \["add", "--", \.\.\.normalizedPaths\] : \["add", "-A"\]\)/);
  assert.match(gitService, /\["restore", "--staged", "--", \.\.\.normalizedPaths\]/);
  assert.match(gitService, /runGit\(repositoryRoot, \["commit", "-m", normalizeCommitMessage\(message\)\]\)/);
  assert.match(gitService, /\["checkout", "-b", branchName\]/);
  assert.match(gitService, /\["checkout", "--detach", normalizedTarget\]/);
  assert.match(gitService, /"show",\s*\n\s*"--no-patch"/);
  assert.match(gitService, /\["diff", "--no-index", "--no-color", "--", "\/dev\/null", normalizedFilePath\]/);
  assert.match(gitService, /No commits yet on/);
  assert.match(gitRoutes, /router\.get\("\/api\/git\/status"/);
  assert.match(gitRoutes, /router\.get\("\/api\/git\/diff"/);
  assert.match(gitRoutes, /router\.get\("\/api\/git\/commit-detail"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/init"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/stage"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/unstage"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/commit"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/branches"/);
  assert.match(gitRoutes, /router\.post\("\/api\/git\/checkout"/);
  assert.match(apiContext, /git: GitService/);
  assert.match(apiIndex, /createGitService/);
  assert.match(apiServer, /registerGitRoutes/);

  assert.match(workspacePage, /:data-terminal-theme="terminalTheme"/);
  assert.match(workspacePage, /TERMINAL_THEME_STORAGE_KEY = 'openclaw-studio\.terminal\.theme'/);
  assert.match(workspacePage, /const terminalTheme = ref\('default'\)/);
  assert.match(workspacePage, /function restoreTerminalThemePreference\(\): void/);
  assert.match(workspacePage, /function setTerminalTheme\(theme: string\): void/);
  assert.match(workspacePage, /@set-terminal-theme="setTerminalTheme"/);
  assert.match(workspacePage, /let pendingResourceResizeClientX: number \| null = null;/);
  assert.match(workspacePage, /let resourceResizeFrame: number \| null = null;/);
  assert.match(workspacePage, /let compactInspectorModeFrame: number \| null = null;/);
  assert.match(workspacePage, /function handleResourceExplorerResizeMove\(event: PointerEvent\): void \{[\s\S]*pendingResourceResizeClientX = event\.clientX;[\s\S]*resourceResizeFrame = window\.requestAnimationFrame\(flushResourceExplorerResize\);[\s\S]*\}/);
  assert.match(workspacePage, /function flushResourceExplorerResize\(\): void \{[\s\S]*resourceExplorerWidth\.value = clampResourceExplorerWidth\([\s\S]*resourceResizeStartWidth\.value \+ delta,[\s\S]*\);[\s\S]*pendingResourceResizeClientX = null;[\s\S]*\}/);
  assert.match(workspacePage, /function stopResourceExplorerResize\(\): void \{[\s\S]*window\.cancelAnimationFrame\(resourceResizeFrame\);[\s\S]*flushResourceExplorerResize\(\);[\s\S]*persistResourceExplorerWidth\(\);[\s\S]*\}/);
  assert.match(workspacePage, /function syncCompactInspectorMode\(\): void \{[\s\S]*if \(compactInspectorModeFrame !== null\) return;[\s\S]*compactInspectorModeFrame = window\.requestAnimationFrame\(applyCompactInspectorMode\);[\s\S]*\}/);
  assert.match(workspacePage, /function cancelCompactInspectorModeSync\(\): void \{[\s\S]*window\.cancelAnimationFrame\(compactInspectorModeFrame\);[\s\S]*compactInspectorModeFrame = null;[\s\S]*\}/);
  assert.match(terminalSessionPane, /terminalThemeOptions/);
  assert.match(terminalSessionPane, /Matrix/);
  assert.match(terminalSessionPane, /Amber/);
  assert.match(terminalSessionPane, /Midnight/);
  assert.match(terminalSessionPane, /\(e: 'setTerminalTheme', theme: string\): void;/);
  assert.match(terminalSessionPane, /@click="setTerminalThemeFromMenu\(theme\.id\)"/);
  assert.match(terminalConsole, /terminalTheme\?: string/);
  assert.match(terminalConsole, /function resolveTerminalFontSize\(\): number/);
  assert.match(terminalConsole, /width > 0 && width <= 380\) return 8\.5/);
  assert.match(terminalConsole, /width > 0 && width <= 430\) return 9/);
  assert.match(terminalConsole, /width > 0 && width <= 540\) return 9\.5/);
  assert.match(terminalConsole, /width > 0 && width <= 720\) return 10\.5/);
  assert.match(terminalConsole, /function resolveTerminalLineHeight\(\): number/);
  assert.match(terminalConsole, /width > 0 && width <= 430\) return 1\.04/);
  assert.match(terminalConsole, /width > 0 && width <= 720\) return 1\.08/);
  assert.match(terminalConsole, /function applyTerminalFontSizeCss\(fontSize: number\): void/);
  assert.match(terminalConsole, /fontSize: resolveTerminalFontSize\(\)/);
  assert.match(terminalConsole, /if \(appliedTerminalLineHeight !== lineHeight\) \{[\s\S]*termInstance\.options\.lineHeight = lineHeight;/);
  assert.match(terminalConsole, /function applyTerminalAppearance\(options: \{ forceTheme\?: boolean; postLayout\?: boolean \} = \{\}\): void/);
  assert.match(terminalConsole, /\(\) => props\.terminalTheme/);

  assert.match(workspaceCss, /\.terminal-workspace-body\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(220px,\s*var\(--terminal-resource-width,\s*286px\)\) 7px minmax\(0,\s*1fr\);/);
  assert.match(workspaceCss, /\.terminal-workspace-body--resource-collapsed\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\);/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen \.terminal-workspace-body\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(240px,\s*var\(--terminal-resource-width,\s*300px\)\) 7px minmax\(0,\s*1fr\);/);
  assert.match(workspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='matrix'\]/);
  assert.match(workspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='amber'\]/);
  assert.match(workspaceCss, /\.terminal-workspace-shell\[data-terminal-theme='midnight'\]/);
  assert.match(workspaceCss, /--terminal-xterm-font-size: 14px/);
  assert.match(workspaceCss, /\.terminal-resource-row__icon--code/);
  assert.match(workspaceCss, /\.terminal-resource-row__icon--image/);
  assert.match(workspaceCss, /\.terminal-resource-row__icon--archive/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*\.terminal-mobile-ide-rail__button\s*\{[\s\S]*font-size:\s*10\.5px;/);
  assert.match(workspaceCss, /@media \(max-width: 720px\) \{[\s\S]*--terminal-xterm-font-size:\s*10\.5px;/);
  assert.match(workspaceCss, /@media \(max-width: 430px\) \{[\s\S]*--terminal-xterm-font-size:\s*9px;/);
  assert.match(workspaceCss, /@media \(max-width: 430px\) \{[\s\S]*\.terminal-mobile-ide-rail__button span\s*\{[\s\S]*display:\s*none;/);
  assert.match(workspaceCss, /@media \(max-width: 380px\) \{[\s\S]*--terminal-xterm-font-size:\s*8\.5px;/);
  assert.match(workspaceCss, /\.terminal-container \.xterm-helper-textarea\s*\{[\s\S]*font-size:\s*16px !important;/);
  assert.match(workspaceCss, /\.terminal-container \.xterm-rows\s*\{[\s\S]*transform:\s*translateZ\(0\);/);
  assert.match(workspaceCss, /\.terminal-container \.xterm-rows div\s*\{[\s\S]*font-size: var\(--terminal-xterm-font-size,\s*14px\) !important;/);
  assert.match(workspaceCss, /\.terminal-workspace-search__load-more\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-search__stop:not\(:disabled\)\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-search__result\s*,\s*\n\.terminal-git-panel__change\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__change-main\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__tabs\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__commit\s*,\s*\n\.terminal-git-panel__branch-create\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__branch-row\s*,\s*\n\.terminal-git-panel__commit-row\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-context-menu\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-context-menu button\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__commit-popover\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-git-panel__commit-detail\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-git-panel__row-action\s*\{/);
  assert.match(workspaceCss, /\.terminal-git-panel__branch\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-ide-rail\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(54px,\s*1fr\)\);/);
  assert.doesNotMatch(workspaceCss, /terminal-mobile-ide-rail--with-editor/);
});

test("terminal workspace exposes shared inspector content through the integrated menu and mobile sheet", () => {
  assert.match(workspacePage, /<TerminalInspectorContent/);
  assert.match(workspacePage, /fetchTerminalProfiles/);
  assert.match(workspacePage, /handleLaunchProfile/);
  assert.match(workspacePage, /desktopInspectorOpen/);
  assert.doesNotMatch(workspacePage, /terminal-desktop-inspector-trigger/);
  assert.match(terminalSessionPane, /terminal-stage-action--inspector/);
  assert.doesNotMatch(workspacePage, /terminal-mobile-inspector-trigger/);
  assert.doesNotMatch(workspaceCss, /\.terminal-mobile-inspector-trigger\s*\{/);
  assert.match(workspacePage, /class="terminal-mobile-ide-rail"/);
  assert.doesNotMatch(workspacePage, /terminal-mobile-ide-rail--with-editor/);
  assert.match(workspacePage, /@click="requestShellNavigation"/);
  assert.match(workspacePage, /@click="openSearchPanel"/);
  assert.match(workspacePage, /@click="openGitPanel"/);
  assert.match(workspacePage, /@click="focusMobileTerminal"/);
  assert.match(workspacePage, /@click="showMobileEditor"/);
  assert.match(workspacePage, /:aria-label="text\('打开导航', 'Open navigation'\)"/);
  assert.match(workspacePage, /:aria-label="text\('打开文件', 'Open files'\)"/);
  assert.match(workspacePage, /:aria-label="text\('打开搜索', 'Open search'\)"/);
  assert.match(workspacePage, /:aria-label="text\('打开 Git', 'Open Git'\)"/);
  assert.match(workspacePage, /:aria-label="text\('显示编辑器', 'Show editor'\)"/);
  assert.match(workspacePage, /:aria-label="text\('显示终端', 'Show terminal'\)"/);
  assert.match(workspacePage, /:aria-label="text\('打开工具', 'Open tools'\)"/);
  assert.match(workspacePage, /<FileText class="terminal-mobile-ide-rail__icon"/);
  assert.match(workspacePage, /v-if="hasActiveFilePreview"/);
  assert.match(workspacePage, /mobileEditorMode/);
  assert.match(workspacePage, /hasActiveFilePreview/);
  assert.match(workspacePage, /@click="openResourceExplorerPanel"/);
  assert.match(workspacePage, /@click="openInspectorPanel"/);
  assert.match(workspacePage, /const emit = defineEmits<\{[\s\S]*requestShellNavigation[\s\S]*\}>\(\);/);
  assert.match(workspacePage, /function focusMobileTerminal\(\): void/);
  assert.match(workspacePage, /sessionPaneRef\.value\?\.showTerminal\(\)/);
  assert.match(workspacePage, /function showMobileEditor\(\): void/);
  assert.match(workspacePage, /sessionPaneRef\.value\?\.showEditor\(\)/);
  assert.match(workspacePage, /function requestShellNavigation\(\): void \{[\s\S]*mobileInspectorOpen\.value = false;[\s\S]*mobileResourceExplorerOpen\.value = false;[\s\S]*emit\('requestShellNavigation'\);/);
  assert.match(workspacePage, /function selectSidebarPanel\(panel: TerminalSidebarPanel\): void \{[\s\S]*mobileInspectorOpen\.value = false;[\s\S]*mobileResourceExplorerOpen\.value = true;/);
  assert.match(workspacePage, /function openResourceExplorerPanel\(\): void \{[\s\S]*selectSidebarPanel\('files'\);[\s\S]*\}/);
  assert.match(workspacePage, /function openInspectorPanel\(\): void \{[\s\S]*mobileResourceExplorerOpen\.value = false;[\s\S]*mobileInspectorOpen\.value = true;/);
  assert.match(workspacePage, /<DialogRoot v-if="compactInspectorMode" v-model:open="mobileInspectorOpen" :modal="false">/);
  assert.match(workspacePage, /terminal-mobile-sheet/);
  assert.match(workspacePage, /closeMobileInspectorIfCompact\(\)/);
  assert.doesNotMatch(inspectorContent, /terminal-inspector-switcher/);
  assert.doesNotMatch(workspaceCss, /terminal-inspector-switcher/);
  assert.doesNotMatch(workspacePage, /:inspector-sections=/);
  assert.doesNotMatch(workspacePage, /@select-section=/);
  assert.match(inspectorContent, /terminal-inspector-profile-menu/);
  assert.match(inspectorContent, /terminal-inspector-profile-item/);
  assert.match(inspectorContent, /launchProfileFromMenu/);
  assert.doesNotMatch(inspectorContent, /terminal-profile-launcher/);
  assert.match(inspectorContent, /TerminalProfileDescriptor/);
  assert.match(inspectorContent, /terminal-inspector-commandbar/);
  assert.match(inspectorContent, /<SlidersHorizontal class="terminal-inspector-commandbar__icon"/);
  assert.match(inspectorContent, /<Command class="terminal-inspector-commandbar__icon"/);
  assert.doesNotMatch(inspectorContent, /<History class="terminal-inspector-commandbar__icon"/);
  assert.match(inspectorContent, /<RefreshCw class="terminal-inspector-commandbar__icon"/);
  assert.match(inspectorContent, /:open="activeInspectorMenu === 'profiles'"/);
  assert.match(inspectorContent, /:open="activeInspectorMenu === 'commands'"/);
  assert.match(inspectorContent, /const activeInspectorMenu = ref<TerminalInspectorMenuKey \| null>\(null\);/);
  assert.match(inspectorContent, /@toggle="handleInspectorMenuToggle\('profiles'\)"/);
  assert.match(inspectorContent, /@toggle="handleInspectorMenuToggle\('commands'\)"/);
  assert.match(inspectorContent, /@click\.prevent\.stop="toggleInspectorMenu\('profiles'\)"/);
  assert.match(inspectorContent, /@click\.prevent\.stop="toggleInspectorMenu\('commands'\)"/);
  assert.match(inspectorContent, /:aria-expanded="activeInspectorMenu === 'profiles'"/);
  assert.match(inspectorContent, /:aria-expanded="activeInspectorMenu === 'commands'"/);
  assert.match(inspectorContent, /terminal-inspector-menu-head/);
  assert.match(inspectorContent, /function toggleInspectorMenu\(menu: TerminalInspectorMenuKey\): void/);
  assert.match(inspectorContent, /import \{ computed, nextTick, onBeforeUnmount, onMounted, ref, watch \} from 'vue';/);
  assert.match(inspectorContent, /<Teleport v-if="activeInspectorMenu === 'profiles' && profileItemCount" to="body">/);
  assert.match(inspectorContent, /<Teleport v-if="activeInspectorMenu === 'commands' && actionItemCount" to="body">/);
  assert.match(inspectorContent, /const profilePanelRef = ref<HTMLElement \| null>\(null\);/);
  assert.match(inspectorContent, /const actionPanelRef = ref<HTMLElement \| null>\(null\);/);
  assert.match(inspectorContent, /const inspectorMenuStyle = ref<Record<string, string>>\(\{\}\);/);
  assert.match(inspectorContent, /:style="inspectorMenuStyle"/);
  assert.match(inspectorContent, /@pointerdown\.stop/);
  assert.match(inspectorContent, /function toggleInspectorMenu\(menu: TerminalInspectorMenuKey\): void \{[\s\S]*void syncInspectorMenuElements\(\);[\s\S]*\}/);
  assert.match(inspectorContent, /async function syncInspectorMenuElements\(\): Promise<void> \{[\s\S]*await nextTick\(\);[\s\S]*menuElement\.open = activeInspectorMenu\.value === menu;/);
  assert.match(inspectorContent, /function updateInspectorMenuPosition\(\s*menu: TerminalInspectorMenuKey \| null = activeInspectorMenu\.value,[\s\S]*\): void/);
  assert.match(inspectorContent, /@keydown\.esc\.stop\.prevent="closeInspectorMenus"/);
  assert.match(inspectorContent, /@click\.stop/);
  assert.doesNotMatch(inspectorContent, /@toggle="handleInspectorMenuToggle\('sessions'\)"/);
  assert.doesNotMatch(inspectorContent, /function closeOtherInspectorMenus/);
  assert.match(inspectorContent, /function closeInspectorMenus\(\): void \{[\s\S]*activeInspectorMenu\.value = null;/);
  assert.match(inspectorContent, /function handleInspectorPointerDown\(event: PointerEvent\): void/);
  assert.match(inspectorContent, /document\.addEventListener\('pointerdown', handleInspectorPointerDown\)/);
  assert.match(inspectorContent, /window\.addEventListener\('resize', handleInspectorMenuViewportChange\)/);
  assert.match(inspectorContent, /window\.visualViewport\?\.addEventListener\('resize', handleInspectorMenuViewportChange\)/);
  assert.match(inspectorContent, /document\.addEventListener\('scroll', handleInspectorMenuViewportChange, true\)/);
  assert.match(inspectorContent, /onBeforeUnmount\(\(\) => \{/);
  assert.match(inspectorContent, /function getInspectorMenuRef\(menu: TerminalInspectorMenuKey\): HTMLDetailsElement \| null/);
  assert.match(inspectorContent, /function refreshInspectorFromCommandbar\(\): void/);
  assert.match(inspectorContent, /function launchProfileFromMenu\(profileId: string\): void \{[\s\S]*emit\('launchProfile', profileId\);[\s\S]*closeInspectorMenus\(\);[\s\S]*\}/);
  assert.match(inspectorContent, /function triggerActionFromMenu\(actionKey: string\): void \{[\s\S]*emit\('triggerAction', actionKey\);[\s\S]*closeInspectorMenus\(\);[\s\S]*\}/);
  assert.doesNotMatch(inspectorContent, /@click="\$emit\('refresh'\)"/);
  assert.match(inspectorContent, /<span class="sr-only">\{\{ text\('配置', 'Profiles'\) \}\}<\/span>/);
  assert.match(inspectorContent, /<span class="sr-only">\{\{ text\('刷新', 'Refresh'\) \}\}<\/span>/);
  assert.doesNotMatch(inspectorContent, /@click="closeInstallOutputSheet">\s*<button/);
  assert.doesNotMatch(inspectorContent, /terminal-panel-status-strip/);
  assert.match(inspectorContent, /launchableTerminalProfiles/);
  assert.match(workspaceCss, /\.terminal-inspector-commandbar__icon\s*\{[\s\S]*width:\s*15px;[\s\S]*height:\s*15px;/);
  assert.match(workspaceCss, /\.terminal-inspector-commandbar__tools\s*\{[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-inspector-commandbar__tools\s*\{[^}]*overflow-x:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-inspector-profile-menu__trigger,\s*\n\.terminal-inspector-command-menu__trigger\s*\{[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;/);
  assert.match(workspaceCss, /\.terminal-inspector-profile-menu__trigger strong,[\s\S]*\.terminal-inspector-command-menu__trigger strong\s*\{[\s\S]*position:\s*absolute;[\s\S]*border-radius:\s*999px;/);
  assert.match(workspaceCss, /\.terminal-inspector-profile-menu__panel,\s*\n\.terminal-inspector-command-menu__panel\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*6200;/);
  assert.match(workspaceCss, /\.terminal-inspector-menu-portal\s*\{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(workspaceCss, /\.terminal-inspector-menu-head\s*\{[\s\S]*justify-content:\s*space-between;/);
  assert.match(workspaceCss, /\.terminal-inspector-menu-head__close\s*\{[\s\S]*width:\s*26px;[\s\S]*height:\s*26px;/);
  assert.match(workspaceCss, /\.terminal-inspector-refresh\s*\{[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;/);
  assert.doesNotMatch(workspaceCss, /var\(--atlas-|var\(--atlas/);
  assert.match(
    workspaceCss,
    /\.terminal-binary-list\s*\{[\s\S]*background:\s*var\(--line\);/,
  );
  assert.match(
    workspaceCss,
    /\.terminal-workspace-stage\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
});

test("terminal resource explorer opens IDE-style editable file previews", () => {
  assert.match(terminalFilePreview, /TerminalFilePreviewTab/);
  assert.match(terminalFilePreview, /TerminalPreviewPlacement/);
  assert.match(terminalFilePreview, /createTerminalFilePreviewId/);
  assert.match(terminalFilePreview, /createTerminalFilePreviewTab/);
  assert.match(terminalFilePreview, /TerminalFilePreviewSnapshot/);
  assert.match(terminalFilePreview, /TERMINAL_FILE_PREVIEW_SNAPSHOT_LIMIT = 32/);
  assert.match(terminalFilePreview, /parseTerminalFilePreviewSnapshot/);
  assert.match(terminalFilePreview, /serializeTerminalFilePreviewSnapshot/);
  assert.match(terminalFilePreview, /normalizeTerminalFilePreviewTabs/);
  assert.match(terminalFilePreview, /resolveNextTerminalFilePreviewTabId/);
  assert.match(terminalFilePreview, /resolveTerminalFilePreviewTabWindow/);
  assert.match(workspacePage, /TERMINAL_FILE_PREVIEW_STORAGE_KEY = 'openclaw-studio\.terminal\.filePreviewTabs'/);
  assert.match(workspacePage, /function restoreFilePreviewTabs\(\): void \{[\s\S]*parseTerminalFilePreviewSnapshot[\s\S]*filePreviewTabs\.value = snapshot\.tabs;[\s\S]*activeFilePreviewId\.value = snapshot\.activeTabId;/);
  assert.match(workspacePage, /function persistFilePreviewTabs\(\): void \{[\s\S]*serializeTerminalFilePreviewSnapshot[\s\S]*localStorage\?\.setItem\(TERMINAL_FILE_PREVIEW_STORAGE_KEY, serialized\)[\s\S]*localStorage\?\.removeItem\(TERMINAL_FILE_PREVIEW_STORAGE_KEY\)/);
  assert.match(workspacePage, /restoreFilePreviewTabs\(\);[\s\S]*applyCompactInspectorMode\(\);/);
  assert.match(workspacePage, /window\.addEventListener\('resize', syncCompactInspectorMode\);/);
  assert.match(workspacePage, /cancelCompactInspectorModeSync\(\);[\s\S]*window\.removeEventListener\('resize', syncCompactInspectorMode\);/);
  assert.match(workspacePage, /watch\(\s*\(\) => \(\{[\s\S]*activeTabId: activeFilePreviewId\.value,[\s\S]*tabs: filePreviewTabs\.value\.map\(\(tab\) => \(\{ \.\.\.tab \}\)\),[\s\S]*persistFilePreviewTabs,/);
  assert.match(terminalFilePreviewPane, /readFileContent/);
  assert.match(terminalFilePreviewPane, /saveFileContent/);
  assert.match(terminalFilePreviewPane, /buildFileDownloadUrl/);
  assert.match(terminalFilePreviewPane, /AsyncCodeFileEditor/);
  assert.match(terminalFilePreviewPane, /AsyncTerminalMarkdownPreview/);
  assert.match(terminalFilePreviewPane, /import\('\.\/TerminalMarkdownPreview\.vue'\)/);
  assert.doesNotMatch(terminalFilePreviewPane, /import\('\.\.\/chat\/MarkdownBlock\.vue'\)/);
  assert.match(terminalFilePreviewPane, /v-model="activeDraft"/);
  assert.match(terminalFilePreviewPane, /activeRichPreviewKind/);
  assert.match(terminalFilePreviewPane, /activeSupportsRichPreview/);
  assert.match(terminalFilePreviewPane, /type TerminalFilePreviewMode = 'edit' \| 'preview' \| 'visual'/);
  assert.match(terminalFilePreviewPane, /type TerminalRichPreviewKind = 'markdown' \| 'html'/);
  assert.match(terminalFilePreviewPane, /previewMode: TerminalFilePreviewMode/);
  assert.match(terminalFilePreviewPane, /previewMode: 'edit'/);
  assert.match(terminalFilePreviewPane, /function toggleActivePreviewMode\(\): void/);
  assert.match(terminalFilePreviewPane, /state\.previewMode = 'preview';/);
  assert.match(terminalFilePreviewPane, /state\.previewMode = 'visual';/);
  assert.match(terminalFilePreviewPane, /state\.previewMode = 'edit';/);
  assert.match(terminalFilePreviewPane, /v-model:source="activeDraft"/);
  assert.match(terminalFilePreviewPane, /Markdown 富文本预览/);
  assert.match(terminalFilePreviewPane, /Markdown 所见即所得编辑/);
  assert.match(terminalFilePreviewPane, /:editable="false"/);
  assert.match(terminalFilePreviewPane, /:read-only="true"/);
  assert.match(terminalFilePreviewPane, /:editable="activeCanEdit"/);
  assert.match(terminalFilePreviewPane, /:read-only="!activeCanEdit \|\| activeState\?\.saving"/);
  assert.match(terminalFilePreviewPane, /@save="saveActiveFile"/);
  assert.match(terminalFilePreviewPane, /开启所见即所得编辑/);
  assert.doesNotMatch(terminalFilePreviewPane, /terminal-file-preview__split--markdown/);
  assert.doesNotMatch(terminalFilePreviewPane, /markdownSplitRef/);
  assert.doesNotMatch(terminalFilePreviewPane, /scheduleMarkdownSplitScrollBinding/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__rendered--markdown/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__rendered--html/);
  assert.match(terminalFilePreviewPane, /<iframe[\s\S]*class="terminal-file-preview__html-frame"[\s\S]*:srcdoc="htmlPreviewSrcdoc"[\s\S]*sandbox="allow-forms allow-modals allow-popups allow-scripts"/);
  assert.doesNotMatch(terminalFilePreviewPane, /allow-same-origin/);
  assert.match(terminalFilePreviewPane, /function buildHtmlPreviewSrcdoc\(\s*source: string,\s*title: string,\s*tab: TerminalFilePreviewTab \| null,\s*\): string/);
  assert.match(terminalFilePreviewPane, /function buildHtmlPreviewViewportStyle\(\): string/);
  assert.match(terminalFilePreviewPane, /function rewriteHtmlPreviewResourceUrls\(source: string, tab: TerminalFilePreviewTab \| null\): string/);
  assert.match(terminalFilePreviewPane, /function rewriteHtmlPreviewSrcset\(value: string, tab: TerminalFilePreviewTab\): string/);
  assert.match(terminalFilePreviewPane, /function rewriteHtmlPreviewCssUrls\(value: string, tab: TerminalFilePreviewTab\): string/);
  assert.match(terminalFilePreviewPane, /function resolveHtmlPreviewResourceUrl\(rawUrl: string, tab: TerminalFilePreviewTab\): string/);
  assert.match(terminalFilePreviewPane, /function normalizeHtmlPreviewResourcePath\(resourcePath: string, filePath: string\): string/);
  assert.match(terminalFilePreviewPane, /rewriteAttribute\('\[src\]', 'src'\)/);
  assert.match(terminalFilePreviewPane, /rewriteAttribute\('\[href\]', 'href'\)/);
  assert.match(terminalFilePreviewPane, /rewriteAttribute\('\[poster\]', 'poster'\)/);
  assert.match(terminalFilePreviewPane, /document\.querySelectorAll<HTMLElement>\('\[srcset\]'\)/);
  assert.match(terminalFilePreviewPane, /document\.querySelectorAll<HTMLStyleElement>\('style'\)/);
  assert.match(terminalFilePreviewPane, /buildFileDownloadUrl\(tab\.rootId, normalizedPath\)/);
  assert.match(terminalFilePreviewPane, /value\.startsWith\('\/\/'\)/);
  assert.match(terminalFilePreviewPane, /\^\[a-z\]\[a-z0-9\+\.\-\]\*:/);
  assert.match(terminalFilePreviewPane, /data-openclaw-ide-preview-viewport/);
  assert.match(terminalFilePreviewPane, /html\{width:100%;height:100%;min-width:0;\}/);
  assert.match(terminalMarkdownPreview, /class="terminal-doc-preview"/);
  assert.match(terminalMarkdownPreview, /function renderTerminalMarkdownDocument\(source: string\): string/);
  assert.match(terminalMarkdownPreview, /const renderedHtml = ref\(renderTerminalMarkdownDocument\(props\.source\)\);/);
  assert.match(terminalMarkdownPreview, /:contenteditable="editable && !readOnly \? 'true' : undefined"/);
  assert.match(terminalMarkdownPreview, /defineEmits<\{/);
  assert.match(terminalMarkdownPreview, /\(e: 'update:source', value: string\): void;/);
  assert.match(terminalMarkdownPreview, /function handleEditableInput\(\): void/);
  assert.match(terminalMarkdownPreview, /function serializeEditableMarkdownDocument\(root: HTMLElement\): string/);
  assert.match(terminalMarkdownPreview, /function serializeEditableMarkdownTable\(table: HTMLElement\): string/);
  assert.match(terminalMarkdownPreview, /function scheduleTerminalMarkdownRender\(\): void/);
  assert.match(terminalMarkdownPreview, /requestIdleCallback/);
  assert.match(terminalMarkdownPreview, /clearScheduledTerminalMarkdownRender/);
  assert.match(terminalMarkdownPreview, /markdownRenderSerial/);
  assert.match(terminalMarkdownPreview, /import \{ unified \} from 'unified';/);
  assert.match(terminalMarkdownPreview, /import remarkGfm from 'remark-gfm';/);
  assert.match(terminalMarkdownPreview, /import rehypeRaw from 'rehype-raw';/);
  assert.match(terminalMarkdownPreview, /allowDangerousHtml: true/);
  assert.match(terminalMarkdownPreview, /extractTerminalPreviewPlaceholders/);
  assert.match(terminalMarkdownPreview, /extractTerminalMathPlaceholders/);
  assert.match(terminalMarkdownPreview, /renderTerminalMermaidPlaceholder/);
  assert.match(terminalMarkdownPreview, /class="terminal-doc-mermaid"/);
  assert.match(terminalMarkdownPreview, /terminal-doc-math--block/);
  assert.match(terminalMarkdownPreview, /import\('mermaid'\)/);
  assert.match(terminalMarkdownPreview, /import\('katex'\)/);
  assert.match(terminalMarkdownPreview, /sanitizeMermaidSvg\(svg\)/);
  assert.match(terminalMarkdownPreview, /sanitizeSvgPreviewMarkup\(source\)/);
  assert.doesNotMatch(terminalMarkdownPreview, /renderChatMarkdownResult/);
  assert.doesNotMatch(terminalMarkdownPreview, /MarkdownBlock/);
  assert.doesNotMatch(terminalMarkdownPreview, /chat-mermaid-source/);
  assert.doesNotMatch(terminalMarkdownPreview, /chat-mermaid-label/);
  assert.doesNotMatch(terminalMarkdownPreview, />Source</);
  assert.doesNotMatch(terminalMarkdownPreview, />Mermaid</);
  assert.doesNotMatch(workspaceCss, /\.terminal-file-preview__split\s*\{/);
  assert.match(workspaceCss, /\.terminal-doc-preview\s*\{[\s\S]*--doc-ink:\s*#122033;[\s\S]*color-scheme:\s*light;[\s\S]*font-family:\s*-apple-system/);
  assert.match(workspaceCss, /\.terminal-doc-preview--dark\s*\{[\s\S]*--doc-paper:\s*#0d141d;[\s\S]*color-scheme:\s*dark;/);
  assert.match(workspaceCss, /\.terminal-doc-preview--editable\s*\{[\s\S]*cursor:\s*text;/);
  assert.match(workspaceCss, /\.terminal-doc-preview--editable \.terminal-doc-preview__document:focus\s*\{[\s\S]*outline:\s*none;/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document > :where\(section, article, div, table, pre, blockquote, figure, details, ul, ol, dl\)\s*\{[\s\S]*content-visibility:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document h2\s*\{[\s\S]*border-left:\s*5px solid var\(--doc-brand\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document h4\s*\{[\s\S]*color:\s*var\(--doc-brand-ink\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document kbd\s*\{[\s\S]*font:\s*700 0\.82em var\(--terminal-font-family\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document details\s*\{[\s\S]*border:\s*1px solid var\(--doc-line\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document :where\(\.footnotes, \[role="doc-endnotes"\]\)\s*\{[\s\S]*border-top:\s*1px solid var\(--doc-line\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document \.terminal-doc-mermaid,[\s\S]*\.terminal-doc-preview__document \.terminal-doc-svg\s*\{[\s\S]*border:\s*1px solid var\(--doc-line\);/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document \.terminal-doc-math--block\s*\{[\s\S]*text-align:\s*center;/);
  assert.match(workspaceCss, /\.terminal-doc-preview__document div\[style\*="#eff6ff"\]/);
  assert.doesNotMatch(workspaceCss, /chat-mermaid|chat-math|chat-markdown/);
  assert.match(terminalFilePreviewPane, /activeDirty/);
  assert.match(terminalFilePreviewPane, /saveActiveFile/);
  assert.match(terminalFilePreviewPane, /dirtyTabIds/);
  assert.match(terminalFilePreviewPane, /saveDirtyFiles/);
  assert.match(terminalFilePreviewPane, /saveDirtyFilesFromMenu/);
  assert.match(terminalFilePreviewPane, /canSaveTabState/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__switcher/);
  assert.match(terminalFilePreviewPane, /previewSwitcherRef/);
  assert.match(terminalFilePreviewPane, /previewActionMenuRef/);
  assert.match(terminalFilePreviewPane, /closePreviewOverlays/);
  assert.match(terminalFilePreviewPane, /selectPreviewTab/);
  assert.match(terminalFilePreviewPane, /TERMINAL_FILE_PREVIEW_DRAG_MIME/);
  assert.match(terminalFilePreviewPane, /TERMINAL_RESOURCE_DRAG_MIME/);
  assert.match(terminalFilePreviewPane, /serializeTerminalResourceTransfer/);
  assert.match(terminalFilePreviewPane, /@dragstart="startPreviewTabDrag\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /event\.dataTransfer\?\.setData\(TERMINAL_FILE_PREVIEW_DRAG_MIME, tab\.id\)/);
  assert.match(terminalFilePreviewPane, /event\.dataTransfer\?\.setData\(\s*TERMINAL_RESOURCE_DRAG_MIME,[\s\S]*serializeTerminalResourceTransfer\(resourcePayload\)/);
  assert.match(terminalFilePreviewPane, /event\.dataTransfer\?\.setData\('text\/plain', resourcePayload\.absolutePath\)/);
  assert.match(terminalFilePreviewPane, /event\.dataTransfer\.effectAllowed = 'copyMove'/);
  assert.doesNotMatch(terminalFilePreviewPane, /event\.dataTransfer\?\.setData\('text\/plain', tab\.id\);[\s\S]*event\.dataTransfer\.effectAllowed = 'move'/);
  assert.match(terminalFilePreviewPane, /@dragover\.prevent="handlePreviewTabDragOver\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /@drop\.prevent="dropPreviewTab\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /@auxclick\.prevent="handlePreviewTabAuxClick\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /@contextmenu\.prevent="openPreviewTabContextMenu\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /:data-preview-tab-id="tab\.id"/);
  assert.match(terminalFilePreviewPane, /@keydown="handlePreviewTabKeydown\(\$event, tab\)"/);
  assert.match(terminalFilePreviewPane, /function handlePreviewTabKeydown\(event: KeyboardEvent, tab: TerminalFilePreviewTab\): void/);
  assert.match(terminalFilePreviewPane, /event\.key === 'ArrowLeft'/);
  assert.match(terminalFilePreviewPane, /event\.key === 'ArrowRight'/);
  assert.match(terminalFilePreviewPane, /event\.key === 'Home'/);
  assert.match(terminalFilePreviewPane, /event\.key === 'End'/);
  assert.match(terminalFilePreviewPane, /event\.key === 'ContextMenu' \|\| \(event\.shiftKey && event\.key === 'F10'\)/);
  assert.match(terminalFilePreviewPane, /function selectPreviewTabByIndex\(index: number\): boolean/);
  assert.match(terminalFilePreviewPane, /function focusPreviewTabButton\(tabId: string\): void/);
  assert.match(terminalFilePreviewPane, /function openPreviewTabContextMenuFromKeyboard\(event: KeyboardEvent, tab: TerminalFilePreviewTab\): void/);
  assert.match(terminalFilePreviewPane, /function resolvePreviewTabContextMenuPosition\(/);
  assert.match(terminalFilePreviewPane, /emit\('reorder', \{\s*tabId: normalizedSourceId,\s*targetIndex: boundedIndex,\s*\}\)/);
  assert.match(terminalFilePreviewPane, /function handlePreviewTabAuxClick\(event: MouseEvent, tab: TerminalFilePreviewTab\): void/);
  assert.match(terminalFilePreviewPane, /if \(event\.button !== 1\) return;[\s\S]*requestCloseTab\(tab\.id\);/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__more-panel/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__context-menu/);
  assert.match(terminalFilePreviewPane, /FILE_PREVIEW_CONTEXT_MENU_WIDTH = 248/);
  assert.match(terminalFilePreviewPane, /FILE_PREVIEW_CONTEXT_MENU_HEIGHT = 360/);
  assert.match(terminalFilePreviewPane, /viewportWidth - FILE_PREVIEW_CONTEXT_MENU_WIDTH - 8/);
  assert.match(terminalFilePreviewPane, /viewportHeight - FILE_PREVIEW_CONTEXT_MENU_HEIGHT - 8/);
  assert.doesNotMatch(terminalFilePreviewPane, /const menuWidth = 240/);
  assert.doesNotMatch(terminalFilePreviewPane, /const menuHeight = 310/);
  assert.match(terminalFilePreviewPane, /<MoreHorizontal class="terminal-file-preview__icon"/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__menu-item--revert/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__menu-item--save-all/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__menu-item--find/);
  assert.match(terminalFilePreviewPane, /function resetActiveDraftFromMenu/);
  assert.match(terminalFilePreviewPane, /function requestEditorSearchFromMenu/);
  assert.doesNotMatch(terminalFilePreviewPane, /@click="searchRequest \+= 1"/);
  assert.match(terminalFilePreviewPane, /requestCloseTab/);
  assert.match(terminalFilePreviewPane, /requestCloseTabs/);
  assert.match(terminalFilePreviewPane, /closePreviewTabs/);
  assert.match(terminalFilePreviewPane, /closeTabsToRight/);
  assert.match(terminalFilePreviewPane, /closeSavedFilesFromMenu/);
  assert.match(terminalFilePreviewPane, /closeOtherFilesFromMenu/);
  assert.match(terminalFilePreviewPane, /closeAllFilesFromMenu/);
  assert.match(terminalFilePreviewPane, /savedTabIds/);
  assert.match(terminalFilePreviewPane, /previewTabContextMenu/);
  assert.match(terminalFilePreviewPane, /contextMenuTab/);
  assert.match(terminalFilePreviewPane, /previewTabContextMenuStyle/);
  assert.match(terminalFilePreviewPane, /openPreviewTabContextMenu/);
  assert.match(terminalFilePreviewPane, /copyContextTabPath/);
  assert.match(terminalFilePreviewPane, /copyContextTabRelativePath/);
  assert.match(terminalFilePreviewPane, /insertContextTabPathInTerminal/);
  assert.match(terminalFilePreviewPane, /emit\('insertTerminalPaths', \[absolutePath\]\)/);
  assert.match(terminalFilePreviewPane, /function insertActiveTabPathInTerminal\(\): boolean \{[\s\S]*activeTab\.value\?\.absolutePath[\s\S]*emit\('insertTerminalPaths', \[absolutePath\]\)[\s\S]*return true;/);
  assert.match(terminalFilePreviewPane, /function copyActiveTabRelativePath\(\): boolean \{[\s\S]*activeTab\.value\?\.path[\s\S]*copyTextToClipboard\(relativePath\)[\s\S]*return true;/);
  assert.match(terminalFilePreviewPane, /复制相对路径/);
  assert.match(terminalFilePreviewPane, /插入路径到终端/);
  assert.match(terminalFilePreviewPane, /closeContextTab/);
  assert.match(terminalFilePreviewPane, /closeOtherContextTabs/);
  assert.match(terminalFilePreviewPane, /closeContextTabsToRight/);
  assert.match(terminalFilePreviewPane, /contextMenuTabIndex/);
  assert.match(terminalFilePreviewPane, /closeSavedContextTabs/);
  assert.match(terminalFilePreviewPane, /closeAllContextTabs/);
  assert.match(terminalFilePreviewPane, /copyTextToClipboard/);
  assert.match(terminalFilePreviewPane, /pendingCloseTabIds/);
  assert.match(terminalFilePreviewPane, /pendingCloseSaving/);
  assert.match(terminalFilePreviewPane, /pendingCloseMessage/);
  assert.match(terminalFilePreviewPane, /保存并关闭/);
  assert.match(terminalFilePreviewPane, /Save and close/);
  assert.match(terminalFilePreviewPane, /function savePendingClose\(\): Promise<void>/);
  assert.match(terminalFilePreviewPane, /const failedTabIds: string\[\] = \[\];/);
  assert.match(terminalFilePreviewPane, /const saved = await savePreviewTab\(tab\);/);
  assert.match(terminalFilePreviewPane, /pendingCloseTabIds\.value = failedTabIds;/);
  assert.match(terminalFilePreviewPane, /closePreviewTabs\(tabIds\);/);
  assert.match(terminalFilePreviewPane, /function handlePreviewBeforeUnload\(event: BeforeUnloadEvent\): void/);
  assert.match(terminalFilePreviewPane, /if \(!dirtyTabIds\.value\.length\) return;/);
  assert.match(terminalFilePreviewPane, /window\.addEventListener\('beforeunload', handlePreviewBeforeUnload\)/);
  assert.match(terminalFilePreviewPane, /window\.removeEventListener\('beforeunload', handlePreviewBeforeUnload\)/);
  assert.match(terminalFilePreviewPane, /关闭已保存文件/);
  assert.match(terminalFilePreviewPane, /保存全部/);
  assert.match(terminalFilePreviewPane, /关闭其他文件/);
  assert.match(terminalFilePreviewPane, /关闭右侧文件/);
  assert.match(terminalFilePreviewPane, /关闭所有文件/);
  assert.doesNotMatch(terminalFilePreviewPane, /globalThis\.confirm/);
  assert.doesNotMatch(terminalFilePreviewPane, /const pendingCloseTabId = ref/);
  assert.doesNotMatch(terminalFilePreviewPane, /pendingCloseTabId\.value/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__dirty-confirm/);
  assert.match(terminalFilePreviewPane, /confirmPendingClose/);
  assert.match(terminalFilePreviewPane, /cancelPendingClose/);
  assert.match(terminalFilePreviewPane, /handlePreviewKeydown/);
  assert.match(terminalFilePreviewPane, /resolveNextTerminalFilePreviewTabId/);
  assert.match(terminalFilePreviewPane, /function selectRelativePreviewTab\(direction: -1 \| 1\): boolean/);
  assert.match(terminalFilePreviewPane, /key === 'pageup' \|\| key === 'pagedown'/);
  assert.match(terminalFilePreviewPane, /selectRelativePreviewTab\(key === 'pageup' \? -1 : 1\)/);
  assert.match(terminalFilePreviewPane, /if \(key === 'tab'\) \{[\s\S]*selectRelativePreviewTab\(event\.shiftKey \? -1 : 1\)[\s\S]*event\.preventDefault\(\);/);
  assert.match(terminalFilePreviewPane, /if \(key === 'enter' && !event\.shiftKey\) \{[\s\S]*insertActiveTabPathInTerminal\(\)[\s\S]*event\.preventDefault\(\);/);
  assert.match(terminalFilePreviewPane, /if \(key === 'c' && event\.shiftKey\) \{[\s\S]*copyActiveTabRelativePath\(\)[\s\S]*event\.preventDefault\(\);/);
  assert.match(terminalFilePreviewPane, /event\.shiftKey[\s\S]*saveDirtyFiles\(\);[\s\S]*saveActiveFile\(\);/);
  assert.match(terminalFilePreviewPane, /function requestEditorSearch\(\): void \{[\s\S]*activePayload\.value\?\.content == null[\s\S]*searchRequest\.value \+= 1;/);
  assert.match(terminalFilePreviewPane, /if \(key === 'f'\) \{[\s\S]*activePayload\.value\?\.content == null[\s\S]*event\.preventDefault\(\);[\s\S]*requestEditorSearch\(\);[\s\S]*closePreviewOverlays\(\);/);
  assert.match(terminalFilePreviewPane, /FolderOpen/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__menu-item--reveal/);
  assert.match(terminalFilePreviewPane, /在资源管理器中定位/);
  assert.match(terminalFilePreviewPane, /Reveal in Explorer/);
  assert.match(terminalFilePreviewPane, /\(e: 'revealResource', payload: TerminalResourceTransferPayload\): void;/);
  assert.match(terminalFilePreviewPane, /function revealActiveFileFromMenu\(\): void/);
  assert.match(terminalFilePreviewPane, /function revealContextTabInExplorer\(\): void/);
  assert.match(terminalFilePreviewPane, /function buildPreviewTabResourcePayload\([\s\S]*TerminalResourceTransferPayload \| null/);
  assert.match(terminalFilePreviewPane, /placementOptions/);
  assert.match(terminalFilePreviewPane, /setPlacement/);
  assert.match(terminalFilePreviewPane, /toggleTerminal/);
  assert.match(terminalFilePreviewPane, /toggleWorkspaceFullscreen/);
  assert.match(terminalFilePreviewPane, /:disabled="activePayload\?\.content == null"/);
  assert.doesNotMatch(terminalFilePreviewPane, /:disabled="!activePayload\?\.content"/);
  assert.match(terminalFilePreviewPane, /:read-only="!activeCanEdit \|\| activeState\?\.saving"/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__image/);
  assert.match(terminalFilePreviewPane, /ZoomIn,\s*\n\s*ZoomOut,/);
  assert.match(terminalFilePreviewPane, /IMAGE_ZOOM_MIN = 0\.2/);
  assert.match(terminalFilePreviewPane, /IMAGE_ZOOM_MAX = 4/);
  assert.match(terminalFilePreviewPane, /IMAGE_ZOOM_STEP = 0\.2/);
  assert.match(terminalFilePreviewPane, /imageZoomByTab/);
  assert.match(terminalFilePreviewPane, /imageFitByTab/);
  assert.match(terminalFilePreviewPane, /class="terminal-file-preview__image-toolbar"/);
  assert.match(terminalFilePreviewPane, /class="terminal-file-preview__image-stage" @wheel\.ctrl\.prevent="zoomActiveImageFromWheel"/);
  assert.match(terminalFilePreviewPane, /class="terminal-file-preview__image-img"/);
  assert.match(terminalFilePreviewPane, /activeImageZoomPercent/);
  assert.match(terminalFilePreviewPane, /activeImageStyle/);
  assert.match(terminalFilePreviewPane, /function zoomActiveImage\(delta: number\): void/);
  assert.match(terminalFilePreviewPane, /function fitActiveImage\(\): void/);
  assert.match(terminalFilePreviewPane, /function resetActiveImageZoom\(\): void/);
  assert.match(terminalFilePreviewPane, /function zoomActiveImageFromWheel\(event: WheelEvent\): void/);
  assert.match(terminalFilePreviewPane, /function clampImageZoom\(value: number\): number/);
  assert.match(terminalFilePreviewPane, /previewMetaLabel[\s\S]*activeStatusLabel\.value/);
  assert.match(terminalFilePreviewPane, /filePreviewTabTitle/);
  assert.match(terminalFilePreviewPane, /:title="filePreviewTabTitle\(tab\)"/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__tab-state/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__dirty-dot/);
  assert.match(terminalFilePreviewPane, /PREVIEW_DIRECT_TAB_LIMIT = 7/);
  assert.match(terminalFilePreviewPane, /v-for="tab in visiblePreviewTabs"/);
  assert.match(terminalFilePreviewPane, /resolveTerminalFilePreviewTabWindow\(props\.tabs, props\.activeTabId, PREVIEW_DIRECT_TAB_LIMIT\)/);
  assert.match(terminalFilePreviewPane, /const visiblePreviewTabs = computed\(\(\) => visiblePreviewWindow\.value\.visibleTabs\)/);
  assert.match(terminalFilePreviewPane, /hiddenPreviewBeforeCount/);
  assert.match(terminalFilePreviewPane, /hiddenPreviewAfterCount/);
  assert.match(terminalFilePreviewPane, /function selectHiddenPreviewTab\(direction: -1 \| 1\): void/);
  assert.match(terminalFilePreviewPane, /@click\.stop="selectHiddenPreviewTab\(-1\)"/);
  assert.match(terminalFilePreviewPane, /@click\.stop="selectHiddenPreviewTab\(1\)"/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__tab-overflow--before/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__tab-overflow--after/);
  assert.match(terminalFilePreviewPane, /const hiddenPreviewTabCount = computed/);
  assert.match(terminalFilePreviewPane, /个文件标签收在文件列表中/);
  assert.match(terminalFilePreviewPane, /previewTabbarClasses/);
  assert.match(terminalFilePreviewPane, /'terminal-file-preview__tabs--dense': props\.tabs\.length >= 6/);
  assert.match(terminalFilePreviewPane, /'terminal-file-preview__tabs--crowded': props\.tabs\.length >= 10/);
  assert.match(terminalFilePreviewPane, /'terminal-file-preview__tabs--windowed': hiddenPreviewTabCount\.value > 0/);
  assert.doesNotMatch(terminalFilePreviewPane, /<small v-if="isTabDirty\(tab\.id\)"/);
  assert.match(terminalFilePreviewPane, /const activePreviewTitle = computed/);
  assert.doesNotMatch(terminalFilePreviewPane, /terminal-file-preview__toolbar/);
  assert.doesNotMatch(terminalFilePreviewPane, /terminal-file-preview__meta/);
  assert.doesNotMatch(terminalFilePreviewPane, /terminal-file-preview__status/);
  assert.match(terminalFilePreviewPane, /terminal-file-preview__tabbar/);
  assert.match(terminalFilePreviewPane, /class="terminal-file-preview__tabbar"[\s\S]*<\/div>\s*<div class="terminal-file-preview__actions" role="toolbar" :aria-label="text\('文件操作', 'File actions'\)"/);
  assert.doesNotMatch(terminalFilePreviewPane, /v-if="activeDirty \|\| activeState\?\.saving"/);
  assert.match(terminalFilePreviewPane, /:class="\{ 'terminal-file-preview__button--dirty': activeDirty \}"/);
  assert.match(terminalFilePreviewPane, /:disabled="!activeDirty \|\| !activeCanEdit \|\| activeState\?\.saving"/);
  assert.match(terminalFilePreviewPane, /const saveButtonLabel = computed/);
  assert.match(terminalFilePreviewPane, /if \(activeDirty\.value\) return text\('保存文件', 'Save file'\);/);
  assert.match(terminalFilePreviewPane, /return text\('已保存', 'Saved'\);/);
  assert.match(terminalFilePreviewPane, /:aria-label="saveButtonLabel"/);
  assert.match(terminalFilePreviewPane, /closeActiveFileFromMenu/);
  assert.match(terminalFilePreviewPane, /:aria-label="text\('关闭文件', 'Close file'\)"/);
  assert.match(terminalFilePreviewPane, /data-testid="terminal-file-preview"/);
  assert.match(terminalSessionPane, /<TerminalFilePreviewPane/);
  assert.match(terminalSessionPane, /activePreviewTab/);
  assert.match(terminalSessionPane, /previewPlacement/);
  assert.match(terminalSessionPane, /previewMaximized/);
  assert.match(terminalSessionPane, /terminalCollapsed/);
  assert.match(terminalSessionPane, /function showEditor\(\): boolean/);
  assert.match(terminalSessionPane, /terminalCollapsed\.value = true;/);
  assert.match(terminalSessionPane, /function showTerminal\(\): void/);
  assert.match(terminalSessionPane, /PanelBottomClose/);
  assert.match(terminalSessionPane, /PanelBottomOpen/);
  assert.match(terminalSessionPane, /class="secondary-button compact-button terminal-stage-action terminal-stage-action--terminal-toggle"/);
  assert.match(terminalSessionPane, /@click="collapseTerminalPanel"/);
  assert.match(terminalSessionPane, /function collapseTerminalPanel\(\): void/);
  assert.match(terminalSessionPane, /function restoreTerminalPanel\(\): void/);
  assert.match(terminalSessionPane, /@click="restoreTerminalPanel"/);
  assert.match(terminalSessionPane, /TERMINAL_STAGE_LAYOUT_STORAGE_KEY/);
  assert.match(terminalSessionPane, /TERMINAL_PREVIEW_SIZE_STORAGE_KEY/);
  assert.match(terminalSessionPane, /terminal-layout-resizer/);
  assert.match(terminalSessionPane, /startPreviewResize/);
  assert.match(terminalSessionPane, /resizePreviewFromKeyboard/);
  assert.match(terminalSessionPane, /clampPreviewSize/);
  assert.match(terminalSessionPane, /terminal-session-terminal-restore/);
  assert.match(terminalSessionPane, /previewTabs: TerminalFilePreviewTab\[\]/);
  assert.match(terminalSessionPane, /activePreviewId: string/);
  assert.match(terminalSessionPane, /selectPreview/);
  assert.match(terminalSessionPane, /closePreview/);
  assert.match(terminalSessionPane, /@insert-terminal-paths="insertTerminalPaths\(\$event\)"/);
  assert.match(terminalSessionPane, /@reveal-resource="emit\('revealResource', \$event\)"/);
  assert.match(terminalSessionPane, /@reorder="emit\('reorderPreview', \$event\)"/);
  assert.match(terminalSessionPane, /\(e: 'reorderPreview', payload: \{ tabId: string; targetIndex: number \}\): void;/);
  assert.match(terminalSessionPane, /\(e: 'revealResource', payload: TerminalResourceTransferPayload\): void;/);
  assert.match(terminalSessionPane, /toggleWorkspaceFullscreen/);
  assert.match(workspacePage, /ref="desktopResourceExplorerRef"/);
  assert.match(workspacePage, /ref="mobileResourceExplorerRef"/);
  assert.match(workspacePage, /@reveal-resource="handlePreviewRevealResource"/);
  assert.match(workspacePage, /const desktopResourceExplorerRef = ref<InstanceType<typeof TerminalResourceExplorer> \| null>\(null\)/);
  assert.match(workspacePage, /const mobileResourceExplorerRef = ref<InstanceType<typeof TerminalResourceExplorer> \| null>\(null\)/);
  assert.match(workspacePage, /async function handlePreviewRevealResource\(payload: TerminalResourceTransferPayload\): Promise<void>/);
  assert.match(workspacePage, /mobileResourceExplorerOpen\.value = true/);
  assert.match(workspacePage, /desktopResourceExplorerRef\.value\?\.revealTerminalResource\(payload\)/);
  assert.match(workspacePage, /@reorder-preview="handleFilePreviewReorder"/);
  assert.match(workspacePage, /function handleFilePreviewReorder\(payload: \{ tabId: string; targetIndex: number \}\): void/);
  assert.match(workspaceCss, /\.terminal-file-preview\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab--dragging\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab--drop-before::after,\s*\n\.terminal-file-preview__tab--drop-after::after\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen\s*\{/);
  assert.match(workspaceCss, /\.app-container:has\(\.terminal-workspace-shell--fullscreen\) \.main-content\.terminal-surface-route\s*\{[\s\S]*z-index:\s*5000;/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen\s*\{[\s\S]*width:\s*100vw;[\s\S]*padding:\s*0;/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen \.terminal-workspace-body\s*\{[\s\S]*max-width:\s*none;/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen \.terminal-workspace-body\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(240px,\s*var\(--terminal-resource-width,\s*300px\)\) 7px minmax\(0,\s*1fr\);/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--fullscreen \.terminal-workspace-body--resource-collapsed\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(0,\s*1fr\);/);
  assert.doesNotMatch(workspaceCss, /terminal-workspace-body--stage-only/);
  assert.match(workspaceCss, /\.terminal-session-body--preview-right\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-body--preview-maximized \.terminal-session-main\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-body--terminal-collapsed \.terminal-file-preview\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-terminal-restore\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-terminal-restore__icon\s*\{/);
  assert.match(workspaceCss, /\.terminal-stage-action--terminal-toggle\s*\{/);
  assert.match(workspaceCss, /\.terminal-layout-resizer\s*\{/);
  assert.match(workspaceCss, /--terminal-preview-size/);
  assert.match(workspaceCss, /\.terminal-file-preview__layout-switch\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__head\s*\{[\s\S]*--terminal-file-preview-actions-width:\s*104px;[\s\S]*position:\s*relative;[\s\S]*grid-template-rows:\s*auto;/);
  assert.doesNotMatch(workspaceCss, /grid-template-rows:\s*auto auto;/);
  assert.match(workspaceCss, /\.terminal-file-preview__actions\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset-block-start:\s*3px;[\s\S]*inset-inline-end:\s*4px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__actions\s*\{[\s\S]*gap:\s*2px;[\s\S]*min-width:\s*calc\(var\(--terminal-file-preview-actions-width\) - 8px\);[\s\S]*padding:\s*2px 0 2px 6px;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-file-preview__toolbar\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-file-preview__meta\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabbar\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);[\s\S]*padding-inline-end:\s*var\(--terminal-file-preview-actions-width\);/);
  assert.doesNotMatch(workspaceCss, /grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-file-preview__switcher\s*\{[\s\S]*width:\s*36px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__actions\s*\{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(workspaceCss, /\.terminal-file-preview__actions\s*\{[\s\S]*border-left:/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab\s*\{[\s\S]*flex:\s*0 0 clamp\(96px,\s*10vw,\s*144px\);[\s\S]*min-height:\s*30px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab\s*\{[\s\S]*grid-template-columns:\s*14px minmax\(0,\s*1fr\) 18px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs\s*\{[\s\S]*overscroll-behavior-x:\s*contain;[\s\S]*scrollbar-gutter:\s*stable;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs--dense \.terminal-file-preview__tab\s*\{[\s\S]*flex-basis:\s*clamp\(86px,\s*8vw,\s*124px\);/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs--crowded \.terminal-file-preview__tab\s*\{[\s\S]*flex-basis:\s*clamp\(76px,\s*7vw,\s*108px\);/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs--windowed\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*scrollbar-gutter:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab-overflow\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab-overflow\s*\{[\s\S]*flex:\s*0 0 38px;[\s\S]*min-width:\s*38px;[\s\S]*min-height:\s*30px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab-overflow--after\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab-overflow:hover,\s*\n\.terminal-file-preview__tab-overflow:focus-visible\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs--windowed \.terminal-file-preview__tab\s*\{[\s\S]*flex:\s*1 1 clamp\(104px,\s*13vw,\s*160px\);[\s\S]*max-width:\s*170px;/);
  assert.doesNotMatch(workspaceCss, /grid-template-columns:\s*14px minmax\(0,\s*1fr\) 8px 18px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab-state\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__tab:hover \.terminal-file-preview__close/);
  assert.match(workspaceCss, /\.terminal-file-preview__dirty-dot\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(workspaceCss, /\.terminal-file-preview__button\s*\{[\s\S]*width:\s*26px;[\s\S]*height:\s*26px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__button--primary\s*\{[\s\S]*color:\s*var\(--muted\);/);
  assert.match(workspaceCss, /\.terminal-file-preview__button--dirty:not\(:disabled\)\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--accent-primary\) 8%, var\(--surface-raised\)\);[\s\S]*color:\s*var\(--accent-primary\);/);
  assert.match(workspaceCss, /\.terminal-file-preview__button--preview-mode\.active\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__rendered\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-file-preview__rendered--html\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*overflow:\s*hidden;/);
  assert.match(workspaceCss, /\.terminal-file-preview__markdown\s*\{[\s\S]*line-height:\s*1\.78;/);
  assert.match(workspaceCss, /\.terminal-file-preview__markdown h2\s*\{[\s\S]*border-left:\s*5px solid var\(--accent-primary\);[\s\S]*background:\s*linear-gradient/);
  assert.match(workspaceCss, /\.terminal-file-preview__markdown pre\s*\{[\s\S]*background:\s*#111827;[\s\S]*color:\s*#e5e7eb;/);
  assert.match(workspaceCss, /\.terminal-file-preview__markdown th\s*\{[\s\S]*background:\s*#1d4ed8;[\s\S]*color:\s*#ffffff;/);
  assert.match(workspaceCss, /\.terminal-file-preview__html-frame\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*0;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image\s*\{[\s\S]*position:\s*relative;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*overflow:\s*hidden;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-stage\s*\{[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*padding:\s*42px 18px 18px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-toolbar\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset-block-start:\s*8px;[\s\S]*inset-inline-end:\s*8px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-tool\s*\{[\s\S]*height:\s*24px;[\s\S]*font-size:\s*11px;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-zoom\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-img\s*\{[\s\S]*max-width:\s*none;[\s\S]*max-height:\s*none;/);
  assert.match(workspaceCss, /\.terminal-file-preview__image-img--fit\s*\{[\s\S]*max-width:\s*100%;[\s\S]*max-height:\s*100%;/);
  assert.match(chatMessageBubbleCss, /\.chat-message-bubble-body \.chat-markdown\s*\{[\s\S]*line-height:\s*1\.78;/);
  assert.match(chatMessageBubbleCss, /\.chat-message-bubble-body h2\s*\{[\s\S]*border-left:\s*5px solid var\(--chat-accent\);[\s\S]*background:\s*linear-gradient/);
  assert.match(chatMessageBubbleCss, /\.chat-message-bubble-body pre\s*\{[\s\S]*background:\s*#111827;[\s\S]*color:\s*#e5e7eb;/);
  assert.match(chatMessageBubbleCss, /\.chat-message-bubble-body \.chat-markdown-table-wrap th\s*\{[\s\S]*background:\s*#1d4ed8;[\s\S]*color:\s*#ffffff;/);
  assert.match(workspaceCss, /\.terminal-file-preview__more-panel\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__more-panel\s*\{[\s\S]*width:\s*min\(276px,\s*calc\(100vw - 16px\)\);[\s\S]*max-height:\s*min\(70dvh,\s*360px\);[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-file-preview__context-menu\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__context-menu\s*\{[\s\S]*width:\s*min\(248px,\s*calc\(100vw - 16px\)\);[\s\S]*max-height:\s*min\(70dvh,\s*360px\);[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-file-preview__context-menu-danger\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__menu-divider\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__menu-item\s*,\s*\n\.terminal-file-preview__context-menu button\s*,\s*\n\.terminal-file-preview__context-menu-item\s*,\s*\n\.terminal-file-preview__menu-section\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__dirty-confirm\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__dirty-confirm-panel\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__dirty-confirm-actions\s*\{[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(workspaceCss, /\.terminal-file-preview__dirty-confirm-save\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__switcher-panel\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__switcher-panel\s*\{[\s\S]*max-height:\s*min\(340px,\s*60vh\);[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-file-preview__switcher-item\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-head-actions\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-explorer\s*\{[\s\S]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);/);
  assert.match(workspaceCss, /\.terminal-resource-filter\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-filter input\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-row__path\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-explorer__head\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(workspaceCss, /grid-template-columns:\s*minmax\(64px, 1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-resource-explorer__head\s*\{[\s\S]*grid-template-areas:\s*"identity actions";/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-explorer__head span\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-root-switcher select\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-root-select\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-head-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(workspaceCss, /\.terminal-resource-head-more__panel\s*\{/);
  assert.match(workspaceCss, /\.terminal-resource-state\s*\{[^}]*min-height:\s*58px;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-state\s*\{[^}]*border:\s*1px dashed/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-hidden-toggle\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-resource-controls\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-body--with-preview \.terminal-session-main\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview__tabs\s*\{/);
  assert.match(workspaceCss, /\.terminal-file-preview\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-file-preview__status\s*\{/);
});

test("terminal file editor search and replace shows IDE-style match state", () => {
  assert.match(codeFileEditor, /role="search"/);
  assert.match(codeFileEditor, /ref="replaceInputRef"/);
  assert.match(codeFileEditor, /const activeSearchField = ref<"search" \| "replace">\("search"\);/);
  assert.match(codeFileEditor, /<output class="code-file-editor__search-status" aria-live="polite">/);
  assert.match(codeFileEditor, /const searchMatchCount = ref\(0\);/);
  assert.match(codeFileEditor, /const searchCurrentIndex = ref\(0\);/);
  assert.match(codeFileEditor, /const searchMatchOverflow = ref\(false\);/);
  assert.match(codeFileEditor, /const SEARCH_MATCH_COUNT_LIMIT = 5000;/);
  assert.match(codeFileEditor, /const searchStatusLabel = computed\(\(\) => \{/);
  assert.match(codeFileEditor, /return t\("输入内容开始查找", "Type to search"\);/);
  assert.match(codeFileEditor, /return t\("无结果", "No results"\);/);
  assert.match(codeFileEditor, /function updateSearchStats\(query = buildSearchQuery\(\), targetView = view\): void/);
  assert.match(codeFileEditor, /query\.getCursor\(targetView\.state\)/);
  assert.match(codeFileEditor, /for \(let next = cursor\.next\(\); !next\.done; next = cursor\.next\(\)\)/);
  assert.match(codeFileEditor, /selection\.from === match\.from && selection\.to === match\.to/);
  assert.match(codeFileEditor, /updateSearchStats\(query, targetView\);/);
  assert.match(codeFileEditor, /replaceNext\(view\);[\s\S]*updateSearchStats\(query, view\);/);
  assert.match(codeFileEditor, /replaceAll\(view\);[\s\S]*updateSearchStats\(query, view\);/);
  assert.match(codeFileEditor, /@keydown\.enter\.exact\.prevent\.stop="runFindNext"/);
  assert.match(codeFileEditor, /@keydown\.enter\.shift\.prevent\.stop="runFindPrevious"/);
  assert.match(codeFileEditor, /@mousedown\.prevent/);
  assert.match(codeFileEditor, /function focusActiveSearchField\(\): Promise<void>/);
  assert.match(codeFileEditor, /runFindNextCommand\(view, \{ focusTarget: "widget" \}\)/);
  assert.match(codeFileEditor, /runFindPreviousCommand\(view, \{ focusTarget: "widget" \}\)/);
  assert.match(codeFileEditor, /if \(options\.focusTarget === "widget"\) \{[\s\S]*void focusActiveSearchField\(\);/);
  assert.match(codeFileEditor, /CaseSensitive/);
  assert.match(codeFileEditor, /ChevronDown/);
  assert.match(codeFileEditor, /ReplaceAll/);
  assert.match(
    filesWorkspaceCss,
    /\.code-file-editor__searchbar\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset-block-start:\s*8px;[\s\S]*inset-inline-end:\s*14px;/,
  );
  assert.match(
    filesWorkspaceCss,
    /\.code-file-editor__searchbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*width:\s*min\(560px,\s*calc\(100% - 28px\)\);/,
  );
  assert.match(filesWorkspaceCss, /\.code-file-editor__search-status\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
  assert.match(filesWorkspaceCss, /\.code-file-editor__icon-button\s*\{[\s\S]*place-items:\s*center;/);
  assert.match(filesWorkspaceCss, /\.code-file-editor__search-divider\s*\{/);
  assert.match(filesWorkspaceCss, /@media \(max-width: 780px\) \{[\s\S]*\.code-file-editor__searchbar\s*\{[\s\S]*inset-inline:\s*6px;[\s\S]*width:\s*auto;/);
});

test("terminal inspector does not duplicate persisted history beside the terminal", () => {
  assert.doesNotMatch(workspacePage, /fetchPersistedTerminalSessionLedger/);
  assert.doesNotMatch(workspacePage, /buildTerminalSessionHistory/);
  assert.doesNotMatch(workspacePage, /sessionHistoryEntries/);
  assert.doesNotMatch(workspacePage, /loadSessionHistory/);
  assert.doesNotMatch(workspacePage, /handleReplayLastCommand/);
  assert.doesNotMatch(inspectorContent, /TerminalSessionHistoryPanel/);
  assert.doesNotMatch(inspectorContent, /historyEntries/);
  assert.doesNotMatch(inspectorContent, /replayLastCommand/);
  assert.equal(
    fs.existsSync(path.join(rootDir, "apps/web-vue/src/features/terminal/TerminalSessionHistoryPanel.vue")),
    false,
  );
  assert.match(terminalHistory, /buildTerminalSessionReplayTranscript/);
});

test("terminal console keeps replay cursor ephemeral so refreshed xterm replays backlog", () => {
  assert.doesNotMatch(terminalConsole, /TERMINAL_RUNTIME_STORAGE_KEY/);
  assert.match(terminalConsole, /Keep replay cursor state in-memory only/);
  assert.match(terminalConsole, /fetchPersistedTerminalSessionLedger/);
  assert.match(terminalConsole, /buildTerminalSessionReplayTranscript/);
  assert.match(terminalConsole, /restorePersistedTranscriptIfNeeded/);
  assert.match(terminalConsole, /restoreTranscript\?: boolean/);
  assert.match(terminalConsole, /restoreTranscript: true/);
  assert.match(terminalConsole, /if \(!props\.restoreTranscript\) return false;/);
  assert.match(terminalConsole, /Do not advance lastOutputSeq from the session summary/);
  assert.doesNotMatch(
    terminalConsole,
    /payload\.type === 'session'[\s\S]{0,500}lastOutputSeq = payload\.outputSeq/,
  );
  assert.doesNotMatch(terminalConsole, /requestGatewayOutputCatchup/);
  assert.doesNotMatch(terminalConsole, /scheduleGatewayOutputCatchup/);
  assert.doesNotMatch(terminalConsole, /gatewayOutputCatchupDirty/);
  assert.match(terminalConsole, /clearGatewayInputRecovery/);
  assert.match(terminalConsole, /scheduleGatewayInputRecovery/);
  assert.match(terminalConsole, /const lastSeenSeq = lastOutputSeq/);
  assert.match(terminalConsole, /TERMINAL_GATEWAY_COMMAND_RECOVERY_MS/);
  assert.match(terminalConsole, /scheduleGatewayInputRecovery\(lastSeenSeq, TERMINAL_GATEWAY_COMMAND_RECOVERY_MS\)/);
  assert.match(terminalConsole, /handleGatewayAckResponse/);
  assert.match(terminalConsole, /gatewayClient\.notify\(STUDIO_TERMINAL_GATEWAY_METHODS\.input/);
  assert.match(terminalConsole, /ackMode: 'none'/);
  assert.match(terminalConsole, /buildTerminalStreamUrl/);
  assert.match(terminalConsole, /new EventSource/);
  assert.match(terminalConsole, /outputMode: useHttpStream \? 'http-stream' : undefined/);
  assert.match(terminalConsole, /terminalHttpStreamActive/);
  assert.match(terminalConsole, /terminalHttpStreamFailed/);
  assert.match(terminalConsole, /terminalInputAckLatencyMs\.value = 0/);
  assert.match(terminalConsole, /shouldScheduleGatewayInputRecovery/);
  assert.match(terminalConsole, /lastSeq: lastOutputSeq \|\| undefined/);
  assert.match(terminalConsole, /instanceId: terminalInstanceId \|\| undefined/);
  assert.match(terminalConsole, /handleGatewayAckResponse\(response as TerminalGatewayAckResponse\)/);
  assert.match(terminalConsole, /enqueueTerminalOutput/);
  assert.match(terminalConsole, /flushTerminalOutputQueue/);
  assert.match(terminalConsole, /TERMINAL_OUTPUT_FRAME_BATCH_LIMIT/);
  assert.match(terminalConsole, /TERMINAL_OUTPUT_MAX_LATENCY_MS/);
  assert.match(terminalConsole, /terminalOutputFrame = window\.requestAnimationFrame\(flushTerminalOutputQueue\)/);
  assert.match(terminalConsole, /window\.setTimeout\(flushTerminalOutputQueue, TERMINAL_OUTPUT_MAX_LATENCY_MS\)/);
  assert.doesNotMatch(terminalConsole, /TERMINAL_IMMEDIATE_OUTPUT_LIMIT/);
  assert.match(terminalConsole, /clearTerminalOutputQueue/);
  assert.match(terminalConsole, /cancelScheduledTerminalOutputFlush/);
  assert.match(terminalConsole, /terminalSyncState/);
  assert.match(terminalConsole, /terminalConnectionLabel/);
  assert.match(terminalConsole, /terminalLatencyLabel/);
  assert.match(terminalConsole, /terminalLastInputAt/);
  assert.match(terminalConsole, /terminalLastAckAt/);
  assert.match(terminalConsole, /terminalLastHeartbeatAt/);
  assert.match(terminalConsole, /terminalInputAckLatencyMs/);
  assert.match(terminalConsole, /terminalOutputLatencyMs/);
  assert.match(terminalConsole, /payload\.emittedAtMs/);
  assert.match(terminalConsole, /inputStartedAt/);
  assert.match(terminalConsole, /heartbeat: true/);
  assert.match(terminalConsole, /connectDelayMs: 50/);
  assert.match(terminalConsole, /canUseDirectTerminalSocket/);
  assert.match(terminalConsole, /getStudioTerminalDirectWebSocketUrl/);
  assert.match(terminalConsole, /terminalDirectSocketActive/);
  assert.match(terminalConsole, /fallbackFromDirectSocket/);
  assert.match(terminalConsole, /payload\.type === 'clear'/);
  assert.match(terminalConsole, /clearedThroughSeq/);
  assert.match(terminalConsole, /adoptOutputSeq/);
  assert.match(terminalConsole, /suppressGapRecovery/);
  assert.match(terminalConsole, /STUDIO_TERMINAL_GATEWAY_METHODS\.clear/);
  assert.match(terminalConsole, /ws\.send\(JSON\.stringify\(\{ type: 'clear' \}\)\)/);
  assert.match(terminalConsole, /formatTerminalPaste/);
  assert.match(terminalConsole, /termInstance\?\.modes\.bracketedPasteMode/);
  assert.match(terminalConsole, /\\x1b\[200~/);
  assert.doesNotMatch(terminalConsole, /terminalTitleLabel/);
  assert.match(terminalConsole, /terminalProgressLabel/);
  assert.match(terminalConsole, /terminalStatusLabel/);
  assert.match(terminalConsole, /terminalScreenModeLabel/);
  assert.match(terminalConsole, /terminalRendererLabel/);
  assert.match(terminalConsole, /terminalConsoleFrameLabel/);
  assert.match(terminalConsole, /:aria-label="terminalConsoleFrameLabel"/);
  assert.doesNotMatch(terminalConsole, /deriveTerminalCliState/);
  assert.doesNotMatch(terminalConsole, /parseProgressParts/);
  assert.doesNotMatch(terminalConsole, /parseElapsedLabel/);
  assert.doesNotMatch(terminalConsole, /term\.onTitleChange/);
  assert.match(terminalConsole, /term\.onWriteParsed/);
  assert.match(terminalConsole, /term\.parser\.registerOscHandler\(9,/);
  assert.match(terminalConsole, /term\.buffer\.onBufferChange/);
  assert.match(terminalConsole, /function isMobileTerminalRenderingEnvironment\(\): boolean/);
  assert.match(terminalConsole, /navigator\.userAgent/);
  assert.match(terminalConsole, /navigator\.maxTouchPoints > 1 && coarsePointer/);
  assert.match(terminalConsole, /function shouldUseTerminalWebglRenderer\(\): boolean/);
  assert.match(terminalConsole, /if \(shouldUseTerminalWebglRenderer\(\)\) \{/);
  assert.match(terminalConsole, /WebglAddon/);
  assert.match(terminalConsole, /terminalRenderer\.value = 'webgl'/);
  assert.match(terminalConsole, /terminalRenderer\.value = 'dom'/);
  assert.match(terminalConsole, /function refreshTerminalLayout\(\): void/);
  assert.match(terminalConsole, /if \(fontSize !== appliedTerminalFontSize \|\| lineHeight !== appliedTerminalLineHeight\) \{[\s\S]*applyTerminalAppearance\(\{ postLayout: true \}\);[\s\S]*return;[\s\S]*\}[\s\S]*schedulePostLayoutFitSync\(\);/);
  assert.match(terminalConsole, /customGlyphs: true/);
  assert.match(terminalConsole, /rescaleOverlappingGlyphs: true/);
  assert.match(terminalConsole, /scrollOnEraseInDisplay: true/);
  assert.match(terminalConsole, /smoothScrollDuration: 0/);
  assert.match(terminalConsole, /updateTerminalScreenMode/);
  assert.match(terminalConsole, /buffer\.active\.type/);
  assert.doesNotMatch(terminalConsole, /inferCliLabel/);
  assert.match(terminalConsole, /handleTerminalProgressOsc/);
  assert.match(terminalConsole, /scheduleTerminalStatusHint/);
  assert.match(terminalConsole, /updateTerminalStatusHint/);
  assert.match(terminalConsole, /translateToString\(true\)/);
  assert.match(terminalConsole, /TERMINAL_STATUS_KEYWORDS/);
  assert.match(terminalConsole, /skipReplay: useHttpStream \? true : skipReplay \|\| undefined/);
  assert.match(terminalConsole, /resume: props\.embedded \|\| undefined/);
  assert.match(terminalConsole, /buildTerminalSocketUrl/);
  assert.match(terminalTransport, /query\.set\("skipReplay", "1"\)/);
  assert.match(terminalTransport, /query\.set\("resume", "1"\)/);
  assert.match(terminalConsole, /options: \{\s*emitAttached\?: boolean;\s*descriptor\?: TerminalSessionDescriptor \| null;\s*\} = \{\}/);
  assert.match(terminalConsole, /if \(options\.emitAttached\) \{[\s\S]*removePendingTerminalLaunchMetadata\(globalThis\.sessionStorage, terminalSessionId\.value\);[\s\S]*emitSessionAttached\(terminalSessionId\.value, options\.descriptor\);/);
  assert.match(terminalConsole, /setSessionId\(response\.sid, \{\s*emitAttached: true,\s*descriptor: response\.descriptor,\s*\}\)/);
  assert.match(terminalConsole, /handleTerminalKeydown/);
  assert.match(terminalConsole, /window\.addEventListener\('keydown', handleTerminalKeydown, true\)/);
  assert.match(terminalConsole, /addEventListener\('focusin', handleTerminalFocusIn\)/);
  assert.match(terminalConsole, /addEventListener\('focusout', handleTerminalFocusOut\)/);
  assert.match(terminalConsole, /async function pasteClipboard\(\): Promise<boolean>/);
  assert.match(terminalConsole, /navigator\.clipboard\?\.readText/);
  assert.match(terminalConsole, /event\.ctrlKey && event\.shiftKey[\s\S]*event\.key\.toUpperCase\(\) === 'V'/);
  assert.doesNotMatch(terminalConsole, /fetchTerminalLaunch/);
  assert.doesNotMatch(terminalConsole, /function canLaunch/);
  assert.doesNotMatch(terminalConsole, /async function launchCli/);
  assert.doesNotMatch(terminalConsole, /\.onFocus\(/);
  assert.doesNotMatch(terminalConsole, /\.onBlur\(/);
  assert.match(terminalConsole, /sendTerminalShortcut/);
  assert.match(terminalConsole, /insertTerminalText/);
  assert.match(terminalConsole, /function normalizeTerminalDimension\(value: number\): number \| null/);
  assert.match(terminalConsole, /const safeCols = normalizeTerminalDimension\(cols\);/);
  assert.match(terminalConsole, /if \(!safeCols \|\| !safeRows\) return false;/);
  assert.match(terminalConsole, /function sendTerminalResize\(cols: number, rows: number\): boolean/);
  assert.match(terminalConsole, /const TERMINAL_RESIZE_SEND_DEBOUNCE_MS = 48/);
  assert.match(terminalConsole, /let pendingTerminalResize: TerminalResizeDimensions \| null = null;/);
  assert.match(terminalConsole, /function cancelScheduledTerminalResize\(\): void/);
  assert.match(terminalConsole, /function queueTerminalResize\(cols: number, rows: number\): boolean/);
  assert.match(terminalConsole, /terminalResizeTimer = window\.setTimeout\(flushQueuedTerminalResize, TERMINAL_RESIZE_SEND_DEBOUNCE_MS\)/);
  assert.match(terminalConsole, /function flushQueuedTerminalResize\(\): void/);
  assert.match(terminalConsole, /if \(!sendTerminalResize\(pending\.cols, pending\.rows\)\) return;/);
  assert.match(terminalConsole, /lastSentResizeCols = 0;/);
  assert.match(terminalConsole, /lastSentResizeRows = 0;/);
  assert.match(terminalConsole, /function scheduleTerminalFit\(options: \{ postLayout\?: boolean \} = \{\}\): void/);
  assert.match(terminalConsole, /function scheduleTerminalRenderRefresh\(options: \{ postLayout\?: boolean \} = \{\}\): void/);
  assert.match(terminalConsole, /term\.refresh\(0, Math\.max\(0, term\.rows - 1\)\)/);
  assert.match(terminalConsole, /window\.visualViewport\?\.addEventListener\('resize', handleTerminalViewportChange\)/);
  assert.match(terminalConsole, /window\.visualViewport\?\.addEventListener\('scroll', handleTerminalViewportChange\)/);
  assert.match(terminalConsole, /window\.visualViewport\?\.removeEventListener\('resize', handleTerminalViewportChange\)/);
  assert.match(terminalConsole, /function isTerminalContainerRenderable\(\): boolean/);
  assert.match(terminalConsole, /rect\.width >= TERMINAL_VISIBLE_MIN_SIZE && rect\.height >= TERMINAL_VISIBLE_MIN_SIZE/);
  assert.match(terminalConsole, /resizeObserver = new ResizeObserver\(\(\) => \{/);
  assert.match(terminalConsole, /if \(fontSize !== appliedTerminalFontSize \|\| lineHeight !== appliedTerminalLineHeight\) \{/);
  assert.match(terminalConsole, /schedulePostLayoutFitSync\(\);/);
  assert.match(terminalConsole, /if \(dims\.cols === lastSentResizeCols && dims\.rows === lastSentResizeRows\) return;/);
  assert.match(terminalConsole, /queueTerminalResize\(dims\.cols, dims\.rows\);/);
  assert.match(terminalConsole, /term\.onResize\(\(\{ cols, rows \}\) => \{[\s\S]*queueTerminalResize\(cols, rows\);/);
  assert.match(terminalConsole, /ws\.send\(JSON\.stringify\(\{ type: 'resize', cols: safeCols, rows: safeRows \}\)\)/);
  assert.match(terminalConsole, /function isLeakedTerminalControlPayload\(data: string\): boolean/);
  assert.match(terminalConsole, /if \(isLeakedTerminalControlPayload\(data\)\) return true;/);
  assert.match(terminalConsole, /parseTerminalControlPayloads/);
  assert.match(terminalConsole, /payloads\.every\(isResizeTerminalControlPayload\)/);
  assert.match(terminalControlPayload, /TERMINAL_CONTROL_BATCH_LIMIT = 32/);
  assert.match(terminalControlPayload, /TERMINAL_CONTROL_BATCH_MAX_LENGTH = 4096/);
  assert.match(terminalControlPayload, /function parseTerminalControlPayloads/);
  assert.match(terminalControlPayload, /function findTerminalControlPayloadEnd/);
  assert.match(terminalControlPayload, /function isResizeTerminalControlPayload/);
  assert.doesNotMatch(terminalConsole, /JSON\.parse\(normalized\)/);
  assert.match(terminalConsole, /sendTerminalResize\(cols, rows\);/);
  assert.match(terminalConsole, /onGap: \(\) => \{/);
  assert.match(terminalConsole, /void attachGatewayTerminal\(\)\.catch\(\(\) => \{/);
  assert.match(terminalConsole, /defineExpose\(\{\s*clearTerminal,\s*focusTerminal,\s*insertTerminalText,\s*pasteClipboard,\s*refreshTerminalLayout,\s*sendTerminalShortcut,/);
  assert.match(
    terminalConsole,
    /function restoreRuntime\(\): void \{[\s\S]*terminalDirectSocketActive = false;[\s\S]*terminalHttpStreamFailed = false;[\s\S]*disconnectTerminalHttpStream\(\);[\s\S]*\}/,
  );
  assert.match(terminalService, /function normalizeSkipReplay/);
  assert.match(terminalService, /delete env\.NO_COLOR/);
  assert.match(terminalService, /function normalizeResumeSession/);
  assert.match(terminalService, /hasBacklogGap/);
  assert.match(terminalService, /reason:\s*[\s\S]*\?\s*"backlog_gap"/);
  assert.match(terminalService, /function createGatewayAck/);
  assert.match(terminalService, /TERMINAL_DESCRIPTOR_ACTIVITY_FLUSH_MS/);
  assert.match(terminalService, /TERMINAL_OUTPUT_LEDGER_FLUSH_MS/);
  assert.match(terminalService, /TERMINAL_OUTPUT_LEDGER_BATCH_LIMIT/);
  assert.match(terminalService, /emittedAtMs: Date\.now\(\)/);
  assert.match(terminalService, /emittedAtMs: chunk\.emittedAtMs/);
  assert.match(terminalService, /function scheduleDescriptorPersist/);
  assert.match(terminalService, /function enqueueOutputLedgerEvent/);
  assert.match(terminalService, /function enqueueInputLedgerEvent/);
  assert.match(terminalService, /session\.term\.write\(inputData\)[\s\S]*enqueueInputLedgerEvent\(session, inputData, runtime\.connId\)/);
  assert.match(terminalService, /payload\.ackMode === "none"/);
  assert.match(terminalService, /function normalizeTerminalDimension\(value: unknown\): number \| null/);
  assert.doesNotMatch(terminalService, /data\.type === "resize" && data\.cols && data\.rows/);
  assert.match(terminalService, /TERMINAL_CONTROL_BATCH_LIMIT = 32/);
  assert.match(terminalService, /TERMINAL_CONTROL_BATCH_MAX_LENGTH = 4096/);
  assert.match(terminalService, /function parseTerminalControlPayloads\(/);
  assert.match(terminalService, /function findTerminalControlPayloadEnd\(/);
  assert.match(terminalService, /function isKnownTerminalControlPayload\(/);
  assert.match(terminalService, /function consumeTerminalControlPayload/);
  assert.match(terminalService, /const payloads = parseTerminalControlPayloads\(rawPayload\);[\s\S]*payloads\.every\(isKnownTerminalControlPayload\)/);
  assert.match(terminalService, /for \(const data of payloads\) \{[\s\S]*if \(data\.type === "resize"\) \{[\s\S]*if \(!cols \|\| !rows\) \{[\s\S]*continue;[\s\S]*session\.term\.resize/);
  assert.match(terminalService, /consumeTerminalControlPayload\(session, payload,[\s\S]*socket: ws/);
  assert.match(terminalService, /consumeTerminalControlPayload\(session, inputData,[\s\S]*actorClientId: runtime\.connId/);
  assert.match(terminalService, /resizeGatewayClient\([\s\S]*if \(!cols \|\| !rows\) \{[\s\S]*return createGatewayAck\(session, payload\);/);
  assert.match(terminalService, /ledger\.appendMany\(events\)/);
  assert.match(terminalService, /markSessionActivity\(session, \{ persist: "deferred" \}\)/);
  assert.match(terminalService, /function clearSessionDisplay/);
  assert.match(terminalService, /appendLedgerEvent\(\s*session,\s*"clear"/);
  assert.match(terminalService, /clearGatewaySession/);
  assert.match(terminalHistory, /function eventsSinceLastClear/);
  assert.match(terminalHistory, /events\[index\]\?\.type === "clear"/);
  assert.match(studioPluginSource, /STUDIO_TERMINAL_GATEWAY_METHODS\.clear/);
  assert.match(apiRuntimeConfig, /terminalDirectWebSocketPort: null/);
  assert.match(webRuntimeConfig, /function getStudioTerminalDirectWebSocketUrl/);
  assert.match(terminalService, /gatewayOutputQueue/);
  assert.match(terminalService, /function enqueueGatewayOutput/);
  assert.match(terminalService, /setImmediate\(\(\) =>/);
  assert.match(terminalService, /streamSubscribers/);
  assert.match(terminalService, /attachStreamClient/);
  assert.match(terminalService, /suppressOutput: payload\.outputMode === "http-stream"/);
  assert.match(terminalService, /recentSummaryEvents/);
  assert.match(terminalService, /buildTerminalRecentOutputSummary\(session\.recentSummaryEvents\)/);
  assert.match(terminalService, /const events = buildAttachEvents\(session, params\)\.filter/);
  assert.match(terminalService, /outputSeq: session\.outputSeq/);
  assert.match(terminalService, /leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS/);
  assert.match(terminalService, /resumePersisted: normalizeResumeSession/);
  assert.match(terminalService, /const existingSubscriber = session\.gatewaySubscribers\.get\(runtime\.connId\)/);
  assert.match(terminalService, /existingSubscriber\.lastLeaseAt = Date\.now\(\)/);
  assert.match(terminalService, /skipReplay\?: boolean \| string \| null;/);
});

test("terminal gateway targeted output preserves order through service batching", () => {
  assert.match(
    terminalService,
    /enqueueGatewayOutput\(session, chunk\)/,
  );
  assert.doesNotMatch(
    studioPluginSource,
    /broadcastToConnIds\(STUDIO_TERMINAL_GATEWAY_EVENT, event, connIds, \{\s*dropIfSlow: true,\s*\}\)/,
  );
  assert.match(
    studioPluginSource,
    /params\?\.ackMode === 'none'[\s\S]*return;/,
  );
});

test("terminal console keeps embedded shells free of floating telemetry status bars", () => {
  assert.doesNotMatch(terminalConsole, /terminal-console-meta-strip/);
  assert.doesNotMatch(terminalConsole, /hasTerminalTelemetry/);
  assert.doesNotMatch(terminalConsole, /terminal-console-workbench-bar/);
  assert.doesNotMatch(terminalConsole, /noticeMessage/);
  assert.doesNotMatch(terminalConsole, /status-banner/);
  assert.doesNotMatch(terminalConsole, /terminal-console-header/);
  assert.doesNotMatch(terminalConsole, /terminal-console-header-chip/);
  assert.doesNotMatch(terminalConsole, /data-testid="terminal-console-status-bar"/);
  assert.doesNotMatch(terminalConsole, /terminal-console-status-bar--active/);
  assert.doesNotMatch(terminalConsole, /terminal-console-status-bar--attention/);
  assert.doesNotMatch(terminalConsole, /terminalRuntimeNeedsAttention/);
  assert.doesNotMatch(terminalConsole, /showTerminalStatusBar/);
  assert.doesNotMatch(terminalConsole, /hasTerminalWorkbenchTelemetry/);
  assert.doesNotMatch(terminalConsole, /terminalLatencyLabel\.value \|\|/);
  assert.doesNotMatch(terminalConsole, /termReady\.value \|\| connected\.value \|\| terminalCliDetailLabel/);
  assert.doesNotMatch(terminalConsole, /Heartbeat · OK|心跳 · 正常/);
  assert.doesNotMatch(terminalConsole, /terminal-console-cli-state/);
  assert.doesNotMatch(terminalConsole, /terminal-console-cli-progress/);
  assert.doesNotMatch(terminalConsole, /showTerminalCliProgress/);
  assert.doesNotMatch(terminalConsole, /terminalCliProgressStyle|terminalCliProgressClass|:style="terminalCliProgressStyle"/);
  assert.doesNotMatch(terminalConsole, /terminal-console-runtime-state/);
  assert.doesNotMatch(terminalConsole, /terminalConnectionShortLabel/);
  assert.doesNotMatch(terminalConsole, /terminalRuntimeTitle/);
  assert.doesNotMatch(terminalConsole, /terminal-console-link-state/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-header/);
  assert.doesNotMatch(workspaceCss, /terminal-console-header-chip/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-cli-progress/);
  assert.match(terminalConsole, /terminalConsoleFrameLabel/);
  assert.match(terminalConsole, /:title="terminalConsoleFrameLabel"/);
  assert.match(workspaceCss, /\.terminal-console-main\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-surface-embedded \.terminal-console-main\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(workspaceCss, /\.terminal-console-frame\s*\{[\s\S]*grid-row:\s*1;/);
  assert.match(workspaceCss, /\.terminal-console-frame\s*\{[\s\S]*position:\s*relative;[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-status-bar\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-frame:hover \.terminal-console-status-bar/);
  assert.doesNotMatch(workspaceCss, /min-width:\s*min\(420px,\s*calc\(100% - 20px\)\)/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-runtime-state\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-runtime-state__dot\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-console-link-state\s*\{/);
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
  assert.match(terminalSessionPane, /useLocalePreference/);
  assert.match(terminalResourceExplorer, /useLocalePreference/);
  assert.match(workspacePage, /text\('终端', 'Shell'\)/);
  assert.match(inspectorContent, /text\('刷新', 'Refresh'\)/);
  assert.match(inspectorContent, /text\('命令', 'Commands'\)/);
  assert.doesNotMatch(inspectorContent, /text\('会话', 'Sessions'\)/);
  assert.match(terminalTabRail, /text\('隐藏的终端标签', 'Hidden terminal tabs'\)/);
  assert.doesNotMatch(terminalTabRail, /text\('更多', 'More'\)/);
  assert.doesNotMatch(inspectorContent, /text\('运行中 \/ 已打开', 'Live \/ Open'\)/);
  assert.match(terminalResourceExplorer, /text\('资源管理器', 'Explorer'\)/);
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
  assert.match(stateSource, /paneSessionIds: Ref<string\[\]>/);
  assert.match(stateSource, /paneLayout: Ref<TerminalPaneLayout>/);
  assert.match(stateSource, /openTab\(sessionId: string\): void/);
  assert.match(stateSource, /setPaneSessions\(sessionIds: string\[\]\): void/);
  assert.match(stateSource, /splitSession\(sessionId: string, layout: Exclude<TerminalPaneLayout, "single">\): void/);
  assert.match(stateSource, /closePane\(sessionId: string\): void/);
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

test("terminal workspace exposes collapsible desktop inspector drawer", () => {
  assert.match(workspacePage, /TERMINAL_DESKTOP_INSPECTOR_STORAGE_KEY/);
  assert.match(workspacePage, /restoreDesktopInspectorPreference/);
  assert.match(workspacePage, /setDesktopInspectorOpen/);
  assert.match(workspacePage, /mobileResourceExplorerOpen/);
  assert.match(workspacePage, /openResourceExplorerPanel/);
  assert.match(workspacePage, /terminal-mobile-sheet--resource/);
  assert.match(workspacePage, /<DialogRoot v-if="compactInspectorMode" v-model:open="mobileResourceExplorerOpen" :modal="false">/);
  assert.match(workspacePage, /terminal-workspace-shell--mobile-rail/);
  assert.doesNotMatch(workspacePage, /terminal-inspector-drawer-head/);
  assert.doesNotMatch(workspacePage, /terminal-inspector-drawer-collapse/);
  assert.match(workspacePage, /terminal-inspector-drawer-close/);
  assert.match(workspacePage, /<X class="terminal-inspector-drawer-close__icon"/);
  assert.match(workspacePage, /@click="setDesktopInspectorOpen\(false\)"/);
  assert.match(workspacePage, /@open-inspector="openInspectorPanel"/);
  assert.match(workspacePage, /:show-resource-trigger="compactInspectorMode \|\| !resourceExplorerOpen"/);
  assert.match(workspacePage, /@open-resource-explorer="openResourceExplorerPanel"/);
  assert.match(workspacePage, /@collapse="mobileResourceExplorerOpen = false"/);
  assert.match(terminalSessionPane, /terminal-stage-action--inspector/);
  assert.match(terminalSessionPane, /terminal-stage-action--resource/);
  assert.doesNotMatch(workspacePage, /terminal-desktop-inspector-trigger/);
  assert.match(workspaceCss, /\.terminal-inspector-backdrop\s*\{/);
  assert.match(workspaceCss, /\.terminal-inspector-drawer--overlay\s*\{/);
  assert.match(workspaceCss, /\.terminal-inspector-drawer-close\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-sheet-mask\s*\{[\s\S]*bottom:\s*max\(74px,\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 68px\)\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-inspector-drawer-head\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-inspector-drawer-collapse\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-sheet--resource\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-sheet--resource \.terminal-resource-explorer\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-shell--mobile-rail\s*\{[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-mobile-ide-rail\s*\{[\s\S]*z-index:\s*1266;[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(54px,\s*1fr\)\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-mobile-ide-rail--with-editor\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-ide-rail__button\[aria-pressed='true'\]\s*\{/);
  assert.match(workspaceCss, /\.terminal-mobile-sheet\s*\{[\s\S]*bottom:\s*max\(74px,\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 68px\)\);/);
  assert.match(
    workspacePage,
    /<TerminalInspectorDrawer v-if="!compactInspectorMode && desktopInspectorOpen"[\s\S]*terminal-inspector-drawer--overlay[\s\S]*:open="true"/,
  );
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
  assert.match(tabRail, /role="tablist"/);
  assert.match(tabRail, /role="tab"/);
  assert.match(tabRail, /resolveNextTerminalSessionTabId/);
  assert.match(tabRail, /function selectRelativeTab\(direction: -1 \| 1\): boolean/);
  assert.match(tabRail, /window\.addEventListener\('keydown', handleWindowKeydown\)/);
  assert.match(tabRail, /key === 'pageup' \|\| key === 'pagedown'/);
  assert.match(tabRail, /selectRelativeTab\(key === 'pageup' \? -1 : 1\)/);
  assert.match(tabRail, /key === 'tab'[\s\S]*!isTerminalTabNavigationEditableTarget\(event\.target\)[\s\S]*selectRelativeTab\(event\.shiftKey \? -1 : 1\)/);
  assert.match(tabRail, /function isTerminalTabNavigationEditableTarget\(target: EventTarget \| null\): boolean/);
  assert.match(tabRail, /target\.isContentEditable/);
  assert.match(tabRail, /tagName === 'input'/);
  assert.match(tabRail, /terminal-tab-dot/);
  assert.match(tabRail, /'terminal-tab--pinned': tab\.pinned/);
  assert.match(tabRail, /@dblclick="startRename\(tab\)"/);
  assert.match(tabRail, /:data-terminal-tab-id="tab\.sessionId"/);
  assert.match(tabRail, /@keydown="handleTabButtonKeydown\(\$event, tab\)"/);
  assert.match(tabRail, /function handleTabButtonKeydown\(event: KeyboardEvent, tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /event\.key === 'ArrowLeft'/);
  assert.match(tabRail, /event\.key === 'ArrowRight'/);
  assert.match(tabRail, /event\.key === 'Home'/);
  assert.match(tabRail, /event\.key === 'End'/);
  assert.match(tabRail, /event\.key === 'ContextMenu' \|\| \(event\.shiftKey && event\.key === 'F10'\)/);
  assert.match(tabRail, /function selectTabByIndex\(index: number\): boolean/);
  assert.match(tabRail, /function focusTabButton\(sessionId: string\): void/);
  assert.match(tabRail, /function openTabContextMenuFromKeyboard\(event: KeyboardEvent, tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /openTabContextMenuFromKeyboard\(event, tab\)/);
  assert.match(tabRail, /:draggable="editingSessionId !== tab\.sessionId"/);
  assert.match(tabRail, /@dragstart="startTabDrag\(\$event, tab\)"/);
  assert.match(tabRail, /@dragover\.prevent="handleTabDragOver\(\$event, tab\)"/);
  assert.match(tabRail, /@drop\.prevent="dropTab\(\$event, tab\)"/);
  assert.match(tabRail, /@auxclick\.prevent="handleTabAuxClick\(\$event, tab\)"/);
  assert.match(tabRail, /TERMINAL_TAB_DRAG_MIME/);
  assert.match(tabRail, /emit\('reorder', \{\s*sessionId: normalizedSourceId,\s*targetIndex: boundedIndex,\s*\}\)/);
  assert.match(tabRail, /function handleTabAuxClick\(event: MouseEvent, tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /emit\('close', tab\.sessionId\)/);
  assert.match(tabRail, /function closeOtherTabs\(tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /function closeTabsToRight\(tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /emit\('closeOthers', tab\.sessionId\)/);
  assert.match(tabRail, /emit\('closeToRight', tab\.sessionId\)/);
  assert.match(tabRail, /关闭其他标签/);
  assert.match(tabRail, /关闭右侧标签/);
  assert.doesNotMatch(tabRail, /function shortSessionId\(sessionId: string\): string/);
  assert.doesNotMatch(tabRail, /terminal-tab-profile/);
  assert.doesNotMatch(tabRail, /shortProfileId/);
  assert.match(tabRail, /function tabTooltip\(tab: TerminalSessionDescriptor\): string/);
  assert.match(tabRail, /tab\.profileId/);
  assert.match(tabRail, /<Check class="terminal-tab-action-icon"/);
  assert.doesNotMatch(tabRail, /terminal-tab-status/);
  assert.doesNotMatch(tabRail, /globalThis\.prompt/);
  assert.match(tabRail, /close/);
  assert.match(tabRail, /end/);
  assert.match(tabRail, /delete/);
  assert.match(tabRail, /terminal-tab-menu/);
  assert.match(tabRail, /<div class="terminal-tab-actions">/);
  assert.doesNotMatch(tabRail, /v-if="tab\.sessionId === activeSessionId" class="terminal-tab-actions"/);
  assert.match(tabRail, /@contextmenu\.prevent="openContextMenu\(\$event, tab\)"/);
  assert.match(tabRail, /terminal-tab-context-menu/);
  assert.match(tabRail, /renameInputRef/);
  assert.match(tabRail, /ref="tabRailRef"/);
  assert.match(tabRail, /'terminal-tab-rail--compact': compactMode/);
  assert.match(tabRail, /TERMINAL_TAB_COMPACT_WIDTH = 560/);
  assert.match(tabRail, /TERMINAL_TAB_COMPACT_VISIBLE_LIMIT = 4/);
  assert.match(tabRail, /TERMINAL_TAB_CONTEXT_MENU_WIDTH = 230/);
  assert.match(tabRail, /TERMINAL_TAB_CONTEXT_MENU_HEIGHT = 360/);
  assert.match(tabRail, /function resolveContextMenuPosition\(/);
  assert.match(tabRail, /viewportWidth - TERMINAL_TAB_CONTEXT_MENU_WIDTH - 8/);
  assert.match(tabRail, /viewportHeight - TERMINAL_TAB_CONTEXT_MENU_HEIGHT - 8/);
  assert.doesNotMatch(tabRail, /const menuWidth = 220/);
  assert.doesNotMatch(tabRail, /const menuHeight = 320/);
  assert.match(tabRail, /function resolveTabRailWidth\(\): number/);
  assert.match(tabRail, /tabRailRef\.value\?\.getBoundingClientRect\(\)\.width/);
  assert.match(tabRail, /new ResizeObserver\(updateCompactMode\)/);
  assert.match(tabRail, /tabRailResizeObserver\.observe\(tabRailRef\.value\)/);
  assert.match(tabRail, /tabRailResizeObserver\?\.disconnect\(\)/);
  assert.match(tabRail, /terminal-tab-overflow/);
  assert.match(tabRail, /ref="overflowMenuRef"/);
  assert.match(tabRail, /class="terminal-tab-overflow__menu" role="menu" :aria-label="text\('隐藏的终端标签', 'Hidden terminal tabs'\)"/);
  assert.match(tabRail, /terminal-tab-overflow__row/);
  assert.match(tabRail, /'terminal-tab-overflow__row--active': tab\.sessionId === activeSessionId/);
  assert.match(tabRail, /'terminal-tab-overflow__row--pinned': tab\.pinned/);
  assert.match(tabRail, /:aria-current="tab\.sessionId === activeSessionId \? 'page' : undefined"/);
  assert.match(tabRail, /terminal-tab-overflow__titleline/);
  assert.match(tabRail, /terminal-tab-overflow__meta/);
  assert.match(tabRail, /overflowTabMeta\(tab\)/);
  assert.match(tabRail, /terminal-tab-overflow__actions/);
  assert.match(tabRail, /terminal-tab-overflow__close/);
  assert.match(tabRail, /terminal-tab-overflow__menu-trigger/);
  assert.match(tabRail, /<ChevronDown class="terminal-tab-overflow__icon"/);
  assert.match(tabRail, /terminal-tab-overflow__count/);
  assert.match(tabRail, /function closeOverflowMenu\(\): void/);
  assert.match(tabRail, /function selectOverflowTab\(tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /function closeOverflowTab\(tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /function openOverflowContextMenu\(event: MouseEvent, tab: TerminalSessionDescriptor\): void/);
  assert.match(tabRail, /closeOverflowMenu\(\);[\s\S]*openInlineContextMenu\(event, tab\);/);
  assert.match(tabRail, /props\.tabs[\s\S]*\.filter\(\(tab\) => tab\.pinned\)[\s\S]*\.forEach\(\(tab\) => keep\.add\(tab\.sessionId\)\)/);
  assert.match(tabRail, /keep\.size < TERMINAL_TAB_COMPACT_VISIBLE_LIMIT/);
  assert.match(tabRail, /function overflowTabMeta\(tab: TerminalSessionDescriptor\): string/);
  assert.match(tabRail, /function formatCompactPath\(path: string \| null \| undefined\): string/);
  assert.match(tabRail, /隐藏的终端标签/);
  assert.doesNotMatch(tabRail, /\{\{ text\('更多'/);
  assert.match(tabRail, /terminal-tab-scroll/);
  assert.match(tabRail, /terminal-tab-rail-actions/);
  assert.match(tabRail, /<slot name="actions"><\/slot>/);
  assert.match(tabRail, /class="terminal-tab-add"/);
  assert.match(tabRail, /<Plus class="terminal-tab-add__icon"/);
  assert.doesNotMatch(tabRail, /terminal-tab-add__copy/);
  assert.match(tabRail, /新建终端标签/);
  assert.match(tabRail, /New terminal tab/);
  assert.doesNotMatch(workspaceCss, /\.terminal-tab-profile\s*\{/);
  assert.match(workspaceCss, /\.terminal-tab-rail--compact\s*\{[\s\S]*gap:\s*4px;[\s\S]*padding:\s*5px;/);
  assert.match(workspaceCss, /\.terminal-tab-rail--compact \.terminal-tab-scroll\s*\{[\s\S]*gap:\s*4px;/);
  assert.match(workspaceCss, /\.terminal-tab-rail--compact \.terminal-tab\s*\{[\s\S]*max-width:\s*min\(48vw,\s*160px\);/);
  assert.match(workspaceCss, /\.terminal-tab--pinned\s*\{[\s\S]*max-width:\s*min\(100%,\s*150px\);/);
  assert.match(workspaceCss, /\.terminal-tab-rail--compact \.terminal-tab--pinned\s*\{[\s\S]*max-width:\s*min\(38vw,\s*132px\);/);
  assert.match(workspaceCss, /\.terminal-tab\s*\{[\s\S]*max-width:\s*min\(100%,\s*180px\);[\s\S]*min-height:\s*30px;/);
  assert.match(workspaceCss, /\.terminal-tab\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(workspaceCss, /\.terminal-tab-select\s*\{[\s\S]*min-height:\s*28px;[\s\S]*padding:\s*0 48px 0 7px;/);
  assert.match(workspaceCss, /\.terminal-tab-actions\s*\{[\s\S]*position:\s*absolute;[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;/);
  assert.match(workspaceCss, /\.terminal-tab\.active \.terminal-tab-actions,\s*\n\.terminal-tab:hover \.terminal-tab-actions,\s*\n\.terminal-tab:focus-within \.terminal-tab-actions\s*\{[\s\S]*opacity:\s*1;[\s\S]*pointer-events:\s*auto;/);
  assert.match(workspaceCss, /\.terminal-tab-close\s*\{[\s\S]*width:\s*24px;[\s\S]*height:\s*24px;[\s\S]*min-width:\s*24px;/);
  assert.match(workspaceCss, /\.terminal-tab-menu__trigger\s*\{[\s\S]*min-width:\s*24px;[\s\S]*min-height:\s*24px;/);
  assert.match(workspaceCss, /\.terminal-tab-add\s*\{[\s\S]*width:\s*30px;[\s\S]*min-width:\s*30px;[\s\S]*height:\s*30px;/);
  assert.match(workspaceCss, /\.terminal-tab-add__icon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__trigger\s*\{[\s\S]*display:\s*inline-grid;[\s\S]*width:\s*30px;[\s\S]*height:\s*30px;[\s\S]*padding:\s*0;/);
  assert.match(workspaceCss, /\.terminal-tab-context-menu\s*\{[\s\S]*width:\s*min\(230px,\s*calc\(100vw - 16px\)\);[\s\S]*max-height:\s*min\(70dvh,\s*360px\);[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__menu\s*\{[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 16px\)\);[\s\S]*min-width:\s*min\(260px,\s*calc\(100vw - 16px\)\);[\s\S]*max-height:\s*min\(70dvh,\s*360px\);[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*overflow:\s*hidden;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__row--active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb, var\(--accent-primary\) 46%, var\(--border-subtle\)\);/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__titleline\s*\{[\s\S]*grid-template-columns:\s*8px minmax\(0,\s*1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__meta\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__actions\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*border-left:/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__close,\s*\n\.terminal-tab-overflow__menu-trigger\s*\{[\s\S]*width:\s*28px;[\s\S]*min-width:\s*28px;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-tab-overflow__item\s*\{[^}]*border:\s*1px/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__icon\s*\{[\s\S]*width:\s*14px;[\s\S]*height:\s*14px;/);
  assert.match(workspaceCss, /\.terminal-tab-overflow__count\s*\{[\s\S]*position:\s*absolute;[\s\S]*font-variant-numeric:\s*tabular-nums;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-tab-overflow__trigger\s*\{[^}]*padding:\s*0 10px;/);
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
  assert.match(pane, /@close-others="emit\('closeOtherSessions', \$event\)"/);
  assert.match(pane, /@close-to-right="emit\('closeSessionsToRight', \$event\)"/);
  assert.match(pane, /@end=/);
  assert.match(pane, /@delete=/);
  assert.match(pane, /@reorder="reorderSessionFromWorkspaceGroup"/);
  assert.match(pane, /function reorderSessionFromWorkspaceGroup\(payload: \{ sessionId: string; targetIndex: number \}\): void/);
  assert.match(pane, /function createSessionInWorkspaceGroup\(\): void/);
  assert.match(pane, /endSession/);
  assert.match(pane, /deleteSession/);
  assert.doesNotMatch(pane, /terminal-stage-header-actions/);
  assert.match(pane, /<template #actions>[\s\S]*terminal-shortcut-menu/);
  assert.doesNotMatch(pane, /terminal-stage-action__label/);
  assert.doesNotMatch(pane, /terminal-stage-action--focus/);
  assert.doesNotMatch(pane, /terminal-stage-action--split/);
  assert.match(pane, /terminal-stage-action--inspector/);
  assert.match(pane, /terminal-stage-action--resource/);
  assert.match(pane, /terminal-stage-action--clear/);
  assert.match(pane, /terminal-stage-action--danger/);
  assert.match(pane, /ref="stageMenuRef"/);
  assert.match(pane, /const stageMenuOpen = ref\(false\)/);
  assert.match(pane, /:open="stageMenuOpen"/);
  assert.match(pane, /:aria-expanded="stageMenuOpen"/);
  assert.match(pane, /@toggle="syncStageMenuState"/);
  assert.match(pane, /@click\.prevent\.stop="toggleStageMenu"/);
  assert.match(pane, /@keydown\.esc\.stop\.prevent="closeStageMenu"/);
  assert.match(pane, /document\.addEventListener\('pointerdown', closeStageMenuFromOutside, true\)/);
  assert.match(pane, /window\.addEventListener\('resize', closeStageMenu\)/);
  assert.match(pane, /@click="pasteClipboardFromMenu"/);
  assert.match(pane, /@click="openResourceExplorerFromMenu"/);
  assert.match(pane, /@click="openInspectorFromMenu"/);
  assert.match(pane, /@click="clearTerminalFromMenu"/);
  assert.match(pane, /@click="endActiveSessionFromMenu"/);
  assert.doesNotMatch(pane, /@click="emit\('openResourceExplorer'\)"/);
  assert.doesNotMatch(pane, /@click="emit\('openInspector'\)"/);
  assert.doesNotMatch(pane, /sendShortcut\(/);
  assert.doesNotMatch(pane, /Ctrl\+(Z|U|K|A|E)/);
  assert.doesNotMatch(pane, /data-testid="terminal-session-sidecar"/);
  assert.doesNotMatch(pane, /terminal-session-sidecar__meta/);
  assert.doesNotMatch(pane, /activeSessionProfileLabel/);
  assert.match(pane, /data-testid="terminal-split-workbench"/);
  assert.match(pane, /data-testid="terminal-split-pane"/);
  assert.match(workspacePage, /@close-other-sessions="handleCloseOtherSessions"/);
  assert.match(workspacePage, /@close-sessions-to-right="handleCloseSessionsToRight"/);
  assert.match(workspacePage, /function handleCloseOtherSessions\(sessionId: string\): void/);
  assert.match(workspacePage, /function handleCloseSessionsToRight\(sessionId: string\): void/);
  assert.match(workspacePage, /workspace\.closeTab\(candidateId\)/);
  assert.doesNotMatch(pane, /terminal-session-context|Handoff Context|交接上下文|Source Module|Recommended Command|推荐命令/);
  assert.match(pane, /visiblePaneSessions/);
  assert.match(pane, /effectivePaneLayout/);
  assert.match(pane, /hasMultiplePaneSessions/);
  assert.match(pane, /TERMINAL_SPLIT_RATIO_STORAGE_KEY/);
  assert.match(pane, /TERMINAL_SPLIT_RATIO_MIN = 24/);
  assert.match(pane, /TERMINAL_SPLIT_RATIO_MAX = 76/);
  assert.match(pane, /splitWorkbenchRef/);
  assert.match(pane, /splitPaneRatio/);
  assert.match(pane, /splitWorkbenchStyle/);
  assert.match(pane, /isSplitResizable/);
  assert.match(pane, /splitPaneResizerOrientation/);
  assert.match(pane, /:data-resizable="isSplitResizable \? 'true' : 'false'"/);
  assert.match(pane, /:style="splitWorkbenchStyle"/);
  assert.match(pane, /<template v-for="\(\s*pane,\s*index\s*\) in visiblePaneSessions"/);
  assert.match(pane, /class="terminal-split-pane-resizer"/);
  assert.match(pane, /role="separator"/);
  assert.match(pane, /:aria-valuenow="splitPaneRatio"/);
  assert.match(pane, /@pointerdown="startSplitPaneResize"/);
  assert.match(pane, /@keydown="resizeSplitPaneFromKeyboard"/);
  assert.match(pane, /function startSplitPaneResize\(event: PointerEvent\): void/);
  assert.match(pane, /function updateSplitPaneRatioFromPointer\(event: PointerEvent\): void/);
  assert.match(pane, /function resizeSplitPaneFromKeyboard\(event: KeyboardEvent\): void/);
  assert.match(pane, /function clampSplitPaneRatio\(ratio: number\): number/);
  assert.match(pane, /function readSplitPaneRatioPreference\(\): number \| null/);
  assert.match(pane, /function writeSplitPaneRatioPreference\(ratio: number\): void/);
  assert.match(pane, /function shouldShowPaneResizer\(index: number\): boolean/);
  assert.match(pane, /\(e: 'setPaneLayout', layout: TerminalMultiPaneLayout\): void;/);
  assert.doesNotMatch(pane, /\(e: 'focusPane', sessionId: string\): void;/);
  assert.match(pane, /@click="setPaneLayoutFromMenu\('columns'\)"/);
  assert.match(pane, /@click="setPaneLayoutFromMenu\('rows'\)"/);
  assert.match(pane, /@click="setPaneLayoutFromMenu\('grid'\)"/);
  assert.match(pane, /function setPaneLayoutFromMenu\(layout: TerminalMultiPaneLayout\): void/);
  assert.match(pane, /function closeStageMenu\(\): void/);
  assert.match(pane, /stageMenuRef\.value\?\.removeAttribute\('open'\)/);
  assert.match(pane, /function toggleStageMenu\(\): void/);
  assert.match(pane, /function syncStageMenuState\(\): void/);
  assert.match(pane, /function closeStageMenuFromOutside\(event: PointerEvent\): void/);
  assert.match(pane, /function pasteClipboardFromMenu\(\): void \{[\s\S]*pasteClipboard\(\);[\s\S]*closeStageMenu\(\);/);
  assert.match(pane, /function openResourceExplorerFromMenu\(\): void \{[\s\S]*emit\('openResourceExplorer'\);[\s\S]*closeStageMenu\(\);/);
  assert.match(pane, /function openInspectorFromMenu\(\): void \{[\s\S]*emit\('openInspector'\);[\s\S]*closeStageMenu\(\);/);
  assert.match(pane, /function clearTerminalFromMenu\(\): void \{[\s\S]*clearTerminal\(\);[\s\S]*closeStageMenu\(\);/);
  assert.match(pane, /function endActiveSessionFromMenu\(\): void \{[\s\S]*endActiveSession\(\);[\s\S]*closeStageMenu\(\);/);
  assert.match(pane, /function setPaneLayoutFromMenu\(layout: TerminalMultiPaneLayout\): void \{[\s\S]*emit\('setPaneLayout', layout\);[\s\S]*closeStageMenu\(\);/);
  assert.doesNotMatch(pane, /function focusActivePane\(\): void/);
  assert.match(pane, /<header v-if="visiblePaneSessions\.length > 1" class="terminal-split-pane__bar">/);
  assert.match(pane, /:title="paneTooltipLabel\(pane\)"/);
  assert.match(pane, /function paneTooltipLabel\(session: TerminalSessionDescriptor\): string/);
  assert.match(pane, /<X class="terminal-split-pane__close-icon"/);
  assert.doesNotMatch(pane, /paneStatusLabel\(pane\) \}\} · \{\{ formatTargetLabel\(pane\.targetKind\)/);
  assert.match(workspaceCss, /\.terminal-stage-header\s*\{[\s\S]*z-index:\s*12;[\s\S]*overflow:\s*visible;/);
  assert.match(workspaceCss, /\.terminal-stage-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-stage-header-actions\s*\{/);
  assert.match(workspaceCss, /\.terminal-session-main\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.doesNotMatch(workspaceCss, /\.terminal-session-context\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-session-sidecar\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-workbench\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-workbench\[data-layout='columns'\]\[data-resizable='true'\]\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, var\(--terminal-split-primary-size, 50%\)\) 6px minmax\(0, 1fr\);/);
  assert.match(workspaceCss, /\.terminal-split-workbench\[data-layout='rows'\]\[data-resizable='true'\]\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, var\(--terminal-split-primary-size, 50%\)\) 6px minmax\(0, 1fr\);/);
  assert.match(workspaceCss, /\.terminal-split-pane-resizer\s*\{[\s\S]*touch-action:\s*none;/);
  assert.match(workspaceCss, /\.terminal-split-pane-resizer\[data-orientation='vertical'\]\s*\{[\s\S]*cursor:\s*col-resize;/);
  assert.match(workspaceCss, /\.terminal-split-pane-resizer\[data-orientation='horizontal'\]\s*\{[\s\S]*cursor:\s*row-resize;/);
  assert.match(workspaceCss, /\.terminal-split-pane-resizer:hover::after,\s*\n\.terminal-split-pane-resizer:focus-visible::after\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-pane__bar\s*\{[\s\S]*min-height:\s*24px;[\s\S]*padding:\s*2px 5px;/);
  assert.match(workspaceCss, /\.terminal-split-pane__title\s*\{[\s\S]*display:\s*flex;[\s\S]*min-height:\s*20px;/);
  assert.doesNotMatch(workspaceCss, /\.terminal-split-pane__title span\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-pane__close\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/);
  assert.match(workspaceCss, /\.terminal-split-pane__close-icon\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-workbench\[data-pane-count='1'\] \.terminal-split-pane\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\);/);
  assert.match(workspaceCss, /\.terminal-tab-rail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(workspaceCss, /\.terminal-tab-scroll\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*padding-bottom:\s*0;/);
  assert.match(workspaceCss, /\.terminal-tab-rail-actions\s*\{[\s\S]*min-width:\s*max-content;/);
  assert.match(workspaceCss, /\.terminal-tab--dragging\s*\{/);
  assert.match(workspaceCss, /\.terminal-tab--drop-before::before,\s*\n\.terminal-tab--drop-after::after\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-pane--resource-drop\s*\{/);
  assert.match(workspaceCss, /\.terminal-split-pane--resource-drop::after\s*\{[\s\S]*border:\s*1px dashed/);
  assert.match(workspaceCss, /\.terminal-stage-action--menu\s*\{[\s\S]*min-width:\s*34px;[\s\S]*padding:\s*0;/);
  assert.match(workspaceCss, /\.terminal-stage-menu__panel\s*\{[\s\S]*min-width:\s*210px;/);
  assert.match(workspaceCss, /\.terminal-stage-menu__item\.active,\s*\n\.terminal-stage-menu__item\[aria-pressed='true'\]\s*\{/);
  assert.match(workspaceCss, /\.terminal-stage-menu__section\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*4px;/);
  assert.match(workspaceCss, /\.terminal-stage-menu__section-label\s*\{[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*600;/);
  assert.match(workspaceCss, /\.terminal-shortcut-menu__panel\s*\{[\s\S]*z-index:\s*60;[\s\S]*backdrop-filter:\s*none;/);
  assert.doesNotMatch(pane, /Ctrl\+C/);
  assert.doesNotMatch(pane, /Ctrl\+L/);
  assert.doesNotMatch(pane, /Ctrl\+D/);
  assert.doesNotMatch(pane, /Ctrl\+Z/);
  assert.doesNotMatch(pane, /Ctrl\+U/);
  assert.doesNotMatch(pane, /Ctrl\+K/);
  assert.match(pane, /terminal-shortcut-menu/);
  assert.match(pane, /function pasteClipboard\(\): void/);
  assert.match(pane, /function pasteClipboardFromMenu\(\): void/);
  assert.doesNotMatch(pane, /Focus active pane|聚焦当前窗格/);
  assert.match(pane, /Force End/);
  assert.match(pane, /setConsolePageRef/);
  assert.match(pane, /consolePages/);
  assert.match(pane, /:restore-transcript="pane\.sessionId === resolvedActiveSession\?\.sessionId \? shouldRestoreTranscript : shouldRestoreTranscriptFor\(pane\)"/);
  assert.match(pane, /const shouldRestoreTranscript = computed\(\(\) =>/);
  assert.match(pane, /session\.status !== 'running' \|\| Boolean\(session\.recentOutputSummary\?\.tailText\)/);
  assert.match(pane, /insertTerminalText: \(value: string\) => boolean;/);
  assert.match(pane, /refreshTerminalLayout: \(\) => void;/);
  assert.doesNotMatch(pane, /sendTerminalShortcut: \(key: string\) => boolean;/);
  assert.match(pane, /pasteClipboard: \(\) => Promise<boolean>;/);
  assert.match(pane, /function focusActiveTerminal\(\): void/);
  assert.match(pane, /const consolePage = getActiveConsolePage\(\);[\s\S]*consolePage\?\.refreshTerminalLayout\(\);[\s\S]*consolePage\?\.focusTerminal\(\);/);
  assert.match(pane, /function resolveTargetSessionId\(sessionId = ''\): string/);
  assert.match(pane, /function getConsolePageForSession\(sessionId = ''\): ConsolePageHandle \| null/);
  assert.match(pane, /function insertTerminalPaths\(paths: string\[\], sessionId = ''\): boolean/);
  assert.match(pane, /terminalCollapsed\.value = false;[\s\S]*previewMaximized\.value = false;[\s\S]*const textToInsert = `\$\{quotedPaths\.join\(' '\)\} `;/);
  assert.match(pane, /type ResizePointerSnapshot = \{/);
  assert.match(pane, /let previewResizeFrame: number \| null = null;/);
  assert.match(pane, /let splitResizeFrame: number \| null = null;/);
  assert.match(pane, /previewResizeFrame = window\.requestAnimationFrame\(flushPreviewResizeFromPointer\)/);
  assert.match(pane, /splitResizeFrame = window\.requestAnimationFrame\(flushSplitPaneRatioFromPointer\)/);
  assert.match(pane, /window\.cancelAnimationFrame\(previewResizeFrame\)/);
  assert.match(pane, /window\.cancelAnimationFrame\(splitResizeFrame\)/);
  assert.match(pane, /TERMINAL_PATH_INSERT_RETRY_LIMIT = 20/);
  assert.match(pane, /TERMINAL_PATH_INSERT_RETRY_MS = 80/);
  assert.match(pane, /if \(tryInsertTerminalText\(targetId, textToInsert\)\) return true;[\s\S]*scheduleDeferredTerminalPathInsert\(targetId, textToInsert\);[\s\S]*return true;/);
  assert.match(pane, /function tryInsertTerminalText\(targetId: string, textToInsert: string\): boolean/);
  assert.match(pane, /const inserted = Boolean\(targetConsole\?\.insertTerminalText\(textToInsert\)\);[\s\S]*targetConsole\?\.focusTerminal\(\);/);
  assert.match(pane, /function scheduleDeferredTerminalPathInsert\([\s\S]*attempt = 0,[\s\S]*\): void \{[\s\S]*void nextTick\(\(\) => \{[\s\S]*tryInsertTerminalText\(targetId, textToInsert\)[\s\S]*attempt >= TERMINAL_PATH_INSERT_RETRY_LIMIT[\s\S]*setTimeout\(\(\) => \{[\s\S]*scheduleDeferredTerminalPathInsert\(targetId, textToInsert, attempt \+ 1\);[\s\S]*\}, TERMINAL_PATH_INSERT_RETRY_MS\);/);
  assert.match(pane, /function clearTerminalPathInsertRetryTimers\(\): void/);
  assert.match(pane, /clearTerminalPathInsertRetryTimers\(\);/);
  assert.match(pane, /defineExpose\(\{\s*focusActiveTerminal,\s*showTerminal,\s*showEditor,\s*insertTerminalPaths,\s*\}\)/);
  assert.match(pane, /resourceDropSessionId/);
  assert.match(pane, /handlePaneDrop/);
  assert.match(pane, /handlePaneDragLeave/);
  assert.match(pane, /canAcceptTerminalResourceDrop/);
  assert.match(pane, /canAcceptTerminalResourceDropTypes/);
  assert.match(pane, /collectTerminalResourceDropPaths/);
  assert.match(pane, /shellQuoteTerminalPath/);
  assert.match(pane, /event\.dataTransfer\?\.getData\('text\/uri-list'\)/);
  assert.match(pane, /quotedPaths\.join\(' '\)/);
  assert.match(pane, /'terminal-split-pane--resource-drop': resourceDropSessionId === pane\.sessionId/);
  assert.match(pane, /@dragover="handlePaneDragOver\(\$event, pane\.sessionId\)"/);
  assert.match(pane, /@dragleave="handlePaneDragLeave\(\$event, pane\.sessionId\)"/);
  assert.match(pane, /@drop="handlePaneDrop\(\$event, pane\.sessionId\)"/);
  assert.doesNotMatch(pane, /@dragover\.prevent="handlePaneDragOver"/);
  assert.doesNotMatch(pane, /function sendShortcut\(key: string\): void/);
  assert.match(pane, /function clearTerminal\(\): void/);
  assert.match(pane, /function endActiveSession\(\): void/);
  assert.doesNotMatch(workspaceCss, /\.terminal-stage-menu__item strong\s*\{/);
  assert.doesNotMatch(pane, /terminal-session-actions/);
  assert.match(terminalResourceTransfer, /TERMINAL_TAB_DRAG_MIME/);
  assert.match(terminalResourceTransfer, /TERMINAL_FILE_PREVIEW_DRAG_MIME/);
  assert.match(terminalResourceTransfer, /function canAcceptTerminalResourceDropTypes/);
  assert.match(terminalResourceTransfer, /function isLikelyTerminalDropPath/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="pane\.sessionId"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:embedded="true"/,
  );
  assert.doesNotMatch(pane, /show-toolbar/);
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
  assert.doesNotMatch(terminalRouteSync, /source: "linked_context"/);
  assert.doesNotMatch(terminalRouteSync, /title: normalized/);
  assert.match(terminalRouteSync, /Do not synthesize a route-only session/);
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
  assert.match(workspacePage, /@split-session="handleSplitSession"/);
  assert.match(workspacePage, /@set-pane-layout="handlePaneLayoutChange"/);
  assert.doesNotMatch(workspacePage, /@focus-pane="handleFocusPane"/);
  assert.match(workspacePage, /@reorder-session="reorderSession"/);
  assert.match(workspacePage, /@close-pane="handleClosePane"/);
  assert.match(workspacePage, /@open-resource-explorer="openResourceExplorerPanel"/);
  assert.match(workspacePage, /@open-inspector="openInspectorPanel"/);
  assert.match(workspacePage, /renameTerminalSession/);
  assert.match(workspacePage, /deleteTerminalSession/);
  assert.match(workspacePage, /endTerminalSession/);
  assert.match(workspacePage, /@select-session="handleSessionSelect"/);
  assert.match(workspacePage, /@close-session="handleSessionClose"/);
  assert.match(workspacePage, /async function handleSessionSelect\(sessionId: string\): Promise<void>/);
  assert.match(workspacePage, /function handleSessionClose\(sessionId: string\): void/);
  assert.match(workspacePage, /async function navigateToSession\(sessionId: string \| null \| undefined\): Promise<void>/);
  assert.match(workspacePage, /await router\.push\(\{ path: targetPath \}\)/);
  assert.match(workspacePage, /function clearStoredTerminalSessionId/);
  assert.match(workspacePage, /sessionStorage\.removeItem\(TERMINAL_SESSION_STORAGE_KEY\)/);
  assert.match(workspacePage, /TERMINAL_MAX_SPLIT_PANES = 4/);
  assert.match(workspacePage, /function buildNextSplitPaneSessionIds\(/);
  assert.match(workspacePage, /\.slice\(0, TERMINAL_MAX_SPLIT_PANES\)/);
  assert.match(workspacePage, /function resolveSplitPaneLayout\(/);
  assert.match(workspacePage, /return paneCount > 2 \? 'grid' : requestedLayout;/);
  assert.match(workspacePage, /async function handleSplitSession/);
  assert.match(workspacePage, /const currentPaneIds = \[\.\.\.workspace\.paneSessionIds\.value\];/);
  assert.match(workspacePage, /const nextPaneIds = buildNextSplitPaneSessionIds\(currentPaneIds, sourceId, splitSessionId\);/);
  assert.match(workspacePage, /workspace\.setPaneSessions\(nextPaneIds\);/);
  assert.match(workspacePage, /workspace\.setPaneLayout\(resolveSplitPaneLayout\(layout, nextPaneIds\.length\)\);/);
  assert.match(workspacePage, /function handlePaneLayoutChange\(layout: Exclude<TerminalPaneLayout, 'single'>\): void/);
  assert.doesNotMatch(workspacePage, /async function handleFocusPane\(sessionId: string\): Promise<void>/);
  assert.doesNotMatch(workspacePage, /workspace\.setPaneSessions\(\[normalized\]\)/);
  assert.doesNotMatch(workspacePage, /workspace\.setPaneSessions\(\[sourceId, splitSessionId\]\)/);
  assert.match(workspacePage, /function reorderSession\(payload: \{ sessionId: string; targetIndex: number \}\): void/);
  assert.match(workspacePage, /workspace\.moveTab\(normalized, payload\.targetIndex\);/);
  assert.match(workspacePage, /function handleClosePane\(sessionId: string\): void/);
  assert.doesNotMatch(workspacePage, /pendingLocalSessionIds/);
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
  assert.match(inspectorContent, /terminal-inspector-commandbar/);
  assert.doesNotMatch(inspectorContent, /terminal-panel-status/);
  assert.doesNotMatch(inspectorContent, /terminal-inspector-switcher/);
  assert.match(inspectorContent, /terminal-inspector-profile-menu/);
  assert.match(inspectorContent, /terminal-inspector-command-menu/);
  assert.match(inspectorContent, /terminal-inspector-command-item/);
  assert.match(inspectorContent, /triggerActionFromMenu/);
  assert.doesNotMatch(inspectorContent, /TerminalActionPanel/);
  assert.doesNotMatch(inspectorContent, /inspectorSection === 'actions'/);
  assert.doesNotMatch(inspectorContent, /terminal-missing-deps-panel/);
  assert.doesNotMatch(inspectorContent, /技能依赖已就绪/);
  assert.doesNotMatch(inspectorContent, /Agent CLI \/ 技能|Agent CLI \/ Skills/);
  assert.match(inspectorContent, /terminal-inspector-tooling/);
  assert.match(inspectorContent, /terminal-binary-list/);
  assert.match(inspectorContent, /terminal-inspector-section-header--compact/);
  assert.match(inspectorContent, /v-if="missingDependencyRows\.length" class="terminal-missing-deps"/);
  assert.match(inspectorContent, /launchableTerminalProfiles/);
  assert.doesNotMatch(inspectorContent, /\$emit\('launchCli'/);
  assert.doesNotMatch(workspacePage, /launchableCliIds/);
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

test("terminal install feedback opens logs in a floating sheet", () => {
  assert.match(inspectorContent, /<Teleport v-if="installOutputOpen && installFeedback\.logs\.length" to="body">/);
  assert.match(inspectorContent, /class="terminal-install-output-dock"/);
  assert.match(inspectorContent, /class="terminal-install-output-sheet"/);
  assert.match(inspectorContent, /copyTextToClipboard\(installOutputText\.value\)/);
  assert.match(inspectorContent, /function openInstallOutputSheet\(\): void/);
  assert.match(inspectorContent, /完整命令和输出已放入浮动窗口/);
  assert.doesNotMatch(inspectorContent, /<pre v-if="installFeedback\.logs\.length"/);
  assert.match(workspaceCss, /\.terminal-install-output-dock\s*\{/);
  assert.match(workspaceCss, /\.terminal-install-output-log\s*\{/);
  assert.match(workspaceCss, /\.terminal-install-feedback__summary\s*\{/);
  assert.doesNotMatch(workspaceCss, /\.terminal-install-feedback pre/);
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
  assert.match(workspacePage, /:pane-sessions="paneSessions"/);
  assert.match(workspacePage, /:pane-layout="workspace\.paneLayout\.value"/);
  assert.match(pane, /tabs: TerminalSessionDescriptor\[\]/);
  assert.match(pane, /activeSessionId: string \| null/);
  assert.match(pane, /activeSession: TerminalSessionDescriptor \| null/);
  assert.match(pane, /paneSessions: TerminalSessionDescriptor\[\]/);
  assert.match(pane, /paneLayout: TerminalPaneLayout/);
  assert.match(pane, /const resolvedActiveSession = computed\(\(\) =>/);
  assert.match(pane, /props\.activeSession \?\? activeSession\.value/);
  assert.match(pane, /\(\) => \[props\.activeSessionId, props\.activeSession\?\.sessionId \|\| ''\] as const/);
  assert.match(pane, /if \(providedSessionId === normalized\) \{\s*activeSession\.value = null;\s*return;\s*\}/);
  assert.match(
    pane,
    /<TerminalConsolePage[\s\S]*:session-id="pane\.sessionId"[\s\S]*:queued-command="props\.queuedCommand"[\s\S]*:embedded="true"/,
  );
  assert.doesNotMatch(pane, /show-toolbar/);
});
