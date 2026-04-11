import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const providerSettingsPage = read('apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue');
const accountDetailPage = read('apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue');
const accessControlPage = read('apps/web-vue/src/features/channels/ChannelAccessControlPage.vue');
const pairingPage = read('apps/web-vue/src/features/channels/ChannelPairingPage.vue');
const bindingsPage = read('apps/web-vue/src/features/channels/ChannelBindingsPage.vue');

test('channels deep pages use single-task heads and avoid page-level header rows', () => {
  assert.match(providerSettingsPage, /channels-stage-task-head/);
  assert.match(accountDetailPage, /channels-stage-task-head/);
  assert.match(accessControlPage, /channels-stage-task-head/);
  assert.match(pairingPage, /channels-stage-task-head/);
  assert.match(bindingsPage, /channels-stage-task-head/);

  assert.doesNotMatch(providerSettingsPage, /page-header-row/);
  assert.doesNotMatch(accountDetailPage, /page-header-row/);
  assert.doesNotMatch(accessControlPage, /page-header-row/);
  assert.doesNotMatch(pairingPage, /page-header-row/);
  assert.doesNotMatch(bindingsPage, /page-header-row/);
});

test('deep-edit pages still guard against accidental navigation with unsaved changes where edits are stateful', () => {
  assert.match(providerSettingsPage, /onBeforeRouteLeave/);
  assert.match(providerSettingsPage, /window\.confirm/);
  assert.match(accountDetailPage, /onBeforeRouteLeave/);
  assert.match(accountDetailPage, /window\.confirm/);
  assert.match(accessControlPage, /onBeforeRouteLeave/);
  assert.match(accessControlPage, /window\.confirm/);
});
