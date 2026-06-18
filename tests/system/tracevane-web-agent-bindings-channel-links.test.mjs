import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/tracevane';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const agentBindingsPage = read('apps/web-vue/src/features/agents/AgentBindingsPage.vue');

test('agent bindings page links back to the related channels workspace', () => {
  assert.match(agentBindingsPage, /openChannelWorkspace/);
  assert.match(agentBindingsPage, /openChannelBindings/);
  assert.match(agentBindingsPage, /\/channels\/\$\{encodeURIComponent\(binding\.channel\)\}/);
});
