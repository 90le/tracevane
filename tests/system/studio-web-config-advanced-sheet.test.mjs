import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);
const configAdvancedSheetPath = path.join(rootDir, 'apps/web-vue/src/features/config/ConfigDomainAdvancedSheet.vue');
const configAdvancedSheetExists = fs.existsSync(configAdvancedSheetPath);
const configAdvancedSheet = configAdvancedSheetExists ? fs.readFileSync(configAdvancedSheetPath, 'utf8') : '';
const configWorkspaceCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/config-workspace.css'),
  'utf8',
);

test('config advanced sheet is split behind a dedicated component boundary', () => {
  assert.match(configEditorPage, /ConfigDomainAdvancedSheet/);
  assert.match(configEditorPage, /openAdvancedSheet/);
});

test('config advanced sheet keeps recommended structure explicit', () => {
  assert.equal(configAdvancedSheetExists, true);
  assert.match(configAdvancedSheet, /推荐用于大多数情况/);
  assert.match(configAdvancedSheet, /Recommended for most cases/);
  assert.match(configAdvancedSheet, /DialogRoot/);
  assert.match(configAdvancedSheet, /<slot/);
  assert.match(configAdvancedSheet, /defineProps/);
  assert.match(configAdvancedSheet, /import '\.\/config-workspace\.css';/);
  assert.doesNotMatch(configAdvancedSheet, /<style scoped>/);
});

test('config advanced sheet uses a visible modal layer above the page chrome', () => {
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\s*\{[\s\S]*z-index:\s*3100;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\s*\{[\s\S]*display:\s*grid;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\s*\{[\s\S]*place-items:\s*center;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\s*\{[\s\S]*top:\s*50%;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\s*\{[\s\S]*left:\s*50%;/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\);/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\s*\{[\s\S]*z-index:\s*3101;/);
});

test('config advanced sheet carries the resolved theme so light mode gets its own surfaced dialog treatment', () => {
  assert.match(configEditorPage, /<ConfigDomainAdvancedSheet[\s\S]*:theme="resolvedTheme"/);
  assert.match(configAdvancedSheet, /<DialogOverlay[\s\S]*:class="\['config-domain-advanced-sheet-mask', theme === 'light' \? 'theme-light' : 'theme-dark'\]"/);
  assert.match(configAdvancedSheet, /<section[\s\S]*:class="\['config-domain-advanced-sheet', theme === 'light' \? 'theme-light' : 'theme-dark'\]"/);
  assert.match(configAdvancedSheet, /theme:\s*ResolvedTheme/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\.theme-light\s*\{/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\.theme-light\s*\{/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\.theme-dark\s*\{/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet\.theme-dark\s*\{/);
});
