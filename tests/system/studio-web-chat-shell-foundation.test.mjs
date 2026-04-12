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
const sessionRowList = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionRowList.vue"),
  "utf8",
);
const sessionFolderList = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionFolderList.vue"),
  "utf8",
);
const sessionFolderHeader = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/SessionFolderHeader.vue",
  ),
  "utf8",
);
const sessionListShared = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/session-list-shared.css",
  ),
  "utf8",
);
const sessionBatchBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionBatchBar.vue"),
  "utf8",
);
const sessionFilterBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/SessionFilterBar.vue"),
  "utf8",
);
const messageResourceList = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/MessageResourceList.vue",
  ),
  "utf8",
);
const inspectorPanel = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/InspectorPanel.vue"),
  "utf8",
);
const markdownBlock = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/MarkdownBlock.vue"),
  "utf8",
);
const queuedMessageRail = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue"),
  "utf8",
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ConversationPane.vue"),
  "utf8",
);
const chatRecordBrowserPanel = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue",
  ),
  "utf8",
);
const composerBar = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ComposerBar.vue"),
  "utf8",
);
const newChatAgentPicker = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/NewChatAgentPicker.vue",
  ),
  "utf8",
);
const messageBubble = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/MessageBubble.vue"),
  "utf8",
);
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/CascadeMenu.vue"),
  "utf8",
);

function assertInOrder(source, parts) {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.notEqual(index, -1, `Missing sequence part: ${part}`);
    cursor = index + part.length;
  }
}

test("chat shell dark theme uses lifted blue-gray surfaces instead of near-black slabs", () => {
  assert.match(
    chatShellPage,
    /\.chat-v2-shell\.theme-dark,\s*\.chat-mobile-drawer-mask\.theme-dark\s*\{/,
  );
  assert.match(chatShellPage, /--chat-shell-bg:\s*#0e1926;/);
  assert.match(chatShellPage, /--chat-thread-bg:\s*#101d2d;/);
  assert.match(
    chatShellPage,
    /--chat-shell-frame:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.98\),\s*rgba\(11,\s*22,\s*35,\s*0\.94\)\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-bg:\s*linear-gradient\(180deg,\s*rgba\(11,\s*22,\s*35,\s*0\.985\),\s*rgba\(8,\s*18,\s*29,\s*0\.955\)\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row:\s*rgba\(24,\s*40,\s*58,\s*0\.965\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row-hover:\s*rgba\(31,\s*49,\s*70,\s*0\.99\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row-active:\s*rgba\(71,\s*135,\s*255,\s*0\.26\);/,
  );
  assert.match(
    chatShellPage,
    /\.chat-shell-layout\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    chatShellPage,
    /\.chat-shell-layout\s*\{[\s\S]*background:\s*var\(--chat-shell-frame\);/,
  );
  assert.match(
    chatShellPage,
    /\.chat-inspector-sheet\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    chatShellPage,
    /\.chat-shell-toast\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});

test("light theme sidebar surfaces stay opaque enough for drawer readability", () => {
  assert.match(
    chatShellPage,
    /\.chat-v2-shell\.theme-light,\s*\.chat-mobile-drawer-mask\.theme-light\s*\{/,
  );
  assert.match(
    chatShellPage,
    /--chat-shell-frame:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.97\),\s*rgba\(245,\s*249,\s*253,\s*0\.94\)\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-bg:\s*linear-gradient\(180deg,\s*rgba\(254,\s*255,\s*255,\s*0\.98\),\s*rgba\(246,\s*250,\s*254,\s*0\.95\)\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row:\s*rgba\(255,\s*255,\s*255,\s*0\.965\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row-hover:\s*rgba\(255,\s*255,\s*255,\s*0\.994\);/,
  );
  assert.match(
    chatShellPage,
    /--chat-sidebar-row-active:\s*rgba\(62,\s*121,\s*235,\s*0\.18\);/,
  );
});

test("session rows use surfaced list blocks instead of fully transparent rows", () => {
  assert.match(
    sessionRowList,
    /\.chat-shell-session-row\s*\{[\s\S]*background:\s*[\s\S]*chat-sidebar-row/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-row\.active,[\s\S]*background:\s*[\s\S]*chat-sidebar-row-active/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-row\s*\{[\s\S]*backdrop-filter:\s*blur\(12px\);/,
  );
});

test("folder rows use the same surfaced sidebar treatment for readability", () => {
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-row\s*\{[\s\S]*background:\s*[\s\S]*chat-sidebar-row/,
  );
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-row:hover\s*\{[\s\S]*background:\s*var\(--chat-sidebar-row-hover\);/,
  );
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-row\.active,[\s\S]*background:\s*[\s\S]*chat-sidebar-row-active/,
  );
});

test("session list chrome adopts a softened IM rail while leaving folder and filter affordances intact", () => {
  assert.match(
    sessionRowList,
    /\.chat-shell-session-row\s*\{[\s\S]*border-radius:\s*14px;/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-row\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(sessionRowList, /\.chat-shell-session-row::before\s*\{/);
  assert.match(
    sessionRowList,
    /\.chat-shell-session-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-item\s*\{[\s\S]*border:\s*0;/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-item\s*\{[\s\S]*background:\s*transparent;/,
  );
  assert.match(
    sessionRowList,
    /\.chat-shell-session-item\s*\{[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(sessionRowList, /chat-shell-session-preview-line/);
  assert.match(sessionRowList, /chat-shell-session-preview-badge/);
  assert.match(sessionRowList, /chat-shell-session-source/);
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-row\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-more\s*\{[\s\S]*border-radius:\s*999px;/,
  );
  assert.match(
    sessionFolderList,
    /\.chat-shell-folder-tag\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    sessionFolderHeader,
    /\.chat-shell-session-subheader\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionFolderHeader,
    /\.chat-shell-session-subheader__badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(sessionFilterBar, /PopoverRoot/);
  assert.match(sessionFilterBar, /PopoverPortal/);
  assert.match(
    sessionFilterBar,
    /\.chat-shell-session-filter-chip\s*\{[\s\S]*border-radius:\s*999px;/,
  );
  assert.match(
    sessionFilterBar,
    /\.chat-shell-session-filter-popover\s*\{[\s\S]*border-radius:\s*16px;/,
  );
  assert.match(
    sessionFilterBar,
    /\.chat-shell-session-filter-popover\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-session-filter-popover-in 0\.2s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    sessionFilterBar,
    /\.chat-shell-session-filter-agent-list\s*\{[\s\S]*border-radius:\s*14px;/,
  );
  assert.match(sessionFilterBar, /@keyframes chat-session-filter-popover-in/);
  assert.match(sessionFilterBar, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    sessionBatchBar,
    /\.chat-shell-session-batchbar__toggle-all\s*\{[\s\S]*border-radius:\s*10px;/,
  );
});

test("chat composer and picker keep the flatter density pass instead of oversized capsules", () => {
  assert.match(newChatAgentPicker, /DialogRoot/);
  assert.match(
    composerBar,
    /\.chat-composer-frame\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-attachment\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-stop,\s*[\s\S]*\.chat-composer-send\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-pool-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-mask-in 160ms ease;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-enter 190ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker__search\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker__filter\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker-option\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});

test("chat notifications keep the flatter chrome and close control sizing", () => {
  assert.match(
    chatShellPage,
    /\.chat-shell-toast\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    chatShellPage,
    /\.chat-shell-toast-icon\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    chatShellPage,
    /\.chat-shell-toast-close\s*\{[\s\S]*border-radius:\s*8px;/,
  );
});

test("conversation pane keeps large empty and history surfaces in the restrained-corner range", () => {
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__notice\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__blocked\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__history-banner\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__history-banner-action\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__jump-fab\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-empty\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});

test("message bubbles and inline resources avoid returning to capsule-heavy chat chrome", () => {
  assert.match(
    messageBubble,
    /\.chat-message-bubble\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-resource\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-break-resource\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-chip\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.chat-markdown-image-fallback\)\s*\{[^}]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.chat-resource-file-badge\)\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.chat-resource-file-actions a\)\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-thinking-pill\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-pill\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-thinking__head::before\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-step\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-head-state\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.chat-resource-card\)\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.chat-mermaid-block\[data-seamless="1"\] \.chat-mermaid-header\)\s*\{[^}]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-bubble-copy\s*\{[\s\S]*border-radius:\s*8px;/,
  );
});

test("message preview chrome stays in the restrained-corner range", () => {
  assert.match(messageBubble, /DialogRoot/);
  assert.match(
    messageBubble,
    /\.chat-image-preview-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-image-preview-mask-in 0\.2s ease;/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-image-preview-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-image\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-video\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(messageBubble, /@keyframes chat-image-preview-mask-in/);
  assert.match(messageBubble, /@keyframes chat-image-preview-dialog-in/);
});

test("resource cards and inspector chrome stay aligned with the flatter chat density pass", () => {
  assert.match(
    messageResourceList,
    /\.chat-resource-card\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourceList,
    /\.chat-resource-image\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourceList,
    /\.chat-resource-video\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourceList,
    /\.chat-resource-file-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageResourceList,
    /\.chat-resource-file-actions a\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanel,
    /\.chat-inspector-panel\s*\{[\s\S]*animation:\s*chat-inspector-panel-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    inspectorPanel,
    /\.chat-inspector-panel__close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanel,
    /\.chat-inspector-panel__tab\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanel,
    /\.chat-inspector-summary-card,[\s\S]*\.chat-inspector-empty\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(inspectorPanel, /@keyframes chat-inspector-panel-in/);
  assert.match(inspectorPanel, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cascadeMenu, /\.cascade-menu\s*\{[\s\S]*border-radius:\s*12px;/);
});

test("composer, picker, and queue utilities keep the flatter control language", () => {
  assert.match(composerBar, /DialogRoot/);
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-mask-in 160ms ease;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\s*\{[\s\S]*top:\s*50%;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\s*\{[\s\S]*left:\s*50%;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\s*\{[\s\S]*z-index:\s*1501;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-enter 190ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-editor :deep\(\.chat-composer-token\)\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-editor :deep\(\.chat-composer-token-media\)\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-editor :deep\(\.chat-composer-token-badge\)\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-pool-preview\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-preview-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-composer-preview-mask-in 180ms ease;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-preview-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-composer-preview-enter 180ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(composerBar, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    composerBar,
    /\.chat-composer-pool-chip:focus-visible\s*\{[^}]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-pool-refcount\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-pool-status\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-pool-insert\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-attachment-remove\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    newChatAgentPicker,
    /\.chat-agent-picker-option__tag\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    queuedMessageRail,
    /\.chat-queue-rail__position,[\s\S]*\.chat-queue-rail__asset-count\s*\{[\s\S]*border-radius:\s*8px;/,
  );
});

test("conversation utility pills and live preview chrome avoid oversized capsules", () => {
  assert.match(conversationPane, /DialogRoot/);
  assert.match(conversationPane, /triggerMenuAction\('toggle-tool-previews'\)/);
  assert.match(
    conversationPane,
    /triggerMenuAction\('toggle-thinking-blocks'\)/,
  );
  assert.match(conversationPane, /triggerMenuAction\('refresh-session'\)/);
  assert.match(conversationPane, /triggerMenuAction\('open-record-browser'\)/);
  assert.match(conversationPane, /toggleHostManagementExecFromMenu/);
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-rendering-settings-mask-in 0\.2s ease;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-rendering-settings-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*top:\s*50%;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*left:\s*50%;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-dialog\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-scope-btn\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-chip\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-rendering-settings-warn-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(conversationPane, /DropdownMenuRoot/);
  assert.match(
    conversationPane,
    /\.chat-session-menu-popover\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-session-menu-popover-in 0\.2s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-session-menu-item\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__status\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__exec-toggle\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__history-banner-icon\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__jump-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(markdownBlock, /DialogRoot/);
  assert.match(
    markdownBlock,
    /\.chat-markdown :deep\(\.chat-inline-preview-trigger\)\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-dialog\s*\{[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-live-preview-mask-in 0\.2s ease;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-live-preview-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-ghost\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    markdownBlock,
    /\.chat-live-preview-body\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-image-preview-dialog\s*\{[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(conversationPane, /@keyframes chat-session-menu-popover-in/);
  assert.match(conversationPane, /@keyframes chat-rendering-settings-mask-in/);
  assert.match(
    conversationPane,
    /@keyframes chat-rendering-settings-dialog-in/,
  );
  assert.match(markdownBlock, /@keyframes chat-live-preview-mask-in/);
  assert.match(markdownBlock, /@keyframes chat-live-preview-dialog-in/);
  assert.match(conversationPane, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(markdownBlock, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    chatShellPage,
    /\.chat-mobile-drawer\s*\{[\s\S]*z-index:\s*1401;/,
  );
  assert.match(
    chatShellPage,
    /\.chat-inspector-sheet\s*\{[\s\S]*z-index:\s*1421;/,
  );
});

test("mobile conversation header and composer prioritize visible controls over hidden horizontal rails", () => {
  assert.match(conversationPane, /headerSummaryItems/);
  assert.match(conversationPane, /class="chat-conversation-pane__summary"/);
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__summary-chip"/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__header\s*\{[\s\S]*padding:\s*8px 10px 6px;/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__summary\s*\{[\s\S]*display:\s*flex;/,
  );
  assert.match(conversationPane, /class="chat-conversation-pane__mobile-dock"/);
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--nav"/,
  );
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--refresh"/,
  );
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--exec"/,
  );
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--tools"/,
  );
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--thinking"/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__actions\s*\{[\s\S]*display:\s*none;/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*\.chat-conversation-pane__mobile-dock\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-dock\s*\{[\s\S]*border-radius:\s*14px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-dock-btn\s*\{[\s\S]*min-height:\s*48px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-dock-btn--refresh\s*\{[\s\S]*box-shadow:\s*0 14px 28px rgba\(44,\s*120,\s*255,\s*0\.16\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-dock-btn--tools\.active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*#0f766e 40%, var\(--chat-line\)\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-dock-btn--thinking\.active\s*\{[\s\S]*border-color:\s*color-mix\(in srgb,\s*#b45309 40%, var\(--chat-line\)\);/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-conversation-pane__composer\s*\{[\s\S]*padding:\s*6px 10px 8px;/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-conversation-pane__avatar\s*\{[\s\S]*width:\s*34px;/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-conversation-pane__mobile-dock-btn\s*\{[\s\S]*min-height:\s*40px;/,
  );
  assert.match(
    conversationPane,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-conversation-pane__summary-chip\s*\{[\s\S]*min-height:\s*21px;/,
  );
  assert.match(
    composerBar,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*flex-wrap:\s*nowrap;/,
  );
  assert.match(
    composerBar,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*overflow-x:\s*auto;/,
  );
  assert.match(
    composerBar,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*scroll-snap-type:\s*x proximity;/,
  );
});

test("mobile record browser uses a dedicated sheet instead of permanently occupying chat chrome", () => {
  assert.match(
    chatRecordBrowserPanel,
    /compactViewportMediaQuery = window\.matchMedia\('\(max-width: 920px\)'\)/,
  );
  assert.match(chatRecordBrowserPanel, /chat-record-browser--sheet/);
  assert.match(
    chatRecordBrowserPanel,
    /\.chat-record-browser--sheet\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    chatRecordBrowserPanel,
    /\.chat-record-browser__filter-actions\s*\{[\s\S]*justify-content:\s*space-between;/,
  );
});

test("mobile action sheet keeps secondary actions compact instead of oversized stacked cards", () => {
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-sheet"/,
  );
  assert.match(
    conversationPane,
    /class="chat-conversation-pane__mobile-sheet-action-icon"/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-sheet\s*\{[\s\S]*padding:\s*12px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-sheet-grid\s*\{[\s\S]*gap:\s*8px;/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-sheet-action\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0,\s*1fr\);/,
  );
  assert.match(
    conversationPane,
    /\.chat-conversation-pane__mobile-sheet-action\s*\{[\s\S]*padding:\s*10px;/,
  );
});

test("session Exec enable flow uses a Studio dialog instead of the browser confirm popup", () => {
  assert.match(chatShellPage, /hostManagementExecConfirmOpen/);
  assert.match(chatShellPage, /pendingHostManagementExecValue/);
  assert.match(chatShellPage, /confirmSessionHostManagementExec/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-mask"/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-dialog"/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-primary"/);
});

test("queued message rail stays hidden when empty and is controlled by compact summary state", () => {
  assert.match(
    queuedMessageRail,
    /<section v-if="items\.length" class="chat-queue-rail"/,
  );
  assert.match(queuedMessageRail, /presentationMode\?: 'rail' \| 'sheet';/);
  assertInOrder(chatShellPage, [
    "const queueRailExpanded = ref(false);",
    "const mobileQueueSheetOpen = ref(false);",
  ]);
  assert.match(chatShellPage, /:queue-rail-expanded="queueRailExpanded"/);
  assert.match(
    chatShellPage,
    /:mobile-queue-sheet-open="mobileQueueSheetOpen"/,
  );
  assert.match(
    chatShellPage,
    /function applyQueueState\(sessionKey: string, items: ChatQueuedMessageItem\[\]\): void \{[\s\S]*items\.length === 0[\s\S]*queueRailExpanded\.value = false;[\s\S]*mobileQueueSheetOpen\.value = false;/,
  );
  assert.match(
    chatShellPage,
    /watch\(selectedSessionKey, async \(sessionKey, previousKey\) => \{[\s\S]*queueRailExpanded\.value = false;[\s\S]*mobileQueueSheetOpen\.value = false;/,
  );
  assert.match(
    conversationPane,
    /watch\(isCompactViewport, \(compactViewport\) => \{[\s\S]*emit\('update:queue-rail-expanded', false\);[\s\S]*emit\('update:mobile-queue-sheet-open', false\);/,
  );
  assert.match(
    conversationPane,
    /<DialogRoot[\s\S]*:open="Boolean\(selectedSession && isCompactViewport && mobileQueueSheetOpen && queuedItems\.length\)"[\s\S]*class="chat-conversation-pane__queue-sheet"/,
  );
  assert.match(
    conversationPane,
    /<QueuedMessageRail[\s\S]*:presentation-mode="'sheet'"/,
  );
});

test("mobile composer tracks visual viewport keyboard changes so the input can ride above IME", () => {
  assert.match(composerBar, /window\.visualViewport/);
  assert.match(composerBar, /composerKeyboardOffset/);
  assert.match(composerBar, /bindViewportKeyboard/);
  assert.match(composerBar, /syncKeyboardLiftFromViewport/);
  assert.match(composerBar, /@focus="handleEditorFocus"/);
  assert.match(
    composerBar,
    /:style="\{ '--chat-composer-keyboard-offset': composerKeyboardOffsetStyle \}"/,
  );
  assert.match(
    composerBar,
    /\.chat-composer-shell\s*\{[\s\S]*margin-bottom:\s*var\(--chat-composer-keyboard-offset,\s*0px\);/,
  );
});
