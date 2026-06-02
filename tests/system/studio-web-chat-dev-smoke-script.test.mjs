import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const devWebSmokeScript = fs.readFileSync(path.join(rootDir, 'scripts/dev-web-smoke.sh'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

function assertInOrder(source, parts) {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.notEqual(index, -1, `Missing sequence part: ${part}`);
    cursor = index + part.length;
  }
}

test('chat browser smoke pre-optimizes Vite dependencies before opening the dev server port', () => {
  assert.match(devWebSmokeScript, /WEB_DIR="\$ROOT_DIR\/apps\/web-vue"/);
  assert.match(devWebSmokeScript, /VITE_BIN="\$ROOT_DIR\/node_modules\/\.bin\/vite"/);
  assert.match(devWebSmokeScript, /cd "\$WEB_DIR"/);
  assert.match(devWebSmokeScript, /\[ "\$\{OPENCLAW_STUDIO_SMOKE_FORCE_OPTIMIZE:-0\}" = "1" \]/);
  assert.match(devWebSmokeScript, /"\$VITE_BIN" optimize --force/);
  assert.match(devWebSmokeScript, /"\$VITE_BIN" optimize/);
  assert.match(devWebSmokeScript, /\[ "\$\{OPENCLAW_STUDIO_SMOKE_SKIP_OPTIMIZE:-0\}" != "1" \]/);
  assert.match(devWebSmokeScript, /exec "\$VITE_BIN"/);
  assert.doesNotMatch(devWebSmokeScript, /exec "\$VITE_BIN" --force/);
  assertInOrder(devWebSmokeScript, [
    'cd "$WEB_DIR"',
    '"$VITE_BIN" optimize --force',
    'exec "$VITE_BIN"',
  ]);
  assert.match(packageJson.scripts['dev:web:smoke'], /scripts\/dev-web-smoke\.sh/);
  assert.match(packageJson.scripts['smoke:chat:browser'], /scripts\/dev-web-smoke\.sh/);
});
