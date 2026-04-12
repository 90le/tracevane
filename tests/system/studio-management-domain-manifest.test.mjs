import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifestSource = fs.readFileSync(
  path.join(root, 'apps', 'web-vue', 'src', 'features', 'management', 'management-domain-manifest.ts'),
  'utf8',
);

test('management domain manifest covers config agents channels skills cron', () => {
  assert.match(manifestSource, /id:\s*'config'/);
  assert.match(manifestSource, /id:\s*'agents'/);
  assert.match(manifestSource, /id:\s*'channels'/);
  assert.match(manifestSource, /id:\s*'skills'/);
  assert.match(manifestSource, /id:\s*'cron'/);
});

test('package json declares studio management coverage script', () => {
  assert.equal(typeof packageJson.scripts?.['studio:management-coverage'], 'string');
  assert.ok(packageJson.scripts['studio:management-coverage'].includes('scripts/studio-management-coverage.mjs'));
});
