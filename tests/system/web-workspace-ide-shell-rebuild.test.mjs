import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const shellSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/WorkspaceIdeShell.tsx", "utf-8");
const cssSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/workspace-ide-shell.css", "utf-8");
const pageSource = fs.readFileSync("apps/web/src/features/workspace/WorkspacePage.tsx", "utf-8");
const workspaceIndexSource = fs.readFileSync("apps/web/src/features/workspace/index.ts", "utf-8");
const ideCommandPaletteSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/IdeCommandPalette.tsx", "utf-8");
const ideCommandsSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/ideCommands.ts", "utf-8");

test("new Workspace IDE shell has real IDE layout regions", () => {
  assert.match(shellSource, /data-testid="workspace-ide-shell"/);
  assert.match(shellSource, /data-testid="workspace-ide-left-pane"/);
  assert.match(shellSource, /data-testid="workspace-ide-center-pane"/);
  assert.match(shellSource, /data-testid="workspace-ide-right-pane"/);
  assert.match(shellSource, /data-testid="workspace-ide-bottom-pane"/);
  assert.match(shellSource, /IDE activity rail/);
  assert.match(shellSource, /命令、文件、符号、Git、终端、AI 上下文/);
});

test("new Workspace IDE shell models pane/plugin composition", () => {
  for (const token of ["explorer", "search", "git", "terminal", "ai", "extensions", "provider"]) {
    assert.match(shellSource, new RegExp(token));
  }
  assert.match(shellSource, /PANE_REGISTRY/);
  assert.match(shellSource, /DEFAULT_PANE_PLACEMENTS/);
  assert.match(shellSource, /type PanePlacement = "left" \| "right" \| "bottom"/);
  assert.match(shellSource, /WorkspaceExplorer/);
  assert.match(shellSource, /WorkspaceSearchPanel/);
  assert.match(shellSource, /WorkspaceGitPanel/);
  assert.match(shellSource, /WorkspaceEditorStage/);
  assert.match(shellSource, /LazyWorkspaceTerminal/);
  assert.match(shellSource, /插件组合/);
});

test("new Workspace IDE shell is responsive for desktop tablet and phone", () => {
  assert.match(cssSource, /grid-template-columns: 72px var\(--ide-left-width\) var\(--ide-resize-width\) minmax\(0, 1fr\) var\(--ide-resize-width\) var\(--ide-right-width\)/);
  assert.match(cssSource, /@media \(max-width: 1100px\)/);
  assert.match(cssSource, /@media \(max-width: 760px\)/);
  assert.match(cssSource, /grid-template-columns: 1fr/);
  assert.match(cssSource, /flex-direction: row/);
});

test("Workspace uses the new IDE shell as the only native workspace entry", () => {
  assert.match(pageSource, /return <WorkspaceIdeShell \/>/);
  assert.doesNotMatch(pageSource, /WorkspaceWorkbench/);
  assert.doesNotMatch(pageSource, /useWorkspaceLegacyMode/);
  assert.doesNotMatch(pageSource, /legacy/);
});


test("Workspace public API exports the new IDE surface and not the old Workbench", () => {
  assert.match(workspaceIndexSource, /WorkspaceIdeShell/);
  assert.doesNotMatch(workspaceIndexSource, /WorkspaceWorkbench/);
  assert.doesNotMatch(workspaceIndexSource, /\.\/workbench/);
});

test("new Workspace IDE shell owns commands without importing the old workbench", () => {
  assert.match(shellSource, /IdeCommandPalette/);
  assert.match(shellSource, /\.\/ideCommands/);
  assert.doesNotMatch(shellSource, /\.\.\/workbench/);
  assert.match(ideCommandPaletteSource, /new-ide-command-console/);
  assert.match(ideCommandsSource, /WorkspaceCommand/);
});

test("new Workspace IDE shell supports real pane layout controls", () => {
  assert.match(shellSource, /type MaximizedPane/);
  assert.match(shellSource, /type LayoutPreset/);
  assert.match(shellSource, /startPaneResize/);
  assert.match(shellSource, /data-ide-resize-handle=\{pane\}/);
  assert.match(shellSource, /data-ide-layout-preset=\{layoutPreset\}/);
  assert.match(shellSource, /data-ide-maximized-pane=\{maximizedPane/);
  assert.match(shellSource, /applyLayoutPreset\("balanced"\)/);
  assert.match(shellSource, /applyLayoutPreset\("code"\)/);
  assert.match(shellSource, /applyLayoutPreset\("terminal"\)/);
  assert.match(cssSource, /--ide-left-width/);
  assert.match(cssSource, /--ide-right-width/);
  assert.match(cssSource, /--ide-bottom-height/);
  assert.match(cssSource, /workspace-ide-shell__resize-handle/);
  assert.match(cssSource, /workspace-ide-shell__body--max-center/);
  assert.match(cssSource, /workspace-ide-shell__body--max-bottom/);
});

test("new Workspace IDE shell persists and exposes accessible pane sizing", () => {
  assert.match(shellSource, /IDE_LAYOUT_STORAGE_KEY/);
  assert.match(shellSource, /loadIdeLayoutState/);
  assert.match(shellSource, /storeIdeLayoutState/);
  assert.match(shellSource, /sanitizeIdeLayoutState/);
  assert.match(shellSource, /data-ide-pane-size-state/);
  assert.match(shellSource, /keyboardResizeDelta/);
  assert.match(shellSource, /ide\.layout\.maximize-left/);
  assert.match(shellSource, /ide\.layout\.maximize-right/);
  assert.match(shellSource, /ide\.layout\.maximize-bottom/);
  assert.match(shellSource, /onKeyDown=\{onKeyDown\}/);
  assert.match(shellSource, /aria-orientation=\{orientation\}/);
  assert.match(shellSource, /aria-valuemin=\{limits\.min\}/);
  assert.match(shellSource, /aria-valuemax=\{limits\.max\}/);
  assert.match(shellSource, /aria-valuenow=\{value\}/);
  assert.match(shellSource, /PANE_SIZE_LIMITS/);
});

test("new Workspace IDE shell supports split editor groups", () => {
  assert.match(shellSource, /type EditorGroupId = "primary" \| "secondary"/);
  assert.match(shellSource, /type EditorSplitMode = "single" \| "vertical" \| "horizontal"/);
  assert.match(shellSource, /editorSplitMode/);
  assert.match(shellSource, /editorSplitRatio/);
  assert.match(shellSource, /data-ide-editor-split=\{editorSplitMode\}/);
  assert.match(shellSource, /data-ide-editor-group=\{group\}/);
  assert.match(shellSource, /data-ide-editor-split-handle=\{mode\}/);
  assert.match(shellSource, /startEditorSplitResize/);
  assert.match(shellSource, /resizeEditorSplitFromKeyboard/);
  assert.match(shellSource, /ide\.editor\.split-right/);
  assert.match(shellSource, /ide\.editor\.split-down/);
  assert.match(shellSource, /ide\.editor\.close-split/);
  assert.match(shellSource, /ide\.editor\.focus-primary/);
  assert.match(shellSource, /ide\.editor\.focus-secondary/);
  assert.match(cssSource, /workspace-ide-shell__editor-grid\[data-ide-editor-split="vertical"\]/);
  assert.match(cssSource, /workspace-ide-shell__editor-grid\[data-ide-editor-split="horizontal"\]/);
  assert.match(cssSource, /workspace-ide-shell__editor-split-handle/);
});


test("new Workspace IDE shell supports movable pane registry placements", () => {
  assert.match(shellSource, /type PaneId = "explorer" \| "search" \| "git" \| "terminal" \| "ai" \| "outline" \| "extensions" \| "problems" \| "output"/);
  assert.match(shellSource, /interface PaneDescriptor/);
  assert.match(shellSource, /defaultPlacement: PanePlacement/);
  assert.match(shellSource, /panePlacements/);
  assert.match(shellSource, /groupPanesByPlacement/);
  assert.match(shellSource, /movePaneToPlacement/);
  assert.match(shellSource, /ide\.pane\.move\.\$\{pane\.id\}\.\$\{placement\}/);
  assert.match(shellSource, /placementLabel/);
  assert.match(shellSource, /sanitizePanePlacements/);
  assert.match(shellSource, /isPanePlacement/);
  assert.match(shellSource, /窗格: L\{leftPaneIds\.length\}\/R\{rightPaneIds\.length\}\/B\{bottomPaneIds\.length\}/);
});

test("new Workspace IDE shell exposes direct dock controls for pane movement", () => {
  assert.match(shellSource, /function PaneDockControls/);
  assert.match(shellSource, /data-ide-pane-dock-controls=\{paneId\}/);
  assert.match(shellSource, /placementShortLabel/);
  assert.match(shellSource, /移动 \$\{paneLabel\(paneId\)\} 到\$\{placementLabel\(target\)\}/);
  assert.match(shellSource, /关闭\$\{placementLabel\(placement\)\} Dock/);
  assert.match(shellSource, /onMovePane\(paneId, target\)/);
  assert.match(shellSource, /onCloseDock=\{\(\) => setLeftOpen\(false\)\}/);
  assert.match(shellSource, /onCloseDock=\{\(\) => setRightOpen\(false\)\}/);
  assert.match(shellSource, /onCloseDock=\{\(\) => setBottomOpen\(false\)\}/);
  assert.match(cssSource, /workspace-ide-shell__pane-dock-controls/);
  assert.match(cssSource, /workspace-ide-shell__dock-tab/);
});

test("new Workspace IDE shell treats empty docks as explicit layout states", () => {
  assert.match(shellSource, /function EmptyDockPane/);
  assert.match(shellSource, /data-ide-empty-dock=\{placement\}/);
  assert.match(shellSource, /function resetPanePlacements/);
  assert.match(shellSource, /setPanePlacements\(DEFAULT_PANE_PLACEMENTS\)/);
  assert.match(shellSource, /ide\.pane\.reset-placements/);
  assert.match(shellSource, /activeLeftPane = leftPaneIds\.includes\(activity\) \? activity : leftPaneIds\[0\]/);
  assert.match(shellSource, /activeRightPane = rightPaneIds\.includes\(rightPanel\) \? rightPanel : rightPaneIds\[0\]/);
  assert.match(shellSource, /activeBottomPane = bottomPaneIds\.includes\(bottomPanel\) \? bottomPanel : bottomPaneIds\[0\]/);
  assert.doesNotMatch(shellSource, /leftPaneIds\[0\] \?\? "explorer"/);
  assert.doesNotMatch(shellSource, /rightPaneIds\[0\] \?\? "ai"/);
  assert.doesNotMatch(shellSource, /bottomPaneIds\[0\] \?\? "terminal"/);
  assert.match(cssSource, /workspace-ide-shell__empty-dock/);
});
