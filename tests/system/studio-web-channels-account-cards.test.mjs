import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const channelAccountCard = read('apps/web-vue/src/features/channels/ChannelAccountCard.vue');
const channelAccountIndex = read('apps/web-vue/src/features/channels/ChannelAccountIndex.vue');

test('channel account card stays an index card with concise facts and routed task actions', () => {
  assert.match(channelAccountCard, /channel-account-card__summary/);
  assert.match(channelAccountCard, /open-account|edit/);
  assert.match(channelAccountCard, /credentials/);
  assert.match(channelAccountCard, /access/);
  assert.match(channelAccountCard, /pairing/);
  assert.match(channelAccountCard, /bindings/);
  assert.match(channelAccountCard, /account\.kind !== 'default'/);
  assert.match(channelAccountCard, /ghost-action-delete/);
  assert.match(channelAccountCard, /\(event: 'delete'\): void/);

  assert.doesNotMatch(channelAccountCard, /form-input/);
  assert.doesNotMatch(channelAccountCard, /form-textarea/);
  assert.doesNotMatch(channelAccountCard, /<textarea/);
  assert.doesNotMatch(channelAccountCard, /GlassSelect/);
});

test('account index renders account cards instead of embedding account form controls inline', () => {
  assert.match(channelAccountIndex, /ChannelAccountCard/);
  assert.match(channelAccountIndex, /defaultAccounts/);
  assert.match(channelAccountIndex, /namedAccounts/);
  assert.match(channelAccountIndex, /默认账号|Default account/);
  assert.match(channelAccountIndex, /命名账号|Named accounts/);
  assert.match(channelAccountIndex, /delete-account/);
  assert.doesNotMatch(channelAccountIndex, /form-input/);
  assert.doesNotMatch(channelAccountIndex, /form-textarea/);
  assert.doesNotMatch(channelAccountIndex, /<textarea/);
});
