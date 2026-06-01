import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedDir = path.join(rootDir, 'apps/web-vue/src/shared/components');
const studioSelect = fs.readFileSync(path.join(sharedDir, 'StudioSelect.vue'), 'utf8');
const studioSelectCss = fs.readFileSync(path.join(sharedDir, 'studio-select.css'), 'utf8');
const globalStyleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');

test('shared studio select keeps CSS ownership centralized', () => {
  assert.match(studioSelect, /import '\.\/studio-select\.css';/);
  assert.doesNotMatch(studioSelect, /<style scoped>/);
  assert.match(studioSelect, /invalid\?: boolean;/);
  assert.match(studioSelect, /invalid: false,/);
  assert.match(studioSelect, /:class="\{ open: isOpen, disabled, invalid, 'open-up': openDirection === 'up' \}"/);
  assert.match(studioSelect, /:aria-invalid="invalid \? 'true' : undefined"/);
  assert.match(studioSelect, /:aria-expanded="isOpen \? 'true' : 'false'"/);
  assert.match(studioSelect, /role="listbox"/);
  assert.match(studioSelect, /role="option"/);
  assert.match(studioSelect, /:aria-selected="option\.value === modelValue \? 'true' : 'false'"/);
  assert.match(studioSelectCss, /\.studio-select\s*\{/);
  assert.match(studioSelectCss, /\.studio-select-menu-portal\s*\{/);
  assert.match(studioSelectCss, /\.studio-select-trigger:focus-visible\s*\{/);
  assert.doesNotMatch(studioSelectCss, /:deep|:global/);
  assert.doesNotMatch(studioSelectCss, /translateY\(-1px\)/);
  assert.doesNotMatch(studioSelectCss, /var\(--(?:mono-accent|accent-primary),\s*var\(--accent-primary,\s*#/);
  assert.doesNotMatch(studioSelectCss, /var\(\s*--[\w-]+\s*,/);
  assert.doesNotMatch(studioSelectCss, /rgba\(|#[0-9a-fA-F]{3,6}/);
  assert.doesNotMatch(studioSelectCss, /var\(--field|var\(--surface\)|var\(--line-strong\)|var\(--shadow-popover\)|var\(--text\)|var\(--muted/);
  assert.doesNotMatch(studioSelectCss, /var\(--surface\)|--shell-(?:panel|stage|highlight)/);
  assert.match(studioSelectCss, /\.studio-select-trigger\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--control-bg\);[\s\S]*box-shadow:\s*var\(--control-shadow\);/);
  assert.match(studioSelectCss, /\.studio-select\.open \.studio-select-trigger,[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\),\s*var\(--control-shadow\);/);
  assert.match(studioSelectCss, /\.studio-select\.disabled \.studio-select-trigger\s*\{[\s\S]*cursor:\s*not-allowed;[\s\S]*opacity:\s*0\.62;[\s\S]*box-shadow:\s*none;/);
  assert.match(studioSelectCss, /\.studio-select\.invalid \.studio-select-trigger,[\s\S]*\.studio-select-trigger\[aria-invalid="true"\]\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--danger\) 58%,\s*var\(--control-border\)\);/);
  assert.match(studioSelectCss, /\.studio-select-trigger:active:not\(:disabled\)\s*\{[\s\S]*transform:\s*translateY\(1px\);/);
  assert.match(studioSelectCss, /\.studio-select-menu\s*\{[\s\S]*background:\s*var\(--control-menu-bg\);[\s\S]*box-shadow:\s*var\(--control-menu-shadow\);/);
  assert.match(studioSelectCss, /\.studio-select-option:hover\s*\{[\s\S]*background:\s*var\(--control-bg-hover\);/);
  assert.match(studioSelectCss, /\.studio-select-option\.active\s*\{[\s\S]*var\(--mono-accent\)/);
  assert.doesNotMatch(globalStyleCss, /\.studio-select/);
});

test('shared studio select preserves portal and viewport-safe menu behavior', () => {
  assert.match(studioSelect, /<Teleport v-if="teleport" to="body">/);
  assert.match(studioSelect, /class="studio-select-menu studio-select-menu-portal"/);
  assert.match(studioSelect, /window\.addEventListener\('resize', handleViewportChange\)/);
  assert.match(studioSelect, /window\.addEventListener\('scroll', handleViewportChange, true\)/);
  assert.match(studioSelect, /openDirection\.value = spaceBelow < menuHeight && spaceAbove > spaceBelow \? 'up' : 'down';/);
});
