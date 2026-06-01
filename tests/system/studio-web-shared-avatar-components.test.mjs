import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedDir = path.join(rootDir, 'apps/web-vue/src/shared/components');
const avatarContent = fs.readFileSync(path.join(sharedDir, 'AgentAvatarContent.vue'), 'utf8');
const avatarFieldEditor = fs.readFileSync(path.join(sharedDir, 'AvatarFieldEditor.vue'), 'utf8');
const avatarComponentsCss = fs.readFileSync(path.join(sharedDir, 'avatar-components.css'), 'utf8');

test('shared avatar components keep CSS ownership centralized', () => {
  for (const source of [avatarContent, avatarFieldEditor]) {
    assert.match(source, /import '\.\/avatar-components\.css';/);
    assert.doesNotMatch(source, /<style scoped>/);
  }

  assert.match(avatarComponentsCss, /\.agent-avatar-content\s*\{/);
  assert.match(avatarComponentsCss, /\.avatar-field-editor__panel\s*\{/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-mask\s*\{/);
  assert.doesNotMatch(avatarComponentsCss, /:deep|:global/);
});

test('shared avatar editor uses DuoYuan solid surfaces instead of legacy gradient glass', () => {
  assert.doesNotMatch(avatarComponentsCss, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(avatarComponentsCss, /backdrop-filter:\s*blur\(/);
  assert.doesNotMatch(avatarComponentsCss, /rgba\(120,\s*185,\s*255|rgba\(111,\s*211,\s*255|rgba\(99,\s*102,\s*241/);
  assert.doesNotMatch(
    avatarComponentsCss,
    /rgba\(|#[0-9a-fA-F]{3,6}/,
    'shared avatar chrome should resolve colors through DuoYuan/OpenClaw tokens',
  );
  assert.doesNotMatch(avatarComponentsCss, /var\(--(?:surface(?:-[a-z-]+)?|line(?:-[a-z-]+)?|muted|danger|shadow)\b/);
  assert.match(avatarComponentsCss, /\.avatar-field-editor__preview\s*\{[\s\S]*background:\s*var\(--control-bg\);[\s\S]*border:\s*1px solid var\(--control-border\);/);
  assert.match(avatarComponentsCss, /\.avatar-field-editor__clear\s*\{[\s\S]*border:\s*1px solid var\(--status-pill-danger-border\);[\s\S]*background:\s*var\(--status-pill-danger-bg\);[\s\S]*color:\s*var\(--status-pill-danger-text\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-mask\s*\{[\s\S]*background:\s*var\(--modal-backdrop\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-dialog\s*\{[\s\S]*border:\s*1px solid var\(--modal-border\);[\s\S]*background:\s*var\(--modal-panel-bg\);[\s\S]*box-shadow:\s*var\(--modal-shadow\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-stage-wrap\s*\{[\s\S]*background:\s*var\(--modal-row-bg\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-stage\s*\{[\s\S]*background:\s*var\(--control-bg\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-box\s*\{[\s\S]*border:\s*2px solid var\(--control-border-focus\);/);
  assert.match(avatarComponentsCss, /\.avatar-cropper-box\s*\{[\s\S]*box-shadow:\s*0 0 0 999px var\(--modal-backdrop\);/);
});

test('avatar field editor still exposes the cropper interaction surface', () => {
  assert.match(avatarFieldEditor, /class="avatar-cropper-mask"/);
  assert.match(avatarFieldEditor, /class="avatar-cropper-box"/);
  assert.match(avatarFieldEditor, /@pointerdown="startCropDrag"/);
  assert.match(avatarFieldEditor, /@click="applyCrop"/);
  assert.match(avatarFieldEditor, /CROP_OUTPUT_SIZE = 192/);
});
