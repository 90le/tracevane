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

test('avatar field editor still exposes the cropper interaction surface', () => {
  assert.match(avatarFieldEditor, /class="avatar-cropper-mask"/);
  assert.match(avatarFieldEditor, /class="avatar-cropper-box"/);
  assert.match(avatarFieldEditor, /@pointerdown="startCropDrag"/);
  assert.match(avatarFieldEditor, /@click="applyCrop"/);
  assert.match(avatarFieldEditor, /CROP_OUTPUT_SIZE = 192/);
});
