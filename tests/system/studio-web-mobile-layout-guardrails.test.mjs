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
  "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
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

test("mobile operate and system side areas use sheet, tabs, drawer, or accordion contracts", () => {
  const operateAndSystemSources = [
    agentsWorkspaceLayout,
    channelsWorkspaceLayout,
    cronControlPage,
    systemControlPage,
  ].join("\n");

  assert.match(
    operateAndSystemSources,
    /(mobile-[a-z-]*(sheet|tabs|drawer|accordion)|(sheet|tabs|drawer|accordion)-mobile)/i,
  );
});
