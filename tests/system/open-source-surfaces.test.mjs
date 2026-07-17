import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public repository surfaces are complete and point at GitHub', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository.url, 'git+https://github.com/90le/tracevane.git');
  assert.equal(pkg.homepage, 'https://90le.github.io/tracevane/');
  assert.equal(pkg.bugs.url, 'https://github.com/90le/tracevane/issues');
  for (const path of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
    assert.ok(read(path).trim().length > 100, `${path} must contain public guidance`);
  }
});
