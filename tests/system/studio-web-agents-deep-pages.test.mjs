import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const docsPage = read("apps/web-vue/src/features/agents/AgentDocsPage.vue");
const bindingsPage = read(
  "apps/web-vue/src/features/agents/AgentBindingsPage.vue",
);
const sessionsPage = read(
  "apps/web-vue/src/features/agents/AgentSessionsPage.vue",
);
const advancedPage = read(
  "apps/web-vue/src/features/agents/AgentAdvancedPage.vue",
);

test("agents deep pages use task heads instead of repeating page-level chrome", () => {
  assert.match(docsPage, /agents-stage-task-head/);
  assert.match(bindingsPage, /agents-stage-task-head/);
  assert.match(sessionsPage, /agents-stage-task-head/);
  assert.match(advancedPage, /agents-stage-task-head/);
  assert.match(docsPage, /人设文档|Persona docs/);
  assert.match(advancedPage, /运行配置|Runtime/);

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

test("agents deep pages refresh on activation without discarding dirty drafts", () => {
  assert.match(advancedPage, /import \{ computed, onActivated, reactive, ref, watch \} from 'vue';/);
  assert.match(advancedPage, /const lastLoadedDraftSnapshot = ref\(''\);/);
  assert.match(advancedPage, /function captureDraftSnapshot\(\): string \{[\s\S]*return JSON\.stringify\(draft\);[\s\S]*\}/);
  assert.match(advancedPage, /onActivated\(async \(\) => \{[\s\S]*if \(!agentId\.value \|\| loading\.value \|\| saveBusy\.value\) return;[\s\S]*if \(captureDraftSnapshot\(\) !== lastLoadedDraftSnapshot\.value\) return;[\s\S]*await loadDetail\(\);[\s\S]*\}\);/);

  assert.match(docsPage, /import \{ computed, onActivated, ref, watch \} from 'vue';/);
  assert.match(docsPage, /const lastLoadedDocContent = ref\(''\);/);
  assert.match(docsPage, /lastLoadedDocContent\.value = payload\.content;/);
  assert.match(docsPage, /onActivated\(async \(\) => \{[\s\S]*if \(!agentId\.value \|\| docLoading\.value \|\| docBusy\.value\) return;[\s\S]*if \(docContent\.value !== lastLoadedDocContent\.value\) return;[\s\S]*await loadDocList\(\);[\s\S]*await loadCurrentDoc\(\);[\s\S]*\}\);/);
});

test("agents advanced page exposes per-agent HEARTBEAT persistence controls", () => {
  assert.match(advancedPage, /Built-in HEARTBEAT/);
  assert.match(advancedPage, /draft\.heartbeatMode/);
  assert.match(advancedPage, /resolveHeartbeatMode\(editor\.heartbeat\)/);
  assert.match(advancedPage, /buildAgentHeartbeatConfig\(heartbeatRaw, draft\.heartbeatMode, draft\.heartbeatEvery\)/);
  assert.match(advancedPage, /every: "0m"/);
});

test("agent bindings page stays focused on bindings instead of duplicating session data", () => {
  assert.match(bindingsPage, /agents-binding-summary-strip/);
  assert.match(bindingsPage, /openChannelWorkspace/);
  assert.match(bindingsPage, /openChannelBindings/);
  assert.match(bindingsPage, /useConfirmDialog/);
  assert.match(bindingsPage, /const \{ confirm \} = useConfirmDialog\(\)/);
  assert.match(bindingsPage, /bindingDialogOpen/);
  assert.match(bindingsPage, /<Teleport to="body">/);
  assert.match(bindingsPage, /removeBinding\(/);
  assert.doesNotMatch(bindingsPage, /DialogRoot/);
  assert.doesNotMatch(bindingsPage, /openConfirm\(/);
  assert.doesNotMatch(bindingsPage, /confirmOpen/);
  assert.doesNotMatch(bindingsPage, /window\.confirm/);
  assert.doesNotMatch(bindingsPage, /openSessionsPage/);
  assert.doesNotMatch(bindingsPage, /detail\.sessions/);
  assert.doesNotMatch(bindingsPage, /recentSessions/);
});

test("agent sessions page uses section rows with a compact summary strip", () => {
  assert.match(sessionsPage, /agents-session-summary-strip/);
  assert.match(sessionsPage, /agents-session-entry-list/);
  assert.match(sessionsPage, /agents-session-entry/);
  assert.doesNotMatch(sessionsPage, /agents-session-card/);
  assert.match(sessionsPage, /useConfirmDialog/);
  assert.match(sessionsPage, /const \{ confirm \} = useConfirmDialog\(\)/);
  assert.match(sessionsPage, /openChatSession\(/);
  assert.match(
    sessionsPage,
    /router\.push\(`\/chat\/s\/\$\{encodeURIComponent\(sessionRef\)\}`\)/,
  );
  assert.doesNotMatch(sessionsPage, /encodeChatSessionRef/);
  assert.doesNotMatch(sessionsPage, /DialogRoot/);
  assert.doesNotMatch(sessionsPage, /openConfirm\(/);
  assert.doesNotMatch(sessionsPage, /confirmOpen/);
  assert.doesNotMatch(sessionsPage, /window\.confirm/);
  assert.doesNotMatch(sessionsPage, /agents-session-head/);
});
