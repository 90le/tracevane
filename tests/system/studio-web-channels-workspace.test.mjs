import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const channelsWorkspaceLayout = read(
  "apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue",
);
const channelsControlPage = read(
  "apps/web-vue/src/features/channels/ChannelsControlPage.vue",
);
const providerOverview = read(
  "apps/web-vue/src/features/channels/ChannelProviderOverview.vue",
);
const accountIndex = read(
  "apps/web-vue/src/features/channels/ChannelAccountIndex.vue",
);
const providerSettingsPage = read(
  "apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue",
);
const accountDetailPage = read(
  "apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue",
);
const channelsPagesCss = read(
  "apps/web-vue/src/features/channels/channels-pages.css",
);
const channelsWorkspaceCss = read(
  "apps/web-vue/src/features/channels/channels-workspace.css",
);
const globalStyleCss = read("apps/web-vue/src/style.css");

test("channels workspace keeps a persistent stage header with top tabs and account subtabs", () => {
  assert.match(channelsWorkspaceLayout, /channels-stage-header/);
  assert.match(channelsWorkspaceLayout, /channels-top-tabs/);
  assert.match(channelsWorkspaceLayout, /activeTopTab/);
  assert.match(channelsWorkspaceLayout, /openStageTab/);
  assert.match(channelsWorkspaceLayout, /selectedAccount/);
  assert.match(channelsWorkspaceLayout, /channels-subtabs/);
  assert.match(channelsWorkspaceLayout, /openAccountStageTab/);
  assert.match(channelsWorkspaceLayout, /channels-stage-actions/);
  assert.match(channelsWorkspaceLayout, /mobileRailCollapsed/);
  assert.match(channelsWorkspaceLayout, /showMobileRailToggle/);
  assert.match(channelsWorkspaceLayout, /showProviderRailBody/);
  assert.match(channelsWorkspaceLayout, /toggleMobileRail/);
  assert.match(channelsWorkspaceLayout, /channels-sidebar-current/);
  assert.match(channelsWorkspaceLayout, /channels-sidebar-body/);
  assert.match(channelsWorkspaceLayout, /showProviderRailBody \? text\('收起列表', 'Hide providers'\) : text\('切换频道', 'Switch provider'\)/);
  assert.match(channelsWorkspaceLayout, /workspace\.createChannelExpanded\.value = false/);
  assert.match(channelsWorkspaceLayout, /Binding rules|绑定规则/);
  assert.match(channelsWorkspaceLayout, /Provider settings|Provider 设置/);
  assert.match(channelsWorkspaceLayout, /Default account access|默认账号权限/);
  assert.match(channelsWorkspaceLayout, /channels-stage-task-card/);
  assert.doesNotMatch(
    channelsWorkspaceLayout,
    /先创建账号，再从账号卡进入凭据和策略。|Create an account first/,
  );
  assert.match(accountIndex, /Create account|新建账号/);
  assert.doesNotMatch(
    channelsWorkspaceLayout,
    /label: text\('账号', 'Accounts'\)/,
  );
  assert.match(
    channelsWorkspaceLayout,
    /:channel-label="workspace\.selectedChannel\.value \? workspace\.channelLabel/,
  );
  assert.doesNotMatch(
    channelsWorkspaceLayout,
    /Quick configure provider|快捷配置频道/,
  );
});

test("channels overview is a thin provider-first surface with summary, quick edits, issues, and account index", () => {
  assert.match(channelsControlPage, /ChannelProviderOverview/);
  assert.match(providerOverview, /channel-command-center/);
  assert.match(providerOverview, /channel-command-facts/);
  assert.match(providerOverview, /channel-command-center__edit/);
  assert.match(providerOverview, /ChannelIssueList/);
  assert.match(providerOverview, /ChannelAccountIndex/);
  assert.match(providerOverview, /update-provider-enabled/);
  assert.match(providerOverview, /update-provider-default-account/);
  assert.match(providerOverview, /open-create-account/);
  assert.doesNotMatch(
    providerOverview,
    /<button type="button" class="primary-button compact-button"[^>]*open-create-account/,
  );
  assert.doesNotMatch(providerOverview, /channels-stage-actions/);
  assert.doesNotMatch(providerOverview, /频道主页/);
  assert.doesNotMatch(providerOverview, /landing surface/i);
});

test("channels overview page styles are owned by the feature stylesheet", () => {
  assert.match(channelsControlPage, /import '\.\/channels-pages\.css';/);
  assert.match(providerOverview, /import '\.\/channels-pages\.css';/);
  assert.doesNotMatch(channelsControlPage, /<style scoped>/);
  assert.doesNotMatch(providerOverview, /<style scoped>/);
  assert.match(channelsPagesCss, /\.channels-overview-surface\s*\{/);
  assert.match(channelsPagesCss, /\.channel-command-center\s*\{/);
  assert.match(channelsPagesCss, /\.channel-command-facts\s*\{/);
});

test("channels workspace chrome styles are owned by the channels feature", () => {
  assert.match(channelsWorkspaceLayout, /import ['"]\.\/channels-workspace\.css['"]/);
  assert.match(channelsWorkspaceCss, /Channels workspace surfaces live with the Channels feature/);
  assert.match(channelsWorkspaceCss, /\.channels-workbench\s*\{/);
  assert.match(channelsWorkspaceCss, /\.channel-rail-item\s*\{/);
  assert.match(channelsWorkspaceCss, /\.binding-table\s*\{/);
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:channels[a-zA-Z0-9_-]*|channel-[a-zA-Z0-9_-]*|binding-table[a-zA-Z0-9_-]*)/,
  );
});

test("channel provider and account editors track and save config write toggles", () => {
  assert.match(
    providerSettingsPage,
    /configWritesMode:\s*draft\.configWritesMode/,
  );
  assert.match(
    providerSettingsPage,
    /healthMonitorMode:\s*draft\.healthMonitorMode/,
  );
  assert.match(
    providerSettingsPage,
    /configWrites: fromBooleanSelectValue\(draft\.configWritesMode\)/,
  );
  assert.match(
    providerSettingsPage,
    /healthMonitor: fromBooleanSelectValue\(draft\.healthMonitorMode\)/,
  );

  assert.match(
    accountDetailPage,
    /configWritesMode:\s*draft\.configWritesMode/,
  );
  assert.match(
    accountDetailPage,
    /healthMonitorMode:\s*draft\.healthMonitorMode/,
  );
  assert.match(
    accountDetailPage,
    /configWrites: draft\.configWritesMode === 'inherit' \? undefined : draft\.configWritesMode === 'enabled'/,
  );
  assert.match(
    accountDetailPage,
    /healthMonitor: draft\.healthMonitorMode === 'inherit' \? undefined : draft\.healthMonitorMode === 'enabled'/,
  );
});
