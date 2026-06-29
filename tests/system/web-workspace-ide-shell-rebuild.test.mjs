import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const shellSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/WorkspaceIdeShell.tsx", "utf-8");
const cssSource = fs.readFileSync("apps/web/src/features/workspace/ide-shell/workspace-ide-shell.css", "utf-8");
const pageSource = fs.readFileSync("apps/web/src/features/workspace/WorkspacePage.tsx", "utf-8");

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
  assert.match(shellSource, /CENTER_TABS/);
  assert.match(shellSource, /插件组合/);
});

test("new Workspace IDE shell is responsive for desktop tablet and phone", () => {
  assert.match(cssSource, /grid-template-columns: 72px minmax\(240px, 320px\) minmax\(0, 1fr\) minmax\(260px, 340px\)/);
  assert.match(cssSource, /@media \(max-width: 1100px\)/);
  assert.match(cssSource, /@media \(max-width: 760px\)/);
  assert.match(cssSource, /grid-template-columns: 1fr/);
  assert.match(cssSource, /flex-direction: row/);
});

test("Workspace defaults to the new IDE shell and keeps legacy workbench behind an explicit flag", () => {
  assert.match(pageSource, /<WorkspaceIdeShell \/>/);
  assert.match(pageSource, /useWorkspaceLegacyMode/);
  assert.match(pageSource, /params\.get\("legacy"\) === "1"/);
  assert.match(pageSource, /<WorkspaceWorkbench \/>/);
});
