import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/CascadeMenu.vue"),
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
const chatShellPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ChatShellPage.vue"),
  "utf8",
);
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/chat-shell-workspace.css"),
  "utf8",
);
const overlaySurfacesCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/overlay-surfaces.css"),
  "utf8",
);
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionFilterBar.vue"),
  "utf8",
);

const sessionFilterCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/session-filter.css"),
  "utf8",
);
const newChatAgentPicker = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/NewChatAgentPicker.vue",
  ),
  "utf8",
);

test("chat portal overlays are backed by global css modules so teleported nodes keep their surfaces", () => {
  assert.match(cascadeMenu, /import '\.\/overlay-surfaces\.css';/);
  assert.doesNotMatch(cascadeMenu, /<style(?: scoped)?>/);
  assert.match(overlaySurfacesCss, /\.cascade-menu-anchor\s*\{/);
  assert.match(overlaySurfacesCss, /\.cascade-menu\s*\{/);
  assert.match(conversationPane, /import '\.\/conversation-pane\.css';/);
  assert.doesNotMatch(conversationPane, /<style(?: scoped)?>/);
  assert.match(conversationPaneCss, /\.chat-session-menu-popover\s*\{/);
  assert.match(conversationPaneCss, /\.chat-rendering-settings-dialog\s*\{/);
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer-mask\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{/,
  );
  assert.match(sessionFilterBar, /import '\.\/session-filter\.css';/);
  assert.doesNotMatch(sessionFilterBar, /<style(?:\s|>)/);
  assert.match(sessionFilterCss, /\.chat-shell-session-filter-popover\s*\{/);
  assert.match(
    newChatAgentPicker,
    /import '\.\/overlay-surfaces\.css';/,
  );
  assert.doesNotMatch(newChatAgentPicker, /<style(?: scoped)?>/);
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-mask\s*\{/,
  );
});
