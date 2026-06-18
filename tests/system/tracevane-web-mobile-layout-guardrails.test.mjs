import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const chatShellPage = read(
  "apps/web-vue/src/features/chat/ChatShellPage.vue",
);
const agentsWorkspaceLayout = read(
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
);
const channelsWorkspaceLayout = read(
  "apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue",
);
const cronControlPage = read(
  "apps/web-vue/src/features/cron/CronControlPage.vue",
);
const systemControlPage = read(
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const systemWorkspaceCss = read(
  "apps/web-vue/src/features/system/system-workspace.css",
);

test("mobile chat keeps dedicated rail drawer and inspector sheet contracts", () => {
  assert.match(
    chatShellPage,
    /(mobile-session-rail-drawer|chat-mobile-rail-drawer|chat-mobile-session-rail)/,
  );
  assert.match(
    chatShellPage,
    /(mobile-inspector-sheet|chat-mobile-inspector-sheet|chat-inspector-mobile-sheet)/,
  );
});

test("mobile operate and system side areas use sheet, task-nav, drawer, or accordion contracts", () => {
  const mobileDownshiftContract =
    /(mobile-[a-z-]*(sheet|tabs|drawer|accordion|task-nav)|(sheet|tabs|drawer|accordion|task-nav)-mobile)/i;

  assert.match(agentsWorkspaceLayout, mobileDownshiftContract);
  assert.match(channelsWorkspaceLayout, mobileDownshiftContract);
  assert.match(cronControlPage, mobileDownshiftContract);
  assert.match(systemControlPage, /system-control-grid/);
  assert.match(
    systemWorkspaceCss,
    /@media \(max-width: 1180px\) \{[\s\S]*\.system-control-grid \{[\s\S]*grid-template-columns:\s*1fr;/,
  );
  assert.match(systemWorkspaceCss, /@media \(max-width: 880px\) \{[\s\S]*\.system-action-row \{[\s\S]*grid-template-columns:\s*28px minmax\(0, 1fr\);/);
});

test("operate mobile layouts keep drawer and tabs contracts", () => {
  assert.match(agentsWorkspaceLayout, /mobile-resource-drawer/);
  assert.match(channelsWorkspaceLayout, /mobile-resource-drawer/);
  assert.match(cronControlPage, /mobile-resource-drawer|mobile-stage-tabs/);
});
