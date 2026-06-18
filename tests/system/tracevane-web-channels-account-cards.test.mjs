import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/tracevane';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelAccountEntry = read('apps/web-vue/src/features/channels/ChannelAccountEntry.vue');
const channelAccountIndex = read('apps/web-vue/src/features/channels/ChannelAccountIndex.vue');
const channelsAccountCss = read('apps/web-vue/src/features/channels/channels-account.css');

test('channel account entry stays concise with routed task actions', () => {
  assert.match(channelAccountEntry, /channel-account-entry__summary/);
  assert.match(channelAccountEntry, /channel-account-entry__footer/);
  assert.match(channelAccountEntry, /channel-account-entry__action-row/);
  assert.match(channelAccountEntry, /channel-account-entry__primary-action/);
  assert.match(channelAccountEntry, /channel-account-entry__task-group/);
  assert.match(channelAccountEntry, /channel-account-entry__task-actions/);
  assert.match(channelAccountEntry, /channel-account-entry__manage-actions/);
  assert.match(channelAccountEntry, /open-account|edit/);
  assert.match(channelAccountEntry, /credentials/);
  assert.match(channelAccountEntry, /access/);
  assert.match(channelAccountEntry, /pairing/);
  assert.match(channelAccountEntry, /bindings/);
  assert.match(channelAccountEntry, /account\.kind !== 'default'/);
  assert.match(channelAccountEntry, /ghost-action-delete/);
  assert.match(channelAccountEntry, /import '\.\/channels-account\.css';/);
  assert.doesNotMatch(channelAccountEntry, /<style scoped>/);
  assert.match(channelsAccountCss, /\.channel-account-entry\s*\{/);
  assert.match(channelsAccountCss, /\.channel-account-entry__task-actions\s*\{/);
  assert.match(channelsAccountCss, /\.ghost-action-delete\s*\{/);
  assert.match(channelAccountEntry, /\(event: 'delete'\): void/);
  assert.doesNotMatch(channelAccountEntry, /channel-account-entry__secondary-actions/);
  assert.doesNotMatch(channelAccountEntry, /grid-template-columns:\s*minmax\(180px,\s*0\.75fr\)\s*minmax\(0,\s*1\.45fr\)\s*auto/);

  assert.doesNotMatch(channelAccountEntry, /form-input/);
  assert.doesNotMatch(channelAccountEntry, /form-textarea/);
  assert.doesNotMatch(channelAccountEntry, /<textarea/);
  assert.doesNotMatch(channelAccountEntry, /TracevaneSelect/);
  assert.doesNotMatch(channelsAccountCss, /channel-account-card|linear-gradient|var\(--sky\)/);
});

test('account index renders account entries instead of embedding account form controls inline', () => {
  assert.match(channelAccountIndex, /ChannelAccountEntry/);
  assert.doesNotMatch(channelAccountIndex, /ChannelAccountCard|ChannelAccountCard\.vue/);
  assert.match(channelAccountIndex, /defaultAccounts/);
  assert.match(channelAccountIndex, /namedAccounts/);
  assert.match(channelAccountIndex, /默认账号|Default account/);
  assert.match(channelAccountIndex, /命名账号|Named accounts/);
  assert.match(channelAccountIndex, /delete-account/);
  assert.match(channelAccountIndex, /import '\.\/channels-account\.css';/);
  assert.doesNotMatch(channelAccountIndex, /<style scoped>/);
  assert.match(channelsAccountCss, /\.channel-account-index__list\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(320px,\s*1fr\)\)/);
  assert.doesNotMatch(channelAccountIndex, /form-input/);
  assert.doesNotMatch(channelAccountIndex, /form-textarea/);
  assert.doesNotMatch(channelAccountIndex, /<textarea/);
});
