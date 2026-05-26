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
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/chat-shell-workspace.css"),
  "utf8",
);
const overlaySurfacesCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/overlay-surfaces.css"),
  "utf8",
);
const slashCommandCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/slash-command.css"),
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
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionFilterBar.vue"),
  "utf8",
);

const sessionFilterCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/session-filter.css"),
  "utf8",
);
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionListPanel.vue"),
  "utf8",
);
const composerBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ComposerBar.vue"),
  "utf8",
);
const composerBarCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/composer-bar.css"),
  "utf8",
);
const slashCommandMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SlashCommandMenu.vue"),
  "utf8",
);
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/CascadeMenu.vue"),
  "utf8",
);
const newChatAgentPicker = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/NewChatAgentPicker.vue",
  ),
  "utf8",
);

test("chat theme tokens are exposed on html so portal overlays inherit visible surfaces", () => {
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(
    chatShellWorkspaceCss,
    /html\[data-theme="light"\],\s*\.chat-v2-shell\.theme-light,\s*\.chat-mobile-drawer-mask\.theme-light\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /html:not\(\[data-theme="light"\]\),\s*\.chat-v2-shell\.theme-dark,\s*\.chat-mobile-drawer-mask\.theme-dark\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-menu-surface:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.995\),\s*rgba\(246,\s*249,\s*253,\s*0\.992\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-dialog-surface:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.998\),\s*rgba\(244,\s*248,\s*252,\s*0\.994\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-drawer-surface:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.998\),\s*rgba\(243,\s*247,\s*251,\s*0\.992\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-inspector-surface:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.998\),\s*rgba\(241,\s*246,\s*251,\s*0\.992\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-menu-surface:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.996\),\s*rgba\(10,\s*21,\s*34,\s*0\.992\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-dialog-surface:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.998\),\s*rgba\(10,\s*21,\s*34,\s*0\.994\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-drawer-surface:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.998\),\s*rgba\(8,\s*18,\s*29,\s*0\.994\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-inspector-surface:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.998\),\s*rgba\(9,\s*20,\s*31,\s*0\.994\)\);/,
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
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*backdrop-filter:\s*blur\(24px\)\s*saturate\(140%\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*box-shadow:\s*0 18px 44px rgba\(3,\s*8,\s*14,\s*0\.28\);/,
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
    /\.chat-session-menu-popover\s*\{[\s\S]*backdrop-filter:\s*blur\(24px\)\s*saturate\(140%\);/,
  );
  assert.match(
    conversationPaneCss,
    /\.chat-session-menu-popover\s*\{[\s\S]*box-shadow:\s*0 18px 44px rgba\(3,\s*8,\s*14,\s*0\.28\);/,
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
    /\.cascade-menu\s*\{[\s\S]*backdrop-filter:\s*blur\(24px\)\s*saturate\(140%\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.cascade-menu\s*\{[\s\S]*box-shadow:\s*0 18px 44px rgba\(3,\s*8,\s*14,\s*0\.28\);/,
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
