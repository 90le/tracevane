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
const channelAccountEntry = read('apps/web-vue/src/features/channels/ChannelAccountEntry.vue');
const channelAccountIndex = read('apps/web-vue/src/features/channels/ChannelAccountIndex.vue');
const channelIssueList = read('apps/web-vue/src/features/channels/ChannelIssueList.vue');
const channelBindingsPage = read('apps/web-vue/src/features/channels/ChannelBindingsPage.vue');
const channelBindingEditorPanel = read('apps/web-vue/src/features/channels/ChannelBindingEditorPanel.vue');
const channelsAccountCss = read('apps/web-vue/src/features/channels/channels-account.css');

test('channels workspace shell uses RouterView for the focused task outlet', () => {
  assert.match(channelsWorkspaceLayout, /import\s+\{[^}]*RouterView[^}]*\}\s+from\s+'vue-router';/);
  assert.match(channelsWorkspaceLayout, /channels-stage/);
  assert.match(channelsWorkspaceLayout, /<RouterView\s*\/>/);
  assert.match(channelsWorkspaceLayout, /showProviderRailBody/);
  assert.match(channelsWorkspaceLayout, /toggleMobileRail/);
  assert.doesNotMatch(channelsWorkspaceLayout, /right-side|右侧专门工作区|高密度索引/);
  assert.doesNotMatch(channelsWorkspaceLayout, /activeWorkspaceTab/);
});

test('channels control page no longer acts as the all-in-one workbench container', () => {
  assert.match(channelsControlPage, /ChannelProviderOverview/);
  assert.doesNotMatch(channelsControlPage, /activeWorkspaceTab/);
  assert.doesNotMatch(channelsControlPage, /activeAccountTab/);
  assert.doesNotMatch(channelsControlPage, /workspaceTabs/);
  assert.match(channelsControlPage, /对象索引只负责选择 provider 或账号/);
  assert.doesNotMatch(channelsControlPage, /右侧会根据当前 provider|right workspace/);
});

test('provider overview composes summary and index surfaces while stage actions stay in the workspace shell', () => {
  assert.match(channelProviderOverview, /channel-provider-strip/);
  assert.match(channelProviderOverview, /channel-provider-facts/);
  assert.match(channelProviderOverview, /channel-provider-strip__edit/);
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
  assert.match(channelsWorkspaceLayout, /Routing rules|路由规则/);
  assert.match(channelsWorkspaceLayout, /Provider settings|Provider 设置/);
  assert.match(channelsWorkspaceLayout, /Default account access|默认账号权限/);
  assert.doesNotMatch(channelsWorkspaceLayout, /先创建账号，再从账号卡进入凭据和策略。|Create an account first/);
  assert.match(channelAccountIndex, /Create account|新建账号/);
  assert.match(channelAccountIndex, /这里创建账号，并从账号入口进入凭据、权限、配对和路由。|Create accounts here/);
  assert.match(channelsWorkspaceLayout, /channels-stage-actions/);
  assert.doesNotMatch(channelsWorkspaceLayout, /Quick configure provider|快捷配置频道/);
});

test('workspace layout owns quick overlays instead of pushing them into the overview page', () => {
  assert.match(channelsWorkspaceLayout, /ChannelAccountCreateDrawer/);
  assert.match(channelsWorkspaceLayout, /ChannelProviderCreateDrawer/);
  assert.match(channelsWorkspaceLayout, /activeOverlay === 'new-provider'/);
  assert.match(channelsWorkspaceLayout, /ChannelCredentialDrawer/);
  assert.doesNotMatch(channelsWorkspaceLayout, /ChannelQuickConfigDrawer/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-create-panel/);
});

test('account entries stay as concise routed task rows instead of inline form editors', () => {
  assert.match(channelAccountEntry, /channel-account-entry/);
  assert.match(channelAccountEntry, /channel-account-entry__footer/);
  assert.match(channelAccountEntry, /channel-account-entry__action-row/);
  assert.match(channelAccountEntry, /channel-account-entry__task-group/);
  assert.match(channelAccountEntry, /channel-account-entry__manage-actions/);
  assert.match(channelAccountEntry, /Credentials|凭据/);
  assert.match(channelAccountEntry, /Access|权限/);
  assert.match(channelAccountEntry, /Pairing|配对/);
  assert.match(channelAccountEntry, /import '\.\/channels-account\.css';/);
  assert.match(channelAccountIndex, /import '\.\/channels-account\.css';/);
  assert.match(channelIssueList, /import '\.\/channels-account\.css';/);
  assert.doesNotMatch(channelAccountEntry, /<style scoped>/);
  assert.doesNotMatch(channelAccountIndex, /<style scoped>/);
  assert.doesNotMatch(channelIssueList, /<style scoped>/);
  assert.match(channelsAccountCss, /\.channel-account-entry\s*\{/);
  assert.match(channelsAccountCss, /\.channel-account-index\s*\{/);
  assert.match(channelsAccountCss, /\.channel-issue-list\s*\{/);
  assert.doesNotMatch(channelAccountEntry, /channel-account-entry__secondary-actions/);
  assert.doesNotMatch(channelAccountEntry, /grid-template-columns:\s*minmax\(180px,\s*0\.75fr\)\s*minmax\(0,\s*1\.45fr\)\s*auto/);
  assert.doesNotMatch(channelAccountEntry, /form-input/);
  assert.doesNotMatch(channelAccountEntry, /form-textarea/);
  assert.doesNotMatch(channelAccountIndex, /ChannelAccountCard|ChannelAccountCard\.vue/);
  assert.doesNotMatch(channelsAccountCss, /channel-account-card|linear-gradient|var\(--sky\)/);
});

test('issue list routes operators to the relevant workflow instead of only opening account detail', () => {
  assert.match(channelIssueList, /activate-issue/);
  assert.match(channelIssueList, /issue\.actionLabel/);
  assert.match(channelIssueList, /showAllIssues/);
  assert.match(channelIssueList, /visibleIssues/);
  assert.match(channelIssueList, /watch\(/);
  assert.match(channelIssueList, /showAllIssues\.value = false/);
  assert.match(channelIssueList, /查看全部|Show all/);
  assert.doesNotMatch(channelIssueList, /查看账号/);
});

test('provider fact strip exposes connection mode in the landing-state snapshot', () => {
  assert.match(channelProviderOverview, /Connection|连接/);
  assert.match(channelProviderOverview, /channel\.connectionMode/);
  assert.match(channelProviderOverview, /channel-provider-fact/);
  assert.doesNotMatch(channelProviderOverview, /channel-command-center|channel-command-facts|channel-command-fact/);
});

test('bindings page can preserve account context when opened from an account entry shortcut', () => {
  assert.match(channelBindingsPage, /route\.query\.accountId/);
  assert.match(channelBindingsPage, /route\.query\.intent/);
  assert.match(channelBindingsPage, /draft\.accountId = focusedAccountId/);
  assert.match(channelBindingsPage, /bindingTaskTitle/);
  assert.match(channelBindingsPage, /为账号 .* 新增路由|Create route for account/);
  assert.match(channelBindingsPage, /isCreatingBinding/);
  assert.match(channelBindingsPage, /binding-table-item/);
  assert.match(channelBindingsPage, /binding-table-editor-row/);
  assert.match(channelBindingsPage, /editingBindingId === binding\.id/);
  assert.match(channelBindingsPage, /ChannelBindingEditorPanel/);
  assert.match(channelBindingEditorPanel, /channels-binding-editor/);
  assert.match(channelBindingEditorPanel, /channels-binding-editor-section/);
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
  assert.match(channelBindingEditorPanel, /匹配角色|Matching roles/);
  assert.match(channelBindingEditorPanel, /ACP 模式|ACP mode/);
  assert.match(channelBindingEditorPanel, /ACP 标签|ACP label/);
  assert.match(channelBindingEditorPanel, /ACP 工作目录|ACP working directory/);
  assert.match(channelBindingEditorPanel, /ACP 后端|ACP backend/);
});
