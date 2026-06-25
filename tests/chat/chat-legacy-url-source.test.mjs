import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const router = fs.readFileSync(path.join(rootDir, "apps/web/src/app/router.tsx"), "utf8");
const workbench = fs.readFileSync(path.join(rootDir, "apps/web/src/features/chat/ChatWorkbenchPage.tsx"), "utf8");

test("app router redirects legacy clean Chat URLs into hash routes", () => {
  assert.match(router, /useLegacyPathRedirect\(\)/);
  assert.match(router, /window\.location\.hash/);
  assert.match(router, /normalizedPath === "\/chat"/);
  assert.match(router, /normalizedPath === "\/chat\/workbench"/);
  assert.match(router, /normalizedPath\.startsWith\("\/chat\/s\/"\)/);
  assert.match(router, /query\.set\("sessionRef", sessionRef\)/);
  assert.match(router, /window\.history\.replaceState\(null, document\.title, `\/#\$\{nextHash\}`\)/);
});

test("ChatWorkbenchPage decodes legacy sessionRef params to the selected session key", () => {
  assert.match(workbench, /function decodeSessionRef\(value: string \| null\): string \| null/);
  assert.match(workbench, /raw\?\.startsWith\("r1_"\)/);
  assert.match(workbench, /window\.atob\(padded\)/);
  assert.match(workbench, /new TextDecoder\(\)\.decode\(bytes\)/);
  assert.match(workbench, /searchParams\.get\("session"\) \?\? decodeSessionRef\(searchParams\.get\("sessionRef"\)\)/);
});
