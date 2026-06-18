import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cronControlPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/CronControlPage.vue"),
  "utf8",
);
const cronWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/cron/cron-workspace.css"),
  "utf8",
);

test("cron control page uses reka tabs primitives for the stage workspace switcher", () => {
  assert.match(cronControlPage, /from 'reka-ui'/);
  assert.match(cronControlPage, /TabsRoot/);
  assert.match(cronControlPage, /TabsList/);
  assert.match(cronControlPage, /TabsTrigger/);
  assert.match(cronControlPage, /TabsContent/);
  assert.match(cronControlPage, /const activeTab = ref<CronTab>\('overview'\)/);
  assert.match(
    cronControlPage,
    /<TabsRoot v-else-if="detail" v-model="activeTab" class="cron-stage-workspace">/,
  );
  assert.match(
    cronControlPage,
    /<TabsList class="cron-stage-tabs mobile-stage-tabs" aria-label="Cron workspace tabs">/,
  );
  assert.match(cronControlPage, /<TabsTrigger/);
  assert.match(cronControlPage, /:value="tab\.id"/);
  assert.match(cronControlPage, /const workspaceTabs = computed\(\(\) => \[/);
  assert.match(cronControlPage, /id: 'overview' as const/);
  assert.match(cronControlPage, /id: 'config' as const/);
  assert.match(cronControlPage, /id: 'runs' as const/);
  assert.match(cronControlPage, /<TabsContent value="overview" as-child>/);
  assert.match(cronControlPage, /<TabsContent value="config" as-child>/);
  assert.match(cronControlPage, /<TabsContent value="runs" as-child>/);
  assert.doesNotMatch(
    cronControlPage,
    /:class="\{ active: activeTab === tab\.id \}"/,
  );
});

test("cron control page keeps stage tab CSS in feature stylesheet", () => {
  assert.match(cronControlPage, /import '\.\/cron-workspace\.css';/);
  assert.doesNotMatch(cronControlPage, /<style scoped>/);
  assert.match(cronWorkspaceCss, /\.cron-stage-tabs\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-stage-tab\[data-state='active'\]\s*\{/);
  assert.doesNotMatch(cronWorkspaceCss, /:deep|:global/);
});

test("cron run outputs use a floating sheet instead of inline pre blocks", () => {
  assert.match(cronControlPage, /<Teleport v-if="cronOutputSheetOpen" to="body">/);
  assert.match(cronControlPage, /class="cron-output-sheet-dock"/);
  assert.match(cronControlPage, /class="cron-output-sheet"/);
  assert.match(cronControlPage, /function openCronOutputSheet\(source: CronOutputSource\): void/);
  assert.match(cronControlPage, /copyTextToClipboard\(activeCronOutputText\.value\)/);
  assert.match(cronControlPage, /openCronOutputSheet\('manual'\)/);
  assert.doesNotMatch(cronControlPage, /class="cron-manual-output"/);
  assert.doesNotMatch(cronControlPage, /<pre>\{\{ selectedRun\.error \|\| selectedRun\.summary/);
  assert.match(cronWorkspaceCss, /\.cron-output-sheet-dock\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-output-sheet-log\s*\{/);
  assert.doesNotMatch(cronWorkspaceCss, /\.cron-manual-output\s*\{/);
  assert.doesNotMatch(cronWorkspaceCss, /\.cron-run-output pre/);
});
