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

const migrationTargets = [
  "apps/web-vue/src/App.vue",
  "apps/web-vue/src/features/channels/ChannelsControlPage.vue",
  "apps/web-vue/src/features/channels/ChannelBindingsPage.vue",
  "apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue",
  "apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue",
  "apps/web-vue/src/features/channels/ChannelAccessControlPage.vue",
  "apps/web-vue/src/features/agents/AgentBindingsPage.vue",
  "apps/web-vue/src/features/agents/AgentSessionsPage.vue",
  "apps/web-vue/src/features/cron/CronControlPage.vue",
  "apps/web-vue/src/features/chat/ChatShellPage.vue",
];

const composableTargets = [
  "apps/web-vue/src/features/channels/ChannelsControlPage.vue",
  "apps/web-vue/src/features/channels/ChannelBindingsPage.vue",
  "apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue",
  "apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue",
  "apps/web-vue/src/features/channels/ChannelAccessControlPage.vue",
  "apps/web-vue/src/features/agents/AgentBindingsPage.vue",
  "apps/web-vue/src/features/agents/AgentSessionsPage.vue",
  "apps/web-vue/src/features/cron/CronControlPage.vue",
  "apps/web-vue/src/features/chat/ChatShellPage.vue",
];

test("confirm dialog migration contract removes browser confirm from scoped surfaces", () => {
  for (const filePath of migrationTargets) {
    const source = read(filePath);
    assert.doesNotMatch(
      source,
      /window\.confirm/,
      `expected ${filePath} to stop using window.confirm`,
    );
  }
});

test("migration targets use shared confirm composable contract", () => {
  for (const filePath of composableTargets) {
    const source = read(filePath);

    assert.match(
      source,
      /import\s*\{[^}]*useConfirmDialog[^}]*\}\s*from\s*["'][^"']*useConfirmDialog["']/,
      `expected ${filePath} to import useConfirmDialog from shared composable module`,
    );
    assert.match(
      source,
      /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\s*\(/,
      `expected ${filePath} to create confirm handler from useConfirmDialog()`,
    );
    assert.match(
      source,
      /await\s+confirm\s*\(/,
      `expected ${filePath} to await shared confirm dialog invocation`,
    );
  }
});
