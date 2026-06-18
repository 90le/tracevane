import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/tracevane';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

const routeManifestSource = read('apps/web-vue/src/features/shell/route-manifest.ts');
const channelsView = read('apps/web-vue/src/views/ChannelsView.vue');
const channelsWorkspaceLayout = read('apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue');

test('channels router exposes dedicated deep-edit routes instead of one shared workspace stack', () => {
  assert.match(routeManifestSource, /path:\s*["']\/channels["']/);
  assert.match(routeManifestSource, /children:\s*\[/);
  assert.match(routeManifestSource, /path:\s*["']:type\/settings["']/);
  assert.match(routeManifestSource, /path:\s*["']:type\/accounts\/:accountId["']/);
  assert.match(routeManifestSource, /path:\s*["']:type\/accounts\/:accountId\/access["']/);
  assert.match(routeManifestSource, /path:\s*["']:type\/accounts\/:accountId\/pairing["']/);
  assert.match(routeManifestSource, /path:\s*["']:type\/bindings["']/);
});

test('channels view mounts the workspace layout instead of the old direct control page', () => {
  assert.match(channelsView, /ChannelsWorkspaceLayout/);
  assert.doesNotMatch(channelsView, /ChannelsControlPage/);
  assert.match(channelsWorkspaceLayout, /import\s+\{[^}]*RouterView[^}]*\}\s+from\s+'vue-router';/);
  assert.match(channelsWorkspaceLayout, /<RouterView\s*\/>/);
});
