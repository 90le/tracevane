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
const workspaceCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/terminal-workspace.css",
);

const terminalView = fs.readFileSync(terminalViewPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");
const workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");

test("terminal view mounts workspace page instead of console placeholder", () => {
  assert.match(terminalView, /<TerminalWorkspacePage\s*\/>/);
  assert.match(
    terminalView,
    /import\s*\{\s*TerminalWorkspacePage\s*\}\s*from\s*['"]\.\.\/features\/terminal['"]/,
  );
  assert.doesNotMatch(terminalView, /<TerminalConsolePage\s*\/>/);
});

test("terminal workspace page composes workspace shell sections and binds state modules", () => {
  assert.equal(fs.existsSync(workspacePagePath), true);
  assert.equal(fs.existsSync(workspaceCssPath), true);

  assert.match(workspacePage, /<section class="terminal-workspace-shell"/);
  assert.match(workspacePage, /<TerminalTabRail/);
  assert.match(workspacePage, /<TerminalSessionPane/);
  assert.match(workspacePage, /<TerminalActionPanel/);
  assert.match(workspacePage, /<TerminalRecentSessionRail/);

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

  assert.match(workspaceCss, /\.terminal-workspace-shell\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-main\s*\{/);
});
