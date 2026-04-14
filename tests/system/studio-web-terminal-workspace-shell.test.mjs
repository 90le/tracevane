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
const terminalServicePath = path.join(
  rootDir,
  "apps/api/modules/terminal/service.ts",
);
const terminalRoutesPath = path.join(
  rootDir,
  "apps/api/modules/terminal/routes.ts",
);

const terminalView = fs.readFileSync(terminalViewPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");
const workspaceCss = fs.readFileSync(workspaceCssPath, "utf8");
const terminalService = fs.readFileSync(terminalServicePath, "utf8");
const terminalRoutes = fs.readFileSync(terminalRoutesPath, "utf8");

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
});

test("terminal routes expose minimal recovery endpoints for persisted sessions", () => {
  assert.match(terminalRoutes, /\"\/api\/terminal\/sessions\/:sessionId\"/);
  assert.match(
    terminalRoutes,
    /\"\/api\/terminal\/sessions\/:sessionId\/ledger\"/,
  );
});

test("terminal session pane consumes recent output summary tail text", () => {
  const panePath = path.join(
    rootDir,
    "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
  );
  const pane = fs.readFileSync(panePath, "utf8");

  assert.match(pane, /recentOutputSummary\?\.tailText/);
  assert.match(pane, /recentOutputSummary\.lastError/);
  assert.match(pane, /recentOutputSummary\.lastCommandHint/);
  assert.match(pane, /recentOutputSummary\.exitSummary/);
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
  assert.match(workspacePage, /fetchPersistedTerminalSessions/);
  assert.match(
    workspacePage,
    /workspace\.hydrateSessions\(summary\.sessions \|\| \[\]\)/,
  );
  assert.doesNotMatch(workspacePage, /fetchTerminalSessions\(/);

  assert.match(workspaceCss, /\.terminal-workspace-shell\s*\{/);
  assert.match(workspaceCss, /\.terminal-workspace-main\s*\{/);
});
