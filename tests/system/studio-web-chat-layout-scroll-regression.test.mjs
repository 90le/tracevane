import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const styleCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/style.css"),
  "utf8",
);
const appVue = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/App.vue"),
  "utf8",
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ChatShellPage.vue"),
  "utf8",
);
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/chat-shell-workspace.css"),
  "utf8",
);
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionListPanel.vue"),
  "utf8",
);
const sessionListSharedCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/session-list-shared.css"),
  "utf8",
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ConversationPane.vue"),
  "utf8",
);

const conversationPaneCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/conversation-pane.css"),
  "utf8",
);
test("app shell uses a direct route host so chat is not boxed inside extra shell wrappers", () => {
  assert.match(
    appVue,
    /class="main-content shell-main"[\s\S]*'chat-surface-route': isChatSurface,[\s\S]*'shell-main-chat': isChatSurface,[\s\S]*'terminal-surface-route': isTerminalSurface,/,
  );
  assert.match(appVue, /<RouterView v-slot="\{ Component,\s*route:\s*routedView \}">/);
  assert.match(appVue, /<section class="shell-main-stage">/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.match(appVue, /<KeepAlive v-if="Component && shouldKeepRouteAlive\(routedView\)" :max="16">/);
  assert.doesNotMatch(appVue, /class="shell-stage-surface"/);
  assert.doesNotMatch(appVue, /class="shell-canvas"/);
});

test("chat route shell establishes an unbroken full-height chain without centered boxed canvases", () => {
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s*\{[\s\S]*height:\s*100dvh;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s+\.shell-layout\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s+\.shell-main-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s+\.shell-route-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s+\.shell-route-stage\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*align-content:\s*stretch;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.main-content\.chat-surface-route\s+\.shell-route-stage\s*>\s*\*\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/,
  );
  assert.doesNotMatch(
    styleCss,
    /\.main-content\.chat-surface-route\s*\{/,
    "chat route full-height shell rules should live with chat-v2 feature CSS",
  );
  assert.doesNotMatch(
    styleCss,
    /\.shell-layout-chat\s*\{/,
    "chat shell layout reset should live with chat-v2 feature CSS",
  );
  assert.doesNotMatch(styleCss, /\.shell-stage-surface-chat\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-canvas-chat\s*\{/);
});

test("chat page keeps independent list and thread scrollers inside the full-height shell", () => {
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-layout\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    sessionListSharedCss,
    /\.chat-shell-session-list__body\s*\{[\s\S]*overflow:\s*auto;/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-conversation-thread\s*\{[\s\S]*overflow:\s*auto;/,
  );
});
