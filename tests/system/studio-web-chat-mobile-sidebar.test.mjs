import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const chatShellPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/ChatShellPage.vue"),
  "utf8",
);
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/chat-shell-workspace.css"),
  "utf8",
);
const sessionContextMenu = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat/SessionContextMenu.vue",
  ),
  "utf8",
);
const folderPickerMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/FolderPickerMenu.vue"),
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
const conversationPane = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/ConversationPane.vue"),
  "utf8",
);

const conversationPaneCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/conversation-pane.css"),
  "utf8",
);
const sessionListFilters = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat/session-list-filters.ts",
  ),
  "utf8",
);

test("mobile drawer and inspector use reka dialog primitives while preserving overlay stacking", () => {
  assert.match(chatShellPage, /from 'reka-ui'/);
  assert.match(chatShellPage, /DialogRoot/);
  assert.match(chatShellPage, /DialogPortal/);
  assert.match(chatShellPage, /DialogOverlay/);
  assert.match(chatShellPage, /DialogContent/);
  assert.match(
    chatShellPage,
    /<DialogRoot v-model:open="mobileSessionDrawerOpen">/,
  );
  assert.match(
    chatShellPage,
    /<DialogRoot :open="inspectPinned && inspectorDrawerOpen" @update:open="handleInspectorDrawerOpenChange">/,
  );
  assert.match(
    chatShellPage,
    /<DialogOverlay[\s\S]*class="chat-mobile-drawer-mask"[\s\S]*:class="resolvedTheme === 'light' \? 'theme-light' : 'theme-dark'"/,
  );
  assert.match(
    chatShellPage,
    /<DialogOverlay[\s\S]*class="chat-inspector-mask"[\s\S]*:class="resolvedTheme === 'light' \? 'theme-light' : 'theme-dark'"/,
  );
  assert.match(
    chatShellPage,
    /<aside class="chat-mobile-drawer[^"]*" :class="resolvedTheme === 'light' \? 'theme-light' : 'theme-dark'">/,
  );
  assert.match(
    chatShellPage,
    /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/,
  );
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-overlay:\s*1400;/);
  assert.match(chatShellWorkspaceCss, /--chat-layer-inspector:\s*1421;/);
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer-mask\s*\{[\s\S]*z-index:\s*var\(--chat-layer-overlay\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer\s*\{[\s\S]*z-index:\s*calc\(var\(--chat-layer-overlay\) \+ 1\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-mask\s*\{[\s\S]*z-index:\s*calc\(var\(--chat-layer-inspector\) - 1\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[\s\S]*z-index:\s*var\(--chat-layer-inspector\);/,
  );
  assert.match(sessionContextMenu, /:z-index="1605"/);
  assert.match(folderPickerMenu, /:z-index="1610"/);
  assert.match(sessionContextMenu, /<Teleport to="body" v-if="open">/);
  assert.match(folderPickerMenu, /<Teleport to="body" v-if="open">/);
  assert.doesNotMatch(chatShellPage, /<Teleport to="body">/);
  assert.doesNotMatch(
    chatShellPage,
    /@click\.self="mobileSessionDrawerOpen = false"/,
  );
  assert.doesNotMatch(chatShellPage, /@click\.self="closeInspectorDrawer"/);
});

test("mobile filter panel escapes drawer clipping and stays tappable", () => {
  assert.match(sessionListPanel, /<SessionListScopeTabs/);
  assert.match(sessionFilterBar, /from 'reka-ui'/);
  assert.match(sessionFilterBar, /PopoverRoot/);
  assert.match(sessionFilterBar, /PopoverTrigger/);
  assert.match(sessionFilterBar, /PopoverPortal/);
  assert.match(sessionFilterBar, /PopoverContent/);
  assert.match(sessionFilterBar, /isCompactViewport/);
  assert.match(sessionFilterBar, /chat-shell-session-filter-mobile-sheet/);
  assert.match(sessionFilterBar, /v-if="isCompactViewport && filterPanelOpen"/);
  assert.match(sessionFilterBar, /<PopoverPortal>/);
  assert.match(sessionFilterBar, /chat-shell-session-filter-popover/);
  assert.match(sessionFilterBar, /Search title, agent, preview, source/);
  assert.match(sessionFilterBar, /selectedSourceFilter/);
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*z-index:\s*1600;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet\s*\{/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet\s*\{[\s\S]*background:\s*var\(--chat-menu-surface\);/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-popover\s*\{[\s\S]*max-height:\s*calc\(100dvh - 108px\);/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-popover\s*\{[\s\S]*width:\s*calc\(100vw - 24px\);/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-popover\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-layer\s*\{[\s\S]*background:\s*var\(--chat-sidebar-bg\);/,
  );
});

test("mobile session filter sheet keeps a compact density pass instead of oversized blocks", () => {
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet\s*\{[\s\S]*gap:\s*8px;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet\s*\{[\s\S]*padding:\s*10px;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet \.chat-shell-session-filter-agent-list\s*\{[\s\S]*max-height:\s*min\(38dvh,\s*260px\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet \.chat-shell-session-filter-agent-option\s*\{[\s\S]*min-height:\s*38px;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-mobile-sheet \.chat-shell-session-filter-popover__actions\s*\{[\s\S]*gap:\s*6px;/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-layer\s*\{[\s\S]*padding-left:\s*14px;/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-button\s*\{[\s\S]*min-height:\s*36px;/,
  );
  assert.match(
    sessionFilterCss,
    /@media \(max-width:\s*1040px\)\s*\{[\s\S]*\.chat-shell-session-filter-chip\s*\{[\s\S]*min-height:\s*28px;/,
  );
});

test("agent filter uses Studio-owned option buttons instead of native select dropdowns", () => {
  assert.doesNotMatch(sessionFilterBar, /<select[\s>]/);
  assert.doesNotMatch(
    sessionFilterBar,
    /<label class="chat-shell-session-filter-field">/,
  );
  assert.match(
    sessionFilterBar,
    /<div class="chat-shell-session-filter-field">/,
  );
  assert.match(
    sessionFilterBar,
    /class="chat-shell-session-filter-agent-list"/,
  );
  assert.match(
    sessionFilterBar,
    /class="chat-shell-session-filter-agent-option"/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-list\s*\{[\s\S]*max-height:\s*240px;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-list\s*\{[\s\S]*overflow:\s*auto;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-list\s*\{[\s\S]*border:\s*1px solid color-mix\(in srgb, var\(--chat-line-strong\) 84%, transparent 16%\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-list\s*\{[\s\S]*background:\s*[\s\S]*var\(--chat-menu-surface\)/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-option\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--chat-menu-surface\) 92%, var\(--chat-modal-row\) 8%\);/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-option\s*\{[\s\S]*touch-action:\s*manipulation;/,
  );
  assert.match(
    sessionFilterCss,
    /\.chat-shell-session-filter-agent-option\.active\s*\{[\s\S]*color:\s*var\(--chat-text\);/,
  );
});

test("mobile and desktop session filters use reka-controlled open state instead of manual outside-click listeners", () => {
  assert.match(
    sessionListPanel,
    /@update:filter-panel-open="filters\.setFilterPanelOpen"/,
  );
  assert.match(sessionFilterBar, /@update:open="handleFilterPanelOpenChange"/);
  assert.match(
    sessionListFilters,
    /function setFilterPanelOpen\(open: boolean\): void \{/,
  );
  assert.doesNotMatch(sessionFilterBar, /data-session-filter-scope-id/);
  assert.doesNotMatch(
    sessionListFilters,
    /window\.addEventListener\('mousedown'/,
  );
  assert.doesNotMatch(sessionListFilters, /filterScopeSelector/);
});

test("mobile conversation moves the session-list trigger into the first mobile dock slot", () => {
  assert.match(
    conversationPane,
    /<div class="chat-conversation-pane__head">\s*<div class="chat-conversation-pane__avatar">/,
  );
  assert.doesNotMatch(
    conversationPane,
    /class="chat-conversation-pane__mobile-session-fab"/,
  );
  assert.match(
    conversationPane,
    /<div class="chat-conversation-pane__mobile-dock">[\s\S]*?@click="\$emit\('open-session-list'\)"[\s\S]*?@click="\$emit\('refresh-session'\)"/,
  );
  assert.match(
    conversationPaneCss,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    conversationPaneCss,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__head\s*\{[\s\S]*padding-left:\s*max\(calc\(env\(safe-area-inset-left,\s*0px\) \+ 48px\),\s*56px\);/,
  );
  assert.match(
    conversationPaneCss,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__mobile-dock\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/,
  );
});
