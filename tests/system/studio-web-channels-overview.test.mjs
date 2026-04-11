import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelsControlPage = read('apps/web-vue/src/features/channels/ChannelsControlPage.vue');
const channelsWorkspaceLayout = read('apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue');
const channelProviderOverview = read('apps/web-vue/src/features/channels/ChannelProviderOverview.vue');
const channelAccountCard = read('apps/web-vue/src/features/channels/ChannelAccountCard.vue');
const channelAccountIndex = read('apps/web-vue/src/features/channels/ChannelAccountIndex.vue');
const channelIssueList = read('apps/web-vue/src/features/channels/ChannelIssueList.vue');
const channelSummaryStrip = read('apps/web-vue/src/features/channels/ChannelSummaryStrip.vue');
const channelBindingsPage = read('apps/web-vue/src/features/channels/ChannelBindingsPage.vue');

test('channels workspace shell uses RouterView for the right-side workspace outlet', () => {
  assert.match(channelsWorkspaceLayout, /import\s+\{[^}]*RouterView[^}]*\}\s+from\s+'vue-router';/);
  assert.match(channelsWorkspaceLayout, /channels-stage/);
  assert.match(channelsWorkspaceLayout, /<RouterView\s*\/>/);
  assert.doesNotMatch(channelsWorkspaceLayout, /activeWorkspaceTab/);
});

test('channels control page no longer acts as the all-in-one workbench container', () => {
  assert.match(channelsControlPage, /ChannelProviderOverview/);
  assert.doesNotMatch(channelsControlPage, /activeWorkspaceTab/);
  assert.doesNotMatch(channelsControlPage, /activeAccountTab/);
  assert.doesNotMatch(channelsControlPage, /workspaceTabs/);
});

test('provider overview composes summary and index surfaces while stage actions stay in the workspace shell', () => {
  assert.match(channelProviderOverview, /ChannelSummaryStrip/);
  assert.match(channelProviderOverview, /channel-provider-overview__quick-edit/);
  assert.match(channelProviderOverview, /ChannelIssueList/);
  assert.match(channelProviderOverview, /ChannelAccountIndex/);
  assert.match(channelProviderOverview, /update-provider-enabled/);
  assert.match(channelProviderOverview, /update-provider-default-account/);
  assert.match(channelProviderOverview, /open-create-account/);
  assert.match(channelProviderOverview, /open-bindings/);
  assert.match(channelProviderOverview, /delete-account/);
  assert.match(channelProviderOverview, /delete-channel/);
  assert.match(channelProviderOverview, /删除频道|Delete provider/);
  assert.match(channelProviderOverview, /activate-issue/);
  assert.match(channelsControlPage, /@open-bindings="openBindingsPage"/);
  assert.match(channelsControlPage, /@delete-account="deleteAccount"/);
  assert.match(channelsControlPage, /@delete-channel="deleteProvider"/);
  assert.match(channelsControlPage, /deleteChannel\(/);
  assert.match(channelsControlPage, /function deleteProvider/);
  assert.match(channelsControlPage, /deleteChannelAccount/);
  assert.match(channelsControlPage, /function deleteAccount/);
  assert.match(channelsControlPage, /function openBindingsPage/);
  assert.match(channelsControlPage, /intent:\s*'create'/);
  assert.doesNotMatch(channelProviderOverview, /channels-stage-actions/);
  assert.match(channelsWorkspaceLayout, /Binding rules|绑定规则/);
  assert.match(channelsWorkspaceLayout, /Provider settings|Provider 设置/);
  assert.match(channelsWorkspaceLayout, /Default account access|默认账号权限/);
  assert.doesNotMatch(channelsWorkspaceLayout, /先创建账号，再从账号卡进入凭据和策略。|Create an account first/);
  assert.match(channelAccountIndex, /Create account|新建账号/);
  assert.match(channelAccountIndex, /这里创建账号，并从账号卡进入凭据、权限、配对和绑定。|Create accounts here/);
  assert.match(channelsWorkspaceLayout, /channels-stage-actions/);
  assert.doesNotMatch(channelsWorkspaceLayout, /Quick configure provider|快捷配置频道/);
});

test('workspace layout owns quick overlays instead of pushing them into the overview page', () => {
  assert.match(channelsWorkspaceLayout, /ChannelAccountCreateDrawer/);
  assert.match(channelsWorkspaceLayout, /ChannelCredentialDrawer/);
  assert.doesNotMatch(channelsWorkspaceLayout, /ChannelQuickConfigDrawer/);
});

test('account cards are concise index cards instead of inline form editors', () => {
  assert.match(channelAccountCard, /channel-account-card/);
  assert.match(channelAccountCard, /channel-account-card__task-group/);
  assert.match(channelAccountCard, /channel-account-card__manage-actions/);
  assert.match(channelAccountCard, /Credentials|凭据/);
  assert.match(channelAccountCard, /Access|权限/);
  assert.match(channelAccountCard, /Pairing|配对/);
  assert.doesNotMatch(channelAccountCard, /channel-account-card__secondary-actions/);
  assert.doesNotMatch(channelAccountCard, /form-input/);
  assert.doesNotMatch(channelAccountCard, /form-textarea/);
});

test('issue list routes operators to the relevant workflow instead of only opening account detail', () => {
  assert.match(channelIssueList, /activate-issue/);
  assert.match(channelIssueList, /issue\.actionLabel/);
  assert.doesNotMatch(channelIssueList, /查看账号/);
});

test('channel summary strip exposes connection mode in the landing-state snapshot', () => {
  assert.match(channelSummaryStrip, /Connection Mode|连接模式/);
  assert.match(channelSummaryStrip, /channel\.connectionMode/);
});

test('bindings page can preserve account context when opened from an account card shortcut', () => {
  assert.match(channelBindingsPage, /route\.query\.accountId/);
  assert.match(channelBindingsPage, /route\.query\.intent/);
  assert.match(channelBindingsPage, /draft\.accountId = focusedAccountId/);
  assert.match(channelBindingsPage, /bindingTaskTitle/);
  assert.match(channelBindingsPage, /为账号 .* 新增绑定|Create binding for account/);
  assert.match(channelBindingsPage, /channels-binding-editor/);
  assert.match(channelBindingsPage, /channels-binding-editor-section/);
  assert.match(channelBindingsPage, /editingBindingId === binding\.id/);
});

test('bindings page keeps roles and acp fields round-trippable during edit/save', () => {
  assert.match(channelBindingsPage, /draft\.roles = binding\.match\.roles\.join\(', '\)/);
  assert.match(channelBindingsPage, /draft\.acpMode = binding\.acp\?\.mode \|\| ''/);
  assert.match(channelBindingsPage, /draft\.acpLabel = binding\.acp\?\.label \|\| ''/);
  assert.match(channelBindingsPage, /draft\.acpCwd = binding\.acp\?\.cwd \|\| ''/);
  assert.match(channelBindingsPage, /draft\.acpBackend = binding\.acp\?\.backend \|\| ''/);
  assert.match(channelBindingsPage, /roles:\s*parseBindingRoles\(draft\.roles\)/);
  assert.match(channelBindingsPage, /acpMode:\s*draft\.type === 'acp' \? draft\.acpMode \|\| null : null/);
  assert.match(channelBindingsPage, /acpLabel:\s*draft\.type === 'acp' \? draft\.acpLabel \|\| null : null/);
  assert.match(channelBindingsPage, /acpCwd:\s*draft\.type === 'acp' \? draft\.acpCwd \|\| null : null/);
  assert.match(channelBindingsPage, /acpBackend:\s*draft\.type === 'acp' \? draft\.acpBackend \|\| null : null/);
  assert.match(channelBindingsPage, /绑定角色|Binding roles/);
  assert.match(channelBindingsPage, /ACP 模式|ACP mode/);
  assert.match(channelBindingsPage, /ACP 标签|ACP label/);
  assert.match(channelBindingsPage, /ACP 工作目录|ACP working directory/);
  assert.match(channelBindingsPage, /ACP 后端|ACP backend/);
});
