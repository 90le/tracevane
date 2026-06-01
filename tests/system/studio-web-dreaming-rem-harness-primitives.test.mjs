import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const dreamingPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/dreaming/DreamingControlPage.vue'),
  'utf8',
);
const dreamingWorkspaceCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/dreaming/dreaming-workspace.css'),
  'utf8',
);

test('dreaming page exposes rem preview and grounded actions in the data-review board', () => {
  assert.match(dreamingPage, /dreaming-review-board/);
  assert.match(dreamingPage, /dreaming-grounded-actions/);
  assert.match(dreamingPage, /Preview REM/);
  assert.match(dreamingPage, /@click="refreshRemHarnessPreview"/);
  assert.equal((dreamingPage.match(/@click="toggleDreamingState/g) || []).length, 1);
  assert.equal((dreamingPage.match(/@click="refreshAll"/g) || []).length, 1);
  assert.equal((dreamingPage.match(/@click="repairConfig"/g) || []).length, 1);
  assert.equal((dreamingPage.match(/@click="runGroundedAction\('backfill'\)"/g) || []).length, 1);
});

test('dreaming page renders a dedicated rem-harness preview surface instead of hiding preview state in raw notices', () => {
  assert.match(dreamingPage, /dreaming-rem-preview/);
  assert.match(dreamingPage, /dreaming-rem-preview__facts/);
  assert.match(dreamingPage, /dreaming-rem-preview__markdown/);
  assert.match(dreamingPage, /Create Daily Aliases/);
  assert.match(dreamingPage, /@click="applyCompatibilityAliases"/);
});

test('dreaming page keeps workspace styling in feature CSS', () => {
  assert.match(dreamingPage, /import '\.\/dreaming-workspace\.css';/);
  assert.doesNotMatch(dreamingPage, /<style scoped>/);
  assert.doesNotMatch(dreamingPage, /:style="\{ '--phase-index'/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-stage\s*\{/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-review-board\s*\{/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-grounded-actions__grid\s*\{/);
  assert.match(dreamingWorkspaceCss, /html\[data-theme='light'\] \.dreaming-page\s*\{/);
  assert.match(dreamingWorkspaceCss, /\.dreaming-stage__copy \.page-copy\s*\{/);
  assert.match(dreamingWorkspaceCss, /DuoYuan P2 data-review contract/);
  assert.match(
    dreamingWorkspaceCss,
    /\.dreaming-stage\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
  assert.match(
    dreamingWorkspaceCss,
    /\.dreaming-stage__dock\s*\{[\s\S]*background:\s*var\(--surface-raised\);/,
  );
  assert.doesNotMatch(
    `${dreamingPage}\n${dreamingWorkspaceCss}`,
    /dreaming-stage__sky|dreaming-stage__star|dreaming-stage__moon|dreaming-stage__haze|dreaming-stage__tide|phaseCards|metricCards|dreaming-ops-strip|dreaming-stage__action-well|dreaming-stage__action-grid/,
  );
  assert.doesNotMatch(
    dreamingWorkspaceCss,
    /linear-gradient|radial-gradient|backdrop-filter:\s*blur|rgba\(168,\s*200,\s*255|#4f80eb/,
  );
  assert.doesNotMatch(
    dreamingWorkspaceCss,
    /rgba\(|#[0-9a-fA-F]{3,6}|--sky|--atlas|--glass/,
  );
  assert.match(
    dreamingWorkspaceCss,
    /\.dreaming-toggle-button:focus-visible:not\(:disabled\)\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*var\(--dream-accent\)/,
  );
  assert.match(
    dreamingWorkspaceCss,
    /@keyframes dreaming-pulse\s*\{[\s\S]*var\(--dream-success\)/,
  );
  assert.doesNotMatch(dreamingWorkspaceCss, /:deep|:global/);
});
