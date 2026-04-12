import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('studio management coverage script emits domains webViews apiModules tests', () => {
  const stdout = execFileSync(
    process.execPath,
    [path.join(root, 'scripts', 'studio-management-coverage.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  const parsed = JSON.parse(stdout);
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed && !Array.isArray(parsed));
  assert.ok('domains' in parsed);
  assert.ok('webViews' in parsed);
  assert.ok('apiModules' in parsed);
  assert.ok('tests' in parsed);
});
