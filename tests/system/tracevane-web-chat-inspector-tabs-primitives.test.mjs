import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inspectorPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/InspectorPanel.vue'),
  'utf8',
);
const inspectorPanelCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/inspector-panel.css'),
  'utf8',
);

test('chat inspector panel uses reka tabs primitives for the inspect workbench switcher', () => {
  assert.match(inspectorPanel, /import '\.\/inspector-panel\.css';/);
  assert.doesNotMatch(inspectorPanel, /<style scoped>/);
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
  assert.match(inspectorPanelCss, /\.chat-inspector-panel__tabs\s*\{/);
  assert.match(inspectorPanelCss, /\.chat-inspector-panel__tab\s*\{/);
  assert.match(inspectorPanelCss, /@keyframes chat-inspector-panel-in/);
  assert.doesNotMatch(inspectorPanelCss, /:global|:deep/);
});

test('chat inspector overview uses compact fact rows instead of summary card walls', () => {
  assert.match(inspectorPanel, /class="chat-inspector-fact-list"/);
  assert.match(inspectorPanel, /class="chat-inspector-fact-row"/);
  assert.match(inspectorPanel, /class="chat-inspector-context-strip"/);
  assert.match(inspectorPanel, /class="chat-inspector-token-tape"/);
  assert.match(inspectorPanelCss, /\.chat-inspector-fact-list\s*\{/);
  assert.match(inspectorPanelCss, /\.chat-inspector-fact-row\s*\{/);
  assert.match(inspectorPanelCss, /\.chat-inspector-context-strip\s*\{/);
  assert.match(inspectorPanelCss, /\.chat-inspector-token-tape\s*\{/);
  assert.doesNotMatch(inspectorPanel, /chat-inspector-summary-card/);
  assert.doesNotMatch(inspectorPanel, /chat-inspector-diagnostics__item/);
  assert.doesNotMatch(inspectorPanelCss, /chat-inspector-summary-card/);
  assert.doesNotMatch(inspectorPanelCss, /chat-inspector-diagnostics__item/);
});
