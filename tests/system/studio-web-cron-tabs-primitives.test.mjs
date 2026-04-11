import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const cronControlPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/cron/CronControlPage.vue'),
  'utf8',
);

test('cron control page uses reka tabs primitives for the stage workspace switcher', () => {
  assert.match(cronControlPage, /from 'reka-ui'/);
  assert.match(cronControlPage, /TabsRoot/);
  assert.match(cronControlPage, /TabsList/);
  assert.match(cronControlPage, /TabsTrigger/);
  assert.match(cronControlPage, /TabsContent/);
  assert.match(cronControlPage, /<TabsRoot v-else-if="detail" v-model="activeTab"/);
  assert.match(cronControlPage, /<TabsList class="cron-stage-tabs"/);
  assert.match(cronControlPage, /<TabsTrigger/);
  assert.match(cronControlPage, /:value="tab\.id"/);
  assert.match(cronControlPage, /id: 'overview'/);
  assert.match(cronControlPage, /id: 'config'/);
  assert.match(cronControlPage, /id: 'runs'/);
  assert.match(cronControlPage, /<TabsContent value="overview"/);
  assert.match(cronControlPage, /<TabsContent value="config"/);
  assert.match(cronControlPage, /<TabsContent value="runs"/);
  assert.doesNotMatch(cronControlPage, /:class="\{ active: activeTab === tab\.id \}"/);
});
