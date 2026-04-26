import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const apiSource = read("apps/web-vue/src/shared/api.ts");
const appVue = read("apps/web-vue/src/App.vue");
const agentsWorkspace = read("apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue");
const routeManifest = read("apps/web-vue/src/features/shell/route-manifest.ts");
const shellRelease = read("apps/web-vue/src/features/shell/use-shell-release.ts");

test("json API reads coalesce concurrent GET requests without caching mutations", () => {
  assert.match(apiSource, /const inflightJsonRequests = new Map<string, Promise<unknown>>\(\);/);
  assert.match(apiSource, /normalizeRequestMethod\(init\) !== 'GET'/);
  assert.match(apiSource, /if \(init\?\.body \|\| init\?\.signal\) return null;/);
  assert.match(apiSource, /inflightJsonRequests\.set\(dedupeKey, requestPromise\);/);
  assert.match(apiSource, /inflightJsonRequests\.delete\(dedupeKey\);/);
  assert.match(apiSource, /if \(!dedupeKey\) \{[\s\S]*?return requestPromise;/);
});

test("shell release status no longer runs fixed global polling on every page", () => {
  assert.match(shellRelease, /requestIdleCallback/);
  assert.match(shellRelease, /visibilitychange/);
  assert.match(shellRelease, /UPGRADE_IDLE_POLL_INTERVAL_MS = 60_000/);
  assert.match(shellRelease, /HIDDEN_TAB_POLL_INTERVAL_MS = 180_000/);
  assert.match(shellRelease, /studioUpgradeStatus\.value\?\.running[\s\S]*?UPGRADE_RUNNING_POLL_INTERVAL_MS/);
  assert.doesNotMatch(shellRelease, /setInterval/);
});

test("non-chat shell routes are kept alive and preloaded only after idle", () => {
  assert.match(appVue, /<KeepAlive v-if="Component && shouldKeepRouteAlive\(routedView\)" :max="16">/);
  assert.match(appVue, /targetRoute\.meta\.keepAlive !== false/);
  assert.match(appVue, /preloadNonChatShellRouteChunks/);
  assert.match(appVue, /requestIdleCallback\(preload, \{ timeout: 3_500 \}\)/);
  assert.match(routeManifest, /keepAlive: false/);
  assert.match(routeManifest, /function preloadNonChatShellRouteChunks/);

  const preloadBlock = routeManifest.match(/const nonChatRouteChunkLoaders[\s\S]*?\];/)?.[0] || "";
  assert.doesNotMatch(preloadBlock, /ChatView/);
  assert.doesNotMatch(preloadBlock, /ChatShellPage/);
});

test("cached agent workspace does not redirect after leaving the agents route", () => {
  assert.match(agentsWorkspace, /const isAgentsRouteActive = computed/);
  assert.match(agentsWorkspace, /route\.path === '\/agents' \|\| route\.path\.startsWith\('\/agents\/'\)/);
  assert.match(agentsWorkspace, /async function refreshSummary[\s\S]*?if \(!isAgentsRouteActive\.value\) return;/);
  assert.match(agentsWorkspace, /if \(!isAgentsRouteActive\.value\) return;[\s\S]*?summary\.value = nextSummary;/);
  assert.match(agentsWorkspace, /watch\([\s\S]*?\(\) => route\.params\.agentId,[\s\S]*?if \(!isAgentsRouteActive\.value\) return;/);
});
