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
  path.join(rootDir, "apps/web-vue/src/features/chat/ChatShellPage.vue"),
  "utf8",
);
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/chat-shell-workspace.css"),
  "utf8",
);
const overlaySurfacesCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/overlay-surfaces.css"),
  "utf8",
);
const slashCommandCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/slash-command.css"),
  "utf8",
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/ConversationPane.vue"),
  "utf8",
);

const conversationPaneCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/conversation-pane.css"),
  "utf8",
);
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/SessionFilterBar.vue"),
  "utf8",
);

const sessionFilterCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/session-filter.css"),
  "utf8",
);
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/SessionListPanel.vue"),
  "utf8",
);
const composerBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/ComposerBar.vue"),
  "utf8",
);
const composerBarCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/composer-bar.css"),
  "utf8",
);
const slashCommandMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/SlashCommandMenu.vue"),
  "utf8",
);
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/CascadeMenu.vue"),
  "utf8",
);
const newChatAgentPicker = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat/NewChatAgentPicker.vue",
  ),
  "utf8",
);
const chatRecordBrowserCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/chat-record-browser.css"),
  "utf8",
);
const markdownBlockCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/markdown-block.css"),
  "utf8",
);
const messageBubbleCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/message-bubble.css"),
  "utf8",
);

test("chat theme tokens are exposed on html so portal overlays inherit visible surfaces", () => {
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(
    chatShellWorkspaceCss,
    /html\[data-theme="light"\],\s*\.chat-shell\.theme-light,\s*\.chat-mobile-drawer-mask\.theme-light\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /html:not\(\[data-theme="light"\]\),\s*\.chat-shell\.theme-dark,\s*\.chat-mobile-drawer-mask\.theme-dark\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-menu-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-dialog-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-drawer-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-inspector-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-menu-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-dialog-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-drawer-surface:\s*var\(--bg-subtle\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-inspector-surface:\s*var\(--modal-panel-bg\);/,
  );
});

test("chat portal overlays render on surfaced backgrounds instead of transparent wrappers", () => {
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*border:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*background:\s*var\(--chat-menu-surface\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*box-shadow:\s*var\(--mono-shadow-md,/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\.theme-dark,[\s\S]*\{[\s\S]*--chat-menu-surface:\s*var\(--modal-panel-bg\);/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-preview-image,[\s\S]*\.chat-composer-preview-video\s*\{[\s\S]*background:\s*var\(--chat-code-bg\);/,
  );
  assert.doesNotMatch(
    `${sessionFilterCss}\n${composerBarCss}`,
    /#102033|#0d1b2a/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-session-menu-popover\s*\{[\s\S]*border:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-session-menu-popover\s*\{[\s\S]*background:\s*var\(--chat-menu-surface\);/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-session-menu-popover\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-session-menu-popover\s*\{[\s\S]*box-shadow:\s*var\(--mono-shadow-md,/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*border:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*background:\s*var\(--chat-dialog-surface\);/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*z-index:\s*1261;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer\s*\{[\s\S]*background:\s*var\(--chat-drawer-surface\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer\s*\{[\s\S]*border-right:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer\s*\{[\s\S]*z-index:\s*calc\(var\(--chat-layer-overlay\) \+ 1\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[\s\S]*background:\s*var\(--chat-inspector-surface\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[\s\S]*z-index:\s*var\(--chat-layer-inspector\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-mask\s*\{[\s\S]*z-index:\s*1500;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*z-index:\s*1501;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*background:\s*var\(--chat-modal-bg\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.cascade-menu\s*\{[\s\S]*border:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.cascade-menu\s*\{[\s\S]*background:\s*var\(--chat-menu-surface\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.cascade-menu\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.cascade-menu\s*\{[\s\S]*box-shadow:\s*var\(--mono-shadow-md\);/,
  );
  assert.match(
    composerBarCss,
    /\.chat-slash-menu-popover\s*\{[\s\S]*background:\s*transparent;/,
  );
  assert.match(
    slashCommandCss,
    /\.chat-slash-menu\s*\{[\s\S]*border:\s*1px solid var\(--chat-line-strong\);/,
  );
  assert.match(
    slashCommandCss,
    /\.chat-slash-menu\s*\{[\s\S]*background:\s*var\(--chat-menu-surface\);/,
  );
});

test("chat floating overlays use dimmed solid surfaces instead of blurred glass", () => {
  const chatOverlayCss = [
    chatShellWorkspaceCss,
    overlaySurfacesCss,
    slashCommandCss,
    conversationPaneCss,
    composerBarCss,
    chatRecordBrowserCss,
    markdownBlockCss,
    messageBubbleCss,
  ].join("\n");

  assert.doesNotMatch(chatOverlayCss, /backdrop-filter:\s*blur\(/);
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-rendering-settings-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-preview-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    slashCommandCss,
    /\.chat-slash-help-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    chatRecordBrowserCss,
    /\.chat-record-browser-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    messageBubbleCss,
    /\.chat-image-preview-mask\s*\{[\s\S]*backdrop-filter:\s*none;/,
  );
});

test("session filter portal carries explicit theme classes so teleported overlays do not fall back to transparent surfaces", () => {
  assert.match(chatShellPage, /<SessionListPanel[\s\S]*:theme="resolvedTheme"/);
  assert.match(sessionListPanel, /<SessionFilterBar[\s\S]*:theme="theme"/);
  assert.match(
    sessionFilterBar,
    /<PopoverContent[\s\S]*:class="\['chat-shell-session-filter-popover',\s*theme === 'light' \? 'theme-light' : 'theme-dark'\]"/,
  );
  assert.match(
    sessionFilterBar,
    /<PopoverArrow[\s\S]*:class="\['chat-shell-session-filter-arrow',\s*theme === 'light' \? 'theme-light' : 'theme-dark'\]"/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\.theme-light,\s*\.chat-shell-session-filter-mobile-sheet\.theme-light,\s*\.chat-shell-session-filter-arrow\.theme-light\s*\{/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\.theme-dark,\s*\.chat-shell-session-filter-mobile-sheet\.theme-dark,\s*\.chat-shell-session-filter-arrow\.theme-dark\s*\{/,
  );
});
