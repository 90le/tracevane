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

test('chat route manifest keeps legacy chat entrypoints redirecting into the unified chat shell', () => {
  assert.match(routeManifest, /path:\s*"\/chat"/);
  assert.match(routeManifest, /path:\s*"new",\s*redirect:\s*"\/chat"/);
  assert.match(routeManifest, /import \{ encodeChatSessionRef, isChatSessionRef \} from "\.\.\/chat\/session-ref";/);
  assert.match(routeManifest, /const sessionRef = String\(to\.params\.sessionRef \|\| ""\);/);
  assert.match(routeManifest, /isChatSessionRef\(sessionRef\)/);
  assert.match(routeManifest, /\? sessionRef/);
  assert.match(routeManifest, /: encodeChatSessionRef\(sessionRef\)/);
  assert.match(routeManifest, /redirect: \(to\) => \{/);
  assert.match(routeManifest, /path:\s*"workbench"/);
  assert.match(routeManifest, /path:\s*"s\/:sessionRef"/);
});

test('chat route manifest places literal child routes before the legacy :sessionRef compatibility matcher', () => {
  const chatBlock = routeManifest.match(/path:\s*"\/chat"[\s\S]*?children:\s*\[([\s\S]*?)\]\s*,/);
  assert.ok(chatBlock);
  const childrenSource = chatBlock[1] || '';
  const newIndex = childrenSource.indexOf('path: "new"');
  const workbenchIndex = childrenSource.indexOf('path: "workbench"');
  const sessionIndex = childrenSource.indexOf('path: "s/:sessionRef"');
  const legacyIndex = childrenSource.indexOf('path: ":sessionRef"');
  assert.notEqual(newIndex, -1);
  assert.notEqual(workbenchIndex, -1);
  assert.notEqual(sessionIndex, -1);
  assert.notEqual(legacyIndex, -1);
  assert.ok(newIndex < legacyIndex);
  assert.ok(workbenchIndex < legacyIndex);
  assert.ok(sessionIndex < legacyIndex);
});
