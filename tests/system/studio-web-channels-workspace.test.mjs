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
const channelsAccountCss = read(
  "apps/web-vue/src/features/channels/channels-account.css",
);
const channelsDrawerCss = read(
  "apps/web-vue/src/features/channels/channels-drawer.css",
);
const globalStyleCss = read("apps/web-vue/src/style.css");

test("channels workspace keeps a persistent provider/account tree and top task bar", () => {
  assert.match(channelsWorkspaceLayout, /channels-stage-header/);
  assert.match(channelsWorkspaceLayout, /channel-rail-node/);
  assert.match(channelsWorkspaceLayout, /channel-account-tree/);
  assert.match(channelsWorkspaceLayout, /channel-account-node/);
  assert.match(channelsWorkspaceLayout, /先选 provider 或账号，再在主工作区顶部切换概览、设置、路由、权限和配对/);
  assert.doesNotMatch(channelsWorkspaceLayout, /高密度索引|右侧专门工作区|right-side workspaces|dense index/);
  assert.match(channelsWorkspaceLayout, /openAccountNode/);
  assert.match(channelsWorkspaceLayout, /isAccountSelected/);
  assert.match(channelsWorkspaceLayout, /channels-task-nav/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-nav studio-workbench-task-nav"/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-nav-button studio-workbench-task-nav-button"/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-bar studio-workbench-task-bar"/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-task-rail|studio-workbench-task-rail/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-top-tabs|channels-task-tabs|mobile-stage-tabs/);
  assert.match(channelsWorkspaceLayout, /activeTaskNavId/);
  assert.match(channelsWorkspaceLayout, /taskNavItems/);
  assert.match(channelsWorkspaceLayout, /openTaskNav/);
  assert.doesNotMatch(channelsWorkspaceLayout, /taskTabs|activeTaskTab|openTaskTab/);
  assert.match(channelsWorkspaceLayout, /selectedAccount/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-subtabs/);
  assert.doesNotMatch(channelsWorkspaceLayout, /openAccountStageTab/);
  assert.doesNotMatch(channelsWorkspaceLayout, /accountTabs/);
  assert.match(channelsWorkspaceLayout, /channels-stage-actions/);
  assert.match(channelsWorkspaceLayout, /mobileRailCollapsed/);
  assert.match(channelsWorkspaceLayout, /showMobileRailToggle/);
  assert.match(channelsWorkspaceLayout, /showProviderRailBody/);
  assert.match(channelsWorkspaceLayout, /toggleMobileRail/);
  assert.match(channelsWorkspaceLayout, /channels-sidebar-current/);
  assert.match(channelsWorkspaceLayout, /channels-sidebar-body/);
  assert.match(channelsWorkspaceLayout, /showProviderRailBody \? text\('收起列表', 'Hide providers'\) : text\('切换频道', 'Switch provider'\)/);
  assert.match(channelsWorkspaceLayout, /openCreateProviderDrawer/);
  assert.match(channelsWorkspaceLayout, /ChannelProviderCreateDrawer/);
  assert.match(channelsWorkspaceLayout, /activeOverlay === 'new-provider'/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-create-panel|toggleCreateChannelPanel/);
  assert.match(channelsWorkspaceLayout, /Routing rules|路由规则/);
  assert.match(channelsWorkspaceLayout, /Provider settings|Provider 设置/);
  assert.match(channelsWorkspaceLayout, /Default account access|默认账号权限/);
  assert.match(channelsWorkspaceLayout, /channels-stage-task/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-stage-task-card|channel-account-card/);
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
  assert.match(channelsWorkspaceCss, /\.channel-account-tree\s*\{/);
  assert.match(channelsWorkspaceCss, /\.channel-account-node\s*\{/);
  assert.doesNotMatch(channelsWorkspaceCss, /\.channels-task-nav-button\s*\{/);
  assert.match(channelsWorkspaceCss, /@media \(max-width: 980px\)[\s\S]*\.channel-rail-list\s*\{[\s\S]*grid-auto-flow:\s*column;/);
  assert.match(channelsWorkspaceCss, /@media \(max-width: 980px\)[\s\S]*\.channel-rail-list > \.channel-rail-node\s*\{[\s\S]*scroll-snap-align:\s*start;/);
  assert.doesNotMatch(channelsWorkspaceCss, /\.channel-rail-list > \.channel-rail-item\s*\{[\s\S]*scroll-snap-align/);
  assert.doesNotMatch(channelsWorkspaceCss, /channel-account-card/);
});

test("channels overview is a thin provider-first surface with summary, quick edits, issues, and account index", () => {
  assert.match(channelsControlPage, /ChannelProviderOverview/);
  assert.match(providerOverview, /channel-provider-strip/);
  assert.match(providerOverview, /channel-provider-facts/);
  assert.match(providerOverview, /channel-provider-strip__edit/);
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
  assert.match(channelsPagesCss, /\.channel-provider-strip\s*\{/);
  assert.match(channelsPagesCss, /\.channel-provider-facts\s*\{/);
  assert.doesNotMatch(providerOverview, /channel-command-center|channel-command-facts|channel-command-fact/);
  assert.doesNotMatch(channelsPagesCss, /channel-command-center|channel-command-facts|channel-command-fact/);
});

test("channels workspace chrome styles are owned by the channels feature", () => {
  assert.match(channelsWorkspaceLayout, /import ['"]\.\/channels-workspace\.css['"]/);
  assert.match(channelsWorkspaceCss, /Channels workspace surfaces live with the Channels feature/);
  assert.match(channelsWorkspaceCss, /\.channels-workbench\s*\{/);
  assert.match(channelsWorkspaceCss, /\.channel-rail-item\s*\{/);
  assert.match(channelsWorkspaceCss, /\.binding-table\s*\{/);
  assert.match(channelsWorkspaceCss, /\.channels-stage-task\s*\{/);
  assert.doesNotMatch(channelsWorkspaceCss, /channels-stage-task-card|channel-account-card|channel-tile|var\(--sky\)|linear-gradient|radial-gradient|--atlas|--glass/);
  assert.doesNotMatch(
    globalStyleCss,
    /\.(?:channels[a-zA-Z0-9_-]*|channel-[a-zA-Z0-9_-]*|binding-table[a-zA-Z0-9_-]*)/,
  );
});

test("channels feature surfaces use DuoYuan tokens instead of local color literals", () => {
  for (const [name, source] of [
    ["channels-workspace.css", channelsWorkspaceCss],
    ["channels-pages.css", channelsPagesCss],
    ["channels-account.css", channelsAccountCss],
    ["channels-drawer.css", channelsDrawerCss],
  ]) {
    assert.doesNotMatch(
      source,
      /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass/,
      `expected ${name} to stay on shared DuoYuan/OpenClaw tokens`,
    );
    assert.doesNotMatch(
      source,
      /var\(--surface\)|--shell-(?:panel|stage|highlight)/,
      `expected ${name} to avoid legacy surface aliases and shell-specific panel tokens`,
    );
  }
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
