import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-domain-inventory.json');

test('studio inventory script writes a machine-readable baseline for routes, api modules, and test surfaces', () => {
  const result = spawnSync('node', ['scripts/studio-domain-inventory.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outputPath), true);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.ok(Array.isArray(payload.webRoutes));
  assert.ok(Array.isArray(payload.apiModules));
  assert.ok(Array.isArray(payload.webFeatures));
  assert.ok(Array.isArray(payload.testSuites));
  assert.ok(payload.webRoutes.includes('/dashboard'));
  assert.ok(payload.apiModules.includes('config'));
  assert.ok(payload.webFeatures.includes('chat-v2'));
  assert.ok(payload.testSuites.includes('tests/system/config-service.test.mjs'));
});
