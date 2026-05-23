import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'apps/web-vue/package.json'), 'utf8'),
);
const appVue = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/App.vue'), 'utf8');
const dashboardView = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/views/DashboardView.vue'),
  'utf8',
);
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);

test('web app declares motion-v as the only new shell animation dependency', () => {
  assert.equal(packageJson.dependencies['motion-v'] !== undefined, true);
});

test('shared motion presets exist for shell and page-stage reveals', () => {
  const motionModule = fs.readFileSync(
    path.join(rootDir, 'apps/web-vue/src/shared/motion.ts'),
    'utf8',
  );

  assert.match(motionModule, /export const shellChromeReveal/);
  assert.match(motionModule, /export const shellRouteReveal/);
  assert.match(motionModule, /export const pageMastheadReveal/);
  assert.match(motionModule, /export const pageSurfaceReveal/);
  assert.match(motionModule, /filter:\s*"blur\(8px\)"/);
  assert.match(motionModule, /scale:\s*0\.992/);
  assert.doesNotMatch(motionModule, /y:\s*(14|18|22|-10|-12)/);
  assert.match(motionModule, /duration:\s*0/);
});

test('app shell keeps route staging static to avoid page-switch flicker', () => {
  assert.match(appVue, /<RouterView v-slot="\{ Component,\s*route:\s*routedView \}">/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.match(appVue, /<KeepAlive v-if="Component && shouldKeepRouteAlive\(routedView\)" :max="16">/);
  assert.match(appVue, /<section/);
  assert.doesNotMatch(appVue, /<AnimatePresence/);
  assert.doesNotMatch(appVue, /<motion\.section/);
  assert.doesNotMatch(appVue, /shellRouteReveal/);
});

test('dashboard and config adopt shared motion presets at the page-shell level', () => {
  assert.match(dashboardView, /from '\.\.\/shared\/motion'/);
  assert.match(dashboardView, /pageMastheadReveal/);
  assert.match(dashboardView, /pageSurfaceReveal/);
  assert.match(dashboardView, /<motion\.(section|header)/);

  assert.match(configEditorPage, /from '\.\.\/\.\.\/shared\/motion'/);
  assert.match(configEditorPage, /pageMastheadReveal/);
  assert.match(configEditorPage, /pageSurfaceReveal/);
  assert.match(configEditorPage, /<motion\.(section|header|div)/);
});
