import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const channelsView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/ChannelsView.vue"),
  "utf8",
);

const workspaceLayout = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue",
  ),
  "utf8",
);

const overviewRecipe = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/channels/channels-overview-recipe.ts",
  ),
  "utf8",
);

const workspaceSummary = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/channels/channel-workspace-summary.ts",
  ),
  "utf8",
);

const channelsApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/channels/api.ts"),
  "utf8",
);

const channelsService = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/channels/service.ts"),
  "utf8",
);

test("channels view wires through workspace overview recipe seam", () => {
  assert.match(
    channelsView,
    /import\s+\{\s*buildChannelsOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/channels\/channels-overview-recipe'/,
  );
  assert.match(
    channelsView,
    /import\s+\{\s*getManagementDomainEntry\s*\}\s+from\s+'\.\.\/features\/management\/management-domain-manifest'/,
  );
  assert.match(channelsView, /getManagementDomainEntry\('channels'\)/);
  assert.match(channelsView, /buildChannelsOverviewRecipe\(text\)/);
  assert.match(channelsView, /providerHeadline:\s*text\(`/);
  assert.match(
    channelsView,
    /<ChannelsWorkspaceLayout\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
});

test("channels workspace layout keeps a provider/account stage with a top task bar", () => {
  assert.match(workspaceLayout, /class="channels-workbench studio-workbench studio-workbench--object"/);
  assert.match(
    workspaceLayout,
    /class="channels-sidebar operate-resource-rail mobile-resource-drawer studio-workbench-index"/,
  );
  assert.match(workspaceLayout, /class="channels-stage operate-stage studio-workbench-canvas"/);
  assert.match(workspaceLayout, /class="channels-task-rail studio-workbench-task-rail"/);
  assert.match(workspaceLayout, /class="channels-task-canvas studio-workbench-active-canvas"/);
  assert.match(workspaceLayout, /class="channels-task-nav studio-workbench-task-nav"/);
  assert.doesNotMatch(workspaceLayout, /channels-top-tabs|channels-task-tabs|mobile-stage-tabs/);
  assert.match(
    workspaceLayout,
    /const activeTaskNavId = computed<ChannelTaskNavId>\(\(\) =>/,
  );
  assert.match(workspaceLayout, /const providerTaskNavItems = computed<ChannelTaskNavItem\[\]>\(\(\) => \[/);
  assert.match(workspaceLayout, /const accountTaskNavItems = computed<ChannelTaskNavItem\[\]>\(\(\) => \[/);
  assert.match(workspaceLayout, /const taskNavItems = computed<ChannelTaskNavItem\[\]>/);
  assert.match(workspaceLayout, /openTaskNav\(/);
  assert.doesNotMatch(workspaceLayout, /taskTabs|activeTaskTab|openTaskTab|ChannelTaskTabId|ProviderTaskTabId|AccountTaskTabId/);
  assert.doesNotMatch(workspaceLayout, /openAccountStageTab\(/);
  assert.match(workspaceLayout, /openPrimaryAccess\(/);
  assert.match(workspaceLayout, /openPrimaryPairing\(/);
  assert.match(workspaceLayout, /<RouterView \/>/);
  assert.doesNotMatch(
    workspaceLayout,
    /const\s+stageSummary\s*=\s*computed\(\(\)\s*=>\s*buildChannelStageSummary\(/,
  );
});

test("channels overview recipe exports provider and account summary builders", () => {
  assert.match(overviewRecipe, /export interface ChannelWorkspaceSummary/);
  assert.match(
    overviewRecipe,
    /export interface ChannelAccountWorkspaceSummary/,
  );
  assert.match(overviewRecipe, /export function buildChannelsOverviewRecipe\(/);
  assert.match(
    overviewRecipe,
    /export function buildChannelWorkspaceSummary\(/,
  );
  assert.match(
    overviewRecipe,
    /export function buildChannelAccountWorkspaceSummary\(/,
  );
});

test("channels workspace summary helper centralizes provider and account summary selection", () => {
  assert.match(workspaceSummary, /export interface ChannelStageSummary/);
  assert.match(workspaceSummary, /export function buildChannelStageSummary\(/);
  assert.match(workspaceSummary, /fallbackHeadline\?: string/);
  assert.match(workspaceSummary, /buildChannelWorkspaceSummary\(/);
  assert.match(workspaceSummary, /buildChannelAccountWorkspaceSummary\(/);
});

test("channels api continues to expose summary fetch for recipe hydration", () => {
  assert.match(channelsApi, /export function fetchChannelsSummary\(/);
  assert.doesNotMatch(channelsApi, /buildChannelWorkspaceSummary/);
  assert.doesNotMatch(channelsApi, /buildChannelAccountWorkspaceSummary/);
});

test("channels service no longer exports duplicate workspace seam builders", () => {
  assert.doesNotMatch(
    channelsService,
    /export function buildChannelWorkspaceSummary\(/,
  );
  assert.doesNotMatch(
    channelsService,
    /export function buildChannelAccountWorkspaceSummary\(/,
  );
});
