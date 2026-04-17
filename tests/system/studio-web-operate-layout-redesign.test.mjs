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
const globalStyle = read("apps/web-vue/src/style.css");

test("operate pages share workspace shell, rail, and stage contracts", () => {
  assert.match(agentsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(channelsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(cronControlPage, /operate-workspace-shell/);

  assert.match(agentsWorkspaceLayout, /operate-resource-rail/);
  assert.match(channelsWorkspaceLayout, /operate-resource-rail/);
  assert.match(cronControlPage, /operate-resource-rail/);

  assert.match(agentsWorkspaceLayout, /operate-stage/);
  assert.match(channelsWorkspaceLayout, /operate-stage/);
  assert.match(cronControlPage, /operate-stage/);

  assert.match(
    agentsWorkspaceLayout,
    /operate-stage-task-head|agents-stage-task-head/,
  );
  assert.match(
    channelsWorkspaceLayout,
    /operate-stage-task-head|channels-stage-head/,
  );
  assert.match(cronControlPage, /operate-stage-task-head/);
});

test("operate pages share unified workspace language hooks", () => {
  assert.match(agentsWorkspaceLayout, /operate-summary-pill/);
  assert.match(channelsWorkspaceLayout, /operate-summary-pill/);
  assert.match(cronControlPage, /operate-summary-pill/);

  assert.match(agentsWorkspaceLayout, /operate-fact-strip/);
  assert.match(channelsWorkspaceLayout, /operate-fact-strip/);
  assert.match(cronControlPage, /operate-fact-strip/);

  assert.match(globalStyle, /\.operate-workspace-surface\s*\{/);
  assert.match(globalStyle, /\.operate-summary-pill\s*\{/);
  assert.match(globalStyle, /\.operate-fact-strip\s*\{/);
  assert.match(globalStyle, /\.operate-badge\s*\{/);

  assert.match(
    globalStyle,
    /html\[data-theme="light"\] \.operate-summary-pill/,
  );
  assert.match(globalStyle, /html\[data-theme="light"\] \.operate-badge/);
});
