import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ChatShellPage.vue"),
  "utf8",
);
const chatRuntimeRecovery = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/chat-runtime-recovery.ts",
  ),
  "utf8",
);

test("chat shell resolves route sessions through the shared recovery helpers", () => {
  assert.match(chatShellPage, /resolveChatRouteSessionKey/);
  assert.match(chatShellPage, /resolveRuntimeFallbackSessionKey/);
  assert.match(chatShellPage, /buildRuntimeChatRoute/);
  assert.match(
    chatRuntimeRecovery,
    /export function resolveChatRouteSessionKey/,
  );
  assert.match(
    chatRuntimeRecovery,
    /export function resolveFallbackSessionKey/,
  );
  assert.match(chatRuntimeRecovery, /export function buildChatRoute/);
});

test("chat shell derives route session keys from params and legacy query inputs", () => {
  assert.match(
    chatShellPage,
    /const routeSessionKey = computed\(\(\) => resolveChatRouteSessionKey\(\{/,
  );
  assert.match(
    chatShellPage,
    /routeParamSessionRef: typeof route\.params\.sessionRef === 'string' \? route\.params\.sessionRef : ''/,
  );
  assert.match(
    chatShellPage,
    /routeQuerySessionRef: typeof route\.query\.sessionRef === 'string' \? route\.query\.sessionRef : ''/,
  );
  assert.match(
    chatShellPage,
    /legacyQuerySession: typeof route\.query\.session === 'string' \? route\.query\.session : ''/,
  );
});

test("chat shell builds canonical chat routes from the shared route builder", () => {
  assert.match(
    chatShellPage,
    /function resolveFallbackSessionKey\(\): string \{/,
  );
  assert.match(chatShellPage, /return resolveRuntimeFallbackSessionKey\(\{/);
  assert.match(
    chatShellPage,
    /function buildChatRoute\(sessionKey: string \| null, mode: 'chat' \| 'inspect' = props\.shellMode\): \{ path: string; query\?: Record<string, string> \} \{/,
  );
  assert.match(chatShellPage, /return buildRuntimeChatRoute\(\{/);
  assert.match(chatShellPage, /currentPath: route\.path,/);
  assert.match(chatShellPage, /shellMode: mode,/);
  assert.match(chatShellPage, /sessionKey,/);
  assert.match(
    chatShellPage,
    /await router\.replace\(nextSessionKey \? buildChatRoute\(nextSessionKey, props\.shellMode\) : '\/chat'\);/,
  );
  assert.match(
    chatRuntimeRecovery,
    /export function hasBrokenChatRouteSessionRef/,
  );
  assert.match(
    chatRuntimeRecovery,
    /export function shouldNormalizeChatSessionQueryRoute/,
  );
});
