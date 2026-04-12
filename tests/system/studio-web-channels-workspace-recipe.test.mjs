import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '../..');

const channelsView = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/views/ChannelsView.vue'),
  'utf8',
);

const workspaceLayout = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue'),
  'utf8',
);

const overviewRecipe = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/channels/channels-overview-recipe.ts'),
  'utf8',
);

const channelsApi = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/channels/api.ts'),
  'utf8',
);

const channelsService = fs.readFileSync(
  path.join(rootDir, 'apps/api/modules/channels/service.ts'),
  'utf8',
);

test('channels view wires through workspace overview recipe seam', () => {
  assert.match(
    channelsView,
    /import\s+\{\s*buildChannelsOverviewRecipe\s*\}\s+from\s+'\.\.\/features\/channels\/channels-overview-recipe'/,
  );
  assert.match(
    channelsView,
    /const\s+overviewRecipe\s*=\s*buildChannelsOverviewRecipe\(/,
  );
  assert.match(
    channelsView,
    /<ChannelsWorkspaceLayout\s+:overview-recipe="overviewRecipe"\s*\/>/,
  );
});

test('channels workspace layout consumes provider-plus-account workspace summaries from recipe', () => {
  assert.match(
    workspaceLayout,
    /from\s+'\.\/channels-overview-recipe'/,
  );
  assert.match(workspaceLayout, /buildChannelWorkspaceSummary/);
  assert.match(workspaceLayout, /buildChannelAccountWorkspaceSummary/);
  assert.match(workspaceLayout, /const\s+workspaceSummary\s*=\s*computed\(/);
  assert.match(workspaceLayout, /const\s+accountWorkspaceSummary\s*=\s*computed\(/);
  assert.match(workspaceLayout, /workspaceSummary\.value\.headline/);
  assert.match(workspaceLayout, /workspaceSummary\.value\.copy/);
  assert.match(workspaceLayout, /workspaceSummary\.value\.badges/);
  assert.match(workspaceLayout, /accountWorkspaceSummary\.value\?\.copy/);
});

test('channels overview recipe exports provider and account summary builders', () => {
  assert.match(overviewRecipe, /export interface ChannelWorkspaceSummary/);
  assert.match(overviewRecipe, /export interface ChannelAccountWorkspaceSummary/);
  assert.match(overviewRecipe, /export function buildChannelsOverviewRecipe\(/);
  assert.match(overviewRecipe, /export function buildChannelWorkspaceSummary\(/);
  assert.match(overviewRecipe, /export function buildChannelAccountWorkspaceSummary\(/);
});

test('channels api continues to expose summary fetch for recipe hydration', () => {
  assert.match(channelsApi, /export function fetchChannelsSummary\(/);
});

test('channels service exports provider and account workspace seam builders', () => {
  assert.match(channelsService, /export function buildChannelWorkspaceSummary\(/);
  assert.match(channelsService, /export function buildChannelAccountWorkspaceSummary\(/);
});
