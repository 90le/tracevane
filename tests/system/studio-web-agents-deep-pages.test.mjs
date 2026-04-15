import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const docsPage = read("apps/web-vue/src/features/agents/AgentDocsPage.vue");
const bindingsPage = read("apps/web-vue/src/features/agents/AgentBindingsPage.vue");
const sessionsPage = read("apps/web-vue/src/features/agents/AgentSessionsPage.vue");
const advancedPage = read("apps/web-vue/src/features/agents/AgentAdvancedPage.vue");

test("agents deep pages use task heads instead of repeating page-level chrome", () => {
  assert.match(docsPage, /agents-stage-task-head/);
  assert.match(bindingsPage, /agents-stage-task-head/);
  assert.match(sessionsPage, /agents-stage-task-head/);
  assert.match(advancedPage, /agents-stage-task-head/);

  assert.doesNotMatch(docsPage, /page-header-row/);
  assert.doesNotMatch(bindingsPage, /page-header-row/);
  assert.doesNotMatch(sessionsPage, /page-header-row/);
  assert.doesNotMatch(advancedPage, /page-header-row/);
});

test("agents advanced page keeps grouped task sections inside a continuous editor", () => {
  assert.match(advancedPage, /CORE/);
  assert.match(advancedPage, /IDENTITY/);
  assert.match(advancedPage, /RUNTIME/);
  assert.match(advancedPage, /OVERRIDES/);
  assert.match(advancedPage, /ADVANCED JSON/);
  assert.match(advancedPage, /agents-summary-strip/);
  assert.match(advancedPage, /agents-advanced-collapsible/);
  assert.match(advancedPage, /agents-advanced-summary/);
});

test("agent bindings page stays focused on bindings instead of duplicating session data", () => {
  assert.match(bindingsPage, /agents-binding-summary-strip/);
  assert.match(bindingsPage, /openChannelWorkspace/);
  assert.match(bindingsPage, /openChannelBindings/);
  assert.doesNotMatch(bindingsPage, /openSessionsPage/);
  assert.doesNotMatch(bindingsPage, /detail\.sessions/);
  assert.doesNotMatch(bindingsPage, /recentSessions/);
});

test("agent sessions page uses card rows with a compact summary strip", () => {
  assert.match(sessionsPage, /agents-session-summary-strip/);
  assert.match(sessionsPage, /agents-session-card-list/);
  assert.match(sessionsPage, /agents-session-card/);
  assert.match(sessionsPage, /encodeChatSessionRef/);
  assert.match(sessionsPage, /DialogRoot/);
  assert.match(sessionsPage, /openConfirm\(/);
  assert.match(sessionsPage, /confirmOpen/);
  assert.match(sessionsPage, /router\.push\(`\/chat\/s\/\$\{encodeChatSessionRef\(sessionRef\)\}`\)/);
  assert.doesNotMatch(sessionsPage, /encodeURIComponent\(sessionRef\)/);
  assert.doesNotMatch(sessionsPage, /window\.confirm/);
  assert.doesNotMatch(sessionsPage, /agents-session-head/);
});
