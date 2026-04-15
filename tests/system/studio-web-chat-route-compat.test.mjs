import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routeManifest = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/shell/route-manifest.ts'),
  'utf8',
);

test('chat route manifest keeps /chat/new as a compatibility redirect into the unified chat shell', () => {
  assert.match(routeManifest, /path:\s*"\/chat"/);
  assert.match(routeManifest, /path:\s*"new",\s*redirect:\s*"\/chat"/);
  assert.match(routeManifest, /path:\s*"workbench"/);
  assert.match(routeManifest, /path:\s*"s\/:sessionRef"/);
});
