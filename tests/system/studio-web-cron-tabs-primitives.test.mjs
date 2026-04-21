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
