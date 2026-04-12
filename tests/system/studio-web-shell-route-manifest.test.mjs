import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/shell/route-manifest.ts');
const navPath = path.join(rootDir, 'apps/web-vue/src/features/shell/use-shell-navigation.ts');
const routerPath = path.join(rootDir, 'apps/web-vue/src/router.ts');
const appPath = path.join(rootDir, 'apps/web-vue/src/App.vue');

test('shell route manifest defines grouped current routes and future placeholders', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.match(manifest, /key:\s*'overview'/);
  assert.match(manifest, /key:\s*'operations'/);
  assert.match(manifest, /key:\s*'management'/);
  assert.match(manifest, /key:\s*'system'/);
  assert.match(manifest, /key:\s*'dashboard'/);
  assert.match(manifest, /key:\s*'chat'/);
  assert.match(manifest, /key:\s*'config'/);
  assert.match(manifest, /key:\s*'room'/);
  assert.match(manifest, /future:\s*true/);
});

test('router and app consume shell route metadata instead of local mock navigation', () => {
  assert.equal(fs.existsSync(navPath), true);
  const router = fs.readFileSync(routerPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(router, /from '\.\/features\/shell\/route-manifest'/);
  assert.match(router, /shellRoutes/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-navigation'/);
  assert.doesNotMatch(app, /useUiContent/);
});
