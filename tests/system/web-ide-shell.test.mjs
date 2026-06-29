import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const read = (rel) =>
  fs.readFileSync(
    new URL(`../../apps/web/src/${rel}`, import.meta.url),
    "utf-8",
  );

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/${rel}`, import.meta.url), "utf-8");

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

// ---------------------------------------------------------------------------
// Workspace is the single IDE route; old /ide and /files feature shells are gone.
// ---------------------------------------------------------------------------

test("/workspace renders the Dockview/Monaco WorkspaceWorkbench", () => {
  const router = read("app/router.tsx");
  const page = read("features/workspace/WorkspacePage.tsx");
  assert.match(router, /path=["']\/workspace["']/);
  assert.match(router, /import \{ WorkspacePage \} from/);
  assert.match(router, /LazyPage><WorkspacePage/);
  assert.doesNotMatch(router, /const WorkspacePage = React\.lazy/);
  assert.doesNotMatch(router, /path=["']\/ide["']/);
  assert.doesNotMatch(router, /path=["']\/files["']/);
  assert.match(page, /WorkspaceWorkbench/);
});

test("WorkspaceWorkbench imports Dockview and wires core panels", () => {
  const workbench = read("features/workspace/workbench/WorkspaceWorkbench.tsx");
  assert.match(workbench, /DockviewReact/);

  assert.match(workbench, /singleTabMode="default"/);
  const workbenchCss = read(
    "features/workspace/workbench/workspace-workbench.css",
  );
  assert.match(workbenchCss, /dv-tabs-and-actions-container\.dv-single-tab/);
  assert.match(workbenchCss, /duplicate the active document title/);
  assert.match(workbench, /dockview-react\/dist\/styles\/dockview\.css/);
  assert.match(workbench, /editor:\s*WorkspaceEditorDockPanel/);
  assert.match(workbench, /terminal:\s*WorkspaceTerminalDockPanel/);
  assert.match(workbench, /explorer:\s*WorkspaceExplorerDockPanel/);
  assert.match(workbench, /search:\s*WorkspaceSearchDockPanel/);
  assert.match(workbench, /git:\s*WorkspaceGitDockPanel/);
  assert.match(workbench, /function WorkspaceSideDockPanel/);
  assert.match(workbench, /data-workspace-side-dock-panel=\{panel\}/);
  assert.match(workbench, /WorkspaceEditorDockContext/);
  assert.match(workbench, /React\.useContext\(WorkspaceEditorDockContext\)/);
  assert.match(workbench, /type WorkspaceGitDiffTarget/);
  assert.match(workbench, /gitDiffTarget: WorkspaceGitDiffTarget \| null/);
  assert.match(workbench, /setGitDiffTarget\(null\)/);
  assert.match(workbench, /setGitDiffTarget\(target\)/);
  assert.match(workbench, /setActivePath\(target\.path\)/);
  assert.match(workbench, /isWorkspaceGitDiffTarget/);
  assert.match(workbench, /gitDiffTarget=\{context\.gitDiffTarget\}/);
  assert.match(workbench, /openFile=\{context\.activePath\}/);
  assert.match(workbench, /const LazyWorkspaceTerminal = React\.lazy/);
  assert.match(workbench, /正在加载终端引擎/);
  assert.doesNotMatch(workbench, /import \{ WorkspaceTerminal \} from/);
  assert.doesNotMatch(workbench, /preview:\s*\(\)\s*=>/);
  assert.doesNotMatch(workbench, /label=["']预览["']/);
  for (const sideComponent of ["explorer", "search", "git"]) {
    assert.doesNotMatch(
      workbench,
      new RegExp(`${sideComponent}:\\s*\\(\\)\\s*=>`),
    );
  }
  assert.match(workbench, /type SidePanel = "explorer" \| "search" \| "git"/);
  assert.match(
    workbench,
    /type DockPanel = "editor" \| "terminal" \| SidePanel/,
  );
  assert.match(workbench, /dockSidePanel/);
  assert.match(workbench, /isSideDockPanel/);
  assert.match(workbench, /onDockSide=\{dockSidePanel\}/);
  assert.match(workbench, /data-workspace-activity-dock-context/);
  assert.match(workbench, /data-workspace-mobile-nav-long-press-menu/);
  assert.match(workbench, /longPressTimerRef/);
  assert.match(workbench, /longPressTriggeredRef/);
  assert.match(workbench, /window\.setTimeout\(\(\) => \{/);
  assert.match(workbench, /长按打开操作菜单/);
  assert.match(workbench, /data-workspace-mobile-nav-action-menu/);
  assert.match(workbench, /data-workspace-mobile-nav-action="open"/);
  assert.match(workbench, /data-workspace-mobile-nav-action="dock"/);
  assert.match(workbench, /data-workspace-mobile-nav-action="half"/);
  assert.match(workbench, /data-workspace-mobile-nav-action="fullscreen"/);
  assert.match(workbench, /data-workspace-mobile-nav-action="close-panel"/);
  assert.match(
    workbench,
    /mobilePanelHeightVh=\{panelSizes\.mobilePanelHeightVh\}/,
  );
  assert.match(workbench, /onSetMobilePanelHeight=\{resizeMobilePanel\}/);
  assert.match(workbench, /onCloseSidePanel=\{\(\) => setSideOpen\(false\)\}/);
  assert.match(workbench, /setMobilePanelSnap/);
  assert.match(workbench, /onSetMobilePanelHeight\(heightVh\)/);
  assert.match(
    workbench,
    /onHalf=\{\(\) => setMobilePanelSnap\(actionPanel, 58\)\}/,
  );
  assert.match(
    workbench,
    /onFullscreen=\{\(\) => setMobilePanelSnap\(actionPanel, 100\)\}/,
  );
  assert.match(workbench, /heightVh >= FULLSCREEN_MOBILE_PANEL_HEIGHT/);
  assert.match(workbench, /半屏查看/);
  assert.match(workbench, /拉到顶部全屏/);
  assert.match(workbench, /关闭当前面板/);
  assert.match(workbench, /停靠到工作区/);
  assert.match(workbench, /component: "explorer"/);
  assert.match(workbench, /component: "search"/);
  assert.match(workbench, /component: "git"/);
  assert.match(workbench, /sideOpen/);
  assert.match(workbench, /WorkbenchSidePanel/);
  assert.match(workbench, /createDefaultLayout/);
  assert.match(
    workbench,
    /api\.addPanel\(\{ id: "editor", component: "editor", title: "Editor" \}\)/,
  );
  const defaultLayoutBody =
    /function createDefaultLayout\(api: DockviewApi\) \{([\s\S]*?)\n\}/.exec(
      workbench,
    )?.[1] ?? "";
  assert.doesNotMatch(defaultLayoutBody, /component: "terminal"/);
  assert.match(workbench, /tracevane\.workspace\.dockview\.v2/);
  assert.match(workbench, /tracevane\.workspace\.panel-sizes\.v1/);
  assert.match(workbench, /DEFAULT_SIDE_PANEL_WIDTH/);
  assert.match(workbench, /MIN_SIDE_PANEL_WIDTH/);
  assert.doesNotMatch(workbench, /MAX_SIDE_PANEL_WIDTH/);
  assert.match(workbench, /DEFAULT_MOBILE_PANEL_HEIGHT/);
  assert.match(workbench, /loadWorkspacePanelSizes/);
  assert.match(workbench, /storeWorkspacePanelSizes/);
  assert.match(workbench, /data-workspace-side-panel-resizer/);
  assert.match(workbench, /data-workspace-mobile-panel-resizer/);
  assert.match(workbench, /data-workspace-mobile-panel-height/);
  assert.match(workbench, /data-workspace-mobile-panel-fullscreen/);
  assert.match(workbench, /mobileSidePanelOverTerminal/);
  assert.match(workbench, /maximizedDockPanel === "terminal"/);
  assert.match(workbench, /browserFullscreenPanel === "terminal"/);
  assert.match(workbench, /overTerminal=\{mobileSidePanelOverTerminal\}/);
  assert.match(workbench, /overTerminal\?: boolean/);
  assert.match(workbench, /data-workspace-mobile-panel-over-terminal/);
  assert.match(workbench, /overTerminal && "z-\[110\]"/);
  assert.match(workbench, /fullscreen && overTerminal && "z-\[120\]"/);
  assert.match(workbench, /data-workspace-mobile-panel-reserves-nav/);
  assert.match(workbench, /data-workspace-mobile-panel-nav-reserved/);
  assert.match(workbench, /--workspace-mobile-nav-height/);
  assert.match(workbench, /bottom-\[var\(--workspace-mobile-nav-height\)\]/);
  assert.doesNotMatch(workbench, /fixed inset-0 z-\[80\] h-dvh/);
  assert.match(workbench, /data-workspace-mobile-panel-snap-controls/);
  assert.match(workbench, /data-workspace-mobile-panel-snap=\{point\}/);
  assert.match(workbench, /MOBILE_PANEL_SNAP_POINTS/);
  assert.match(workbench, /MOBILE_PANEL_DRAG_UPDATE_THRESHOLD = 0\.6/);
  assert.match(workbench, /lastCommittedHeight/);
  assert.match(workbench, /commitPendingHeight/);
  assert.match(workbench, /data-workspace-mobile-panel-content/);
  assert.match(workbench, /MAX_MOBILE_PANEL_HEIGHT = 100/);
  assert.match(workbench, /FULLSCREEN_MOBILE_PANEL_HEIGHT = 96/);
  assert.match(workbench, /\[30, 42, 58, 76, 100\]/);
  assert.match(workbench, /document\.fullscreenElement/);
  assert.match(workbench, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  assert.match(workbench, /document\.exitFullscreen\(\)/);
  assert.match(workbench, /data-workspace-browser-fullscreen-panel/);
  assert.match(workbench, /data-workspace-project-navigation-trigger/);
  assert.match(workbench, /data-workspace-project-navigation-menu/);
  assert.match(workbench, /data-workspace-project-navigation-dismissable/);
  assert.match(
    workbench,
    /window\.addEventListener\("pointerdown", onPointerDown\)/,
  );
  assert.match(workbench, /event\.key === "Escape"/);
  assert.match(workbench, /navItemsByGroup/);
  assert.match(workbench, /href=\{`#\$\{item\.path\}`\}/);
  assert.match(
    workbench,
    /data-workspace-project-navigation-link=\{item\.path\}/,
  );

  const commands = read("features/workspace/workbench/workspaceCommands.tsx");
  assert.match(
    commands,
    /dockSidePanel\?: \(panel: WorkspaceSidePanelCommand\) => void/,
  );
  assert.match(commands, /id: "workspace\.files\.dock"/);
  assert.match(commands, /id: "workspace\.search\.dock"/);
  assert.match(commands, /id: "workspace\.git\.dock"/);
  assert.match(commands, /dockSidePanel\?\.\("explorer"\)/);
  assert.match(commands, /dockSidePanel\?\.\("search"\)/);
  assert.match(commands, /dockSidePanel\?\.\("git"\)/);
  assert.match(commands, /id: "workspace\.files\.maximize"/);
  assert.match(commands, /id: "workspace\.search\.maximize"/);
  assert.match(commands, /id: "workspace\.git\.maximize"/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("explorer"\)/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("search"\)/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("git"\)/);
  assert.match(commands, /id: "workspace\.files\.closePanel"/);
  assert.match(commands, /id: "workspace\.search\.closePanel"/);
  assert.match(commands, /id: "workspace\.git\.closePanel"/);
  assert.match(commands, /closeDockPanel\?\.\("explorer"\)/);
  assert.match(commands, /closeDockPanel\?\.\("search"\)/);
  assert.match(commands, /closeDockPanel\?\.\("git"\)/);
  assert.match(workbench, /terminalDockOpen/);
  assert.match(
    workbench,
    /setTerminalDockOpen\(Boolean\(event\.api\.getPanel\("terminal"\)\)\)/,
  );
  assert.match(
    workbench,
    /if \(panel === "terminal"\) setTerminalDockOpen\(true\)/,
  );
  assert.match(
    workbench,
    /if \(panel === "terminal"\) setTerminalDockOpen\(false\)/,
  );
  assert.match(
    workbench,
    /setBrowserFullscreenPanel\(\(current\) =>[\s\S]*current === panel \? null : current/,
  );
  assert.match(workbench, /document\.exitFullscreen\(\)\.catch/);
  assert.match(workbench, /terminalOpen=\{terminalDockOpen\}/);
  assert.match(workbench, /label=\{terminalOpen \? "收起" : "终端"\}/);
  assert.match(workbench, /active=\{terminalOpen\}/);
  assert.match(workbench, /focusMobileEditorCanvas/);
  assert.match(workbench, /activateEditorNav/);
  assert.match(
    workbench,
    /onOpenCommandPalette=\{\(\) => setCommandPaletteOpen\(true\)\}/,
  );
  assert.match(
    workbench,
    /!sideOpen && !terminalOpen[\s\S]*onOpenCommandPalette\(\)/,
  );
  assert.match(workbench, /setSideOpen\(false\)/);
  assert.match(workbench, /onFocusEditor=\{focusMobileEditorCanvas\}/);
  assert.match(
    workbench,
    /data-workspace-mobile-nav-overlay=\{overlay \? "true" : "false"\}/,
  );
  assert.match(workbench, /active=\{!sideOpen && !terminalOpen\}/);
  assert.match(
    workbench,
    /label=\{!sideOpen && !terminalOpen \? "命令" : "编辑"\}/,
  );
  assert.match(workbench, /titleOverride=/);
  assert.match(workbench, /dataAttr="editor-command-or-focus"/);
  assert.match(workbench, /data-workspace-mobile-nav-button=\{dataAttr\}/);
  assert.match(workbench, /data-workspace-dock-quick-button=\{dataAttr\}/);
  assert.match(workbench, /WORKSPACE_DOCK_CONTROLS_COLLAPSED_STORAGE_KEY/);
  assert.match(workbench, /tracevane\.workspace\.dock-controls-collapsed\.v1/);
  assert.match(workbench, /loadWorkspaceDockControlsCollapsed/);
  assert.match(workbench, /storeWorkspaceDockControlsCollapsed/);
  assert.match(workbench, /data-workspace-dock-controls-collapsed/);
  assert.match(workbench, /data-workspace-dock-controls-edge-toggle/);
  assert.match(workbench, /dataAttr="collapse-controls"/);
  assert.match(workbench, /展开工作台悬浮控件/);
  assert.match(workbench, /browser-fullscreen/);
  assert.match(workbench, /dataAttr="side-panel-compose"/);
  assert.match(workbench, /dataAttr="terminal-compose"/);
  assert.match(workbench, /onDockSidePanel=\{dockSidePanel\}/);
  assert.match(workbench, /onToggleSidePanel=\{openSidePanel\}/);
  assert.match(
    workbench,
    /onToggleTerminal=\{\(\) => focusDockPanel\("terminal"\)\}/,
  );
  assert.match(
    workbench,
    /label=\{`将\$\{sidePanelTitle\(activeSidePanel\)\}停靠到工作区`\}/,
  );
  assert.match(workbench, /toggleMaximizedDockPanel\(panel\)/);
  assert.doesNotMatch(
    workbench,
    /if \(maximizedDockPanelRef\.current !== panel\)[\s\S]*toggleMaximizedDockPanel\(panel\);/,
  );
  assert.match(workbench, /window\.visualViewport\?\.height/);
  assert.match(workbench, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(
    workbench,
    /data-workspace-mobile-panel-resizing=\{dragging \? "true" : "false"\}/,
  );
  assert.match(workbench, /requestAnimationFrame/);
  assert.match(workbench, /snapMobilePanelHeight/);
  assert.match(workbench, /touch-none/);
  assert.match(workbench, /WorkbenchSidePanelResizeHandle/);
  assert.match(
    workbench,
    /onResize\(startWidth \+ moveEvent\.clientX - startX\)/,
  );
  assert.match(
    workbench,
    /sidePanelWidth: Math\.max\(width, MIN_SIDE_PANEL_WIDTH\)/,
  );
  assert.match(workbench, /onResize\(snapMobilePanelHeight\(pendingHeight\)\)/);
  assert.match(workbench, /--workspace-mobile-panel-height/);
  assert.match(workbench, /WorkspaceOpenFileOptions/);
  assert.match(workbench, /activePathRootId/);
  assert.match(
    workbench,
    /setActivePathRootId\(options\?\.rootId \?\? rootId\)/,
  );
  assert.match(workbench, /rootId: activePathRootId \|\| rootId/);
  assert.match(workbench, /workspaceRootId: rootId/);
  assert.match(workbench, /workspaceRootId=\{context\.workspaceRootId\}/);
  assert.match(workbench, /WorkspaceEditorSearchRequest/);
  assert.match(workbench, /searchRequest/);
  const commandPalette = read(
    "features/workspace/workbench/WorkspaceCommandPalette.tsx",
  );
  const commandRegistry = read(
    "features/workspace/workbench/workspaceCommands.tsx",
  );
  const commandShortcuts = read(
    "features/workspace/workbench/workspaceCommandShortcuts.ts",
  );
  const keymap = read("features/workspace/workbench/workspaceKeymap.ts");
  assert.match(workbench, /WorkspaceCommandPalette/);
  assert.match(workbench, /commandPaletteOpen/);
  assert.match(workbench, /setCommandPaletteOpen\(\(open\) => !open\)/);
  assert.match(workbench, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(workbench, /event\.shiftKey && key === "p"/);
  assert.match(
    workbench,
    /runWorkspaceShortcutCommand\(event, workspaceCommands\)/,
  );
  assert.match(workbench, /loadWorkspaceKeymapOverrides/);
  assert.match(workbench, /applyWorkspaceKeymap/);
  assert.match(workbench, /getWorkspaceKeybindingConflicts/);
  assert.match(workbench, /storeWorkspaceKeymapOverrides\(\[\]\)/);
  assert.match(workbench, /keybindingConflicts=\{keybindingConflicts\}/);
  assert.doesNotMatch(workbench, /event\.altKey && key === "1"/);
  assert.doesNotMatch(workbench, /showSidePanel\("explorer"\)/);
  assert.match(workbench, /data-workspace-command-palette-trigger/);
  assert.match(commandPalette, /CommandDialog/);
  assert.match(commandPalette, /contentClassName="max-md:fixed/);
  assert.match(
    commandPalette,
    /commandClassName="max-md:max-h-\[min\(76dvh,42rem\)\]/,
  );
  assert.match(commandPalette, /data-workspace-command-palette-mobile-handle/);
  assert.match(commandPalette, /data-workspace-command-palette-mobile-sheet/);
  assert.match(
    commandPalette,
    /max-md:max-h-\[calc\(min\(76dvh,42rem\)-4\.25rem\)\]/,
  );
  assert.doesNotMatch(commandPalette, /createWorkspaceCommandRegistry/);
  assert.match(commandPalette, /WORKSPACE_COMMAND_GROUPS\.map/);
  assert.match(commandPalette, /data-workspace-command-palette/);
  const commandUi = read("design/ui/command.tsx");
  assert.match(commandUi, /interface CommandDialogProps/);
  assert.match(commandUi, /contentClassName\?: string/);
  assert.match(commandUi, /commandClassName\?: string/);
  assert.match(commandUi, /className=\{cn\([\s\S]*contentClassName/);
  assert.match(commandUi, /className=\{cn\([\s\S]*commandClassName/);
  assert.match(commandPalette, /data-workspace-keybinding-conflicts/);
  assert.match(commandPalette, /快捷键冲突/);
  assert.match(commandPalette, /data-workspace-command=\{command\.id\}/);
  assert.doesNotMatch(commandPalette, /id: "workspace\.files\.focus"/);
  assert.match(commandRegistry, /export interface WorkspaceCommand/);
  assert.match(
    commandRegistry,
    /export interface WorkspaceCommandRegistryInput/,
  );
  assert.match(commandRegistry, /WORKSPACE_COMMAND_GROUPS/);
  assert.match(commandRegistry, /createWorkspaceCommandRegistry/);
  assert.match(commandRegistry, /extensionCommands = \[\]/);
  assert.match(commandRegistry, /\.\.\.extensionCommands/);
  assert.match(commandRegistry, /"Git"/);
  assert.match(commandRegistry, /"终端"/);
  assert.match(commandRegistry, /"编辑器"/);
  assert.match(commandPalette, /disabled=\{command\.disabled\}/);
  assert.match(workbench, /gitCommands/);
  assert.match(workbench, /searchCommands/);
  assert.match(workbench, /terminalCommands/);
  assert.match(workbench, /editorCommands/);
  assert.match(workbench, /setGitCommands/);
  assert.match(workbench, /setSearchCommands/);
  assert.match(workbench, /setTerminalCommands/);
  assert.match(workbench, /setEditorCommands/);
  assert.match(workbench, /const workspaceCommands = React\.useMemo/);
  assert.match(workbench, /createWorkspaceCommandRegistry\(\{/);
  assert.match(
    workbench,
    /extensionCommands: \[\s*\.\.\.gitCommands,\s*\.\.\.searchCommands,\s*\.\.\.terminalCommands,\s*\.\.\.editorCommands,?\s*\]/,
  );
  assert.match(workbench, /commands=\{workspaceCommands\}/);
  assert.match(workbench, /onGitCommandsChange=\{registerGitCommands\}/);
  assert.match(workbench, /onSearchCommandsChange=\{registerSearchCommands\}/);
  assert.match(workbench, /onTerminalCommandsChange: registerTerminalCommands/);
  assert.match(workbench, /onEditorCommandsChange: registerEditorCommands/);
  assert.match(workbench, /onSearchCommandsChange: registerSearchCommands/);
  assert.match(workbench, /terminalInputRequest/);
  assert.match(workbench, /tracevane:workspace-terminal-insert-input/);
  assert.match(workbench, /setTerminalDockOpen\(true\)/);
  assert.match(
    workbench,
    /ensureDockPanel\(apiRef\.current, "terminal"\)\?\.api\.setActive\(\)/,
  );
  assert.match(
    workbench,
    /onCommandsChange=\{context\?\.onTerminalCommandsChange\}/,
  );
  assert.match(
    workbench,
    /onCommandsChange=\{context\.onEditorCommandsChange\}/,
  );
  assert.match(commandRegistry, /workspace\.files\.focus/);
  assert.match(commandRegistry, /workspace\.terminal\.open/);
  assert.match(commandRegistry, /workspace\.layout\.reset/);
  assert.match(commandRegistry, /workspace\.keymap\.reset/);
  assert.match(commandRegistry, /workspace\.ai\.context/);
  assert.match(commandRegistry, /@file \/ @terminal \/ @git \/ @selection/);
  assert.match(commandShortcuts, /findWorkspaceCommandForShortcut/);
  assert.match(commandShortcuts, /runWorkspaceShortcutCommand/);
  assert.match(commandShortcuts, /matchesWorkspaceShortcut/);
  assert.match(commandShortcuts, /parseWorkspaceShortcut/);
  assert.match(commandShortcuts, /command\.shortcut/);
  assert.match(commandShortcuts, /command\.disabled/);
  assert.match(commandShortcuts, /event\.preventDefault\(\)/);
  assert.match(keymap, /WORKSPACE_KEYMAP_STORAGE_KEY/);
  assert.match(keymap, /tracevane\.workspace\.keymap\.v1/);
  assert.match(keymap, /applyWorkspaceKeymap/);
  assert.match(keymap, /getWorkspaceKeybindingConflicts/);
  assert.match(keymap, /loadWorkspaceKeymapOverrides/);
  assert.match(keymap, /storeWorkspaceKeymapOverrides/);
  assert.match(keymap, /sanitizeWorkspaceKeymapOverrides/);
  assert.match(keymap, /normalizeWorkspaceKeybinding/);
});

test("Workspace side explorer exposes file-management toolbar capabilities", () => {
  const explorer = read("features/workspace/files/WorkspaceExplorer.tsx");
  const tree = read("features/workspace/files/FileTree.tsx");
  const upload = read("features/workspace/files/uploadManager.ts");
  const uploadUi = read("features/workspace/files/UploadManagerDialog.tsx");
  const uploadTaskStrip = read("features/workspace/files/UploadTaskStrip.tsx");
  const uploadTaskSnapshots = read(
    "features/workspace/files/uploadTaskSnapshots.ts",
  );
  const filesQuery = read("lib/query/files.ts");
  const searchPanel = read("features/workspace/files/WorkspaceSearchPanel.tsx");
  const searchCommands = read(
    "features/workspace/files/searchPanelCommands.tsx",
  );
  const workspaceWorkbench = read(
    "features/workspace/workbench/WorkspaceWorkbench.tsx",
  );
  const replaceDiff = read("features/workspace/shared/ReplaceDiffPreview.tsx");
  const propertiesDialog = read(
    "features/workspace/shared/FilePropertiesDialog.tsx",
  );
  assert.match(explorer, /data-workspace-explorer-scrollport/);
  assert.match(searchPanel, /data-workspace-search-scrollport/);
  assert.match(explorer, /FileActionsMenu/);
  assert.match(explorer, /filesKeys\.all/);
  assert.match(explorer, /type="file"/);
  assert.match(explorer, /folderInputRef/);
  assert.match(explorer, /setAttribute\("webkitdirectory"/);
  assert.match(explorer, /onUploadChange/);
  assert.match(explorer, /currentDirectory/);
  assert.match(explorer, /createUploadBatch/);
  assert.match(explorer, /UploadManagerDialog/);
  assert.match(explorer, /onUploadRequest/);
  assert.match(uploadUi, /onPasteFiles/);
  assert.match(uploadUi, /const dataTransfer = event\.clipboardData/);
  assert.match(uploadUi, /dataTransfer\?\.files\?\.length/);
  assert.match(uploadUi, /window\.addEventListener\("paste"/);
  assert.match(explorer, /handleExplorerPaste/);
  assert.match(explorer, /handleExplorerKeyDown/);
  assert.match(explorer, /FilePreviewDialog/);
  assert.match(explorer, /previewEntry/);
  assert.match(explorer, /useFileReadQuery/);
  assert.match(explorer, /fileEntryFromActionTarget/);
  assert.match(explorer, /onPreviewRequest=\{\(target\) =>/);
  assert.match(explorer, /onSelectFile\?\.\(path, \{ rootId \}\)/);
  assert.match(explorer, /previewEntry\?\.kind === "file" \? \(/);
  assert.doesNotMatch(
    explorer,
    /entry=\{previewEntry\?\.kind === "file" \? fileEntryFromActionTarget\(previewEntry\) : undefined\}/,
  );
  assert.match(explorer, /FilePropertiesDialog/);
  assert.match(explorer, /propertiesEntry/);
  assert.match(explorer, /onPropertiesRequest=\{setPropertiesEntry\}/);
  assert.match(explorer, /event\.altKey && key === "Enter" && activeEntry/);
  assert.match(explorer, /absoluteDisplayPath/);
  assert.match(propertiesDialog, /export function FilePropertiesDialog/);
  assert.match(propertiesDialog, /FilePropertiesEntry/);
  assert.match(propertiesDialog, /基本信息/);
  assert.match(explorer, /isEditableEventTarget/);
  assert.match(explorer, /key === "F2"/);
  assert.match(explorer, /key === "Delete" \|\| key === "Backspace"/);
  assert.match(explorer, /key === "F5"/);
  assert.match(explorer, /checkedEntries/);
  assert.match(explorer, /WorkspaceBulkActionBar/);
  assert.match(explorer, /WorkspaceBulkDialog/);
  assert.match(explorer, /setBulkDialog\(\{ kind: "delete" \}\)/);
  assert.match(explorer, /openBulkTransfer/);
  assert.match(explorer, /setBulkDialog\(\{ kind \}\)/);
  assert.match(explorer, /dryRunFileTransfer/);
  assert.match(explorer, /transferFiles/);
  assert.match(explorer, /FilesTransferConflictPolicy/);
  assert.match(explorer, /WorkspaceTransferDryRunSummary/);
  assert.match(explorer, /服务端预检/);
  assert.match(explorer, /同名冲突策略/);
  assert.match(explorer, /保留两者：自动生成 name \(1\)\.ext/);
  assert.match(explorer, /ops\.archive/);
  assert.match(explorer, /ops\.remove/);
  assert.match(explorer, /输入 DELETE 确认删除/);
  assert.match(explorer, /归档文件名（保存到当前目录）/);
  assert.match(explorer, /清空多选/);
  assert.match(explorer, /key === "ContextMenu"/);
  assert.match(explorer, /event\.shiftKey && key === "F10"/);
  assert.match(explorer, /findTreeRowMenuPoint/);
  assert.match(explorer, /key\.toLowerCase\(\) === "u"/);
  assert.match(explorer, /initialFlow=\{menu\.initialFlow\}/);
  assert.doesNotMatch(explorer, /onPaste=\{handlePaste\}/);
  assert.doesNotMatch(
    explorer,
    /onClick=\\{\\(\\) => fileInputRef\\.current\\?\\.click\\(\\)\\}/,
  );
  assert.doesNotMatch(explorer, /当前目录：/);
  assert.match(explorer, /setShowHidden/);
  assert.match(explorer, /setTreeVersion/);
  assert.match(tree, /showHidden/);

  assert.match(tree, /FileTypeIcon/);
  assert.match(tree, /fileIconEntry/);
  assert.match(tree, /hidden:\s*props\.showHidden/);
  assert.match(explorer, /treeVersion/);
  assert.match(explorer, /showHidden \? "hidden" : "visible"/);
  assert.match(explorer, /showHidden \? "隐藏隐藏文件" : "显示隐藏文件"/);
  assert.match(explorer, /useTouchActionSurface/);
  assert.match(explorer, /data-workspace-explorer-action-sheet/);
  assert.match(explorer, /data-workspace-explorer-action-sheet-scrollport/);
  assert.match(explorer, /onSelectFile\?\.\(path, \{ rootId \}\)/);
  assert.match(explorer, /data-workspace-explorer-touch-actions/);
  assert.match(explorer, /data-workspace-explorer-touch-action-group="target"/);
  assert.match(
    explorer,
    /data-workspace-explorer-touch-action-group="workspace"/,
  );
  assert.match(explorer, /data-workspace-explorer-touch-action-group="manage"/);
  assert.match(explorer, /overscroll-contain/);
  assert.match(explorer, /env\(safe-area-inset-bottom\)/);
  assert.match(explorer, /aria-label="文件操作列表"/);
  assert.match(explorer, /触屏文件操作/);
  assert.match(explorer, /手机端不依赖鼠标右键/);
  assert.match(
    explorer,
    /window\.matchMedia\("\(pointer: coarse\), \(max-width: 768px\)"\)/,
  );
  assert.match(explorer, /openWorkspaceDownload/);
  assert.doesNotMatch(tree, /onTouchStart/);
  assert.match(tree, /longPressRef/);
  assert.match(tree, /onPointerDown/);
  assert.match(tree, /onPointerMove/);
  assert.match(tree, /onPointerCancel=\{clearLongPressTimer\}/);
  assert.match(tree, /onDirectoryFocus/);
  assert.match(tree, /onActiveEntryChange/);
  assert.match(tree, /onDoubleClick=\{onOpen\}/);
  assert.match(tree, /onSelectRow/);
  assert.match(
    tree,
    /Fired when a row is explicitly opened \(double-click or Enter\)/,
  );
  assert.match(tree, /checkedPaths/);
  assert.match(tree, /onToggleChecked/);
  assert.match(tree, /aria-multiselectable/);
  assert.match(tree, /aria-checked/);
  assert.match(tree, /选择 \$\{name\}/);
  assert.match(tree, /case " ":/);
  assert.match(tree, /hidden:\s*props\.showHidden/);
  assert.match(tree, /const pageSize = 200/);
  assert.match(tree, /加载更多/);
  assert.match(tree, /setPage\(\(value\) => value \+ 1\)/);
  assert.match(tree, /renderLimit/);
  assert.match(tree, /显示更多已加载/);
  assert.match(upload, /initFileUpload/);
  assert.match(upload, /getFileUpload/);
  assert.match(upload, /uploadFileChunk/);
  assert.match(upload, /completeFileUpload/);
  assert.match(upload, /MAX_CONCURRENT_CHUNKS/);
  assert.match(upload, /localStorage/);
  assert.match(upload, /CHECKPOINT_PREFIX/);
  assert.match(upload, /getUploadCheckpointStorageKey/);
  assert.match(upload, /UPLOAD_CHUNK_SIZE_BYTES/);
  assert.match(upload, /subtle\.digest\("SHA-256"/);
  assert.match(upload, /MAX_HASH_BYTES/);
  assert.doesNotMatch(upload, /readAsDataURL/);
  assert.match(upload, /resume/);
  assert.match(explorer, /conflictPolicy/);
  assert.match(uploadUi, /保留两者/);
  assert.match(explorer, /UploadTaskStrip/);
  assert.match(uploadTaskStrip, /上传任务/);
  assert.match(explorer, /WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadTaskSnapshots, /WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadTaskStrip, /待恢复上传/);
  assert.match(uploadTaskStrip, /重新选择文件恢复/);
  assert.match(explorer, /FileActionsMenu/);
  const fileActionsMenu = read("features/workspace/files/FileActionsMenu.tsx");
  assert.match(fileActionsMenu, /label="属性"/);
  assert.match(fileActionsMenu, /移入回收站/);
  assert.match(fileActionsMenu, /\.tracevane-trash/);
  assert.match(
    fileActionsMenu,
    /onPropertiesRequest\?: \(target: FileActionsMenuTarget\) => void/,
  );
  assert.match(
    fileActionsMenu,
    /onCopyNameRequest\?: \(target: FileActionsMenuTarget\) => void/,
  );
  assert.match(fileActionsMenu, /initialFlow = "menu"/);
  assert.match(fileActionsMenu, /setFlow\(open \? initialFlow : null\)/);
  assert.match(fileActionsMenu, /dryRunUnarchiveFile/);
  assert.match(fileActionsMenu, /UnarchiveDryRunSummary/);
  assert.match(fileActionsMenu, /解压预检/);
  assert.match(fileActionsMenu, /存在阻塞冲突或不安全条目/);
  assert.match(fileActionsMenu, /dryRunFileTransfer/);
  assert.match(fileActionsMenu, /transferFiles/);
  assert.match(fileActionsMenu, /TransferDryRunSummary/);
  assert.match(fileActionsMenu, /data-file-actions-transfer-dry-run-summary/);
  assert.match(fileActionsMenu, /nextName: newName\.trim\(\) \|\| undefined/);
  assert.match(fileActionsMenu, /conflictPolicy/);
  assert.match(fileActionsMenu, /overwriteConfirm\.trim\(\) === "OVERWRITE"/);
  assert.doesNotMatch(fileActionsMenu, /ops\.copy\(/);
  assert.doesNotMatch(fileActionsMenu, /ops\.move\(/);
  assert.match(filesQuery, /params\.hidden\s*\?\?\s*null/);
  assert.match(
    filesQuery,
    /search: \(params: \{ rootId: string; path\?: string; query: string; recursive\?: boolean; hidden\?: boolean/,
  );
  assert.match(filesQuery, /params\.recursive \?\? true/);
  assert.match(filesQuery, /params\.hidden \?\? true/);
  assert.match(filesQuery, /recursive: params\?\.recursive/);
  assert.match(filesQuery, /hidden: params\?\.hidden/);
  assert.match(filesQuery, /params\.limit \?\? null/);
  assert.match(filesQuery, /limit: params\?\.limit/);
  assert.match(filesQuery, /staleTime:\s*5_000/);
  assert.match(searchPanel, /跨文件替换/);
  assert.match(searchPanel, /prepareReplacePreview/);
  assert.match(searchPanel, /ReplacePreviewDialog/);
  assert.match(searchPanel, /ReplaceUndoPackage/);
  assert.match(searchPanel, /ReplaceUndoStrip/);
  assert.match(searchPanel, /预览跨文件替换/);
  assert.match(searchPanel, /replaceSelection/);
  assert.match(searchPanel, /selectedReplaceItems/);
  assert.match(searchPanel, /toggleReplacePreviewItem/);
  assert.match(searchPanel, /selectAllReplacePreviewItems/);
  assert.match(searchPanel, /全选本次预览/);
  assert.match(searchPanel, /包含隐藏文件/);
  assert.match(searchPanel, /hidden: includeHidden/);
  assert.match(searchPanel, /indexStats/);
  assert.match(searchPanel, /WORKSPACE_SEARCH_LIMIT = 250/);
  assert.match(searchPanel, /limit: WORKSPACE_SEARCH_LIMIT/);
  assert.match(searchPanel, /searchLimit/);
  assert.match(searchPanel, /searchTruncated/);
  assert.match(searchPanel, /已达到 \{searchLimit\} 条结果上限/);
  assert.match(searchPanel, /结果上限 \{searchLimit\}[\s\S]*条由后端保护/);
  assert.match(searchPanel, /内容索引命中/);
  assert.match(searchPanel, /索引未命中，已扫描补全/);
  assert.match(searchPanel, /formatWorkspaceSearchAiContext/);
  assert.match(searchPanel, /@search results/);
  assert.match(searchPanel, /copySearchAiContext/);
  assert.match(searchPanel, /data-workspace-search-copy-ai-context/);
  assert.match(searchPanel, /navigator\.clipboard\.writeText\(searchContext\)/);
  assert.match(searchPanel, /indexUsed: Boolean\(indexStats\?\.used\)/);
  assert.match(searchPanel, /results\.slice\(0, 20\)/);
  assert.match(searchPanel, /result\.snippet\?\.trim\(\)/);
  assert.match(searchPanel, /SearchResultContextMenu/);
  assert.match(searchPanel, /data-workspace-search-result-menu/);
  assert.match(
    searchPanel,
    /data-workspace-search-result-action=\{action\.id\}/,
  );
  assert.match(searchPanel, /formatSingleSearchResultAiContext/);
  assert.match(searchPanel, /@search result/);
  assert.match(searchPanel, /formatSearchResultRipgrepCommand/);
  assert.match(searchPanel, /insertSearchResultRipgrepToTerminal/);
  assert.match(searchPanel, /insertRipgrepToTerminal/);
  assert.match(searchPanel, /tracevane:workspace-terminal-insert-input/);
  assert.match(searchPanel, /rg --line-number --context 2/);
  assert.match(searchPanel, /shellQuote/);
  assert.match(
    searchPanel,
    /onContextMenu=\{\(event\) => onOpenMenu\(event, result\)\}/,
  );
  assert.match(searchPanel, /longPressTimerRef/);
  assert.match(searchPanel, /touch-manipulation/);
  assert.match(searchPanel, /searchInputRef/);
  assert.match(searchPanel, /createSearchPanelCommands/);
  assert.match(searchPanel, /onCommandsChange\?\.\(searchPanelCommands\)/);
  assert.match(searchCommands, /search\.panel\.focusInput/);
  assert.match(searchCommands, /search\.panel\.copyAiContext/);
  assert.match(searchCommands, /search\.panel\.prepareReplacePreview/);
  assert.match(searchCommands, /search\.panel\.applyReplacePreview/);
  assert.match(searchCommands, /search\.panel\.undoLastReplace/);
  assert.match(searchCommands, /search\.panel\.clear/);
  assert.match(workspaceWorkbench, /searchCommands/);
  assert.match(workspaceWorkbench, /onSearchCommandsChange/);
  assert.match(searchPanel, /确认全部替换/);
  assert.match(searchPanel, /撤销上次替换/);
  assert.match(searchPanel, /previousContent/);
  assert.match(searchPanel, /replacedContent/);
  assert.match(searchPanel, /current\.content !== item\.replacedContent/);
  assert.match(searchPanel, /countTextMatches/);
  assert.match(searchPanel, /replaceText/);
  assert.match(searchPanel, /searchCaseSensitive/);
  assert.match(searchPanel, /searchRegex/);
  assert.match(searchPanel, /正则搜索/);
  assert.match(searchPanel, /正则替换/);
  assert.match(searchPanel, /caseSensitive: searchCaseSensitive/);
  assert.match(searchPanel, /regex: searchRegex/);
  assert.match(searchPanel, /ReplaceDiffPreview/);
  assert.match(searchPanel, /createReplaceDiffLines/);
  assert.match(replaceDiff, /export function ReplaceDiffPreview/);
  assert.match(replaceDiff, /export function createReplaceDiffLines/);
  assert.match(replaceDiff, /export function renderMarkedLiteral/);
  assert.match(replaceDiff, /export function renderMarkedSearch/);
  assert.match(searchPanel, /diffLines/);
  assert.match(searchPanel, /readFile/);
  assert.match(searchPanel, /writeFileContent/);
  assert.match(searchPanel, /HighlightedText/);
  assert.match(searchPanel, /<mark/);
  assert.match(searchPanel, /WorkspaceOpenFileOptions/);
  assert.match(searchPanel, /initialSearch: \{ query, caseSensitive, regex \}/);
});

// ---------------------------------------------------------------------------
// Editor is Monaco-backed.
// ---------------------------------------------------------------------------

test("CodeEditor imports Monaco, not CodeMirror", () => {
  const editor = read("features/workspace/editor/CodeEditor.tsx");
  const stage = read("features/workspace/editor/WorkspaceEditorStage.tsx");
  const tabs = read("features/workspace/editor/EditorTabs.tsx");
  const editorTabActions = read(
    "features/workspace/editor/editorTabActions.tsx",
  );
  const editorTabCommands = read(
    "features/workspace/editor/editorTabCommands.tsx",
  );
  const documentPreview = read("features/workspace/shared/DocumentPreview.tsx");
  const archivePreview = read("features/workspace/shared/ArchivePreview.tsx");
  const binaryFilePreview = read(
    "features/workspace/shared/BinaryFilePreview.tsx",
  );
  const csvPreview = read("features/workspace/shared/CsvPreview.tsx");
  const jsonPreview = read("features/workspace/shared/JsonPreview.tsx");
  const textSlicePreview = read(
    "features/workspace/shared/TextSlicePreview.tsx",
  );
  const documentViewRegistry = read(
    "features/workspace/shared/DocumentViewRegistry.ts",
  );
  const textSearchReplace = read(
    "features/workspace/shared/TextSearchReplaceStrip.tsx",
  );
  const visualDocumentEditor = read(
    "features/workspace/shared/VisualDocumentEditor.tsx",
  );
  const documentWorkbench = read(
    "features/workspace/shared/DocumentWorkbench.tsx",
  );
  const fileTree = read("features/workspace/files/FileTree.tsx");
  const packageJson = readRoot("package.json");
  const workspaceModesSmoke = readRoot(
    "tests/file-manager/workspace-document-modes.smoke.mjs",
  );
  const viteConfig = readWeb("vite.config.ts");
  assert.match(editor, /monaco-editor\/esm\/vs\/editor\/editor\.api\.js/);
  assert.match(viteConfig, /'monaco-editor'/);
  assert.match(viteConfig, /'dockview-react'/);
  assert.doesNotMatch(editor, /@monaco-editor\/react/);
  assert.match(editor, /useTheme/);
  assert.match(editor, /data-editor-theme/);
  assert.match(editor, /theme === "dark" \? "vs-dark" : "vs"/);
  assert.match(editor, /data-code-editor="monaco-direct"/);
  assert.match(editor, /data-code-editor-keyboard-inset/);
  assert.match(editor, /const viewport = window\.visualViewport/);
  assert.match(editor, /viewport\.addEventListener\("resize", schedule\)/);
  assert.match(editor, /viewport\.addEventListener\("scroll", schedule\)/);
  assert.match(editor, /getScrolledVisiblePosition\(position\)/);
  assert.match(editor, /MONACO_KEYBOARD_CARET_GAP = 24/);
  assert.match(editor, /MONACO_KEYBOARD_MIN_OVERLAP = 8/);
  assert.match(editor, /MONACO_KEYBOARD_MAX_INSET_RATIO = 0\.38/);
  assert.match(editor, /MONACO_KEYBOARD_MAX_SCROLL_DELTA = 96/);
  assert.match(editor, /pendingKeyboardScrollDeltaRef = React\.useRef\(0\)/);
  assert.match(editor, /caretOverlap > MONACO_KEYBOARD_MIN_OVERLAP/);
  assert.match(editor, /const visibleBottom = Math\.min/);
  assert.match(editor, /Math\.round\(containerRect\.bottom\)/);
  assert.match(editor, /const maxEditorInset = Math\.round/);
  assert.match(editor, /const viewportOverlap = Math\.max/);
  assert.match(editor, /containerRect\.bottom - visibleBottom/);
  assert.match(
    editor,
    /Math\.min\(viewportOverlap, caretOverlap, maxEditorInset\)/,
  );
  assert.match(
    editor,
    /const remainingOverlap = Math\.max\(0, caretOverlap - nextInset\)/,
  );
  assert.match(
    editor,
    /Math\.min\(remainingOverlap, MONACO_KEYBOARD_MAX_SCROLL_DELTA\)/,
  );
  assert.match(
    editor,
    /current VisualViewport, then further cap it by the caret\'s real overlap/,
  );
  assert.match(
    editor,
    /padding: \{ top: 16, bottom: 16 \+ editorKeyboardInset \}/,
  );
  assert.match(editor, /editorKeyboardInset > 0/);
  assert.match(
    editor,
    /editor\.setScrollTop\(Math\.max\(0, scrollTop \+ scrollDelta\)\)/,
  );
  assert.doesNotMatch(editor, /revealPosition\(/);
  assert.doesNotMatch(editor, /revealPositionInCenterIfOutsideViewport/);
  assert.match(editor, /measured intersection between this editor/);
  assert.match(editor, /style=\{\{ height: "100%" \}\}/);
  assert.match(editor, /data-code-editor-container/);
  assert.match(editor, /monaco\.editor\.createModel/);
  assert.match(editor, /monaco\.editor\.create\(container/);
  assert.match(editor, /monaco\.editor\.setModelLanguage\(model, language\)/);
  assert.match(editor, /data-editor-language=\{languageForPath\(path\)\}/);
  assert.match(editor, /requestAnimationFrame\(\(\) => editor\.layout\(\)\)/);
  assert.doesNotMatch(editor, /@codemirror\//);
  assert.doesNotMatch(editor, /actions\.find/);
  assert.doesNotMatch(editor, /editor\.action\.startFindReplaceAction/);
  assert.match(editor, /searchHighlights/);
  assert.match(editor, /createDecorationsCollection/);
  assert.match(editor, /findMatches/);
  assert.match(editor, /tv-monaco-search-inline-active/);
  assert.match(editor, /languageForPath/);
  assert.match(editor, /monaco\.languages\.getLanguages\(\)/);
  assert.match(editor, /language\.extensions \?\? \[\]/);
  assert.match(editor, /language\.filenames \?\? \[\]/);
  assert.match(editor, /extensions\.sort/);
  assert.match(editor, /languageOverrideForFile/);
  assert.match(editor, /fileName\.startsWith\("\.env"\)/);
  assert.match(editor, /fileName\.endsWith\("\.vue"\)/);
  assert.doesNotMatch(editor, /EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /COMPOUND_EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /FILE_NAME_LANGUAGE_MAP/);
  assert.match(
    documentWorkbench,
    /export type DocumentWorkbenchMode = "source" \| "preview" \| "split" \| "visual"/,
  );
  assert.match(stage, /type EditorViewMode = DocumentWorkbenchMode/);
  assert.match(
    stage,
    /className="grid h-full min-h-0 min-w-0 grid-rows-\[auto_minmax\(0,1fr\)\]/,
  );
  assert.match(stage, /viewModes/);
  assert.match(stage, /buildActiveModeActions/);
  assert.match(stage, /showModeSwitcher=\{false\}/);
  assert.match(tabs, /EditorTabModeAction/);
  assert.doesNotMatch(tabs, /当前文件标签页内视图模式/);
  assert.doesNotMatch(tabs, /当前标签页模式/);
  assert.match(stage, /tabRootIds/);
  assert.match(stage, /activeRootId/);
  assert.match(stage, /rootId: activeRootId/);
  assert.match(stage, /workspaceRootId\?: string/);
  assert.match(stage, /tabRootIds\[active\] \?\? rootId \?\? workspaceRootId/);
  assert.match(stage, /prev\[openFile\] === rootId/);
  assert.match(stage, /setTabRootIds/);
  assert.match(stage, /WorkspaceDocumentFloatingToolbar/);
  assert.match(stage, /viewModeCommands/);
  assert.match(stage, /editorUtilityCommands/);
  assert.match(stage, /switchEditorViewMode/);
  assert.match(stage, /toggleEditorSearch/);
  assert.match(stage, /zoomEditor/);
  assert.match(stage, /editor\.viewMode\.\$\{mode\.id\}/);
  assert.match(stage, /editor\.search\.toggle/);
  assert.match(stage, /editor\.zoom\.decrease/);
  assert.match(stage, /editor\.zoom\.increase/);
  assert.match(stage, /编辑器：切换到\$\{mode\.label\}/);
  assert.match(stage, /当前文件不支持该视图模式/);
  assert.match(
    stage,
    /\.\.\.tabCommands,\s*\.\.\.viewModeCommands,\s*\.\.\.editorUtilityCommands,\s*\.\.\.selectionCommands,\s*\.\.\.diffCommands/,
  );
  assert.match(stage, /gitDiffTarget\?: WorkspaceGitDiffTarget \| null/);
  assert.match(stage, /useGitDiffQuery/);
  assert.match(stage, /WorkspaceGitDiffViewer/);
  assert.match(stage, /id: "diff"/);
  assert.match(stage, /data-workspace-git-diff-viewer/);
  assert.match(stage, /data-workspace-git-diff-toolbar/);
  assert.match(stage, /data-workspace-git-diff-actions/);
  assert.match(stage, /data-workspace-git-diff-copy/);
  assert.match(stage, /data-workspace-git-diff-copy-ai-context/);
  assert.match(stage, /data-workspace-git-diff-open-source/);
  assert.match(stage, /formatWorkspaceGitDiffAiContext/);
  assert.match(stage, /"@git diff"/);
  assert.match(stage, /scope: \$\{scope\}/);
  assert.match(stage, /kind: \$\{target\.kind\}/);
  assert.match(stage, /onOpenSource=\{\(\) => onViewModeChange\("source"\)\}/);
  assert.match(stage, /navigator\.clipboard\.writeText\(diffText\)/);
  assert.match(
    stage,
    /navigator\.clipboard\.writeText\(\s*formatWorkspaceGitDiffAiContext/,
  );
  assert.match(stage, /diffCommands/);
  assert.match(stage, /setDiffCommands/);
  assert.match(
    stage,
    /\.\.\.tabCommands,\s*\.\.\.viewModeCommands,\s*\.\.\.editorUtilityCommands,\s*\.\.\.selectionCommands,\s*\.\.\.diffCommands/,
  );
  assert.match(stage, /id: "git\.diff\.copyCurrent"/);
  assert.match(stage, /id: "git\.diff\.copyAiContext"/);
  assert.match(stage, /id: "git\.diff\.openSource"/);
  assert.match(stage, /group: "Git"/);
  assert.match(stage, /group: "AI"/);
  assert.match(stage, /onCommandsChange\(\[/);
  assert.match(stage, /return \(\) => onCommandsChange\(\[\]\)/);
  assert.match(stage, /data-git-diff-binary/);
  assert.match(stage, /data-git-diff-truncated/);
  assert.match(stage, /path=\{`\$\{target\.path\}\.diff`\}/);
  assert.match(stage, /readOnly/);
  assert.match(stage, /setViewModes\(\(prev\) => \{/);
  assert.match(stage, /prev\[activeGitDiffTarget\.path\] === "diff"/);
  assert.match(stage, /data-workspace-editor-git-diff-target/);
  assert.match(stage, /data-git-diff-staged/);
  assert.match(stage, /data-git-diff-untracked/);
  assert.match(tabs, /data-workspace-editor-tab=\{path\}/);
  assert.match(tabs, /data-workspace-editor-tab-menu/);
  assert.match(tabs, /data-workspace-editor-tab-action-sheet/);
  assert.match(tabs, /data-workspace-editor-tab-action-sheet-scrollport/);
  assert.match(tabs, /data-workspace-editor-tab-action-group/);
  assert.match(tabs, /groupEditorTabSheetActions/);
  assert.match(tabs, /overscroll-contain/);
  assert.match(tabs, /env\(safe-area-inset-bottom\)/);
  assert.match(tabs, /data-workspace-editor-tab-more/);
  assert.match(tabs, /useEditorTabTouchActionSurface/);
  assert.match(tabs, /longPressTimerRef/);
  assert.match(tabs, /window\.setTimeout\(\(\) => \{/);
  assert.match(tabs, /event\.pointerType !== "touch"/);
  assert.match(tabs, /!touchActionSurface \? \(/);
  assert.match(tabs, /min-h-12/);
  assert.match(tabs, /pointer: coarse/);
  assert.match(tabs, /createEditorTabActions/);
  assert.match(tabs, /data-editor-tab-action=\{action\.id\}/);
  assert.match(tabs, /data-editor-tab-action-shortcut=\{action\.id\}/);
  assert.match(tabs, /aria-keyshortcuts=\{action\.shortcut\}/);
  assert.match(tabs, /<kbd/);
  assert.match(tabs, /action\.shortcut/);
  assert.match(tabs, /clampFloatingMenuPosition/);
  assert.match(tabs, /max-h-\[min\(80vh,26rem\)\]/);
  assert.match(tabs, /onCloseAll/);
  assert.match(tabs, /onCloseLeft/);
  assert.match(tabs, /onInsertPathToTerminal/);
  assert.match(tabs, /onCopyAiFileContext/);
  assert.match(tabs, /canCloseLeft/);
  assert.doesNotMatch(tabs, /<MenuButton onClick=\{onCloseOthers\}/);
  assert.match(editorTabActions, /export interface EditorTabAction/);
  assert.match(editorTabActions, /shortcut\?: string/);
  assert.match(editorTabActions, /shortcut: "Ctrl\+F4"/);
  assert.match(editorTabActions, /shortcut: "Ctrl\+K W"/);
  assert.match(editorTabActions, /shortcut: "Ctrl\+K U"/);
  assert.match(editorTabActions, /shortcut: "Shift\+Alt\+C"/);
  assert.match(
    editorTabActions,
    /export interface EditorTabActionRegistryInput/,
  );
  assert.match(editorTabActions, /createEditorTabActions/);
  assert.match(editorTabActions, /editor\.tab\.closeAll/);
  assert.match(editorTabActions, /editor\.tab\.closeOthers/);
  assert.match(editorTabActions, /editor\.tab\.closeSaved/);
  assert.match(editorTabActions, /canCloseSaved/);
  assert.match(editorTabActions, /closeSaved\?: \(\) => void/);
  assert.match(editorTabActions, /editor\.tab\.closeLeft/);
  assert.match(editorTabActions, /editor\.tab\.closeRight/);
  assert.match(editorTabActions, /editor\.tab\.copyFileName/);
  assert.match(editorTabActions, /editor\.tab\.copyPath/);
  assert.match(editorTabActions, /editor\.tab\.copyRelativePath/);
  assert.match(editorTabActions, /editor\.tab\.revealInExplorer/);
  assert.match(editorTabActions, /editor\.tab\.insertPathToTerminal/);
  assert.match(
    editorTabActions,
    /insertPathToTerminal\?: \(path: string\) => void/,
  );
  assert.match(editorTabActions, /editor\.tab\.copyAiFileContext/);
  assert.match(
    editorTabActions,
    /copyAiFileContext\?: \(path: string\) => void/,
  );
  assert.match(editorTabActions, /editor\.tab\.splitRight/);
  assert.match(editorTabActions, /editor\.tab\.splitDown/);
  assert.match(editorTabActions, /editor\.tab\.moveToGroup/);
  assert.match(editorTabActions, /复制文件名/);
  assert.match(editorTabActions, /copyFileName\?: \(path: string\) => void/);
  assert.match(editorTabActions, /在资源管理器中显示/);
  assert.match(editorTabActions, /向右拆分/);
  assert.match(editorTabActions, /向下拆分/);
  assert.match(editorTabActions, /移动到新编辑组/);
  assert.match(editorTabActions, /splitTab/);
  assert.match(editorTabActions, /moveTabToGroup/);
  assert.match(tabs, /onCopyFileName/);
  assert.match(tabs, /copyFileName: onCopyFileName/);
  assert.match(tabs, /onCopyRelativePath/);
  assert.match(tabs, /onRevealInExplorer/);
  assert.match(tabs, /onInsertPathToTerminal/);
  assert.match(tabs, /onCopyAiFileContext/);
  assert.match(tabs, /onSplitTab/);
  assert.match(tabs, /onMoveTabToGroup/);
  assert.match(editorTabCommands, /editor\.tab\.copyFileName/);
  assert.match(editorTabCommands, /编辑器：复制当前文件名/);
  assert.match(editorTabCommands, /copyFileName\?: \(path: string\) => void/);
  assert.match(editorTabCommands, /编辑器：复制当前文件相对路径/);
  assert.match(editorTabCommands, /editor\.tab\.insertPathToTerminal/);
  assert.match(editorTabCommands, /编辑器：插入当前文件路径到终端/);
  assert.match(editorTabCommands, /editor\.tab\.copyAiFileContext/);
  assert.match(editorTabCommands, /AI：复制当前文件上下文/);
  assert.match(editorTabCommands, /relativePathLabel/);
  assert.match(editorTabCommands, /编辑器：在资源管理器中显示/);
  assert.match(editorTabCommands, /editor\.tab\.closeAll/);
  assert.match(editorTabCommands, /editor\.tab\.closeSaved/);
  assert.match(editorTabCommands, /dirtyPathsCount: number/);
  assert.match(
    editorTabCommands,
    /savedCount = openTabs\.length - dirtyPathsCount/,
  );
  assert.match(editorTabCommands, /disabled: savedCount <= 0/);
  assert.match(editorTabCommands, /editor\.tab\.closeLeft/);
  assert.match(editorTabCommands, /编辑器：关闭全部标签/);
  assert.match(editorTabCommands, /编辑器：关闭已保存标签/);
  assert.match(editorTabCommands, /编辑器：关闭左侧标签/);
  assert.match(editorTabCommands, /editor\.tab\.splitRight/);
  assert.match(editorTabCommands, /editor\.tab\.splitDown/);
  assert.match(editorTabCommands, /editor\.tab\.moveToGroup/);
  assert.match(editorTabCommands, /编辑器：向右拆分当前标签/);
  assert.match(editorTabCommands, /编辑器：向下拆分当前标签/);
  assert.match(editorTabCommands, /编辑器：移动当前标签到新组/);
  assert.match(editorTabCommands, /FolderSearch/);
  assert.match(editorTabActions, /全部关闭/);
  assert.match(editorTabActions, /关闭其它/);
  assert.match(editorTabActions, /关闭已保存/);
  assert.match(editorTabActions, /关闭左侧/);
  assert.match(editorTabActions, /关闭右侧/);
  assert.match(stage, /copyTabFileName/);
  assert.match(stage, /已复制标签文件名/);
  assert.match(stage, /onCopyFileName=\{copyTabFileName\}/);
  assert.match(stage, /copyFileName: \(path\) => void copyTabFileName\(path\)/);
  assert.match(stage, /closeAllTabs/);
  assert.match(stage, /closeSavedTabs/);
  assert.match(stage, /dirtyPathsCount: dirtySet\.size/);
  assert.match(stage, /openTabs\.filter\(\(path\) => !dirtySet\.has\(path\)\)/);
  assert.match(stage, /closeLeftTabs/);
  assert.match(stage, /closeRightTabs/);
  assert.match(stage, /onCloseAll=\{closeAllTabs\}/);
  assert.match(stage, /onCloseOthers=\{\(path\) =>/);
  assert.match(stage, /onCloseSaved=\{closeSavedTabs\}/);
  assert.match(stage, /onCloseLeft=\{closeLeftTabs\}/);
  assert.match(stage, /onCloseRight=\{closeRightTabs\}/);
  assert.match(stage, /closeTabs\(openTabs\.filter/);
  assert.match(stage, /onCopyPath=\{copyTabPath\}/);
  assert.match(stage, /onCopyRelativePath=\{copyTabRelativePath\}/);
  assert.match(stage, /toWorkspaceRelativePath/);
  assert.match(stage, /workspaceRootAbsolutePath/);
  assert.match(stage, /navigator\.clipboard\.writeText\(relativePath\)/);
  assert.match(stage, /insertTabPathToTerminal/);
  assert.match(stage, /sourceSelection/);
  assert.match(stage, /editor\.selection\.copyAiContext/);
  assert.match(stage, /AI：复制当前选区上下文/);
  assert.match(stage, /formatWorkspaceSelectionAiContext/);
  assert.match(stage, /"@selection"/);
  assert.match(stage, /已复制 @selection 上下文/);
  assert.match(stage, /onSourceSelectionChange=\{setSourceSelection\}/);
  assert.match(stage, /tracevane:workspace-terminal-insert-input/);
  assert.match(stage, /shellQuoteWorkspacePath/);
  assert.match(stage, /copyTabAiFileContext/);
  assert.match(stage, /formatWorkspaceFileAiContext/);
  assert.match(stage, /"@file"/);
  assert.match(stage, /已复制 @file 上下文/);
  assert.match(stage, /selectionCommands/);
  assert.match(stage, /onInsertPathToTerminal=\{insertTabPathToTerminal\}/);
  assert.match(stage, /onCopyAiFileContext=\{copyTabAiFileContext\}/);
  assert.match(stage, /onRevealInExplorer=\{onRevealInExplorer\}/);
  assert.match(stage, /onSplitTab=\{onSplitTab\}/);
  assert.match(stage, /onMoveTabToGroup=\{onMoveTabToGroup\}/);
  assert.match(stage, /navigator\.clipboard\.writeText\(path\)/);
  assert.match(stage, /role="toolbar"/);
  assert.match(stage, /data-workspace-editor-floating-mode-select/);
  assert.match(stage, /data-workspace-editor-floating-collapsed/);
  assert.match(stage, /WORKSPACE_EDITOR_FLOATING_COLLAPSED_STORAGE_KEY/);
  assert.match(stage, /tracevane\.workspace\.editor-floating-collapsed\.v1/);
  assert.match(stage, /loadWorkspaceEditorFloatingCollapsed/);
  assert.match(stage, /storeWorkspaceEditorFloatingCollapsed/);
  assert.match(stage, /data-workspace-editor-floating-edge-toggle/);
  assert.match(stage, /展开编辑器悬浮菜单/);
  assert.match(stage, /收起编辑器悬浮菜单/);
  assert.match(stage, /data-workspace-editor-floating-search/);
  assert.match(stage, /data-workspace-editor-floating-search-state/);
  assert.match(stage, /aria-pressed=\{searchOpen\}/);
  assert.match(stage, /data-workspace-editor-floating-zoom-out/);
  assert.match(stage, /data-workspace-editor-floating-zoom-in/);
  assert.match(stage, /data-workspace-editor-floating-button-count="4"/);
  assert.match(stage, /searchOpenByPath/);
  assert.match(stage, /tracevane:workspace-editor-toggle-search/);
  assert.match(stage, /tracevane:workspace-editor-search-state/);
  assert.match(stage, /WORKSPACE_EDITOR_MODE_PREFERENCE_STORAGE_KEY/);
  assert.match(stage, /storeWorkspaceEditorModePreference/);
  assert.match(stage, /<select/);
  assert.doesNotMatch(stage, /data-workspace-editor-floating-replace/);
  assert.doesNotMatch(stage, /data-workspace-editor-mobile-mode-select/);
  assert.match(fileTree, /data-tree-name=\{name\}/);
  assert.match(packageJson, /smoke:workspace:document-modes/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-tab/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"preview\"/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"split\"/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"visual\"/);
  assert.match(workspaceModesSmoke, /data-file-preview-dialog/);
  assert.match(
    workspaceModesSmoke,
    /Workspace mode switch opened FileManager preview dialog/,
  );
  assert.match(workspaceModesSmoke, /data-split-source-editor=\"true\"/);
  assert.match(workspaceModesSmoke, /data-visual-document-editor-shell/);
  assert.match(documentWorkbench, /源码/);
  assert.match(documentWorkbench, /预览/);
  assert.match(documentWorkbench, /边写边预览/);
  assert.match(stage, /编辑\+预览/);
  assert.match(stage, /预览时编辑/);
  assert.doesNotMatch(stage, /label: "Preview"/);
  assert.match(documentWorkbench, /编辑、预览、源码始终属于当前文件标签页/);
  assert.match(documentWorkbench, /DocumentPreview/);
  assert.match(documentWorkbench, /TextSearchReplaceStrip/);
  assert.match(documentWorkbench, /showInlineSearchButton/);
  assert.match(documentWorkbench, /showWorkbenchToolbar/);
  assert.match(documentWorkbench, /查找替换/);
  assert.match(documentWorkbench, /openSearchReplace/);
  assert.match(documentWorkbench, /handleWorkbenchKeyDown/);
  assert.match(documentWorkbench, /data-document-workbench-body="true"/);
  assert.match(documentWorkbench, /data-document-workbench-viewport="true"/);
  assert.match(documentWorkbench, /data-split-source-editor/);
  assert.match(documentWorkbench, /data-split-source-keyboard-inset/);
  assert.match(
    documentWorkbench,
    /textareaRef = React\.useRef<HTMLTextAreaElement/,
  );
  assert.match(
    documentWorkbench,
    /useVisualViewportKeyboardInset\(textareaRef\)/,
  );
  assert.match(documentWorkbench, /完整 Monaco 在“源码\/编辑”模式/);
  assert.match(documentWorkbench, /grid-rows-\[minmax\(0,1fr\)\]/);
  assert.match(
    documentWorkbench,
    /grid-rows-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/,
  );
  assert.match(
    documentWorkbench,
    /showSearchReplace\s*\?\s*"grid-rows-\[auto_minmax\(0,1fr\)\]"/,
  );
  assert.match(textSearchReplace, /ReplaceDiffPreview/);
  assert.match(textSearchReplace, /createReplaceDiffLines/);
  assert.match(textSearchReplace, /replacePreviewOpen/);
  assert.match(textSearchReplace, /预览全部/);
  assert.match(textSearchReplace, /确认全部替换/);
  assert.match(textSearchReplace, /替换前预览/);
  assert.match(textSearchReplace, /data-text-replace-preview/);
  assert.match(documentWorkbench, /key === "f"/);
  assert.match(documentWorkbench, /key === "h"/);
  assert.match(documentWorkbench, /event\.altKey/);
  assert.match(documentWorkbench, /Ctrl\+Alt\+1/);
  assert.match(documentWorkbench, /Ctrl\+Alt\+4/);
  assert.match(documentWorkbench, /VisualDocumentEditor/);
  assert.match(documentWorkbench, /canEditDocumentVisually/);
  assert.match(documentWorkbench, /onSearchStateChange=\{setSearchState\}/);
  assert.match(documentWorkbench, /initialSearch\?\.query/);
  assert.match(
    documentWorkbench,
    /initialQuery=\{initialSearch\?\.query \?\? ""\}/,
  );
  assert.match(
    documentWorkbench,
    /searchHighlights=\{showSearchReplace \? searchState : undefined\}/,
  );
  assert.match(documentWorkbench, /当前文件查找\/替换；替换后进入未保存状态/);
  assert.match(
    documentWorkbench,
    /density=\{compact \? "compact" : "default"\}/,
  );
  assert.match(stage, /DocumentWorkbench/);
  assert.match(documentWorkbench, /onSourceSelectionChange/);
  assert.match(documentWorkbench, /CodeEditorSelectionContext/);
  assert.match(
    documentWorkbench,
    /onSelectionChange=\{onSourceSelectionChange\}/,
  );
  assert.match(stage, /WorkspaceEditorSearchRequest/);
  assert.match(stage, /searchRequest\?\.path === active/);
  assert.match(stage, /searchRequest : null/);
  assert.match(stage, /initialSearch=\{searchRequest\}/);
  assert.match(
    stage,
    /Source, preview, split preview and visual editing are modes of the active/,
  );
  assert.doesNotMatch(stage, /setSplit/);
  assert.doesNotMatch(stage, /splitPane/);
  assert.doesNotMatch(stage, /grid-cols-2 divide-x divide-line/);
  assert.match(stage, /mimeType=\{readQuery\.data\?\.mimeType\}/);
  assert.doesNotMatch(stage, /function WorkspacePreview/);
  assert.match(documentPreview, /import \{ MarkdownPreview \} from/);
  assert.doesNotMatch(
    documentPreview,
    /React\.lazy\(\(\) =>\s*import\("@\/features\/workspace\/preview\/MarkdownPreview"/,
  );
  assert.match(documentPreview, /getDocumentViewer/);
  assert.match(documentPreview, /canRenderRegisteredDocumentPreview/);
  assert.match(documentPreview, /sandbox=""/);
  assert.match(documentViewRegistry, /export const DOCUMENT_VIEWERS/);
  assert.match(documentViewRegistry, /export const DOCUMENT_VISUAL_EDITORS/);
  assert.match(documentViewRegistry, /getDocumentViewer/);
  assert.match(documentViewRegistry, /getDocumentVisualEditor/);
  assert.match(documentViewRegistry, /canRenderRegisteredDocumentPreview/);
  assert.match(documentViewRegistry, /canEditRegisteredDocumentVisually/);
  assert.match(documentViewRegistry, /id: "markdown"/);
  assert.match(documentViewRegistry, /id: "html"/);
  assert.match(documentViewRegistry, /id: "json"/);
  assert.match(documentViewRegistry, /id: "csv"/);
  assert.match(documentViewRegistry, /id: "image"/);
  assert.match(documentViewRegistry, /id: "video"/);
  assert.match(documentViewRegistry, /id: "audio"/);
  assert.match(documentViewRegistry, /id: "pdf"/);
  assert.match(documentViewRegistry, /id: "archive"/);
  assert.match(documentViewRegistry, /id: "binary"/);
  assert.match(documentViewRegistry, /context\?\.textLike === false/);
  assert.match(documentViewRegistry, /isArchiveDocument/);
  assert.match(documentPreview, /ArchivePreview/);
  assert.match(documentPreview, /JsonPreview/);
  assert.match(documentPreview, /CsvPreview/);
  assert.match(documentPreview, /MediaPreviewStage/);
  assert.match(documentPreview, /data-media-preview-scrollport/);
  assert.match(documentPreview, /mediaFitStyle/);
  assert.match(documentPreview, /TextSlicePreview/);
  assert.match(documentPreview, /BinaryFilePreview/);
  assert.match(jsonPreview, /export function JsonPreview/);
  assert.match(jsonPreview, /JSON\.parse/);
  assert.match(jsonPreview, /JSON 结构化预览/);
  assert.match(csvPreview, /export function CsvPreview/);
  assert.match(csvPreview, /parseDelimitedPreview/);
  assert.match(csvPreview, /CSV.*表格预览|CSV\"/);
  assert.match(binaryFilePreview, /安全占位预览/);
  assert.match(binaryFilePreview, /describeBinaryKind/);
  assert.match(binaryFilePreview, /application\/octet-stream/);
  assert.match(binaryFilePreview, /下载文件/);
  assert.match(textSlicePreview, /TEXT_SLICE_LIMIT/);
  assert.match(textSlicePreview, /MAX_RENDERED_LINES/);
  assert.match(
    textSlicePreview,
    /readFile\(\{ rootId, path, offset, limit: TEXT_SLICE_LIMIT \}\)/,
  );
  assert.match(textSlicePreview, /大文本\/日志切片预览/);
  assert.match(archivePreview, /dryRunUnarchiveFile/);
  assert.match(archivePreview, /压缩包清单预览/);
  assert.match(archivePreview, /conflictPolicy: "fail"/);
  assert.match(documentPreview, /<video[\s\S]*src=\{resolvedDownloadUrl\}/);
  assert.match(documentPreview, /<audio[\s\S]*src=\{downloadUrl\}/);
  assert.match(documentPreview, /isPdfDocument/);
  assert.match(textSearchReplace, /export function TextSearchReplaceStrip/);
  assert.match(textSearchReplace, /export function replaceText/);
  assert.match(textSearchReplace, /export interface TextSearchState/);
  assert.match(textSearchReplace, /focusTarget/);
  assert.match(textSearchReplace, /focusSignal/);
  assert.match(textSearchReplace, /initialQuery/);
  assert.match(textSearchReplace, /initialSignal/);
  assert.match(textSearchReplace, /setQuery\(initialQuery\)/);
  assert.match(textSearchReplace, /queryInputRef/);
  assert.match(textSearchReplace, /replaceInputRef/);
  assert.match(textSearchReplace, /collectTextMatchRanges/);
  assert.match(textSearchReplace, /上一个/);
  assert.match(textSearchReplace, /下一个/);
  assert.match(visualDocumentEditor, /getDocumentVisualEditor/);
  assert.match(visualDocumentEditor, /const MarkdownPreview = React\.lazy/);
  assert.match(visualDocumentEditor, /VisualPreviewLoading/);
  assert.doesNotMatch(
    visualDocumentEditor,
    /import \{ MarkdownPreview \} from/,
  );
  assert.match(visualDocumentEditor, /export function MarkdownLiveEditor/);
  assert.match(visualDocumentEditor, /export function HtmlVisualEditor/);
  assert.match(visualDocumentEditor, /data-visual-document-keyboard-inset/);
  assert.match(visualDocumentEditor, /data-html-visual-keyboard-inset/);
  assert.match(visualDocumentEditor, /parseMarkdownBlocks/);
  assert.match(
    visualDocumentEditor,
    /data-markdown-visual-block=\{block\.kind\}/,
  );
  assert.match(visualDocumentEditor, /Mermaid 图表默认渲染/);
  assert.match(visualDocumentEditor, /图片默认直接预览/);
  assert.match(visualDocumentEditor, /代码块默认高亮预览/);
  assert.match(visualDocumentEditor, /textarea/);
  assert.match(visualDocumentEditor, /编辑 Markdown 块源码/);
  assert.match(visualDocumentEditor, /data-markdown-fence-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-table-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-html-inline-editor/);
  assert.match(visualDocumentEditor, /MarkdownTaskListInlineEditor/);
  assert.match(visualDocumentEditor, /data-markdown-task-list-inline-editor/);
  assert.match(visualDocumentEditor, /parseMarkdownListItems/);
  assert.match(visualDocumentEditor, /buildMarkdownListItems/);
  assert.match(visualDocumentEditor, /parseMarkdownFence/);
  assert.match(visualDocumentEditor, /buildMarkdownTable/);
  assert.match(visualDocumentEditor, /parseMarkdownTableClipboard/);
  assert.match(visualDocumentEditor, /pasteTableAtCell/);
  assert.match(visualDocumentEditor, /onPaste=\{\(event\) => \{/);
  assert.match(
    visualDocumentEditor,
    /doc\.designMode = editable \? "on" : "off"/,
  );
  assert.match(visualDocumentEditor, /serializeHtmlDocument/);
  assert.match(
    visualDocumentEditor,
    /useVisualViewportKeyboardInset\(scrollportRef\)/,
  );
  assert.match(
    visualDocumentEditor,
    /useVisualViewportKeyboardInset\(iframeRef\)/,
  );
  assert.match(
    visualDocumentEditor,
    /scrollPaddingBottom: keyboardInset \? keyboardInset \+ 24 : undefined/,
  );
  assert.match(visualDocumentEditor, /height: "100%"/);
  assert.doesNotMatch(
    visualDocumentEditor,
    /height: keyboardInset \? `calc\(100% - \$\{keyboardInset\}px\)` : "100%"/,
  );
});

// ---------------------------------------------------------------------------
// Preview remains remark/rehype-backed Markdown.
// ---------------------------------------------------------------------------

test("MarkdownPreview imports remarkParse and resolves file-root media", () => {
  const preview = read("features/workspace/preview/MarkdownPreview.tsx");
  const documentPreview = read("features/workspace/shared/DocumentPreview.tsx");
  const visualDocumentEditor = read(
    "features/workspace/shared/VisualDocumentEditor.tsx",
  );
  const css = read("features/workspace/preview/markdown-preview.css");

  assert.ok(
    preview.includes("remark-parse"),
    "MarkdownPreview must use remarkParse (remark pipeline)",
  );
  assert.match(preview, /rootId\?: string/);
  assert.match(preview, /useTheme/);
  assert.match(
    preview,
    /mermaidTheme = theme === "dark" \? "dark" : "default"/,
  );
  assert.match(preview, /ensureMermaid\(mermaidTheme\)/);
  assert.match(preview, /mermaidInitializedTheme !== theme/);
  assert.match(preview, /\[debounced, path, mermaidTheme\]/);
  assert.match(preview, /decorateMarkdownDom/);
  assert.match(preview, /resolveMarkdownResourceUrl/);
  assert.match(preview, /normalizeMarkdownAssetPath/);
  assert.match(preview, /new URLSearchParams\(\{ rootId, path: assetPath \}\)/);
  assert.match(preview, /image\.setAttribute\("loading"/);
  assert.match(preview, /image\.setAttribute\("decoding"/);
  assert.match(preview, /getMarkdownMediaKind/);
  assert.match(preview, /image\.replaceWith\(video\)/);
  assert.match(preview, /image\.replaceWith\(audio\)/);
  assert.match(preview, /copyMarkdownMediaLabel/);
  assert.match(preview, /media\.setAttribute\("controls"/);
  assert.match(preview, /media\.setAttribute\("preload"/);
  assert.match(preview, /anchor\.setAttribute\("target", "_blank"\)/);
  assert.match(
    preview,
    /onTaskToggle\?: \(taskIndex: number, checked: boolean\) => void/,
  );
  assert.match(preview, /li input\[type="checkbox"\]/);
  assert.match(preview, /md-preview__task-toggle/);
  assert.match(preview, /checkbox\.disabled = false/);
  assert.match(
    preview,
    /checkbox\.onchange = \(\) => onTaskToggle\(index, checkbox\.checked\)/,
  );
  assert.match(preview, /grid h-full min-h-0 min-w-0/);
  assert.match(
    documentPreview,
    /<MarkdownPreview path=\{path\} rootId=\{rootId\} content=\{content\} \/>/,
  );
  assert.match(visualDocumentEditor, /content=\{block\.raw\}/);
  assert.match(
    visualDocumentEditor,
    /editable && block\.kind === "list" \? onTaskToggle : undefined/,
  );
  assert.match(visualDocumentEditor, /export function toggleMarkdownTask/);
  assert.match(visualDocumentEditor, /\[ xX\]/);
  assert.match(visualDocumentEditor, /updateBlocks/);
  assert.match(visualDocumentEditor, /insertBlockAfter/);
  assert.match(visualDocumentEditor, /deleteBlock/);
  assert.match(visualDocumentEditor, /moveBlock/);
  assert.match(visualDocumentEditor, /createMarkdownBlock/);
  assert.match(visualDocumentEditor, /data-markdown-table-delete-row/);
  assert.match(visualDocumentEditor, /data-markdown-table-delete-column/);
  assert.match(visualDocumentEditor, /data-markdown-table-align-select/);
  assert.match(visualDocumentEditor, /新增/);
  assert.match(visualDocumentEditor, /删除/);
  assert.match(visualDocumentEditor, /上移 Markdown 块/);
  assert.match(visualDocumentEditor, /下移 Markdown 块/);
  assert.match(visualDocumentEditor, /extractMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /replaceMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /data-markdown-resource-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-resource-path-input/);
  assert.match(visualDocumentEditor, /data-markdown-resource-dropzone/);
  assert.match(visualDocumentEditor, /data-markdown-resource-preview/);
  assert.match(visualDocumentEditor, /data-markdown-resource-copy-path/);
  assert.match(visualDocumentEditor, /data-markdown-resource-open/);
  assert.match(visualDocumentEditor, /MARKDOWN_FILE_MANAGER_DRAG_MIME/);
  assert.match(
    visualDocumentEditor,
    /application\/x-tracevane-file-manager-paths/,
  );
  assert.match(visualDocumentEditor, /resolveMarkdownResourcePreviewUrl/);
  assert.match(visualDocumentEditor, /resolveMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /markdownResourcePreviewKind/);
  assert.match(visualDocumentEditor, /这里只修改路径，不执行上传/);
  assert.match(visualDocumentEditor, /MarkdownResourcePicker/);
  assert.match(visualDocumentEditor, /data-markdown-resource-picker/);
  assert.match(visualDocumentEditor, /useFilesBrowseQuery/);
  assert.match(visualDocumentEditor, /relativePathFromMarkdown/);
  assert.match(visualDocumentEditor, /markdownDirectoryPath/);
  assert.match(visualDocumentEditor, /parentDirectoryPath/);
  assert.match(visualDocumentEditor, /isMarkdownResourceCandidate/);
  assert.match(visualDocumentEditor, /MARKDOWN_IMAGE_EXTENSIONS/);
  assert.match(visualDocumentEditor, /MARKDOWN_MEDIA_EXTENSIONS/);
  assert.match(visualDocumentEditor, /资源选择器/);
  assert.match(visualDocumentEditor, /文档目录/);
  assert.match(
    visualDocumentEditor,
    /可选\{pickerKind === "image" \? "图片" : "媒体"\}/,
  );
  assert.match(visualDocumentEditor, /资源路径/);
  assert.match(visualDocumentEditor, /粘贴路径\/URL/);
  assert.match(
    visualDocumentEditor,
    /block\.kind === "image" \|\| block\.kind === "video"/,
  );
  assert.match(css, /\.md-preview__article video/);
  assert.match(css, /\.md-preview__article audio/);
  assert.match(
    css,
    /\.md-preview__article li input\[type="checkbox"\]\.md-preview__task-toggle/,
  );
  assert.match(css, /max-height: 62vh/);
});

// ---------------------------------------------------------------------------
// Terminal remains xterm.js-backed.
// ---------------------------------------------------------------------------

test("WorkspaceTerminal imports @xterm/xterm", () => {
  const terminal = read("features/workspace/terminal/WorkspaceTerminal.tsx");
  const terminalSessionActions = read(
    "features/workspace/terminal/terminalSessionActions.tsx",
  );
  const terminalPanelCommands = read(
    "features/workspace/terminal/terminalPanelCommands.tsx",
  );
  const query = read("lib/query/terminal.ts");
  const api = read("lib/api/terminal.ts");
  assert.ok(
    terminal.includes("@xterm/xterm"),
    "WorkspaceTerminal must import @xterm/xterm",
  );
  assert.match(terminal, /useCreateTerminalSessionMutation/);
  assert.match(terminal, /useEndTerminalSessionMutation/);
  assert.match(terminal, /useDeleteTerminalSessionMutation/);
  assert.match(terminal, /useRenameTerminalSessionMutation/);
  assert.match(terminal, /TerminalController/);
  assert.match(terminal, /terminalControllerRef/);
  assert.match(terminal, /handleRenameSession/);
  assert.match(terminal, /submitRenameSession/);
  assert.match(terminal, /TerminalRenameDialog/);
  assert.match(terminal, /data-workspace-terminal-rename-dialog/);
  assert.match(terminal, /data-workspace-terminal-rename-input/);
  assert.match(terminal, /data-workspace-terminal-rename-submit/);
  assert.match(terminal, /maxLength=\{40\}/);
  assert.doesNotMatch(terminal, /window\.prompt/);
  assert.match(terminal, /handleClearSession/);
  assert.match(terminal, /handleCopyOutput/);
  assert.match(terminal, /handleInsertCwd/);
  assert.match(terminal, /handleSplitSession/);
  assert.match(terminal, /handleMoveSessionToEditor/);
  assert.match(terminal, /workspace-terminal-split/);
  assert.match(terminal, /tracevane:workspace-terminal-move-to-editor/);
  assert.match(terminal, /已创建右侧拆分终端/);
  assert.match(terminal, /终端编辑区标签入口已预留/);
  assert.match(terminal, /getTerminalVisibleOutput/);
  assert.match(terminal, /buffer\.active/);
  assert.match(terminal, /translateToString\(true\)/);
  assert.match(terminal, /onControllerChange/);
  assert.match(terminal, /paste: \(value: string\) => term\.paste\(value\)/);
  assert.match(terminal, /shellQuotePath\(cwd\)/);
  assert.match(terminal, /data-workspace-terminal-session-menu/);
  assert.match(terminal, /createTerminalSessionActions/);
  assert.match(terminal, /TerminalFontToolbar/);
  assert.match(terminal, /data-workspace-terminal-font-toolbar/);
  assert.match(terminal, /data-workspace-terminal-floating-collapsed/);
  assert.match(terminal, /TERMINAL_FLOATING_COLLAPSED_STORAGE_KEY/);
  assert.match(
    terminal,
    /tracevane\.workspace\.terminal-floating-collapsed\.v1/,
  );
  assert.match(terminal, /loadTerminalFloatingCollapsed/);
  assert.match(terminal, /saveTerminalFloatingCollapsed/);
  assert.match(terminal, /data-workspace-terminal-floating-edge-toggle/);
  assert.match(terminal, /展开终端悬浮菜单/);
  assert.match(terminal, /收起终端悬浮菜单/);
  assert.doesNotMatch(terminal, /data-workspace-terminal-toggle-maximize/);
  assert.doesNotMatch(
    terminal,
    /data-workspace-terminal-toggle-browser-fullscreen/,
  );
  assert.doesNotMatch(terminal, /data-workspace-terminal-unified-fullscreen/);
  assert.doesNotMatch(
    terminal,
    /data-workspace-terminal-fullscreen-single-action/,
  );
  assert.doesNotMatch(terminal, /getTerminalFullscreenAction/);
  assert.match(terminal, /data-workspace-terminal-interface-fullscreen/);
  assert.match(terminal, /data-workspace-terminal-browser-fullscreen/);
  assert.match(terminal, /终端界面全屏/);
  assert.match(terminal, /终端真实全屏/);
  assert.match(terminal, /onToggleMaximize/);
  assert.match(terminal, /onToggleBrowserFullscreen/);
  assert.match(terminal, /browserFullscreenAvailable/);
  assert.match(terminal, /TERMINAL_FONT_SIZE_STORAGE_KEY/);
  assert.match(terminal, /tracevane\.workspace\.terminal\.font-size\.v1/);
  assert.match(terminal, /loadTerminalFontSize/);
  assert.match(terminal, /saveTerminalFontSize/);
  assert.match(terminal, /data-workspace-terminal-pinch-zoom/);
  assert.match(terminal, /refitTerminalForViewportChange/);
  assert.match(terminal, /fitAndRevealCursor/);
  assert.match(terminal, /window\.setTimeout\(fitAndRevealCursor, 80\)/);
  assert.match(terminal, /window\.setTimeout\(fitAndRevealCursor, 220\)/);
  assert.match(terminal, /term\?\.scrollToBottom\(\)/);
  assert.match(terminal, /helperTextarea\(\)\?\.scrollIntoView/);
  assert.match(terminal, /distanceBetweenTouchPointers/);
  assert.match(terminal, /onPointerMoveCapture/);
  assert.match(terminal, /useTerminalTouchActionSurface/);
  assert.match(terminal, /data-workspace-terminal-action-sheet/);
  assert.match(terminal, /data-workspace-terminal-action-sheet-scrollport/);
  assert.match(terminal, /overscroll-contain/);
  assert.match(terminal, /env\(safe-area-inset-bottom\)/);
  assert.match(terminal, /groupTerminalSheetActions/);
  assert.match(terminal, /data-terminal-session-sheet-action-group/);
  assert.match(terminal, /data-terminal-session-sheet-shortcut=\{action\.id\}/);
  assert.match(
    terminal,
    /data-terminal-session-action-shortcut=\{action\.id\}/,
  );
  assert.match(terminal, /aria-keyshortcuts=\{action\.shortcut\}/);
  assert.match(terminal, /<kbd/);
  assert.match(terminal, /action\.shortcut/);
  assert.match(terminal, /terminalSheetActionHint/);
  assert.match(terminal, /separatorBefore \|\| groups\.length === 0/);
  assert.match(terminal, /触屏终端操作/);
  assert.match(terminal, /data-workspace-terminal-session-more/);
  assert.match(terminal, /touchActionSurface=\{touchActionSurface\}/);
  assert.match(terminal, /longPressTimerRef/);
  assert.match(terminal, /startTouchLongPress/);
  assert.match(terminal, /window\.setTimeout\(\(\) => \{/);
  assert.match(terminal, /event\.pointerType !== "touch"/);
  assert.match(terminal, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(
    terminal,
    /touchActionSurface \|\| activeSessionId === s\.sessionId/,
  );
  assert.match(terminal, /getDefaultTerminalFontSize/);
  assert.match(terminal, /max-width: 768px/);
  assert.match(terminal, /clampTerminalFontSize/);
  assert.match(terminal, /fontSize={fontSize}/);
  assert.match(terminal, /decreaseTerminalFontSize/);
  assert.match(terminal, /increaseTerminalFontSize/);
  assert.match(terminal, /resetTerminalFontSize/);
  assert.match(terminal, /decreaseFontSize: decreaseTerminalFontSize/);
  assert.match(terminal, /increaseFontSize: increaseTerminalFontSize/);
  assert.match(terminal, /resetFontSize: resetTerminalFontSize/);
  assert.match(terminal, /maximized,/);
  assert.match(terminal, /browserFullscreen,/);
  assert.match(terminal, /browserFullscreenAvailable,/);
  assert.match(terminal, /toggleMaximize: onToggleMaximize/);
  assert.match(terminal, /toggleBrowserFullscreen: onToggleBrowserFullscreen/);
  assert.match(terminal, /openActiveSessionActions: handleOpenSessionActions/);
  assert.match(terminal, /createTerminalPanelCommands/);
  assert.match(terminal, /onCommandsChange\?\.\(terminalCommands\)/);
  assert.match(terminal, /handleDiagnoseOutput/);
  assert.match(terminal, /formatTerminalAiContext/);
  assert.match(terminal, /copyTerminalAiContext/);
  assert.match(terminal, /"@terminal"/);
  assert.match(terminal, /已复制 @terminal 上下文/);
  assert.match(terminal, /formatTerminalDiagnosticContext/);
  assert.match(terminal, /Tracevane Terminal Diagnostic Context/);
  assert.match(terminal, /navigator\.clipboard\.writeText\(context\)/);
  assert.match(terminal, /已复制终端诊断上下文/);
  assert.match(terminal, /当前终端没有可诊断输出/);
  assert.doesNotMatch(terminal, /AI 终端诊断入口已预留/);
  assert.match(terminal, /data-terminal-session-action=\{action\.id\}/);
  assert.match(terminal, /clampFloatingTerminalMenuPosition/);
  assert.match(terminal, /max-h-\[min\(80vh,28rem\)\]/);
  assert.match(terminal, /deletePersistedSession/);
  assert.match(terminal, /session\?\.canResume/);
  assert.match(terminal, /endSession\.mutate/);
  assert.match(terminal, /deletePersistedSession\(\)/);
  assert.match(terminal, /删除终端记录失败/);
  assert.match(terminal, /关闭终端失败/);
  assert.match(terminal, /handleCloseOtherSessions/);
  assert.match(terminal, /已关闭其它终端/);
  assert.doesNotMatch(terminal, /<TerminalMenuButton onClick=\{onEnd\}/);
  assert.match(
    terminalSessionActions,
    /export interface TerminalSessionAction/,
  );
  assert.match(terminalSessionActions, /shortcut\?: string/);
  assert.match(terminalSessionActions, /shortcut: "Ctrl\+Shift\+`"/);
  assert.match(terminalSessionActions, /shortcut: "F2"/);
  assert.match(terminalSessionActions, /shortcut: "Ctrl\+Shift\+5"/);
  assert.match(terminalSessionActions, /shortcut: "Ctrl\+L"/);
  assert.match(terminalSessionActions, /shortcut: "Ctrl\+Shift\+C"/);
  assert.match(terminalSessionActions, /shortcut: "Delete"/);
  assert.match(
    terminalSessionActions,
    /export interface TerminalSessionActionRegistryInput/,
  );
  assert.match(terminalSessionActions, /createTerminalSessionActions/);
  assert.match(terminalSessionActions, /terminal\.session\.new/);
  assert.match(terminalSessionActions, /terminal\.session\.closeOthers/);
  assert.match(terminalSessionActions, /terminal\.session\.rename/);
  assert.match(terminalSessionActions, /terminal\.session\.splitRight/);
  assert.match(terminalSessionActions, /terminal\.session\.splitDown/);
  assert.match(terminalSessionActions, /terminal\.session\.moveToEditor/);
  assert.match(terminalSessionActions, /terminal\.session\.clear/);
  assert.match(terminalSessionActions, /terminal\.session\.copyOutput/);
  assert.match(terminalSessionActions, /terminal\.session\.copyAiContext/);
  assert.match(
    terminalSessionActions,
    /copyAiContext: \(session: TerminalSessionDescriptor\) => void/,
  );
  assert.match(terminalSessionActions, /复制 @terminal 上下文/);
  assert.match(terminalSessionActions, /terminal\.session\.insertCwd/);
  assert.match(terminalSessionActions, /terminal\.session\.end/);
  assert.match(terminalSessionActions, /terminal\.session\.delete/);
  assert.match(terminalSessionActions, /terminal\.session\.copyCwd/);
  assert.match(terminalSessionActions, /关闭其它终端/);
  assert.match(terminalSessionActions, /closeOtherSessions/);
  assert.match(terminalSessionActions, /重命名/);
  assert.match(terminalSessionActions, /向右拆分终端/);
  assert.match(terminalSessionActions, /向下拆分终端/);
  assert.match(terminalSessionActions, /移动到编辑区域/);
  assert.match(terminalSessionActions, /splitSession/);
  assert.match(terminalSessionActions, /moveSessionToEditor/);
  assert.match(terminalSessionActions, /清屏/);
  assert.match(terminalSessionActions, /复制输出/);
  assert.match(terminalSessionActions, /复制 @terminal 上下文/);
  assert.match(terminalSessionActions, /插入 cwd 到终端/);
  assert.match(terminalSessionActions, /复制 cwd/);
  assert.match(terminalSessionActions, /结束会话/);
  assert.match(terminalSessionActions, /删除记录/);
  assert.match(terminalSessionActions, /关闭并删除终端/);
  assert.match(terminalPanelCommands, /终端：关闭并删除当前会话/);
  assert.match(terminalPanelCommands, /先结束 \$\{activeSession\?\.title \|\| activeSessionId\}，再删除会话记录/);
  assert.match(
    terminalPanelCommands,
    /export interface TerminalPanelCommandRegistryInput/,
  );
  assert.match(terminalPanelCommands, /createTerminalPanelCommands/);
  assert.match(terminalPanelCommands, /terminal\.panel\.new/);
  assert.match(terminalPanelCommands, /terminal\.panel\.closeOthers/);
  assert.match(terminalPanelCommands, /terminal\.panel\.renameActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.splitRight/);
  assert.match(terminalPanelCommands, /terminal\.panel\.splitDown/);
  assert.match(terminalPanelCommands, /terminal\.panel\.moveToEditor/);
  assert.match(terminalPanelCommands, /terminal\.panel\.clearActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.copyOutput/);
  assert.match(terminalPanelCommands, /terminal\.panel\.copyAiContext/);
  assert.match(terminalPanelCommands, /terminal\.panel\.openActions/);
  assert.match(
    terminalPanelCommands,
    /openActiveSessionActions\?: \(session: TerminalSessionDescriptor\) => void/,
  );
  assert.match(
    terminalPanelCommands,
    /copyAiContext: \(session: TerminalSessionDescriptor\) => void/,
  );
  assert.match(terminalPanelCommands, /AI：复制当前终端上下文/);
  assert.match(terminalPanelCommands, /terminal\.panel\.insertCwd/);
  assert.match(terminalPanelCommands, /terminal\.panel\.endActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.deleteActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.clearArchived/);
  assert.match(terminalPanelCommands, /terminal\.panel\.copyCwd/);
  assert.match(
    terminalPanelCommands,
    /terminal\.panel\.toggleInterfaceFullscreen/,
  );
  assert.match(
    terminalPanelCommands,
    /terminal\.panel\.toggleBrowserFullscreen/,
  );
  assert.match(terminalPanelCommands, /maximized: boolean/);
  assert.match(terminalPanelCommands, /browserFullscreen: boolean/);
  assert.match(terminalPanelCommands, /toggleMaximize\?: \(\) => void/);
  assert.match(
    terminalPanelCommands,
    /toggleBrowserFullscreen\?: \(\) => void/,
  );
  assert.match(terminalPanelCommands, /终端：界面全屏/);
  assert.match(terminalPanelCommands, /终端：真实全屏/);
  assert.match(terminalPanelCommands, /保留应用导航能力/);
  assert.match(terminalPanelCommands, /Fullscreen API/);
  assert.match(
    terminalPanelCommands,
    /terminal\.panel\.toggleInterfaceFullscreen/,
  );
  assert.match(
    terminalPanelCommands,
    /terminal\.panel\.toggleBrowserFullscreen/,
  );
  assert.match(terminalPanelCommands, /terminal\.panel\.fontDecrease/);
  assert.match(terminalPanelCommands, /terminal\.panel\.fontIncrease/);
  assert.match(terminalPanelCommands, /terminal\.panel\.fontReset/);
  assert.match(terminalPanelCommands, /fontSize: number/);
  assert.match(terminalPanelCommands, /decreaseFontSize: \(\) => void/);
  assert.match(terminalPanelCommands, /increaseFontSize: \(\) => void/);
  assert.match(terminalPanelCommands, /resetFontSize: \(\) => void/);
  assert.match(terminalPanelCommands, /当前终端字体 \${fontSize}px/);
  assert.match(terminalPanelCommands, /恢复当前设备推荐的终端字体大小/);
  assert.match(terminalPanelCommands, /terminal\.panel\.ai\.diagnose/);
  assert.match(terminalPanelCommands, /终端：关闭其它会话/);
  assert.match(terminalPanelCommands, /终端：清理已结束记录/);
  assert.match(terminalPanelCommands, /archivedCount: number/);
  assert.match(terminalPanelCommands, /clearArchivedSessions: \(\) => void/);
  assert.match(terminalPanelCommands, /disabled: archivedCount === 0/);
  assert.match(terminalPanelCommands, /closeOtherSessions/);
  assert.match(terminalPanelCommands, /向右拆分当前会话/);
  assert.match(terminalPanelCommands, /向下拆分当前会话/);
  assert.match(terminalPanelCommands, /移动到编辑区域/);
  const workspaceCommands = read(
    "features/workspace/workbench/workspaceCommands.tsx",
  );
  assert.match(workspaceCommands, /workspace\.editor\.maximize/);
  assert.match(workspaceCommands, /workspace\.terminal\.maximize/);
  assert.match(workspaceCommands, /workspace\.terminal\.closePanel/);
  assert.match(terminalPanelCommands, /group: "终端"/);
  assert.match(terminal, /attachableSessions/);
  assert.match(terminal, /sessions=\{attachableSessions\}/);
  assert.match(terminal, /archivedCount=\{archivedSessions\.length\}/);
  assert.match(terminal, /data-terminal-roster-active-only/);
  assert.match(terminal, /TERMINAL_COMPACT_ROSTER_THRESHOLD/);
  assert.match(terminal, /TERMINAL_ICON_ONLY_ROSTER_THRESHOLD/);
  assert.match(terminal, /data-terminal-roster-compact/);
  assert.match(terminal, /data-terminal-roster-icon-only/);
  assert.match(terminal, /data-terminal-session-tab/);
  assert.match(terminal, /data-terminal-session-tab-icon-only/);
  assert.match(terminal, /inputRequest/);
  assert.match(terminal, /processedInputRequestRef/);
  assert.match(terminal, /terminalControllerVersion/);
  assert.match(terminal, /controller\.paste\(inputRequest\.value\)/);
  assert.match(terminal, /iconOnlyRoster \? 0 : compactRoster \? 12 : 18/);
  assert.match(terminal, /sr-only/);
  assert.match(terminal, /archivedSessions/);
  assert.match(terminal, /clearArchivedSessions: handleClearArchivedSessions/);
  assert.match(terminal, /archivedCount: archivedSessions\.length/);
  assert.match(
    terminal,
    /sessions\.filter\(\(session\) => !session\.canResume\)/,
  );
  assert.match(terminal, /data-terminal-archived-count/);
  assert.match(terminal, /data-terminal-history-trigger/);
  assert.match(terminal, /TerminalQuickActions/);
  assert.match(terminal, /data-workspace-terminal-quick-actions/);
  assert.match(terminal, /data-workspace-terminal-quick-copy-output/);
  assert.match(terminal, /data-workspace-terminal-quick-clear/);
  assert.match(terminal, /data-workspace-terminal-quick-ai-diagnose/);
  assert.match(terminal, /data-workspace-terminal-quick-new/);
  assert.match(terminal, /activeSession=\{activeSession\}/);
  assert.match(
    terminal,
    /const canUseActive = Boolean\(activeSession\?\.canResume\)/,
  );
  assert.match(terminal, /onDiagnoseOutput\(activeSession\)/);
  assert.match(terminal, /TerminalHistoryDialog/);
  assert.match(terminal, /data-workspace-terminal-history-dialog/);
  assert.match(terminal, /data-workspace-terminal-history-scrollport/);
  assert.match(terminal, /data-workspace-terminal-history-row/);
  assert.match(terminal, /data-workspace-terminal-history-delete/);
  assert.match(terminal, /data-workspace-terminal-history-clear-all/);
  assert.match(terminal, /handleClearArchivedSessions/);
  assert.match(terminal, /shortTerminalTitle/);
  assert.match(terminal, /maxLength = 18/);
  assert.match(terminal, /maxLength <= 0/);
  assert.match(terminal, /session\.title \|\| shortTerminalTitle\(session\)/);
  assert.match(terminal, /Terminal\\s\+/);
  assert.match(terminal, /normalized\.length <= maxLength/);
  assert.match(terminal, /normalized\.slice\(0, head\)/);
  assert.match(terminal, /normalized\.slice\(-tail\)/);
  assert.match(terminal, /session\.canResume/);
  assert.match(terminal, /已不可恢复/);
  assert.doesNotMatch(
    terminal,
    /fetch\(`\$\{STREAM_BASE\}\/\$\{encodeURIComponent\(newId\)\}\/stream`/,
  );
  assert.match(query, /useCreateTerminalSessionMutation/);
  assert.match(query, /useRenameTerminalSessionMutation/);
  assert.match(query, /renameTerminalSession/);
  assert.match(api, /createTerminalSession/);
  assert.match(api, /renameTerminalSession/);
  assert.match(api, /\/rename`/);
  assert.match(api, /`\$\{BASE\}\/sessions`/);
});

test("Workspace editor keeps document modes inside the file canvas and expands Monaco language support", () => {
  const stage = read("features/workspace/editor/WorkspaceEditorStage.tsx");
  const tabs = read("features/workspace/editor/EditorTabs.tsx");
  const editor = read("features/workspace/editor/CodeEditor.tsx");
  assert.match(stage, /tabRootIds/);
  assert.match(stage, /activeRootId/);
  assert.match(stage, /rootId: activeRootId/);
  assert.match(stage, /workspaceRootId\?: string/);
  assert.match(stage, /tabRootIds\[active\] \?\? rootId \?\? workspaceRootId/);
  assert.match(stage, /prev\[openFile\] === rootId/);
  assert.match(stage, /setTabRootIds/);
  assert.match(stage, /WorkspaceDocumentFloatingToolbar/);
  assert.match(stage, /viewModeCommands/);
  assert.match(stage, /editor\.viewMode\.\$\{mode\.id\}/);
  assert.match(stage, /switchEditorViewMode/);
  assert.match(stage, /absolute right-0 top-3/);
  assert.match(stage, /role="toolbar"/);
  assert.match(stage, /data-workspace-editor-floating-mode-select/);
  assert.match(stage, /data-workspace-editor-floating-collapsed/);
  assert.match(stage, /WORKSPACE_EDITOR_FLOATING_COLLAPSED_STORAGE_KEY/);
  assert.match(stage, /data-workspace-editor-floating-edge-toggle/);
  assert.doesNotMatch(tabs, /当前文件标签页内视图模式/);
  assert.doesNotMatch(tabs, /activeModeLabel/);
  assert.match(stage, /showModeSwitcher=\{false\}/);
  assert.doesNotMatch(editor, /runEditorAction/);
  assert.doesNotMatch(editor, /editor\.action\.startFindReplaceAction/);
  for (const contribution of [
    "go",
    "rust",
    "java",
    "php",
    "ruby",
    "dockerfile",
    "cpp",
    "csharp",
    "javascript",
    "typescript",
    "scss",
    "less",
    "bat",
    "powershell",
    "ini",
    "lua",
    "graphql",
    "hcl",
    "protobuf",
  ]) {
    assert.match(
      editor,
      new RegExp(
        `basic-languages/${contribution}/${contribution}\.contribution`,
      ),
    );
  }
  assert.match(editor, /monaco\.languages\.getLanguages\(\)/);
  assert.match(editor, /language\.filenames \?\? \[\]/);
  assert.match(editor, /language\.extensions \?\? \[\]/);
  assert.match(editor, /extensions\.sort/);
  assert.match(editor, /fileName\.endsWith\("\.vue"\)/);
  assert.match(editor, /fileName\.endsWith\("\.svelte"\)/);
  assert.match(editor, /fileName\.endsWith\("\.toml"\)/);
  assert.doesNotMatch(editor, /EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /COMPOUND_EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /FILE_NAME_LANGUAGE_MAP/);
});

test("Workspace explorer supports address-bar cwd, path copy, terminal drop, and upload auto-clear", () => {
  const explorer = read("features/workspace/files/WorkspaceExplorer.tsx");
  const fileTree = read("features/workspace/files/FileTree.tsx");
  const actionsMenu = read("features/workspace/files/FileActionsMenu.tsx");
  const terminal = read("features/workspace/terminal/WorkspaceTerminal.tsx");
  const terminalSessionActions = read(
    "features/workspace/terminal/terminalSessionActions.tsx",
  );
  const terminalPanelCommands = read(
    "features/workspace/terminal/terminalPanelCommands.tsx",
  );
  const workbench = read("features/workspace/workbench/WorkspaceWorkbench.tsx");

  assert.match(explorer, /data-workspace-explorer-compact-header/);
  assert.match(explorer, /data-workspace-explorer-address-bar/);
  assert.match(explorer, /data-workspace-explorer-breadcrumb-address/);
  assert.match(explorer, /data-workspace-explorer-address-edit-hotspot/);
  assert.match(explorer, /data-workspace-explorer-path-input/);
  assert.match(explorer, /data-workspace-explorer-default-directory/);
  assert.match(explorer, /WorkspaceAddressBar/);
  assert.match(explorer, /createWorkspaceAddressCrumbs/);
  assert.match(explorer, /WorkspaceExplorerMoreMenu/);
  assert.match(explorer, /data-workspace-explorer-more-menu/);
  assert.match(explorer, /返回上级目录/);
  assert.match(explorer, /更多文件操作/);
  assert.match(explorer, /设当前目录为默认工作区/);
  assert.match(explorer, /defaultDirectoryRef/);
  assert.match(explorer, /currentDirectoryByRootRef/);
  assert.match(explorer, /lastAppliedRootRef/);
  assert.match(explorer, /rememberedDirectory \?\?/);
  assert.match(explorer, /defaultDirectoryRef\.current = next/);
  assert.match(explorer, /WorkspaceExplorerRevealRequest/);
  assert.match(explorer, /revealRequest\?\.path/);
  assert.match(explorer, /parentOfPath\(revealRequest\.path\)/);
  assert.match(explorer, /setActiveEntry\(\{/);
  assert.match(workbench, /explorerRevealRequest/);
  assert.match(workbench, /revealInExplorer/);
  assert.match(workbench, /onRevealInExplorer: revealInExplorer/);
  assert.match(workbench, /splitEditorTab/);
  assert.match(workbench, /moveEditorTabToGroup/);
  assert.match(workbench, /tracevane:workspace-editor-tab-split/);
  assert.match(workbench, /tracevane:workspace-editor-tab-move-to-group/);
  assert.match(workbench, /onSplitTab: splitEditorTab/);
  assert.match(workbench, /onMoveTabToGroup: moveEditorTabToGroup/);
  assert.match(workbench, /onRevealInExplorer=\{context\.onRevealInExplorer\}/);
  assert.match(workbench, /onOpenFile=\{onOpenFile\}/);
  assert.match(workbench, /onRevealInExplorer=\{onRevealInExplorer\}/);
  assert.match(workbench, /onSplitTab=\{context\.onSplitTab\}/);
  assert.match(workbench, /onMoveTabToGroup=\{context\.onMoveTabToGroup\}/);
  assert.doesNotMatch(explorer, /appliedDefaultRootRef/);
  assert.match(explorer, /const workspaceLaunchDirectory =/);
  assert.match(
    explorer,
    /const workspaceBaseDirectory = workspaceLaunchDirectory/,
  );
  assert.match(explorer, /absoluteDisplayPath/);
  assert.match(explorer, /root\.absolutePath/);
  assert.match(explorer, /workspaceLaunchDirectory/);
  assert.match(explorer, /relativePath: workspaceLaunchDirectory/);
  assert.match(
    explorer,
    /currentDirectoryByRootRef\.current\[rootId\] = currentDirectory/,
  );
  assert.match(explorer, /const initialDirectory =/);
  assert.match(explorer, /basePath=""/);
  assert.match(explorer, /showBreadcrumb=\{false\}/);
  assert.doesNotMatch(explorer, /basePath=\{workspaceBaseDirectory\}/);
  assert.match(
    explorer,
    /className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden outline-none"/,
  );
  assert.match(actionsMenu, /onSetDefaultDirectoryRequest/);
  assert.match(actionsMenu, /设为工作区主目录/);
  assert.match(fileTree, /basePath\?: string/);
  assert.match(fileTree, /showBreadcrumb\?: boolean/);
  assert.match(fileTree, /showBreadcrumb = true/);
  assert.match(fileTree, /path=\{basePath\}/);
  assert.match(explorer, /tracevane\.workspace\.default-directory\.v1/);
  assert.match(explorer, /normalizeWorkspacePathInput/);
  assert.match(explorer, /onWorkspaceDirectoryChange\?\.\(/);
  assert.match(explorer, /clearUploadTaskSnapshots/);
  assert.match(explorer, /setUploadJobs\(\[\]\)/);
  assert.match(
    explorer,
    /saveUploadTaskSnapshots\(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY, \[\]\)/,
  );

  assert.match(actionsMenu, /onCopyNameRequest/);
  assert.match(actionsMenu, /复制文件名/);
  assert.match(actionsMenu, /onCopyNameRequest\(target\)/);
  assert.match(actionsMenu, /onCopyPathRequest/);
  assert.match(actionsMenu, /onInsertPathToTerminalRequest/);
  assert.match(actionsMenu, /插入路径到终端/);
  assert.match(actionsMenu, /TerminalSquare/);
  assert.match(actionsMenu, /复制相对路径/);
  assert.match(actionsMenu, /复制绝对路径/);
  assert.match(explorer, /copyName/);
  assert.match(explorer, /已复制文件名/);
  assert.match(explorer, /复制文件名失败/);
  assert.match(explorer, /onCopyNameRequest=\{\(target\) => void copyName\(target\)\}/);
  assert.match(explorer, /navigator\.clipboard\.writeText/);
  assert.match(explorer, /insertPathToTerminal/);
  assert.match(explorer, /shellQuoteWorkspacePath/);
  assert.match(explorer, /tracevane:workspace-terminal-insert-input/);
  assert.match(
    explorer,
    /onInsertPathToTerminalRequest=\{insertPathToTerminal\}/,
  );
  assert.match(explorer, /发送路径到终端输入/);
  assert.match(actionsMenu, /MessageSquarePlus/);
  assert.match(actionsMenu, /onCopyAiFileContextRequest/);
  assert.match(actionsMenu, /复制 @file 上下文/);
  assert.match(actionsMenu, /onCopyAiFileContextRequest\(target\)/);
  assert.match(explorer, /copyAiFileContext/);
  assert.match(explorer, /formatExplorerFileAiContext/);
  assert.match(explorer, /"@file"/);
  assert.match(explorer, /已复制 @file 上下文/);
  assert.match(explorer, /复制 @file 上下文失败/);
  assert.match(
    explorer,
    /onCopyAiFileContextRequest=\{\(target\) =>\s*void copyAiFileContext\(target\)\s*\}/,
  );

  const uploadSnapshots = read(
    "features/workspace/files/uploadTaskSnapshots.ts",
  );
  assert.match(uploadSnapshots, /UPLOAD_TASK_SNAPSHOT_MAX_AGE_MS/);
  assert.match(uploadSnapshots, /RECOVERABLE_UPLOAD_SNAPSHOT_STATUSES/);
  assert.match(uploadSnapshots, /window\.localStorage\.removeItem/);
  assert.match(uploadSnapshots, /snapshot\.status\)/);
  assert.match(fileTree, /focusedPath\?: string/);
  assert.match(fileTree, /rootAbsolutePath\?: string/);
  assert.match(fileTree, /draggable/);
  assert.match(fileTree, /application\/x-tracevane-file-absolute-path/);
  assert.match(fileTree, /shellQuotePath/);

  assert.match(workbench, /workspaceDirectory/);
  assert.match(
    workbench,
    /onWorkspaceDirectoryChange=\{setWorkspaceDirectory\}/,
  );
  assert.match(workbench, /useMediaQuery\("\(max-width: 768px\)"\)/);
  assert.match(workbench, /data-workspace-responsive-shell/);
  assert.match(
    workbench,
    /data-workspace-mobile=\{isMobileWorkbench \? "true" : "false"\}/,
  );
  assert.match(workbench, /data-workspace-main-stage/);
  assert.match(workbench, /data-workspace-maximized-dock/);
  assert.match(workbench, /workspace-shell-immersive/);
  assert.match(workbench, /data-workspace-immersive-panel/);
  assert.match(workbench, /data-workspace-immersive-controls/);
  assert.match(workbench, /preMaximizeLayoutRef/);
  assert.match(workbench, /maximizedDockPanelRef/);
  assert.match(workbench, /restoreDockLayout/);
  assert.match(workbench, /standaloneDockPanelSpec/);
  assert.match(workbench, /api\.toJSON\(\)/);
  assert.match(
    workbench,
    /api\.fromJSON\(previous, \{ reuseExistingPanels: false \}\)/,
  );
  assert.match(workbench, /event\.key !== "Escape"/);
  assert.match(workbench, /沉浸模式 · Esc 退出/);
  assert.match(workbench, /workspace-dock-maximized/);
  const workbenchCss = read(
    "features/workspace/workbench/workspace-workbench.css",
  );
  assert.match(workbenchCss, /workspace-shell-immersive/);
  assert.match(workbenchCss, /grid-template-rows: minmax\(0, 1fr\) !important/);
  const layoutController = read(
    "features/workspace/workbench/workbenchLayoutController.ts",
  );
  assert.match(workbench, /from "\.\/workbenchLayoutController"/);
  assert.match(workbench, /deriveWorkspaceLayoutMode/);
  assert.match(layoutController, /export function deriveWorkspaceLayoutMode/);
  assert.match(layoutController, /export type WorkspaceShellMode/);
  assert.match(layoutController, /export interface WorkspaceLayoutMode/);
  assert.match(workbench, /data-workspace-layout-controller="unified-v1"/);
  assert.match(
    workbench,
    /data-workspace-layout-mode=\{layoutMode\.shellMode\}/,
  );
  assert.match(workbench, /workspace-mobile-browser-fullscreen/);
  assert.match(layoutController, /shellImmersive: false/);
  assert.match(
    layoutController,
    /mobileNavOverlay:[\s\S]*browserFullscreen \|\| mobilePanelFullscreen \|\| dockImmersive/,
  );
  assert.match(
    layoutController,
    /showDockQuickControls: browserFullscreen \|\| dockImmersive/,
  );
  assert.match(
    layoutController,
    /reserveMobileNav:[\s\S]*browserFullscreen \|\| mobilePanelFullscreen \|\| dockImmersive/,
  );
  assert.match(
    layoutController,
    /shellImmersive: dockImmersive \|\| browserFullscreen/,
  );
  assert.match(workbenchCss, /workspace-mobile-browser-fullscreen/);
  assert.match(workbenchCss, /data-workspace-mobile-panel-nav-reserved="true"/);
  assert.match(workbenchCss, /data-workspace-explorer-scrollport/);
  assert.match(workbenchCss, /data-workspace-search-scrollport/);
  assert.match(workbenchCss, /data-workspace-git-scrollport/);
  assert.match(
    workbenchCss,
    /scroll-padding-bottom: calc\(var\(--workspace-mobile-nav-height\)/,
  );
  assert.match(
    workbenchCss,
    /workspace-mobile-browser-fullscreen > nav[\s\S]*display: grid !important/,
  );
  assert.match(workbenchCss, /env\(safe-area-inset-top\)/);
  assert.match(
    workbenchCss,
    /workspace-dock-maximized > :not\(\.tracevane-dockview\)/,
  );
  assert.match(workbench, /WorkbenchDockQuickControls/);
  assert.match(workbench, /data-workspace-dock-quick-controls/);
  assert.match(workbench, /data-workspace-dock-controls-collapsed/);
  assert.match(workbench, /data-workspace-dock-controls-edge-toggle/);
  assert.match(workbench, /onToggleTerminalBrowserFullscreen/);
  assert.match(workbench, /terminalBrowserFullscreen/);
  assert.match(workbench, /browserFullscreenAvailable/);
  assert.match(workbench, /closeDockPanel/);
  assert.match(workbench, /toggleMaximizedDockPanel/);
  assert.match(
    workbench,
    /apiRef\.current\?\.getPanel\(panel\)\?\.api\.close\(\)/,
  );
  assert.match(workbench, /data-workspace-mobile-inline-panels/);
  assert.match(workbench, /data-workspace-mobile-panel-dock/);
  assert.match(workbench, /data-workspace-mobile-nav/);
  assert.match(workbench, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(workbench, /aria-controls=\{controls\}/);
  assert.match(workbench, /aria-expanded=\{expanded\}/);
  assert.match(workbench, /mobileSidePanelDockId/);
  assert.match(workbench, /mobileSidePanelId/);
  assert.match(workbench, /id=\{id\}/);
  assert.match(workbench, /controls=\{mobileSidePanelId\}/);
  assert.doesNotMatch(workbench, /aria-pressed=\{active\}/);
  assert.match(workbench, /data-workspace-mobile-nav-button-active/);
  assert.match(workbench, /data-workspace-mobile-nav-button=\{dataAttr\}/);
  assert.match(workbench, /长按打开操作菜单/);
  assert.match(workbench, /data-workspace-mobile-nav-long-press-menu/);
  assert.match(workbench, /grid-rows-\[40px_minmax\(0,1fr\)_auto\]/);
  assert.match(workbench, /env\(safe-area-inset-bottom\)/);
  assert.match(workbench, /toggleMobileTerminalPanel/);
  assert.match(workbench, /apiRef\.current\?\.getPanel\("terminal"\)/);

  const commands = read("features/workspace/workbench/workspaceCommands.tsx");
  assert.match(
    commands,
    /dockSidePanel\?: \(panel: WorkspaceSidePanelCommand\) => void/,
  );
  assert.match(commands, /id: "workspace\.files\.dock"/);
  assert.match(commands, /id: "workspace\.search\.dock"/);
  assert.match(commands, /id: "workspace\.git\.dock"/);
  assert.match(commands, /dockSidePanel\?\.\("explorer"\)/);
  assert.match(commands, /dockSidePanel\?\.\("search"\)/);
  assert.match(commands, /dockSidePanel\?\.\("git"\)/);
  assert.match(commands, /id: "workspace\.files\.maximize"/);
  assert.match(commands, /id: "workspace\.search\.maximize"/);
  assert.match(commands, /id: "workspace\.git\.maximize"/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("explorer"\)/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("search"\)/);
  assert.match(commands, /toggleMaximizedDockPanel\?\.\("git"\)/);
  assert.match(commands, /id: "workspace\.files\.closePanel"/);
  assert.match(commands, /id: "workspace\.search\.closePanel"/);
  assert.match(commands, /id: "workspace\.git\.closePanel"/);
  assert.match(commands, /closeDockPanel\?\.\("explorer"\)/);
  assert.match(commands, /closeDockPanel\?\.\("search"\)/);
  assert.match(commands, /closeDockPanel\?\.\("git"\)/);
  assert.match(workbench, /terminalDockOpen/);
  assert.match(
    workbench,
    /setTerminalDockOpen\(Boolean\(event\.api\.getPanel\("terminal"\)\)\)/,
  );
  assert.match(
    workbench,
    /if \(panel === "terminal"\) setTerminalDockOpen\(true\)/,
  );
  assert.match(
    workbench,
    /if \(panel === "terminal"\) setTerminalDockOpen\(false\)/,
  );
  assert.match(
    workbench,
    /setBrowserFullscreenPanel\(\(current\) =>[\s\S]*current === panel \? null : current/,
  );
  assert.match(workbench, /document\.exitFullscreen\(\)\.catch/);
  assert.match(workbench, /onToggleTerminal=\{toggleMobileTerminalPanel\}/);
  assert.match(workbench, /terminalOpen=\{terminalDockOpen\}/);
  assert.match(workbench, /label=\{terminalOpen \? "收起" : "终端"\}/);
  assert.match(workbench, /active=\{terminalOpen\}/);
  assert.match(workbench, /overlay=\{layoutMode\.mobileNavOverlay\}/);
  assert.match(workbench, /fixed inset-x-0 bottom-0 z-\[90\]/);
  assert.match(workbench, /layoutMode\.showDockQuickControls/);
  assert.match(workbench, /maximizedDockPanel !== "terminal"/);
  assert.match(workbench, /browserFullscreenPanel !== "terminal"/);
  assert.match(
    workbench,
    /grid-rows-\[minmax\(0,1fr\)_minmax\(0,var\(--workspace-mobile-panel-height\)\)\]/,
  );
  assert.match(workbench, /data-workspace-mobile-panel-resizer/);
  assert.match(workbench, /data-workspace-mobile-panel-height/);
  assert.match(workbench, /data-workspace-mobile-panel-fullscreen/);
  assert.match(workbench, /mobileSidePanelOverTerminal/);
  assert.match(workbench, /maximizedDockPanel === "terminal"/);
  assert.match(workbench, /browserFullscreenPanel === "terminal"/);
  assert.match(workbench, /overTerminal=\{mobileSidePanelOverTerminal\}/);
  assert.match(workbench, /overTerminal\?: boolean/);
  assert.match(workbench, /data-workspace-mobile-panel-over-terminal/);
  assert.match(workbench, /overTerminal && "z-\[110\]"/);
  assert.match(workbench, /fullscreen && overTerminal && "z-\[120\]"/);
  assert.match(workbench, /data-workspace-mobile-panel-reserves-nav/);
  assert.match(workbench, /data-workspace-mobile-panel-nav-reserved/);
  assert.match(workbench, /--workspace-mobile-nav-height/);
  assert.match(workbench, /bottom-\[var\(--workspace-mobile-nav-height\)\]/);
  assert.doesNotMatch(workbench, /fixed inset-0 z-\[80\] h-dvh/);
  assert.match(workbench, /data-workspace-mobile-panel-snap-controls/);
  assert.match(workbench, /data-workspace-mobile-panel-snap=\{point\}/);
  assert.match(workbench, /MOBILE_PANEL_SNAP_POINTS/);
  assert.match(workbench, /MOBILE_PANEL_DRAG_UPDATE_THRESHOLD = 0\.6/);
  assert.match(workbench, /lastCommittedHeight/);
  assert.match(workbench, /commitPendingHeight/);
  assert.match(workbench, /data-workspace-mobile-panel-content/);
  assert.match(workbench, /MAX_MOBILE_PANEL_HEIGHT = 100/);
  assert.match(workbench, /FULLSCREEN_MOBILE_PANEL_HEIGHT = 96/);
  assert.match(workbench, /\[30, 42, 58, 76, 100\]/);
  assert.match(workbench, /window\.visualViewport\?\.height/);
  assert.match(workbench, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(
    workbench,
    /data-workspace-mobile-panel-resizing=\{dragging \? "true" : "false"\}/,
  );
  assert.match(workbench, /requestAnimationFrame/);
  assert.match(workbench, /snapMobilePanelHeight/);
  assert.match(workbench, /touch-none/);
  assert.doesNotMatch(workbench, /data-workspace-mobile-side-sheet/);
  assert.doesNotMatch(workbench, /fixed inset-x-3 bottom-16 top-12/);
  assert.match(workbench, /sidePanelTitle\(activeSidePanel\)/);
  assert.match(workbenchCss, /workspace-mobile-panel-resizing/);
  assert.match(workbenchCss, /will-change: height, transform/);
  assert.match(workbenchCss, /contain: layout paint/);
  assert.match(workbenchCss, /data-workspace-mobile-panel-content/);
  assert.match(workbenchCss, /pointer-events: none/);
  assert.match(fileTree, /data-workspace-file-tree-row-more/);
  assert.match(fileTree, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(fileTree, /onPointerDown/);
  assert.match(fileTree, /onPointerMove/);
  assert.match(
    fileTree,
    /Math\.hypot\(event\.clientX - state\.x, event\.clientY - state\.y\)/,
  );
  assert.match(fileTree, /moved > 12/);
  assert.match(fileTree, /openContextMenuAt/);
  assert.match(fileTree, /opacity-100 md:opacity-0 md:group-hover:opacity-100/);
  assert.match(explorer, /data-workspace-explorer-action-sheet/);
  assert.match(explorer, /data-workspace-explorer-action-sheet-scrollport/);
  assert.match(explorer, /data-workspace-explorer-touch-action-group="manage"/);
  assert.match(explorer, /手机端不依赖鼠标右键/);
  assert.match(terminal, /cwd: workspaceDirectory\?\.absolutePath \?\? null/);
  assert.match(terminal, /data-workspace-terminal-drop-target/);
  assert.match(terminal, /application\/x-tracevane-file-absolute-path/);
  assert.match(terminal, /termRef\.current\?\.paste\(data\)/);
  assert.match(terminal, /TerminalFontToolbar/);
  assert.match(terminal, /data-workspace-terminal-font-toolbar/);
  assert.match(terminal, /TERMINAL_FONT_SIZE_STORAGE_KEY/);
  assert.match(terminal, /data-workspace-terminal-pinch-zoom/);
  assert.match(terminal, /data-workspace-terminal-touch-scroll/);
  assert.match(terminal, /useVisualViewportKeyboardInset/);
  assert.match(terminal, /data-workspace-terminal-keyboard-inset/);
  const keyboardInsetHook = read(
    "features/workspace/shared/useVisualViewportKeyboardInset.ts",
  );
  assert.match(keyboardInsetHook, /VisualViewport/);
  assert.match(
    keyboardInsetHook,
    /targetRef\?: React\.RefObject<HTMLElement \| null>/,
  );
  assert.match(keyboardInsetHook, /viewport\.height \+ viewport\.offsetTop/);
  assert.match(keyboardInsetHook, /targetRect\.bottom - visualBottom/);
  assert.match(keyboardInsetHook, /getFocusedRectInside/);
  assert.match(keyboardInsetHook, /getSelectionRectInside/);
  assert.match(keyboardInsetHook, /getTextareaCaretApproxRect/);
  assert.match(
    keyboardInsetHook,
    /if \(!focusedRect && requireFocusedTarget\) \{/,
  );
  assert.match(keyboardInsetHook, /setInset\(0\);/);
  assert.match(keyboardInsetHook, /MAX_SURFACE_SHRINK_RATIO/);
  assert.match(keyboardInsetHook, /window\.innerHeight\) - visualBottom/);
  assert.match(terminal, /surfaceRef = React\.useRef/);
  assert.match(terminal, /useVisualViewportKeyboardInset\(surfaceRef, \{/);
  assert.match(terminal, /includeViewportOverlayInset: true/);
  assert.match(terminal, /requireFocusedTarget: false/);
  assert.match(keyboardInsetHook, /includeViewportOverlayInset\?: boolean/);
  assert.match(keyboardInsetHook, /getViewportOverlayKeyboardInset/);
  assert.match(keyboardInsetHook, /getVirtualKeyboardInset/);
  assert.match(keyboardInsetHook, /geometrychange/);
  assert.match(terminal, /data-workspace-terminal-keyboard-surface="outer"/);
  assert.match(terminal, /term\?\.scrollToBottom\(\)/);
  assert.match(terminal, /\.xterm-helper-textarea/);
  assert.match(
    terminal,
    /scrollIntoView\(\{[\s\S]*block: "nearest",[\s\S]*inline: "nearest",[\s\S]*\}\)/,
  );
  assert.match(
    terminal,
    /grid-rows-\[minmax\(0,var\(--workspace-terminal-visual-height,1fr\)\)_auto\]/,
  );
  assert.match(terminal, /"--workspace-terminal-visual-height"/);
  assert.match(terminal, /`calc\(100% - \$\{keyboardInset\}px\)`/);
  assert.match(terminal, /height: "100%"/);
  assert.match(terminal, /data-workspace-terminal-keyboard-spacer/);
  assert.match(terminal, /height: keyboardInset \|\| 0/);
  assert.doesNotMatch(terminal, /paddingBottom: keyboardInset/);
  assert.match(terminal, /touchScrollRef/);
  assert.match(terminal, /TERMINAL_TOUCH_SCROLL_PX_PER_LINE/);
  assert.match(terminal, /TERMINAL_TOUCH_SCROLL_MAX_LINES/);
  assert.match(terminal, /data-workspace-terminal-touch-scroll-capture/);
  assert.match(
    terminal,
    /event\.currentTarget\.setPointerCapture\?\.\(event\.pointerId\)/,
  );
  assert.match(
    terminal,
    /Math\.round\(magnitude \/ TERMINAL_TOUCH_SCROLL_PX_PER_LINE\)/,
  );
  assert.match(terminal, /clampTerminalTouchScrollLines/);
  assert.match(
    terminal,
    /termRef\.current\?\.scrollLines\(delta > 0 \? -lines : lines\)/,
  );
  assert.match(terminal, /data-workspace-terminal-action-sheet/);
  assert.match(terminal, /data-workspace-terminal-session-more/);
  assert.match(terminal, /handleCloseRightSessions/);
  assert.match(terminal, /rightSessionsOf/);
  assert.match(terminalSessionActions, /terminal\.session\.closeRight/);
  assert.match(terminal, /getDefaultTerminalFontSize/);
  assert.match(terminal, /max-width: 768px/);
  assert.match(terminal, /clampTerminalFontSize/);
  assert.match(terminal, /fontSize={fontSize}/);
  assert.match(terminal, /createTerminalPanelCommands/);
  assert.match(terminal, /terminalCommands/);
  assert.match(terminalPanelCommands, /terminal\.panel\.new/);
  assert.match(terminalPanelCommands, /terminal\.panel\.closeOthers/);
  assert.match(terminalPanelCommands, /terminal\.panel\.clearArchived/);
  assert.match(terminalPanelCommands, /terminal\.panel\.closeRight/);
  assert.match(terminalPanelCommands, /rightSessionCount/);
  assert.match(terminalPanelCommands, /terminal\.panel\.fontDecrease/);
  assert.match(terminalPanelCommands, /terminal\.panel\.fontIncrease/);
  assert.match(terminalPanelCommands, /terminal\.panel\.fontReset/);
  assert.match(terminalPanelCommands, /terminal\.panel\.ai\.diagnose/);
  const workspaceCommands = read(
    "features/workspace/workbench/workspaceCommands.tsx",
  );
  assert.match(workspaceCommands, /workspace\.editor\.maximize/);
  assert.match(workspaceCommands, /workspace\.terminal\.maximize/);
  assert.match(workspaceCommands, /workspace\.terminal\.closePanel/);
  const gitPanel = read("features/workspace/git/WorkspaceGitPanel.tsx");
  const gitChangeActions = read("features/workspace/git/gitChangeActions.tsx");
  const gitPanelCommands = read("features/workspace/git/gitPanelCommands.tsx");
  const gitApi = read("lib/api/git.ts");
  const gitQuery = read("lib/query/git.ts");
  assert.match(gitPanel, /createGitChangeActions/);
  assert.match(gitPanel, /createGitPanelCommands/);
  assert.match(gitPanel, /requestBranchSwitch/);
  assert.match(gitPanel, /branchMenu/);
  assert.match(gitPanel, /activeBranchName/);
  assert.match(gitPanel, /activeBranch/);
  assert.match(gitPanel, /openGitBranchActions/);
  assert.match(gitPanel, /createGitBranchActions/);
  assert.match(gitPanel, /GitBranchContextMenu/);
  assert.match(gitPanel, /GitBranchActionSheet/);
  assert.match(gitPanel, /data-workspace-git-branch-menu/);
  assert.match(gitPanel, /GitTouchActionSheetShell/);
  assert.match(gitPanel, /data-workspace-git-touch-action-sheet/);
  assert.match(gitPanel, /data-workspace-git-touch-action-sheet-panel/);
  assert.match(gitPanel, /data-workspace-git-touch-action-sheet-scrollport/);
  assert.match(gitPanel, /data-workspace-git-sheet-scrollport=\{scrollportDataAttr\}/);
  assert.match(gitPanel, /max-h-\[calc\(100dvh-0\.75rem\)\]/);
  assert.match(gitPanel, /max-h-\[calc\(100dvh-6\.75rem-env\(safe-area-inset-bottom\)\)\]/);
  assert.match(gitPanel, /function GitTouchSheetActionButton/);
  assert.match(gitPanel, /dataAttr: "branch" \| "commit" \| "change"/);
  assert.match(gitPanel, /data-workspace-git-branch-action-sheet/);
  assert.match(gitPanel, /data-workspace-git-branch-action-sheet-scrollport/);
  assert.match(gitPanel, /data-git-branch-action=\{action\.id\}/);
  assert.match(gitPanel, /data-git-branch-action-shortcut=\{action\.id\}/);
  assert.match(gitPanel, /data-git-branch-sheet-action=\{dataAttr === "branch" \? action\.id : undefined\}/);
  assert.match(gitPanel, /data-git-branch-sheet-shortcut=\{dataAttr === "branch" \? action\.id : undefined\}/);
  assert.match(gitPanel, /data-workspace-git-branch-more/);
  assert.match(gitPanel, /formatGitBranchContext/);
  assert.match(gitPanel, /"@git branch"/);
  assert.match(gitPanel, /已复制 Git 分支上下文/);
  assert.match(gitPanel, /AI 分支解释入口已预留/);
  assert.match(gitPanel, /aria-keyshortcuts=\{action\.shortcut\}/);
  assert.match(gitPanel, /<kbd/);
  assert.match(gitPanel, /git\.branch\.checkout/);
  assert.match(gitPanel, /git\.branch\.createFrom/);
  assert.match(gitPanel, /git\.branch\.copyName/);
  assert.match(gitPanel, /git\.branch\.copyContext/);
  assert.match(gitPanel, /git\.branch\.explain/);
  assert.match(gitPanel, /shortcut: "Ctrl\+Shift\+B"/);
  assert.match(gitPanel, /branches,/);
  assert.match(gitPanel, /commits,/);
  assert.match(gitPanel, /copyCommitContext: copyGitCommitContext/);
  assert.match(gitPanel, /openCommitDetails/);
  assert.match(gitPanel, /selectedCommit/);
  assert.match(gitPanel, /GitCommitDetailsPanel/);
  assert.match(gitPanel, /data-workspace-git-commit-details-panel/);
  assert.match(gitPanel, /data-workspace-git-commit-details-copy-context/);
  assert.match(gitPanel, /data-workspace-git-open-commit-details/);
  assert.match(gitPanel, /copyGitCommitDiffContext/);
  assert.match(gitPanel, /formatGitCommitDiffContext/);
  assert.match(gitPanel, /@git commit-diff/);
  assert.match(gitPanel, /data-workspace-git-commit-details-copy-diff-context/);
  assert.match(gitPanel, /data-git-commit-action-shortcut=\{action\.id\}/);
  assert.match(gitPanel, /data-git-commit-sheet-shortcut=\{dataAttr === "commit" \? action\.id : undefined\}/);
  assert.match(gitPanel, /shortcut: "Ctrl\+K C"/);
  assert.match(gitPanel, /data-workspace-git-commit-details-files/);
  assert.match(gitPanel, /data-workspace-git-commit-details-file/);
  assert.match(gitPanel, /data-workspace-git-commit-details-diff/);
  assert.match(gitPanel, /data-workspace-git-commit-details-diff-truncated/);
  assert.match(gitPanel, /detail\.files/);
  assert.match(gitPanel, /detail\.diff/);
  assert.match(gitPanel, /detail\.binary/);
  assert.match(gitPanel, /detail\.truncated/);
  assert.match(gitPanel, /git.commit.openDetails/);
  assert.match(gitPanel, /onDoubleClick=\{\(\) => onOpenDetails\(commit\)\}/);
  assert.match(gitPanel, /branchCreateDialogOpen/);
  assert.match(gitPanel, /branchCreateDraft/);
  assert.match(gitPanel, /branchCreateFrom/);
  assert.match(gitPanel, /setBranchCreateFrom\(target\)/);
  assert.match(gitPanel, /const from = branchCreateFrom\?\.name/);
  assert.match(gitPanel, /name: nextName, checkout: true, from/);
  assert.match(gitPanel, /setBranchCreateFrom\(null\)/);
  assert.match(gitPanel, /data-workspace-git-branch-create-from/);
  assert.match(gitPanel, /openCreateBranchDialog/);
  assert.match(gitPanel, /handleCreateBranch/);
  assert.match(gitPanel, /handleCreateBranchDialogOpenChange/);
  assert.match(gitPanel, /createDialogOpen=\{branchCreateDialogOpen\}/);
  assert.match(gitPanel, /createFrom=\{branchCreateFrom\}/);
  assert.match(gitPanel, /onOpenCreateDialog=\{openCreateBranchDialog\}/);
  assert.match(gitPanel, /onDraftNameChange=\{setBranchCreateDraft\}/);
  assert.match(gitPanel, /onCommandsChange\?\.\(gitCommands\)/);
  assert.match(gitPanel, /handleStageFiles/);
  assert.match(gitPanel, /handleUnstageFiles/);
  assert.match(gitPanel, /AI Git 总结入口已预留/);
  assert.match(gitPanel, /GitQuickActions/);
  assert.match(gitPanel, /data-workspace-git-quick-actions/);
  assert.match(gitPanel, /data-workspace-git-quick-actions-density="compact-menu-v1"/);
  assert.match(gitPanel, /data-workspace-git-quick-primary/);
  assert.match(gitPanel, /data-workspace-git-quick-summary/);
  assert.match(gitPanel, /primaryRemoteAction/);
  assert.match(gitPanel, /data-workspace-git-primary-remote-action/);
  assert.match(gitPanel, /data-workspace-git-publish=\{!upstream \? "primary" : undefined\}/);
  assert.match(gitPanel, /data-workspace-git-sync=\{upstream \? "primary" : undefined\}/);
  assert.match(gitPanel, /data-workspace-git-quick-more/);
  assert.match(gitPanel, /data-workspace-git-quick-menu/);
  assert.match(gitPanel, /data-workspace-git-quick-menu-scrollport/);
  assert.match(gitPanel, /max-h-\[min\(72dvh,22rem\)\]/);
  assert.match(gitPanel, /function GitQuickMenuButton/);
  assert.match(gitPanel, /data-workspace-git-quick-menu-action/);
  assert.match(gitPanel, /复制 Git AI 上下文/);
  assert.match(gitPanel, /aria-haspopup="menu"/);
  assert.match(gitPanel, /aria-expanded=\{menuOpen\}/);
  assert.match(gitPanel, /setMenuOpen\(false\)/);
  assert.match(gitPanel, /data-workspace-git-stage-all/);
  assert.match(gitPanel, /dataAttr="unstage-all"/);
  assert.match(gitPanel, /dataAttr="stash-save"/);
  assert.match(gitPanel, /dataAttr="pull"/);
  assert.match(gitPanel, /dataAttr="push"/);
  assert.match(gitPanel, /dataAttr="sync"/);
  assert.match(gitPanel, /dataAttr="copy-branch"/);
  assert.match(gitPanel, /dataAttr="explain-status"/);
  assert.match(gitPanel, /data-workspace-git-explain-status/);
  assert.match(gitPanel, /stageAllChanges/);
  assert.match(gitPanel, /unstageAllChanges/);
  assert.match(gitPanel, /copyCurrentBranch/);
  assert.match(gitPanel, /gitStatusContext/);
  assert.match(gitPanel, /formatGitStatusContext/);
  assert.match(gitPanel, /formatGitChangeContext/);
  assert.match(gitPanel, /"@git status"/);
  assert.match(gitPanel, /"@git diff"/);
  assert.match(gitPanel, /navigator\.clipboard\.writeText\(gitStatusContext\)/);
  assert.match(gitPanel, /navigator\.clipboard\.writeText\(context\)/);
  assert.match(gitPanel, /已复制 Git AI 上下文/);
  assert.match(gitPanel, /已复制 Git Diff 上下文/);
  assert.match(gitPanel, /items\.slice\(0, 12\)/);
  assert.match(gitPanel, /items\.length > 12/);
  assert.match(gitPanel, /appendGroup\("conflicts", conflicts\)/);
  assert.match(gitPanel, /previousPath: \$\{change\.previousPath\}/);
  assert.match(gitPanel, /scope: untracked file metadata/);
  assert.match(gitPanel, /copyGitDiffContext/);
  assert.match(gitPanel, /export interface WorkspaceGitDiffTarget/);
  assert.match(gitPanel, /openDiffTarget/);
  assert.match(gitPanel, /staged: change\.staged/);
  assert.match(gitPanel, /untracked: change\.kind === "untracked"/);
  assert.match(gitPanel, /kind: change\.kind/);
  assert.match(gitPanel, /openDiff: openDiffTarget/);
  assert.match(gitChangeActions, /openDiff: \(change: GitFileChange\) => void/);
  assert.match(gitChangeActions, /run: \(\) => openDiff\(change\)/);
  assert.match(gitPanel, /onOpenFile\?: \(path: string\) => void/);
  assert.match(gitPanel, /openFile: onOpenFile/);
  assert.match(gitPanel, /copyGitChangePath/);
  assert.match(gitPanel, /formatGitAbsolutePath/);
  assert.match(gitPanel, /repositoryRoot = status\.data\?\.repositoryRoot/);
  assert.match(gitPanel, /已复制 Git 相对路径/);
  assert.match(gitPanel, /已复制 Git 绝对路径/);
  assert.match(gitPanel, /onRevealInExplorer\?: \(path: string\) => void/);
  assert.match(gitPanel, /revealInExplorer: onRevealInExplorer/);
  assert.match(gitPanel, /insertGitChangePathToTerminal/);
  assert.match(gitPanel, /tracevane:workspace-terminal-insert-input/);
  assert.match(gitPanel, /shellQuoteGitPath/);
  assert.match(gitPanel, /已插入 Git 文件路径到终端/);
  assert.match(gitPanel, /insertPathToTerminal: insertGitChangePathToTerminal/);
  assert.match(gitPanel, /explainDiff: copyGitDiffContext/);
  assert.match(gitPanel, /<PanelShell scrollManaged>/);
  assert.match(gitPanel, /data-workspace-git-panel-shell/);
  assert.match(gitPanel, /scrollManaged && "h-full overflow-hidden"/);
  assert.match(gitPanel, /selectedChangePaths/);
  assert.match(gitPanel, /selectedChangePathSet/);
  assert.match(gitPanel, /selectedChanges/);
  assert.match(gitPanel, /selectedStageableChanges/);
  assert.match(gitPanel, /selectedStagedChanges/);
  assert.match(gitPanel, /selectGitChange/);
  assert.match(gitPanel, /toggleGitChangeSelected/);
  assert.match(gitPanel, /lastSelectedChangePath/);
  assert.match(gitPanel, /event\?\.shiftKey/);
  assert.match(gitPanel, /event\?\.metaKey \|\| event\?\.ctrlKey/);
  assert.match(gitPanel, /GitChangeSelectionToolbar/);
  assert.match(gitPanel, /data-workspace-git-selection-toolbar/);
  assert.match(gitPanel, /data-workspace-git-stage-selected/);
  assert.match(gitPanel, /data-workspace-git-unstage-selected/);
  assert.match(gitPanel, /data-workspace-git-clear-selection/);
  assert.match(gitPanel, /selectGitChangeGroup/);
  assert.match(gitPanel, /clearGitChangeGroupSelection/);
  assert.match(gitPanel, /stagedSelectedCount/);
  assert.match(gitPanel, /unstagedSelectedCount/);
  assert.match(gitPanel, /untrackedSelectedCount/);
  assert.match(gitPanel, /data-workspace-git-change-group-select/);
  assert.match(gitPanel, /data-workspace-git-change-group-selected/);
  assert.match(gitPanel, /data-workspace-git-change-group-selected-count/);
  assert.match(gitPanel, /onSelectAll=\{\(\) => selectGitChangeGroup\(staged\)\}/);
  assert.match(gitPanel, /onClearGroupSelection=\{\(\) => clearGitChangeGroupSelection\(staged\)\}/);
  assert.match(gitPanel, /onSelectAll=\{\(\) => selectGitChangeGroup\(unstaged\)\}/);
  assert.match(gitPanel, /onSelectAll=\{\(\) => selectGitChangeGroup\(untracked\)\}/);
  assert.match(gitPanel, /data-workspace-git-change-select/);
  assert.match(gitPanel, /data-workspace-git-change-selected/);
  assert.match(gitPanel, /aria-pressed=\{selected\}/);
  assert.match(gitPanel, /stageSelectedChanges/);
  assert.match(gitPanel, /unstageSelectedChanges/);
  assert.match(gitPanel, /clearGitChangeSelection/);
  assert.match(gitPanel, /data-workspace-git-scrollport/);
  assert.match(gitPanel, /WebkitOverflowScrolling: "touch"/);
  assert.match(gitPanel, /touchAction: "pan-y"/);
  assert.match(gitPanel, /generateGitCommitDraft/);
  assert.match(gitPanel, /buildGitCommitDraftBasis/);
  assert.match(gitPanel, /commitDraftBasis/);
  assert.match(gitPanel, /data-workspace-git-commit-draft-preview/);
  assert.match(gitPanel, /data-workspace-git-commit-draft-sample/);
  assert.match(gitPanel, /草稿依据/);
  assert.match(gitPanel, /data-workspace-git-commit-draft-actions/);
  assert.match(gitPanel, /data-workspace-git-generate-commit-draft/);
  assert.match(gitPanel, /data-workspace-git-ai-commit-draft/);
  assert.match(gitPanel, /AI 提交信息入口已预留/);
  assert.match(gitPanel, /commitMessage: messageTrim/);
  assert.match(gitPanel, /canCommit/);
  assert.match(gitPanel, /commitStaged: handleCommit/);
  assert.match(gitPanel, /commit\.isPending/);
  assert.match(gitPanel, /and \$\{changes\.length - visible\.length\} more/);
  assert.match(gitPanel, /data-workspace-git-change-menu/);
  assert.match(gitPanel, /clampGitChangeMenuPosition/);
  assert.match(gitPanel, /max-h-\[min\(80vh,26rem\)\]/);
  assert.match(gitPanel, /overflow-y-auto/);
  assert.match(gitPanel, /useGitTouchActionSurface/);
  assert.match(gitPanel, /data-workspace-git-action-sheet/);
  assert.match(gitPanel, /data-workspace-git-change-more/);
  assert.match(gitPanel, /data-workspace-git-history/);
  assert.match(gitPanel, /GitCommitRow/);
  assert.match(gitPanel, /createGitCommitActions/);
  assert.match(gitPanel, /activeCommitHash/);
  assert.match(gitPanel, /activeCommit/);
  assert.match(gitPanel, /openGitCommitActions/);
  assert.match(gitPanel, /data-workspace-git-commit-row/);
  assert.match(gitPanel, /data-workspace-git-commit-active/);
  assert.match(gitPanel, /data-workspace-git-commit-more/);
  assert.match(gitPanel, /data-workspace-git-commit-menu/);
  assert.match(gitPanel, /clampGitCommitMenuPosition/);
  assert.match(gitPanel, /max-h-\[min\(80vh,24rem\)\]/);
  assert.match(
    gitPanel,
    /style=\{clampGitCommitMenuPosition\(x, y, 248, 384\)\}/,
  );
  assert.match(gitPanel, /data-workspace-git-commit-action-sheet/);
  assert.match(gitPanel, /data-git-commit-action=\{action\.id\}/);
  assert.match(gitPanel, /data-git-commit-sheet-action=\{dataAttr === "commit" \? action\.id : undefined\}/);
  assert.match(gitPanel, /formatGitCommitContext/);
  assert.match(gitPanel, /copyGitCommitContext/);
  assert.match(gitPanel, /"@git commit"/);
  assert.match(gitPanel, /已复制 Git Commit 上下文/);
  assert.match(gitPanel, /explainCommit: copyGitCommitContext/);
  assert.match(gitPanel, /navigator\.clipboard\.writeText\(context\)/);
  assert.match(gitPanel, /git\.commit\.copyHash/);
  assert.match(gitPanel, /git\.commit\.copyContext/);
  assert.match(gitPanel, /AI 提交解释入口已预留/);
  assert.match(gitPanelCommands, /commitMessage: string/);
  assert.match(gitPanelCommands, /canCommit: boolean/);
  assert.match(gitPanelCommands, /commitStaged: \(\) => void/);
  assert.match(gitPanelCommands, /id: "git\.panel\.commitStaged"/);
  assert.match(gitPanelCommands, /label: "Git：提交已暂存更改"/);
  assert.match(gitPanelCommands, /disabled: pending \|\| !canCommit/);
  assert.match(gitPanelCommands, /run: commitStaged/);

  assert.match(gitPanel, /GitStatusOverview/);
  assert.match(gitPanel, /data-workspace-git-status-overview/);
  assert.match(gitPanel, /data-workspace-git-clean-state/);
  assert.match(gitPanel, /data-workspace-git-upstream/);
  assert.match(gitPanel, /data-workspace-git-conflict-warning/);
  assert.match(gitPanel, /function GitConflictPanel/);
  assert.match(gitPanel, /data-workspace-git-conflict-panel/);
  assert.match(gitPanel, /data-workspace-git-conflict-list/);
  assert.match(gitPanel, /data-workspace-git-conflict-row/);
  assert.match(gitPanel, /data-workspace-git-conflict-open/);
  assert.match(gitPanel, /data-workspace-git-conflict-copy-context/);
  assert.match(gitPanel, /data-workspace-git-conflict-insert-terminal/);
  assert.match(gitPanel, /useGitStashesQuery/);
  assert.match(gitPanel, /useDropGitStashMutation/);
  assert.match(gitPanel, /requestDropWorkspaceStash/);
  assert.match(gitPanel, /confirmDropWorkspaceStash/);
  assert.match(gitPanel, /GitStashPanel/);
  assert.match(gitPanel, /GitStashDropConfirmDialog/);
  assert.match(gitPanel, /data-workspace-git-stash-panel/);
  assert.match(gitPanel, /data-workspace-git-stash-drop/);
  assert.match(gitPanel, /data-workspace-git-stash-drop-dialog/);
  assert.match(gitPanel, /data-workspace-git-stash-drop-target/);
  assert.match(gitPanel, /data-workspace-git-stash-drop-confirm/);
  assert.match(gitPanel, /git stash drop/);
  assert.match(gitPanel, /Tracevane 当前不会为 Stash 删除提供一键撤销/);
  assert.match(gitPanel, /setStashDropTarget\(entry\)/);
  assert.match(gitPanel, /setStashDropTarget\(null\)/);
  assert.match(gitPanel, /data-workspace-git-conflict-more/);
  assert.match(gitPanel, /formatGitConflictContext/);
  assert.match(gitPanel, /"@git conflicts"/);
  assert.match(gitPanel, /已复制 Git 冲突上下文/);
  assert.match(gitPanel, /data-workspace-git-branch-switcher/);
  assert.match(gitPanel, /BranchSwitchConfirmDialog/);
  assert.match(gitPanel, /data-workspace-git-branch-switch-dialog/);
  assert.match(gitPanel, /data-workspace-git-confirm-branch-switch/);
  assert.match(
    gitPanel,
    /data-workspace-git-branch-current=\{b\.current \? "true" : "false"\}/,
  );
  assert.match(gitPanel, /disabled=\{b\.current\}/);
  assert.match(gitPanel, /data-workspace-git-branch-switch-dirty-warning/);
  assert.match(gitPanel, /data-workspace-git-branch-switch-conflict-warning/);
  assert.match(gitPanel, /toast\.success\("已切换分支"/);
  assert.match(gitPanel, /toast\.error\("切换分支失败"/);
  assert.match(gitPanel, /已创建并切换分支/);
  assert.match(gitPanel, /ahead = status\.data\?\.ahead/);
  assert.match(gitPanel, /behind = status\.data\?\.behind/);
  assert.match(gitPanel, /conflicts = React\.useMemo/);
  assert.match(gitPanel, /data-workspace-git-action-sheet-scrollport/);
  assert.match(gitPanel, /data-git-change-sheet-action-group/);
  assert.match(gitPanel, /data-git-change-sheet-action=\{dataAttr === "change" \? action\.id : undefined\}/);
  assert.match(gitPanel, /groupGitSheetActions/);
  assert.match(gitPanel, /gitSheetActionHint/);
  assert.match(gitPanel, /overscroll-contain/);
  assert.match(gitPanel, /env\(safe-area-inset-bottom\)/);
  assert.match(gitPanel, /触屏 Git 操作/);
  assert.match(
    gitPanel,
    /window\.matchMedia\("\(pointer: coarse\), \(max-width: 768px\)"\)/,
  );
  assert.match(gitPanel, /data-git-change-action=\{action\.id\}/);
  assert.match(gitPanel, /刷新 Git 状态/);
  assert.match(
    gitPanel,
    /copyPath: \(path\) => copyGitChangePath\(path, "absolute"\)/,
  );
  assert.match(
    gitPanel,
    /copyRelativePath: \(path\) => copyGitChangePath\(path, "relative"\)/,
  );
  assert.doesNotMatch(gitPanel, /<GitMenuButton onClick=\{onStage\}/);
  assert.match(gitChangeActions, /export interface GitChangeAction/);
  assert.match(
    gitChangeActions,
    /export interface GitChangeActionRegistryInput/,
  );
  assert.match(gitChangeActions, /createGitChangeActions/);
  assert.match(gitChangeActions, /git\.change\.openDiff/);
  assert.match(gitChangeActions, /git\.change\.openFile/);
  assert.match(gitChangeActions, /打开文件/);
  assert.match(gitChangeActions, /FileText/);
  assert.match(gitChangeActions, /change\.kind === "deleted"/);
  assert.match(gitChangeActions, /git\.change\.stage/);
  assert.match(gitChangeActions, /git\.change\.unstage/);
  assert.match(gitChangeActions, /git\.change\.copyPath/);
  assert.match(gitChangeActions, /复制绝对路径/);
  assert.match(gitChangeActions, /git\.change\.copyRelativePath/);
  assert.match(gitChangeActions, /复制相对路径/);
  assert.match(
    gitChangeActions,
    /copyRelativePath\?: \(path: string\) => void/,
  );
  assert.match(gitChangeActions, /git\.change\.revealInExplorer/);
  assert.match(gitChangeActions, /在资源管理器显示/);
  assert.match(gitChangeActions, /FileSymlink/);
  assert.match(gitChangeActions, /shortcut\?: string/);
  assert.match(gitChangeActions, /shortcut: "Enter"/);
  assert.match(gitChangeActions, /shortcut: "Ctrl\+Enter"/);
  assert.match(gitChangeActions, /shortcut: "Shift\+Alt\+C"/);
  assert.match(gitPanel, /data-git-change-action-shortcut=\{action\.id\}/);
  assert.match(gitPanel, /data-git-change-sheet-shortcut=\{dataAttr === "change" \? action\.id : undefined\}/);
  assert.match(gitChangeActions, /git\.change\.insertPathToTerminal/);
  assert.match(gitChangeActions, /插入路径到终端/);
  assert.match(gitChangeActions, /TerminalSquare/);
  assert.match(gitChangeActions, /git\.change\.explain/);
  assert.match(gitChangeActions, /AI 解释 Diff/);
  assert.match(
    gitPanelCommands,
    /export interface GitPanelCommandRegistryInput/,
  );
  assert.match(gitPanelCommands, /createGitPanelCommands/);
  assert.match(gitPanelCommands, /git\.panel\.refresh/);
  assert.match(gitPanelCommands, /git\.panel\.stageAll/);
  assert.match(gitPanelCommands, /git\.panel\.unstageAll/);
  assert.match(gitPanelCommands, /activeChange: GitFileChange \| null/);
  assert.match(gitPanelCommands, /activeCommit: GitCommitSummary \| null/);
  assert.match(gitPanelCommands, /activeBranch: GitBranchSummary \| null/);
  assert.match(
    gitPanelCommands,
    /openActiveChangeActions\?: \(change: GitFileChange\) => void/,
  );
  assert.match(
    gitPanelCommands,
    /openActiveCommitActions\?: \(commit: GitCommitSummary\) => void/,
  );
  assert.match(
    gitPanelCommands,
    /openActiveBranchActions\?: \(branch: GitBranchSummary\) => void/,
  );
  assert.match(gitPanelCommands, /git\.panel\.openActiveChangeActions/);
  assert.match(gitPanelCommands, /git\.panel\.openActiveCommitActions/);
  assert.match(gitPanelCommands, /git\.panel\.openActiveBranchActions/);
  assert.match(gitPanelCommands, /commits: GitCommitSummary\[\]/);
  assert.match(
    gitPanelCommands,
    /copyCommitContext: \(commit: GitCommitSummary\) => void/,
  );
  assert.match(
    gitPanelCommands,
    /copyCommitReleaseNote: \(commit: GitCommitSummary\) => void/,
  );
  assert.match(gitPanelCommands, /copyRecentHistoryContext: \(\) => void/);
  assert.match(
    gitPanelCommands,
    /copyCommitDiffContext: \(commit: GitCommitSummary\) => void/,
  );
  assert.match(
    gitPanelCommands,
    /git\.panel\.commitDiffContext\.\$\{commit\.shortHash \|\| commit\.hash\}/,
  );
  assert.match(gitPanelCommands, /copyCommitDiffContext\(commit\)/);
  assert.match(gitPanelCommands, /openCreateBranchDialog: \(\) => void/);
  assert.match(gitPanelCommands, /git\.panel\.createBranch/);
  assert.match(gitPanelCommands, /run: openCreateBranchDialog/);
  assert.match(gitPanelCommands, /switchableBranches/);
  assert.match(gitPanelCommands, /git\.panel\.checkout\.\$\{candidate\.name\}/);
  assert.match(gitPanelCommands, /requestBranchSwitch\(candidate\.name\)/);
  assert.match(gitPanelCommands, /slice\(0, 8\)/);
  assert.match(gitPanelCommands, /git\.panel\.copyBranch/);
  assert.match(gitPanelCommands, /git\.panel\.generateCommitDraft/);
  assert.match(gitPanelCommands, /git\.panel\.ai\.commitMessage/);
  assert.match(gitPanelCommands, /canGenerateCommitDraft/);
  assert.match(gitPanelCommands, /git\.panel\.explainStatus/);
  assert.match(gitPanelCommands, /git\.panel\.recentHistoryContext/);
  assert.match(gitPanelCommands, /run: copyRecentHistoryContext/);
  assert.match(gitPanelCommands, /Math\.min\(commits\.length, 10\)/);
  assert.match(gitPanelCommands, /commits\.slice\(0, 5\)\.flatMap/);
  assert.match(
    gitPanelCommands,
    /git\.panel\.commitDetails\.\$\{commit\.shortHash \|\| commit\.hash\}/,
  );
  assert.match(gitPanelCommands, /openCommitDetails\(commit\)/);
  assert.match(
    gitPanelCommands,
    /git\.panel\.commitReleaseNote\.\$\{commit\.shortHash \|\| commit\.hash\}/,
  );
  assert.match(gitPanelCommands, /copyCommitReleaseNote\(commit\)/);
  assert.match(
    gitPanelCommands,
    /git\.panel\.commitContext\.\$\{commit\.shortHash \|\| commit\.hash\}/,
  );
  assert.match(gitPanelCommands, /copyCommitContext\(commit\)/);
  assert.match(gitPanelCommands, /group: "AI" as const/);
  assert.match(gitPanelCommands, /group: "Git"/);
  assert.match(gitApi, /getGitCommitDetail/);
  assert.match(gitApi, /\/api\/git\/commit-detail/);
  assert.match(gitQuery, /useGitCommitDetailQuery/);
  assert.match(gitQuery, /gitKeys\.commitDetail/);
  const gitTypes = readRoot("types/git.ts");
  const gitService = readRoot("apps/api/modules/git/service.ts");
  const gitRoutes = readRoot("apps/api/modules/git/routes.ts");
  assert.match(gitTypes, /files: GitFileChange\[\]/);
  assert.match(gitTypes, /diff: string/);
  assert.match(gitTypes, /binary: boolean/);
  assert.match(gitTypes, /truncated: boolean/);
  assert.match(gitService, /function listCommitFiles/);
  assert.match(gitService, /"diff-tree"/);
  assert.match(gitService, /"--root"/);
  assert.match(gitService, /"--name-status"/);
  assert.match(gitService, /function getCommitDiff/);
  assert.match(gitService, /runGitForDiff\(repositoryRoot/);
  assert.match(gitService, /"--find-renames"/);
  assert.match(gitService, /truncateGitDiff\(output\)/);
  assert.match(gitService, /isBinaryDiff\(output\)/);
  assert.match(terminal, /would duplicate the dropped path/);
  assert.doesNotMatch(
    terminal,
    new RegExp(
      "sendInput\\(sessionId, data\\);\\s*sendInput\\(sessionId, data\\);",
    ),
  );
});
