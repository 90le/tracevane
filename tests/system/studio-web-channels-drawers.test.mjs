import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const quickConfigDrawer = read('apps/web-vue/src/features/channels/ChannelQuickConfigDrawer.vue');
const accountCreateDrawer = read('apps/web-vue/src/features/channels/ChannelAccountCreateDrawer.vue');
const credentialDrawer = read('apps/web-vue/src/features/channels/ChannelCredentialDrawer.vue');
const accountDetailPage = read('apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue');

test('provider quick config drawer only exposes common provider defaults', () => {
  assert.match(quickConfigDrawer, /default account/i);
  assert.match(quickConfigDrawer, /dm policy/i);
  assert.match(quickConfigDrawer, /group policy/i);
  assert.match(quickConfigDrawer, /streaming/i);
  assert.match(quickConfigDrawer, /connection mode/i);
  assert.doesNotMatch(quickConfigDrawer, /groupedAccountFields/);
  assert.doesNotMatch(quickConfigDrawer, /accountFieldGroups/);
  assert.doesNotMatch(quickConfigDrawer, /JSON/i);
});

test('account create drawer stays focused on creation intent and required credentials', () => {
  assert.match(accountCreateDrawer, /create account/i);
  assert.match(accountCreateDrawer, /enabled/i);
  assert.match(accountCreateDrawer, /credential/i);
  assert.match(accountCreateDrawer, /save/i);
  assert.match(accountCreateDrawer, /cancel/i);
  assert.match(accountCreateDrawer, /channels-drawer-mask/);
  assert.match(accountCreateDrawer, /channels-drawer-section/);
  assert.match(accountCreateDrawer, /create-account-drawer/);
  assert.match(accountCreateDrawer, /没有单独名称字段|separate display-name field/);
  assert.match(accountCreateDrawer, /html\[data-theme="light"\]\s+\.channels-drawer/);
  assert.doesNotMatch(accountCreateDrawer, /var\(--panel\)/);
  assert.doesNotMatch(accountCreateDrawer, /access/i);
  assert.doesNotMatch(accountCreateDrawer, /binding/i);
  assert.doesNotMatch(accountCreateDrawer, /pairing/i);
  assert.doesNotMatch(accountCreateDrawer, /继续/);
  assert.doesNotMatch(accountCreateDrawer, /Continue/);
});

test('credential drawer stays credential-only instead of mixing in deep account fields', () => {
  assert.match(credentialDrawer, /configured/i);
  assert.match(credentialDrawer, /unconfigured/i);
  assert.match(credentialDrawer, /credential/i);
  assert.match(credentialDrawer, /channels-drawer-mask/);
  assert.match(credentialDrawer, /credential-field-grid/);
  assert.match(credentialDrawer, /credential-field-grid--compact/);
  assert.match(credentialDrawer, /credential-field-card/);
  assert.match(credentialDrawer, /credential-drawer__context-panel/);
  assert.match(credentialDrawer, /credential-drawer__account-context/);
  assert.match(credentialDrawer, /align-content:\s*start/);
  assert.match(credentialDrawer, /channelLabel/);
  assert.match(credentialDrawer, /shell-stage-fill-strong/);
  assert.match(credentialDrawer, /html\[data-theme="light"\]\s+\.channels-drawer/);
  assert.match(credentialDrawer, /@media\s*\(max-width:\s*640px\)/);
  assert.match(credentialDrawer, /\.channels-drawer\s+\.form-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(credentialDrawer, /var\(--panel\)/);
  assert.doesNotMatch(credentialDrawer, /group policy/i);
  assert.doesNotMatch(credentialDrawer, /render mode/i);
  assert.doesNotMatch(credentialDrawer, /groupedAccountFields/);
});

test('account detail delegates credential editing to the credential drawer', () => {
  assert.match(accountDetailPage, /account-credential-summary/);
  assert.match(accountDetailPage, /openCredentialDrawer/);
  assert.match(accountDetailPage, /workspace\.openOverlay\('credentials', account\.value\.id\)/);
  assert.match(accountDetailPage, /buildAccountDetailFieldPayload/);
  assert.match(accountDetailPage, /delete values\[field\.key\]/);
  assert.doesNotMatch(accountDetailPage, /fetchChannelAccountCredentials/);
  assert.doesNotMatch(accountDetailPage, /v-model="draft\.credentialValues\[credentialField\.key\]"/);
  assert.doesNotMatch(accountDetailPage, /credentialValues: draft\.credentialValues/);
});
