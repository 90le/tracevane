import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const chatRuntimeRecovery = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-runtime-recovery.ts'),
  'utf8',
);

test('chat shell resolves requested route sessions through the shared recovery helper', () => {
  assert.match(chatShellPage, /resolveRequestedOrFallbackSessionKey/);
  assert.match(chatRuntimeRecovery, /export function resolveRequestedOrFallbackSessionKey/);
});

test('chat shell repairs stale deep links for both inspect and standard chat routes', () => {
  assert.match(chatShellPage, /route\.path === '\/chat\/workbench'/);
  assert.match(chatShellPage, /route\.path\.startsWith\('\/chat\/s\/'\)/);
  assert.match(chatShellPage, /await router\.replace\(buildChatRoute\(resolved \|\| null, props\.shellMode\)\);/);
  assert.match(chatShellPage, /if \(route\.path\.startsWith\('\/chat\/s\/'\) \|\| routeUsesLegacySessionQuery\.value\) \{[\s\S]*await router\.replace\(buildChatRoute\(fallback \|\| null, props\.shellMode\)\);/);
});

test('chat shell normalizes only true legacy query session routes back to canonical chat routes', () => {
  assert.match(chatShellPage, /const routeHasBrokenSessionRef = computed\(\(\) =>/);
  assert.match(chatShellPage, /hasBrokenChatRouteSessionRef\(routeSessionRefParams\.value\)/);
  assert.match(chatShellPage, /const routeUsesLegacySessionQuery = computed\(\(\) => shouldNormalizeChatSessionQueryRoute\(\{/);
  assert.match(chatShellPage, /currentPath: route\.path,/);
  assert.match(chatShellPage, /shellMode: props\.shellMode,/);
  assert.match(chatShellPage, /if \(routeUsesLegacySessionQuery\.value \|\| routeHasBrokenSessionRef\.value\) \{[\s\S]*await router\.replace\(buildChatRoute\(requested, props\.shellMode\)\);/);
  assert.match(chatShellPage, /if \(route\.path\.startsWith\('\/chat\/s\/'\) \|\| routeUsesLegacySessionQuery\.value\) \{[\s\S]*await router\.replace\(buildChatRoute\(fallback \|\| null, props\.shellMode\)\);/);
  assert.match(chatRuntimeRecovery, /export function hasBrokenChatRouteSessionRef/);
  assert.match(chatRuntimeRecovery, /export function shouldNormalizeChatSessionQueryRoute/);
});
