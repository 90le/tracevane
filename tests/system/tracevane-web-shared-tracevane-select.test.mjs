import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedDir = path.join(rootDir, 'apps/web-vue/src/shared/components');
const tracevaneSelect = fs.readFileSync(path.join(sharedDir, 'TracevaneSelect.vue'), 'utf8');
const tracevaneSelectCss = fs.readFileSync(path.join(sharedDir, 'tracevane-select.css'), 'utf8');
const globalStyleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');

test('shared tracevane select keeps CSS ownership centralized', () => {
  assert.match(tracevaneSelect, /import '\.\/tracevane-select\.css';/);
  assert.doesNotMatch(tracevaneSelect, /<style scoped>/);
  assert.match(tracevaneSelect, /invalid\?: boolean;/);
  assert.match(tracevaneSelect, /invalid: false,/);
  assert.match(tracevaneSelect, /:class="\{ open: isOpen, disabled, invalid, 'open-up': openDirection === 'up' \}"/);
  assert.match(tracevaneSelect, /:aria-invalid="invalid \? 'true' : undefined"/);
  assert.match(tracevaneSelect, /:aria-expanded="isOpen \? 'true' : 'false'"/);
  assert.match(tracevaneSelect, /role="listbox"/);
  assert.match(tracevaneSelect, /role="option"/);
  assert.match(tracevaneSelect, /:aria-selected="option\.value === modelValue \? 'true' : 'false'"/);
  assert.match(tracevaneSelectCss, /\.tracevane-select\s*\{/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-menu-portal\s*\{/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-trigger:focus-visible\s*\{/);
  assert.doesNotMatch(tracevaneSelectCss, /:deep|:global/);
  assert.doesNotMatch(tracevaneSelectCss, /translateY\(-1px\)/);
  assert.doesNotMatch(tracevaneSelectCss, /var\(--(?:mono-accent|accent-primary),\s*var\(--accent-primary,\s*#/);
  assert.doesNotMatch(tracevaneSelectCss, /var\(\s*--[\w-]+\s*,/);
  assert.doesNotMatch(tracevaneSelectCss, /rgba\(|#[0-9a-fA-F]{3,6}/);
  assert.doesNotMatch(tracevaneSelectCss, /var\(--field|var\(--surface\)|var\(--line-strong\)|var\(--shadow-popover\)|var\(--text\)|var\(--muted/);
  assert.doesNotMatch(tracevaneSelectCss, /var\(--surface\)|--shell-(?:panel|stage|highlight)/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-trigger\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--control-bg\);[\s\S]*box-shadow:\s*var\(--control-shadow\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select\.open \.tracevane-select-trigger,[\s\S]*box-shadow:\s*0 0 0 3px var\(--mono-ring\),\s*var\(--control-shadow\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select\.disabled \.tracevane-select-trigger\s*\{[\s\S]*cursor:\s*not-allowed;[\s\S]*opacity:\s*0\.62;[\s\S]*box-shadow:\s*none;/);
  assert.match(tracevaneSelectCss, /\.tracevane-select\.invalid \.tracevane-select-trigger,[\s\S]*\.tracevane-select-trigger\[aria-invalid="true"\]\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--danger\) 58%,\s*var\(--control-border\)\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-trigger:active:not\(:disabled\)\s*\{[\s\S]*transform:\s*translateY\(1px\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-menu\s*\{[\s\S]*background:\s*var\(--control-menu-bg\);[\s\S]*box-shadow:\s*var\(--control-menu-shadow\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-option:hover\s*\{[\s\S]*background:\s*var\(--control-bg-hover\);/);
  assert.match(tracevaneSelectCss, /\.tracevane-select-option\.active\s*\{[\s\S]*var\(--mono-accent\)/);
  assert.doesNotMatch(globalStyleCss, /\.tracevane-select/);
});

test('shared tracevane select preserves portal and viewport-safe menu behavior', () => {
  assert.match(tracevaneSelect, /<Teleport v-if="teleport" to="body">/);
  assert.match(tracevaneSelect, /class="tracevane-select-menu tracevane-select-menu-portal"/);
  assert.match(tracevaneSelect, /window\.addEventListener\('resize', handleViewportChange\)/);
  assert.match(tracevaneSelect, /window\.addEventListener\('scroll', handleViewportChange, true\)/);
  assert.match(tracevaneSelect, /openDirection\.value = spaceBelow < menuHeight && spaceAbove > spaceBelow \? 'up' : 'down';/);
});
