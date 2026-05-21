import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const controlPage = read("apps/web-vue/src/features/codex-stack/CodexStackControlPage.vue");
const logConsole = read("apps/web-vue/src/features/codex-stack/CodexStackLogConsole.vue");
const dashboardInsights = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardInsights.vue");
const chainMap = read("apps/web-vue/src/features/codex-stack/CodexStackChainMap.vue");

test("codex stack logs panel is isolated from the main control page", () => {
  assert.match(controlPage, /import CodexStackLogConsole from "\.\/CodexStackLogConsole\.vue";/);
  assert.match(controlPage, /<CodexStackLogConsole[\s\S]*v-model:selected-service="selectedLogService"[\s\S]*@load="loadLogs"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-log-console"/);

  assert.match(logConsole, /export interface CodexStackLogServiceOption/);
  assert.match(logConsole, /\.cs-log-service-button\s*\{/);
  assert.match(logConsole, /\.cs-log\s*\{/);
});

test("codex stack log reads avoid overlapping auto-refresh requests", () => {
  assert.match(controlPage, /let logRequestInFlight = false;/);
  assert.match(controlPage, /let queuedLogRequest: \{ serviceId: CodexStackServiceId; silent: boolean \} \| null = null;/);
  assert.match(
    controlPage,
    /if \(logRequestInFlight\) \{[\s\S]*queuedLogRequest = \{ serviceId, silent \};[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(controlPage, /const nextRequest = queuedLogRequest;[\s\S]*queuedLogRequest = null;/);
  assert.match(controlPage, /void loadLogs\(nextRequest\.serviceId, nextRequest\.silent\);/);
});

test("codex stack extracted panels own their scoped display styles", () => {
  assert.match(dashboardInsights, /\.cs-section-kicker\s*\{/);
  assert.match(dashboardInsights, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(chainMap, /export interface CodexStackChainNode/);
  assert.match(chainMap, /\.cs-chain-line\s*\{/);
  assert.match(chainMap, /\.cs-chain-gates\s*\{/);
  assert.match(chainMap, /\.cs-chain-warning-strip\s*\{/);
  assert.match(logConsole, /\.cs-section-kicker\s*\{/);
  assert.match(logConsole, /\.cs-info-chip,\s*\n\.cs-status-pill\s*\{/);
});

test("codex stack dashboard exposes a request chain safety map", () => {
  assert.match(controlPage, /import CodexStackChainMap from "\.\/CodexStackChainMap\.vue";/);
  assert.match(controlPage, /<CodexStackChainMap[\s\S]*:nodes="chainNodes"[\s\S]*:gates="chainGates"[\s\S]*:warnings="chainWarnings"/);
  assert.match(controlPage, /const chainNodes = computed<CodexStackChainNode\[\]>/);
  assert.match(controlPage, /const chainWarnings = computed\(\(\) => summary\.value\?\.warnings\.slice\(0, 3\) \|\| \[\]\);/);
  assert.match(controlPage, /id: "job-lock"/);
  assert.match(controlPage, /id: "smoke"/);
  assert.match(controlPage, /id: "watchdog"/);
  assert.match(controlPage, /NO_PROXY 缺少/);
  assert.match(controlPage, /!current\.proxyPolicy\.noProxyLoopbackReady[\s\S]*\? "danger"/);
  assert.match(chainMap, /aria-label="Codex Stack request chain"/);
  assert.match(chainMap, /v-if="warnings\.length"/);
});

test("codex stack runtime config save sends only changed fields", () => {
  assert.match(controlPage, /const configPatchPayload = computed<CodexStackConfigPatchRequest>\(\(\) => \{/);
  assert.match(controlPage, /const hasConfigPatchChanges = computed\(\(\) => Object\.keys\(configPatchPayload\.value\)\.length > 0\);/);
  assert.match(controlPage, /:disabled="!canRunMutation \|\| !hasConfigPatchChanges"/);
  assert.match(controlPage, /const payload = configPatchPayload\.value;[\s\S]*if \(!Object\.keys\(payload\)\.length\)/);
  assert.doesNotMatch(controlPage, /const payload: CodexStackConfigPatchRequest = \{\s*defaultModel: configForm\.defaultModel,/);
});
