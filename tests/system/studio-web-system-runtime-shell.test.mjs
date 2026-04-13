import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const systemControlPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const overviewPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemOverviewPanel.vue",
);
const sectionRailPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemSectionRail.vue",
);

const systemControlPage = fs.readFileSync(systemControlPagePath, "utf8");
const overviewPanel = fs.readFileSync(overviewPanelPath, "utf8");
const sectionRail = fs.readFileSync(sectionRailPath, "utf8");

test("system control page composes overview and rail subcomponents", () => {
  assert.match(
    systemControlPage,
    /import SystemOverviewPanel from '\.\/SystemOverviewPanel\.vue'/,
  );
  assert.match(
    systemControlPage,
    /import SystemSectionRail from '\.\/SystemSectionRail\.vue'/,
  );
  assert.match(systemControlPage, /<SystemSectionRail/);
  assert.match(systemControlPage, /<SystemOverviewPanel/);
  assert.doesNotMatch(
    systemControlPage,
    /class="panel-card system-sidebar-panel"/,
  );
});

test("system control page consumes extracted recipe and selectors", () => {
  assert.match(
    systemControlPage,
    /import \{[\s\S]*buildSystemOverviewCards[\s\S]*\} from '\.\/system-overview-recipe'/,
  );
  assert.match(
    systemControlPage,
    /import \{[\s\S]*buildSystemStageHeader[\s\S]*\} from '\.\/system-stage-selectors'/,
  );
  assert.match(systemControlPage, /buildSystemOverviewCards\(/);
  assert.match(systemControlPage, /buildSystemQuickActions\(/);
  assert.match(systemControlPage, /buildSystemEventSummaryItems\(/);
  assert.match(systemControlPage, /buildSystemStageHeader\(/);
  assert.match(systemControlPage, /buildSystemHealthSummary\(/);
  assert.match(systemControlPage, /buildSystemControlActionSummary\(/);
});

test("new system shell components keep dedicated template seams", () => {
  assert.match(overviewPanel, /<section class="system-section">/);
  assert.match(overviewPanel, /v-for="card in healthCards"/);
  assert.match(overviewPanel, /v-for="card in runtimeCards"/);

  assert.match(
    sectionRail,
    /<article class="panel-card system-sidebar-panel">/,
  );
  assert.match(sectionRail, /<StatusPill/);
  assert.match(sectionRail, /v-for="action in quickActions"/);
});
