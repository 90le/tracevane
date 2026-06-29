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
  assert.match(shellSource, /RIGHT_PANELS/);
  assert.match(shellSource, /BOTTOM_PANELS/);
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
