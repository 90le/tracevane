import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const chatShellPage = read(
  "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
);

test("chat page redesign keeps stage contracts and removes equal three-way blocks", () => {
  assert.match(chatShellPage, /chat-main-stage/);
  assert.match(chatShellPage, /chat-side-inspector/);
  assert.match(chatShellPage, /chat-focused-workspace/);
  assert.match(chatShellPage, /chat-session-rail-context/);
  assert.match(chatShellPage, /chat-main-stage-focus/);
  assert.doesNotMatch(
    chatShellPage,
    /(chat-three-way-equal-block|chat-equal-three-column|chat-main-equal-grid)/,
  );
});

test("chat page redesign keeps layered workspace hierarchy tokens", () => {
  assert.match(chatShellPage, /--chat-layer-stage:\s*1/);
  assert.match(chatShellPage, /--chat-layer-toast:\s*35/);
  assert.match(chatShellPage, /--chat-layer-overlay:\s*1400/);
  assert.match(chatShellPage, /--chat-layer-inspector:\s*1421/);
  assert.match(chatShellPage, /--chat-layer-dialog:\s*1431/);
});
