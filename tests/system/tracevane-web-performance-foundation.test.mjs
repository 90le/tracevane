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
const globalStyle = read("apps/web-vue/src/style.css");
const agentsWorkspace = read("apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue");
const channelsWorkspace = read("apps/web-vue/src/features/channels/workspace.ts");
const channelsWorkspaceLayout = read("apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue");
const dashboardSummary = read("apps/web-vue/src/features/dashboard/use-dashboard-summary.ts");
const skillsControlPage = read("apps/web-vue/src/features/skills/SkillsControlPage.vue");
const cronControlPage = read("apps/web-vue/src/features/cron/CronControlPage.vue");
const systemControlPage = read("apps/web-vue/src/features/system/SystemControlPage.vue");
const configEditorPage = read("apps/web-vue/src/features/config/ConfigEditorPage.vue");
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
  assert.match(shellRelease, /tracevaneUpgradeStatus\.value\?\.running[\s\S]*?UPGRADE_RUNNING_POLL_INTERVAL_MS/);
  assert.doesNotMatch(shellRelease, /setInterval/);
});

test("non-chat shell routes are kept alive and preloaded only after idle", () => {
  assert.match(appVue, /<KeepAlive v-if="Component && shouldKeepRouteAlive\(routedView\)" :max="16">/);
  assert.match(appVue, /targetRoute\.meta\.keepAlive !== false/);
  assert.match(appVue, /'standard-scroll-route': !isChatSurface && !isTerminalSurface && !isFilesSurface/);
  assert.match(globalStyle, /\.main-content\.standard-scroll-route \.shell-layout \{/);
  assert.match(globalStyle, /\.main-content\.standard-scroll-route \.shell-route-stage \{/);
  assert.match(appVue, /preloadNonChatShellRouteChunks/);
  assert.match(appVue, /preloadNonChatShellRouteChunks\('core'\)/);
  assert.match(appVue, /preloadNonChatShellRouteChunks\('extended'\)/);
  assert.match(appVue, /deviceMemory < 4/);
  assert.match(appVue, /hardwareConcurrency && navigator\.hardwareConcurrency < 4/);
  assert.match(routeManifest, /keepAlive: false/);
  assert.match(routeManifest, /function preloadNonChatShellRouteChunks/);

  const corePreloadBlock = routeManifest.match(/const coreRouteChunkLoaders[\s\S]*?\];/)?.[0] || "";
  assert.doesNotMatch(corePreloadBlock, /ChatView/);
  assert.doesNotMatch(corePreloadBlock, /ChatShellPage/);
  assert.doesNotMatch(corePreloadBlock, /FilesView/);
});

test("cached agent workspace does not redirect after leaving the agents route", () => {
  assert.match(agentsWorkspace, /const isAgentsRouteActive = computed/);
  assert.match(agentsWorkspace, /route\.path === '\/agents' \|\| route\.path\.startsWith\('\/agents\/'\)/);
  assert.match(agentsWorkspace, /async function refreshSummary[\s\S]*?if \(!isAgentsRouteActive\.value\) return;/);
  assert.match(agentsWorkspace, /if \(!isAgentsRouteActive\.value\) return;[\s\S]*?summary\.value = nextSummary;/);
  assert.match(agentsWorkspace, /watch\([\s\S]*?\(\) => route\.params\.agentId,[\s\S]*?if \(!isAgentsRouteActive\.value\) return;/);
});

test("cached channel workspace does not redirect or keep listeners after leaving channels", () => {
  assert.match(channelsWorkspace, /const isChannelsRouteActive = computed/);
  assert.match(channelsWorkspace, /route\.path === '\/channels' \|\| route\.path\.startsWith\('\/channels\/'\)/);
  assert.match(channelsWorkspace, /async function ensureRouteAfterSummary[\s\S]*?if \(!isChannelsRouteActive\.value\) return;/);
  assert.match(channelsWorkspace, /const nextSummary = await fetchChannelsSummary\(\);[\s\S]*?if \(!isChannelsRouteActive\.value\) return;/);
  assert.match(channelsWorkspaceLayout, /onDeactivated/);
  assert.match(channelsWorkspaceLayout, /unregisterResizeListener/);
  assert.match(channelsWorkspaceLayout, /if \(!isChannelsRouteActive\.value\) return;[\s\S]*?fetchChannelAccountCredentials/);
});

test("dashboard summary transport stops when cached dashboard route deactivates", () => {
  assert.match(dashboardSummary, /onActivated/);
  assert.match(dashboardSummary, /onDeactivated/);
  assert.match(dashboardSummary, /function registerConsumer\(\)/);
  assert.match(dashboardSummary, /function unregisterConsumer\(\)/);
  assert.match(dashboardSummary, /visibilitychange/);
  assert.match(dashboardSummary, /suspendDashboardSummary/);
  assert.doesNotMatch(dashboardSummary, /window\.setInterval/);
});

test("cached skills page cancels marketplace debounce and ignores stale route results", () => {
  assert.match(skillsControlPage, /const isSkillsRouteActive = computed/);
  assert.match(skillsControlPage, /route\.path === '\/skills' \|\| route\.path\.startsWith\('\/skills\/'\)/);
  assert.match(skillsControlPage, /function clearMarketSearchTimer\(\)/);
  assert.match(skillsControlPage, /onDeactivated\(clearMarketSearchTimer\)/);
  assert.match(skillsControlPage, /const payload = await fetchSkillsSummary\(refresh\);[\s\S]*?if \(!isSkillsRouteActive\.value\) return;[\s\S]*?summary\.value = payload;/);
  assert.match(skillsControlPage, /const payload = await fetchMarketplaceSkills[\s\S]*?if \(!isSkillsRouteActive\.value\) return;[\s\S]*?marketplace\.value = payload;/);
  assert.match(skillsControlPage, /marketSearchTimer = window\.setTimeout\(\(\) => \{[\s\S]*?isSkillsRouteActive\.value && mode\.value === 'marketplace'/);
});

test("cached cron page does not apply stale summary or detail responses after leaving cron", () => {
  assert.match(cronControlPage, /const isCronRouteActive = computed/);
  assert.match(cronControlPage, /route\.path === '\/cron' \|\| route\.path\.startsWith\('\/cron\/'\)/);
  assert.match(cronControlPage, /const payload = await fetchCronSummary\(\);[\s\S]*?if \(!isCronRouteActive\.value\) return;[\s\S]*?summary\.value = payload;/);
  assert.match(cronControlPage, /const payload = await fetchCronDetail\(jobId\);[\s\S]*?if \(!isCronRouteActive\.value\) return;[\s\S]*?detail\.value = payload;/);
  assert.match(cronControlPage, /onActivated\(activateCronPage\)/);
});

test("system status page stays lightweight and avoids default diagnostics", () => {
  assert.match(systemControlPage, /fetchSystemHealth/);
  assert.match(systemControlPage, /fetchOpenClawRecoveryStatus/);
  assert.match(systemControlPage, /fetchTracevaneUpgradeStatus/);
  assert.match(systemControlPage, /router\.push\('\/system\/recovery'\)/);
  assert.doesNotMatch(systemControlPage, /fetchTracevaneRelease/);
  assert.doesNotMatch(systemControlPage, /fetchSystemDiagnostics/);
  assert.doesNotMatch(systemControlPage, /normalizeDiagnostics/);
  assert.doesNotMatch(systemControlPage, /diagnosticCommandItems/);
  assert.doesNotMatch(systemControlPage, /openclaw doctor|openclaw status|gateway status/);
});

test("cached config page does not hydrate stale config summary after route changes", () => {
  assert.match(configEditorPage, /const isConfigRouteActive = computed/);
  assert.match(configEditorPage, /route\.path === '\/config' \|\| route\.path\.startsWith\('\/config\/'\)/);
  assert.match(configEditorPage, /let configLoadPromise: Promise<void> \| null = null;/);
  assert.match(configEditorPage, /const \[summary, channels\] = await Promise\.all[\s\S]*?if \(!isConfigRouteActive\.value\) return;[\s\S]*?loadedSummary\.value = summary;/);
  assert.match(configEditorPage, /watch\([\s\S]*?\(\) => \[route\.query\.tab, route\.query\.section\],[\s\S]*?if \(!isConfigRouteActive\.value\) return;/);
  assert.match(configEditorPage, /onActivated\(activateConfigPage\)/);
});
