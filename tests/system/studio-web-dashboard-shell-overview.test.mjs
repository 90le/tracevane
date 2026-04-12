import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/dashboard/overview-recipe.ts');
const dashboardPath = path.join(rootDir, 'apps/web-vue/src/views/DashboardView.vue');

test('dashboard overview recipe derives quick actions from the shell foundation', () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  assert.match(recipe, /from '\.\.\/shell\/route-manifest'/);
  assert.match(recipe, /buildDashboardQuickActions/);
  assert.match(recipe, /buildDashboardOverviewSignals/);
});

test('dashboard view consumes the overview recipe instead of hardcoding all quick-action semantics locally', () => {
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  assert.match(dashboard, /from '\.\.\/features\/dashboard\/overview-recipe'/);
  assert.match(dashboard, /buildDashboardQuickActions/);
  assert.match(dashboard, /buildDashboardOverviewSignals/);
});
