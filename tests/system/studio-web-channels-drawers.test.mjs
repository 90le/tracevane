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
const channelsDrawerCss = read('apps/web-vue/src/features/channels/channels-drawer.css');

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
  assert.match(accountCreateDrawer, /import '\.\/channels-drawer\.css';/);
  assert.doesNotMatch(accountCreateDrawer, /<style scoped>/);
  assert.match(channelsDrawerCss, /html\[data-theme="light"\]\s+\.channels-drawer/);
  assert.match(channelsDrawerCss, /\.create-account-drawer\s*\{/);
  assert.match(channelsDrawerCss, /\.channels-drawer-section\s*\{/);
  assert.match(channelsDrawerCss, /\.channels-drawer-mask\s*\{[\s\S]*background:\s*var\(--modal-backdrop\);/);
  assert.match(channelsDrawerCss, /\.channels-drawer\s*\{[\s\S]*background:\s*var\(--modal-panel-bg\);/);
  assert.doesNotMatch(channelsDrawerCss, /credential-field-card|linear-gradient|radial-gradient|var\(--sky\)|rgba\(|#[0-9a-fA-F]{3,6}/);
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
  assert.match(credentialDrawer, /credential-field-panel/);
  assert.match(credentialDrawer, /credential-drawer__account-summary/);
  assert.match(credentialDrawer, /credential-drawer__account-facts/);
  assert.match(credentialDrawer, /import '\.\/channels-drawer\.css';/);
  assert.doesNotMatch(credentialDrawer, /<style scoped>/);
  assert.match(channelsDrawerCss, /align-content:\s*start/);
  assert.match(credentialDrawer, /channelLabel/);
  assert.match(channelsDrawerCss, /--modal-panel-bg/);
  assert.match(channelsDrawerCss, /html\[data-theme="light"\]\s+\.channels-drawer/);
  assert.match(channelsDrawerCss, /@media\s*\(max-width:\s*640px\)/);
  assert.match(channelsDrawerCss, /\.channels-drawer\s+\.form-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
  assert.match(channelsDrawerCss, /\.channels-drawer\s+\.form-input\s*\{[\s\S]*background:\s*var\(--control-bg\);[\s\S]*border-color:\s*var\(--control-border\);/);
  assert.doesNotMatch(channelsDrawerCss, /credential-field-card|linear-gradient|radial-gradient|var\(--sky\)|rgba\(|#[0-9a-fA-F]{3,6}/);
  assert.doesNotMatch(credentialDrawer, /var\(--panel\)/);
  assert.doesNotMatch(credentialDrawer, /group policy/i);
  assert.doesNotMatch(credentialDrawer, /render mode/i);
  assert.doesNotMatch(credentialDrawer, /groupedAccountFields/);
});

test('channels drawer surfaces share a feature stylesheet instead of scoped style blocks', () => {
  assert.match(quickConfigDrawer, /import '\.\/channels-drawer\.css';/);
  assert.match(accountCreateDrawer, /import '\.\/channels-drawer\.css';/);
  assert.match(credentialDrawer, /import '\.\/channels-drawer\.css';/);
  assert.doesNotMatch(quickConfigDrawer, /<style scoped>/);
  assert.doesNotMatch(accountCreateDrawer, /<style scoped>/);
  assert.doesNotMatch(credentialDrawer, /<style scoped>/);
  assert.match(channelsDrawerCss, /\.channels-drawer-mask\s*\{/);
  assert.match(channelsDrawerCss, /\.channels-drawer\s*\{/);
  assert.match(channelsDrawerCss, /\.channels-drawer__foot\s+\.primary-button/);
  assert.match(channelsDrawerCss, /\.channels-drawer-section\s*\{[\s\S]*background:\s*var\(--modal-panel-bg-strong\);/);
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
