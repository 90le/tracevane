import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const inspectorPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/InspectorPanel.vue'),
  'utf8',
);

test('chat inspector panel uses reka tabs primitives for the inspect workbench switcher', () => {
  assert.match(inspectorPanel, /from 'reka-ui'/);
  assert.match(inspectorPanel, /TabsRoot/);
  assert.match(inspectorPanel, /TabsList/);
  assert.match(inspectorPanel, /TabsTrigger/);
  assert.match(inspectorPanel, /TabsContent/);
  assert.match(inspectorPanel, /<TabsRoot :model-value="tab"/);
  assert.match(inspectorPanel, /<TabsList class="chat-inspector-panel__tabs"/);
  assert.match(inspectorPanel, /<TabsTrigger/);
  assert.match(inspectorPanel, /:value="item\.value"/);
  assert.match(inspectorPanel, /<TabsContent value="overview"/);
  assert.match(inspectorPanel, /<TabsContent value="tools"/);
  assert.match(inspectorPanel, /<TabsContent value="activity"/);
  assert.match(inspectorPanel, /<TabsContent value="diagnostics"/);
  assert.doesNotMatch(inspectorPanel, /:class="\{ active: tab === item\.value \}"/);
});
