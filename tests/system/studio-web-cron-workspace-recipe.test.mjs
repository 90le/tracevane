import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const cronView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/CronView.vue"),
  "utf8",
);

const cronControlPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/CronControlPage.vue"),
  "utf8",
);

const cronWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/cron-workspace.css"),
  "utf8",
);

const cronOverviewRecipe = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/cron-overview-recipe.ts"),
  "utf8",
);

const cronApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/api.ts"),
  "utf8",
);

const cronService = fs.readFileSync(
  path.join(rootDir, "apps/api/modules/cron/service.ts"),
  "utf8",
);

test("cron view wires through overview recipe seam", () => {
  assert.match(
    cronView,
    /import\s+\{\s*buildDefaultCronOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/cron\/cron-overview-recipe'/,
  );
  assert.match(
    cronView,
    /import\s+\{\s*getManagementDomainEntry\s*\}\s+from\s+'\.\.\/features\/management\/management-domain-manifest'/,
  );
  assert.match(cronView, /getManagementDomainEntry\('cron'\)/);
  assert.match(cronView, /buildDefaultCronOverviewRecipe\(text\)/);
  assert.match(cronView, /pageEyebrow:\s*entry\.label/);
  assert.match(
    cronView,
    /<CronControlPage\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
});

test("cron control page consumes recipe content for stage copy", () => {
  assert.match(cronControlPage, /overviewRecipe\?:\s*CronOverviewRecipe/);
  assert.match(
    cronControlPage,
    /const\s+overviewRecipe\s*=\s*computed\(\(\)\s*=>\s*props\.overviewRecipe\s*\?\?\s*buildDefaultCronOverviewRecipe\(text\)\)/,
  );
  assert.match(cronControlPage, /overviewRecipe\.value\.pageTitle/);
  assert.match(cronControlPage, /overviewRecipe\.value\.jobListTitle/);
  assert.match(
    cronControlPage,
    /overviewRecipe\.value\.workspaceTabs\.overview/,
  );
  assert.match(cronControlPage, /overviewRecipe\.value\.workspaceTabs\.config/);
  assert.match(cronControlPage, /overviewRecipe\.value\.workspaceTabs\.runs/);
  assert.doesNotMatch(cronControlPage, /DEFAULT_CRON_OVERVIEW_RECIPE/);
});

test("cron control page keeps workspace styling outside the Vue page file", () => {
  assert.match(cronControlPage, /import '\.\/cron-workspace\.css';/);
  assert.doesNotMatch(cronControlPage, /<style scoped>/);
  assert.match(cronWorkspaceCss, /\.cron-workbench\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-sidebar-panel\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-modal-mask\s*\{/);
});

test("cron overview recipe exports typed default recipe builder", () => {
  assert.match(cronOverviewRecipe, /export interface CronOverviewRecipe/);
  assert.match(
    cronOverviewRecipe,
    /export function buildDefaultCronOverviewRecipe\(/,
  );
});

test("cron api and service keep seam builders and overview aliases out of transport layers", () => {
  assert.doesNotMatch(cronApi, /buildDefaultCronOverviewRecipe/);
  assert.doesNotMatch(cronApi, /fetchCronOverview/);
  assert.doesNotMatch(cronService, /buildDefaultCronOverviewRecipe/);
  assert.doesNotMatch(cronService, /getOverview\(/);
});
