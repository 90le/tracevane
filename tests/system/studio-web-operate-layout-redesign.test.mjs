import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const agentsWorkspaceLayout = read(
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
);
const channelsWorkspaceLayout = read(
  "apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue",
);
const cronControlPage = read(
  "apps/web-vue/src/features/cron/CronControlPage.vue",
);

test("operate pages share workspace shell and cron task head contracts", () => {
  assert.match(agentsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(channelsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(cronControlPage, /operate-workspace-shell/);
  assert.match(cronControlPage, /operate-stage-task-head/);
});
