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

test('shared status pill keeps DuoYuan solid status surfaces', () => {
  assert.doesNotMatch(statusPillCss, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(statusPillCss, /rgba\(111,\s*211,\s*255|rgba\(99,\s*102,\s*241|rgba\(37,\s*99,\s*235/);
  assert.doesNotMatch(statusPillCss, /var\(--(?:surface(?:-[a-z-]+)?|line(?:-[a-z-]+)?|acc|peach|success|danger|shell-[^)]+)\)/);
  assert.doesNotMatch(globalStyleCss, /--status-pill-(?:accent|sage|danger)-text:\s*#[0-9a-fA-F]{3,8}/);
  assert.match(statusPillCss, /\.status-pill\s*\{[\s\S]*background:\s*var\(--status-pill-neutral-bg\);/);
  assert.match(statusPillCss, /\.status-pill\s*\{[\s\S]*box-shadow:\s*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.match(statusPillCss, /\.status-pill\.tone-accent\s*\{[\s\S]*border-color:\s*var\(--status-pill-accent-border\);[\s\S]*background:\s*var\(--status-pill-accent-bg\);/);
  assert.match(statusPillCss, /\.status-pill\.tone-sage\s*\{[\s\S]*border-color:\s*var\(--status-pill-sage-border\);[\s\S]*background:\s*var\(--status-pill-sage-bg\);/);
  assert.match(statusPillCss, /\.status-pill\.tone-neutral\s*\{[\s\S]*background:\s*var\(--status-pill-neutral-bg\);/);
  assert.match(statusPillCss, /\.status-pill\.tone-danger\s*\{[\s\S]*border-color:\s*var\(--status-pill-danger-border\);[\s\S]*background:\s*var\(--status-pill-danger-bg\);/);
  [
    '--status-pill-neutral-bg',
    '--status-pill-neutral-border',
    '--status-pill-accent-bg',
    '--status-pill-accent-border',
    '--status-pill-sage-bg',
    '--status-pill-sage-border',
    '--status-pill-danger-bg',
    '--status-pill-danger-border',
  ].forEach((token) => {
    assert.match(globalStyleCss, new RegExp(`${token}:`));
  });
});

test('shared status pill replaces hand-written app status markup', () => {
  assert.match(skillsControlPage, /import StatusPill from '..\/..\/components\/StatusPill\.vue';/);
  assert.doesNotMatch(terminalConsolePage, /import StatusPill/);
  assert.doesNotMatch(terminalConsolePage, /<StatusPill/);
  assert.doesNotMatch(skillsControlPage, /class="status-pill"/);
  assert.doesNotMatch(terminalConsolePage, /class="status-pill"/);
  assert.match(skillsControlPage, /:tone="skillTone\(skill\.status\)"/);
  assert.doesNotMatch(terminalConsolePage, /:tone="connected \? 'sage' : 'neutral'"/);
});
