import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const webPackageJson = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'web-vue', 'package.json'), 'utf-8'));
const apiPackageJson = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'api', 'package.json'), 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'openclaw.plugin.json'), 'utf-8'));
const docs = fs.readFileSync(path.join(root, 'docs', '聊天官方对齐.md'), 'utf-8');

test('package.json keeps official host install metadata authoritative', () => {
  assert.equal(packageJson.openclaw?.id, 'tracevane');
  assert.deepEqual(packageJson.openclaw?.extensions, ['./index.ts']);
  assert.deepEqual(packageJson.openclaw?.runtimeExtensions, ['./dist/index.js']);
  assert.equal(packageJson.openclaw?.install?.minHostVersion, '>=2026.4.8');
});

test('openclaw.plugin.json keeps 5.x activation and runtime contracts explicit', () => {
  assert.equal(manifest.id, packageJson.openclaw?.id);
  assert.equal(manifest.activation?.onStartup, true);
  assert.deepEqual(manifest.contracts?.tools, ['tracevane_delivery']);
});

test('openclaw.plugin.json no longer carries host install/runtime entrypoint semantics', () => {
  assert.equal('requirements' in manifest, false);
  assert.equal('provides' in manifest, false);
  assert.equal('kind' in manifest, false);
});

test('official parity doc records package vs manifest responsibilities', () => {
  assert.match(docs, /package\.json/i);
  assert.match(docs, /openclaw\.plugin\.json/i);
  assert.match(docs, /minHostVersion/i);
  assert.match(docs, /host compatibility/i);
  assert.match(docs, /activation/i);
  assert.match(docs, /contracts/i);
});

test('workspace package versions stay aligned with the root release version', () => {
  assert.equal(webPackageJson.version, packageJson.version);
  assert.equal(apiPackageJson.version, packageJson.version);
});
