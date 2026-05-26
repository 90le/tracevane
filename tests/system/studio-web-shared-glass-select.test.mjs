import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedDir = path.join(rootDir, 'apps/web-vue/src/shared/components');
const glassSelect = fs.readFileSync(path.join(sharedDir, 'GlassSelect.vue'), 'utf8');
const glassSelectCss = fs.readFileSync(path.join(sharedDir, 'glass-select.css'), 'utf8');
const globalStyleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');

test('shared glass select keeps CSS ownership centralized', () => {
  assert.match(glassSelect, /import '\.\/glass-select\.css';/);
  assert.doesNotMatch(glassSelect, /<style scoped>/);
  assert.match(glassSelectCss, /\.glass-select\s*\{/);
  assert.match(glassSelectCss, /\.glass-select-menu-portal\s*\{/);
  assert.match(glassSelectCss, /\.glass-select-trigger:focus-visible\s*\{/);
  assert.doesNotMatch(glassSelectCss, /:deep|:global/);
  assert.doesNotMatch(globalStyleCss, /\.glass-select/);
});

test('shared glass select preserves portal and viewport-safe menu behavior', () => {
  assert.match(glassSelect, /<Teleport v-if="teleport" to="body">/);
  assert.match(glassSelect, /class="glass-select-menu glass-select-menu-portal"/);
  assert.match(glassSelect, /window\.addEventListener\('resize', handleViewportChange\)/);
  assert.match(glassSelect, /window\.addEventListener\('scroll', handleViewportChange, true\)/);
  assert.match(glassSelect, /openDirection\.value = spaceBelow < menuHeight && spaceAbove > spaceBelow \? 'up' : 'down';/);
});
