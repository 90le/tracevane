import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const componentDir = path.join(rootDir, 'apps/web-vue/src/components');
const statusPill = fs.readFileSync(path.join(componentDir, 'StatusPill.vue'), 'utf8');
const statusPillCss = fs.readFileSync(path.join(componentDir, 'status-pill.css'), 'utf8');
const globalStyleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');
const skillsControlPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/skills/SkillsControlPage.vue'),
  'utf8',
);
const terminalConsolePage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/terminal/TerminalConsolePage.vue'),
  'utf8',
);

test('shared status pill keeps CSS ownership centralized', () => {
  assert.match(statusPill, /import '\.\/status-pill\.css';/);
  assert.doesNotMatch(statusPill, /<style scoped>/);
  assert.match(statusPillCss, /\.status-pill\s*\{/);
  assert.match(statusPillCss, /\.status-pill-dot\s*\{/);
  assert.match(statusPillCss, /\.status-pill\.tone-sage\s*\{/);
  assert.doesNotMatch(statusPillCss, /:deep|:global/);
  assert.doesNotMatch(globalStyleCss, /\.status-pill(?!-[a-zA-Z])/);
});

test('shared status pill replaces hand-written app status markup', () => {
  assert.match(skillsControlPage, /import StatusPill from '..\/..\/components\/StatusPill\.vue';/);
  assert.match(terminalConsolePage, /import StatusPill from '..\/..\/components\/StatusPill\.vue';/);
  assert.doesNotMatch(skillsControlPage, /class="status-pill"/);
  assert.doesNotMatch(terminalConsolePage, /class="status-pill"/);
  assert.match(skillsControlPage, /:tone="skillTone\(skill\.status\)"/);
  assert.match(terminalConsolePage, /:tone="connected \? 'sage' : 'neutral'"/);
});
