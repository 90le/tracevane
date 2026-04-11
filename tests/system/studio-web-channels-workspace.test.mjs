import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelsWorkspaceLayout = read('apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue');
const channelsControlPage = read('apps/web-vue/src/features/channels/ChannelsControlPage.vue');
const providerOverview = read('apps/web-vue/src/features/channels/ChannelProviderOverview.vue');

test('channels workspace keeps a persistent stage header with top tabs and account subtabs', () => {
  assert.match(channelsWorkspaceLayout, /channels-stage-header/);
  assert.match(channelsWorkspaceLayout, /channels-top-tabs/);
  assert.match(channelsWorkspaceLayout, /activeTopTab/);
  assert.match(channelsWorkspaceLayout, /openStageTab/);
  assert.match(channelsWorkspaceLayout, /selectedAccount/);
  assert.match(channelsWorkspaceLayout, /channels-subtabs/);
  assert.match(channelsWorkspaceLayout, /openAccountStageTab/);
  assert.match(channelsWorkspaceLayout, /channels-stage-actions/);
  assert.match(channelsWorkspaceLayout, /Create account|新建账号/);
  assert.match(channelsWorkspaceLayout, /Binding rules|绑定规则/);
  assert.match(channelsWorkspaceLayout, /channels-stage-task-card/);
  assert.doesNotMatch(channelsWorkspaceLayout, /label: text\('账号', 'Accounts'\)/);
  assert.match(channelsWorkspaceLayout, /:channel-label="workspace\.selectedChannel\.value \? workspace\.channelLabel/);
  assert.doesNotMatch(channelsWorkspaceLayout, /Quick configure provider|快捷配置频道/);
});

test('channels overview is a thin provider-first surface with summary, quick edits, issues, and account index', () => {
  assert.match(channelsControlPage, /ChannelProviderOverview/);
  assert.match(providerOverview, /ChannelSummaryStrip/);
  assert.match(providerOverview, /channel-provider-overview__quick-edit/);
  assert.match(providerOverview, /ChannelIssueList/);
  assert.match(providerOverview, /ChannelAccountIndex/);
  assert.match(providerOverview, /update-provider-enabled/);
  assert.match(providerOverview, /update-provider-default-account/);
  assert.match(providerOverview, /open-create-account/);
  assert.doesNotMatch(providerOverview, /channels-stage-actions/);
  assert.doesNotMatch(providerOverview, /频道主页/);
  assert.doesNotMatch(providerOverview, /landing surface/i);
});
