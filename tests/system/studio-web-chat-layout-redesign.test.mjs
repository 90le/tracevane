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
const chatShellWorkspaceCss = read(
  "apps/web-vue/src/features/chat-v2/chat-shell-workspace.css",
);

test("chat page redesign keeps stage contracts and removes equal three-way blocks", () => {
  assert.match(chatShellPage, /chat-session-rail/);
  assert.match(chatShellPage, /chat-main-stage/);
  assert.match(chatShellPage, /chat-side-inspector/);
  assert.match(chatShellPage, /chat-mobile-session-rail/);
  assert.match(chatShellPage, /chat-mobile-inspector-sheet/);
  assert.match(chatShellPage, /chat-host-exec-confirm-dialog/);
  assert.match(chatShellPage, /chat-shell-toast/);
  assert.match(chatShellPage, /chat-focused-workspace/);
  assert.match(chatShellPage, /chat-session-rail-context/);
  assert.match(chatShellPage, /chat-main-stage-focus/);
  assert.match(chatShellPage, /chat-mobile-drawer/);
  assert.match(chatShellPage, /chat-inspector-sheet/);
  assert.match(chatShellPage, /inspectorDrawerOpen/);
  assert.match(chatShellPage, /data-context-policy="local-inspector"/);
  assert.doesNotMatch(
    chatShellPage,
    /(chat-three-way-equal-block|chat-equal-three-column|chat-main-equal-grid)/,
  );
});

test("chat page redesign keeps layered workspace hierarchy tokens", () => {
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-stage:\s*1/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-toast:\s*35/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-overlay:\s*1400/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-inspector:\s*1421/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-dialog:\s*1431/);
});

test("chat shell visual tokens align calmer stage and secondary surfaces", () => {
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-sidebar\s*\{[^}]*background:\s*var\(--surface-base\);/s,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[^}]*background:\s*var\(--chat-inspector-surface\);[^}]*border:\s*1px\s+solid\s+var\(--chat-line-strong\);/s,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-host-exec-confirm-dialog\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-subtle\);[^}]*background:\s*var\(--surface-base\);/s,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-toast\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-subtle\);[^}]*background:\s*var\(--surface-base\);/s,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-main-stage\s*\{[^}]*background:\s*var\(--chat-thread-bg\);/s,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-host-exec-confirm-primary\s*\{[^}]*background:\s*var\(--accent-primary\);/s,
  );
});
