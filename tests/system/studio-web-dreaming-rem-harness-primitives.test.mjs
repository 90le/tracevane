import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const dreamingPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/dreaming/DreamingControlPage.vue'),
  'utf8',
);

test('dreaming page exposes a rem-harness preview action in the operations strip', () => {
  assert.match(dreamingPage, /Preview REM/);
  assert.match(dreamingPage, /@click="refreshRemHarnessPreview"/);
});

test('dreaming page renders a dedicated rem-harness preview surface instead of hiding preview state in raw notices', () => {
  assert.match(dreamingPage, /dreaming-rem-preview/);
  assert.match(dreamingPage, /dreaming-rem-preview__facts/);
  assert.match(dreamingPage, /dreaming-rem-preview__markdown/);
  assert.match(dreamingPage, /Create Daily Aliases/);
  assert.match(dreamingPage, /@click="applyCompatibilityAliases"/);
});
