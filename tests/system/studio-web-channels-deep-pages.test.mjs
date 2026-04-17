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

const providerSettingsPage = read(
  "apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue",
);
const accountDetailPage = read(
  "apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue",
);
const accessControlPage = read(
  "apps/web-vue/src/features/channels/ChannelAccessControlPage.vue",
);
const pairingPage = read(
  "apps/web-vue/src/features/channels/ChannelPairingPage.vue",
);
const bindingsPage = read(
  "apps/web-vue/src/features/channels/ChannelBindingsPage.vue",
);

test("channels deep pages use single-task heads and avoid page-level header rows", () => {
  assert.match(providerSettingsPage, /channels-stage-task-head/);
  assert.match(providerSettingsPage, /channels-provider-settings-section/);
  assert.match(accountDetailPage, /channels-stage-task-head/);
  assert.match(accountDetailPage, /channels-account-detail-section/);
  assert.match(accessControlPage, /channels-stage-task-head/);
  assert.match(accessControlPage, /channels-access-card/);
  assert.match(pairingPage, /channels-stage-task-head/);
  assert.match(pairingPage, /channels-pairing-card/);
  assert.match(bindingsPage, /channels-stage-task-head/);
  assert.match(bindingsPage, /channels-binding-editor/);
  assert.match(bindingsPage, /channels-binding-editor-section/);

  assert.doesNotMatch(providerSettingsPage, /page-header-row/);
  assert.doesNotMatch(accountDetailPage, /page-header-row/);
  assert.doesNotMatch(accessControlPage, /page-header-row/);
  assert.doesNotMatch(pairingPage, /page-header-row/);
  assert.doesNotMatch(bindingsPage, /page-header-row/);
});

test("access and pairing pages expose task cards and useful empty states", () => {
  assert.match(accessControlPage, /channels-access-grid/);
  assert.match(
    accessControlPage,
    /当前没有私聊白名单|No DM allowlist entries yet/,
  );
  assert.match(
    accessControlPage,
    /当前没有群组白名单|No group allowlist entries yet/,
  );
  assert.match(pairingPage, /channels-pairing-summary/);
  assert.match(pairingPage, /channels-pairing-card/);
  assert.match(pairingPage, /不支持配对|Pairing unsupported/);
  assert.match(
    pairingPage,
    /当前频道或账号不支持配对审批|does not support pairing approval/,
  );
});

test("provider settings exposes provider defaults and thread binding runtime fields", () => {
  assert.match(providerSettingsPage, /configWritesMode/);
  assert.match(providerSettingsPage, /healthMonitorMode/);
  assert.match(
    providerSettingsPage,
    /fromBooleanSelectValue\(draft\.configWritesMode\)/,
  );
  assert.match(
    providerSettingsPage,
    /fromBooleanSelectValue\(draft\.healthMonitorMode\)/,
  );
  assert.match(
    providerSettingsPage,
    /draft\.threadBindings\.spawnSubagentSessions/,
  );
  assert.match(providerSettingsPage, /draft\.threadBindings\.spawnAcpSessions/);
  assert.match(providerSettingsPage, /v-model="draft\.domain"/);
  assert.match(providerSettingsPage, /v-model="draft\.responsePrefix"/);
  assert.match(providerSettingsPage, /domain:\s*draft\.domain\s*\|\|\s*null/);
  assert.match(
    providerSettingsPage,
    /responsePrefix:\s*draft\.responsePrefix\s*\|\|\s*null/,
  );
});

test("deep-edit pages route unsaved-change leave guards through shared confirm dialog contract", () => {
  assert.match(providerSettingsPage, /onBeforeRouteLeave/);
  assert.match(accountDetailPage, /onBeforeRouteLeave/);
  assert.match(accessControlPage, /onBeforeRouteLeave/);

  assert.match(
    providerSettingsPage,
    /import\s*\{[^}]*useConfirmDialog[^}]*\}\s*from\s*["'][^"']*useConfirmDialog["']/,
  );
  assert.match(
    accountDetailPage,
    /import\s*\{[^}]*useConfirmDialog[^}]*\}\s*from\s*["'][^"']*useConfirmDialog["']/,
  );
  assert.match(
    accessControlPage,
    /import\s*\{[^}]*useConfirmDialog[^}]*\}\s*from\s*["'][^"']*useConfirmDialog["']/,
  );

  assert.match(
    providerSettingsPage,
    /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\s*\(/,
  );
  assert.match(
    accountDetailPage,
    /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\s*\(/,
  );
  assert.match(
    accessControlPage,
    /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\s*\(/,
  );

  assert.match(providerSettingsPage, /await\s+confirm\s*\(/);
  assert.match(accountDetailPage, /await\s+confirm\s*\(/);
  assert.match(accessControlPage, /await\s+confirm\s*\(/);

  assert.doesNotMatch(providerSettingsPage, /window\.confirm/);
  assert.doesNotMatch(accountDetailPage, /window\.confirm/);
  assert.doesNotMatch(accessControlPage, /window\.confirm/);
});
