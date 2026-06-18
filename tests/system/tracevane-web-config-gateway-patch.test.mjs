import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/tracevane';
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);

test('config editor keeps a gateway baseline snapshot so display defaults do not become save defaults', () => {
  assert.match(configEditorPage, /const gatewayBaselineData = ref<Record<string, unknown> \| null>\(null\);/);
  assert.match(configEditorPage, /function onGatewayUpdate\(data: Record<string, unknown>\) \{/);
  assert.match(configEditorPage, /const shouldSyncBaselineFingerprint = !gatewayBaselineData\.value;/);
  assert.match(configEditorPage, /if \(shouldSyncBaselineFingerprint\) \{\s*gatewayBaselineData\.value = \{\s*\.\.\.next\s*\};/);
  assert.match(configEditorPage, /gateway:\s*currentDomainFingerprints\(\)\.gateway,/);
});

test('config editor serializes gateway drafts through a sparse diff instead of posting the hydrated full form', () => {
  assert.match(configEditorPage, /function buildGatewayPayloadFromFormData\(data: Record<string, unknown>\): ConfigUpdatePayload\['gateway'\]/);
  assert.match(configEditorPage, /function buildSparseGatewayPatchValue\(current: unknown, baseline: unknown\): unknown/);
  assert.match(configEditorPage, /function buildSparseGatewayPatch\(\): ConfigUpdatePayload\['gateway'\] \| null/);
  assert.match(configEditorPage, /const gatewayPayload = buildSparseGatewayPatch\(\);/);
  assert.match(configEditorPage, /\.\.\.\(gatewayPayload \? \{\s*gateway: gatewayPayload,/);
  assert.doesNotMatch(configEditorPage, /\.\.\.\(gatewayFormData\.value \? \{\s*gateway:/);
});

test('config editor resets gateway baseline after reload and save responses so later edits diff against the latest persisted state', () => {
  assert.match(configEditorPage, /gatewayFormData\.value = null;\s*gatewayBaselineData\.value = null;\s*hydrateForm\(summary\);/);
  assert.match(
    configEditorPage,
    /function acceptSavedConfigSummary\(nextSummary: ConfigSummaryPayload\): void \{[\s\S]*gatewayFormData\.value = null;\s*gatewayBaselineData\.value = null;\s*hydrateForm\(nextSummary\);[\s\S]*captureConfigBaseline\(\);[\s\S]*\}/,
  );
  assert.match(configEditorPage, /acceptSavedConfigSummary\(response\.config\);/);
});
