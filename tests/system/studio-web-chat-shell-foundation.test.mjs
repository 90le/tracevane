import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const chatShellPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/ChatShellPage.vue"),
  "utf8",
);
const chatShellWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/chat-shell-workspace.css"),
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
const overlaySurfacesCss = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/overlay-surfaces.css",
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
const messageResourcesCss = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/message-resources.css",
  ),
  "utf8",
);
const inspectorPanel = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/InspectorPanel.vue"),
  "utf8",
);
const inspectorPanelCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/inspector-panel.css"),
  "utf8",
);
const markdownBlock = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/MarkdownBlock.vue"),
  "utf8",
);
const markdownBlockCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/markdown-block.css"),
  "utf8",
);
const queuedMessageRail = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue"),
  "utf8",
);
const queueRailCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat-v2/queue-rail.css"),
  "utf8",
);
const chatApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/chat/api.ts"),
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
const chatRecordBrowserCss = fs.readFileSync(
  path.join(
    rootDir,
    "apps/web-vue/src/features/chat-v2/chat-record-browser.css",
  ),
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
  assert.match(chatShellPage, /import '\.\/chat-shell-workspace\.css';/);
  assert.doesNotMatch(chatShellPage, /<style scoped>/);
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-v2-shell\.theme-dark,\s*\.chat-mobile-drawer-mask\.theme-dark\s*\{/,
  );
  assert.match(chatShellWorkspaceCss, /--chat-shell-bg:\s*#0e1926;/);
  assert.match(chatShellWorkspaceCss, /--chat-thread-bg:\s*#101d2d;/);
  assert.match(
    chatShellWorkspaceCss,
    /--chat-shell-frame:\s*linear-gradient\(180deg,\s*rgba\(14,\s*27,\s*42,\s*0\.98\),\s*rgba\(11,\s*22,\s*35,\s*0\.94\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-bg:\s*linear-gradient\(180deg,\s*rgba\(11,\s*22,\s*35,\s*0\.985\),\s*rgba\(8,\s*18,\s*29,\s*0\.955\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row:\s*rgba\(24,\s*40,\s*58,\s*0\.965\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row-hover:\s*rgba\(31,\s*49,\s*70,\s*0\.99\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row-active:\s*rgba\(71,\s*135,\s*255,\s*0\.26\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-layout\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-layout\s*\{[\s\S]*background:\s*var\(--chat-shell-frame\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-toast\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});

test("light theme sidebar surfaces stay opaque enough for drawer readability", () => {
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-v2-shell\.theme-light,\s*\.chat-mobile-drawer-mask\.theme-light\s*\{/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-shell-frame:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.97\),\s*rgba\(245,\s*249,\s*253,\s*0\.94\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-bg:\s*linear-gradient\(180deg,\s*rgba\(254,\s*255,\s*255,\s*0\.98\),\s*rgba\(246,\s*250,\s*254,\s*0\.95\)\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row:\s*rgba\(255,\s*255,\s*255,\s*0\.965\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row-hover:\s*rgba\(255,\s*255,\s*255,\s*0\.994\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /--chat-sidebar-row-active:\s*rgba\(62,\s*121,\s*235,\s*0\.18\);/,
  );
});

test("session rows use surfaced list blocks instead of fully transparent rows", () => {
  assert.match(
    sessionListShared,
    /\.chat-shell-session-row\s*\{[\s\S]*background:\s*[\s\S]*chat-sidebar-row/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-row\.active,[\s\S]*background:\s*[\s\S]*chat-sidebar-row-active/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-row\s*\{[\s\S]*backdrop-filter:\s*blur\(12px\);/,
  );
});

test("folder rows use the same surfaced sidebar treatment for readability", () => {
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-row\s*\{[\s\S]*background:\s*[\s\S]*chat-sidebar-row/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-row:hover\s*\{[\s\S]*background:\s*var\(--chat-sidebar-row-hover\);/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-row\.active,[\s\S]*background:\s*[\s\S]*chat-sidebar-row-active/,
  );
});

test("session list chrome adopts a softened IM rail while leaving folder and filter affordances intact", () => {
  assert.match(
    sessionListShared,
    /\.chat-shell-session-row\s*\{[\s\S]*border-radius:\s*14px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-row\s*\{[\s\S]*overflow:\s*hidden;/,
  );
  assert.match(sessionListShared, /\.chat-shell-session-row::before\s*\{/);
  assert.match(
    sessionListShared,
    /\.chat-shell-session-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-item\s*\{[\s\S]*border:\s*0;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-item\s*\{[\s\S]*background:\s*transparent;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-item\s*\{[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(sessionRowList, /chat-shell-session-preview-line/);
  assert.match(sessionRowList, /chat-shell-session-preview-badge/);
  assert.match(sessionRowList, /chat-shell-session-source/);
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-row\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-more\s*\{[\s\S]*border-radius:\s*999px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-folder-tag\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    sessionListShared,
    /\.chat-shell-session-subheader\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    sessionListShared,
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
    sessionListShared,
    /\.chat-shell-session-batchbar__toggle-all\s*\{[\s\S]*border-radius:\s*10px;/,
  );
});

test("chat composer and picker keep the flatter density pass instead of oversized capsules", () => {
  assert.match(newChatAgentPicker, /DialogRoot/);
  assert.match(composerBar, /import '\.\/composer-bar\.css';/);
  assert.doesNotMatch(composerBar, /<style scoped>/);
  assert.match(
    composerBarCss,
    /\.chat-composer-frame\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-attachment\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-stop,\s*[\s\S]*\.chat-composer-send\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-item\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-mask-in 160ms ease;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-enter 190ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker__search\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker__filter\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-option\s*\{[\s\S]*border-radius:\s*12px;/,
  );
});

test("chat notifications keep the flatter chrome and close control sizing", () => {
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-toast\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-shell-toast-icon\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    chatShellWorkspaceCss,
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
  assert.match(messageBubble, /:open="shouldOpenProcessDetails\(message, messageIndex\)"/);
  assert.match(messageBubble, /function isProcessStreaming\(message: ChatMessageGroup\['messages'\]\[number\]\): boolean \{/);
  assert.match(messageBubble, /function shouldOpenProcessDetails\(message: ChatMessageGroup\['messages'\]\[number\], index: number\): boolean \{/);
  assert.match(messageBubble, /function shouldOpenGroupedProcessDetails\(message: ChatMessageGroup\['messages'\]\[number\]\): boolean \{/);
  assert.match(messageBubble, /正在思考，回复会在下方继续生成。/);
  assert.match(messageBubble, /正在推理，工具步骤会继续更新。/);
  assert.match(
    messageBubble,
    /\.chat-inline-thinking-body\s*\{[\s\S]*max-height:\s*min\(220px,\s*36vh\);[\s\S]*overflow:\s*auto;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-thinking__item-body\s*\{[\s\S]*max-height:\s*min\(220px,\s*36vh\);[\s\S]*overflow:\s*auto;/,
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
  assert.match(messageBubble, /class="chat-inline-process-live"/);
  assert.match(messageBubble, /正在执行，工具输出会实时更新。/);
  assert.match(messageBubble, /function toolOutputLabel\(status: ChatToolStatus\): string \{/);
  assert.match(messageBubble, /text\('工具输入', 'Tool input'\)/);
  assert.match(messageBubble, /text\('实时输出', 'Live output'\)/);
  assert.match(messageBubble, /text\('工具输出', 'Tool output'\)/);
  assert.match(messageBubble, /text\('等待工具输出…', 'Waiting for tool output\.\.\.'\)/);
  assert.match(messageBubble, /function shouldRenderToolOutputPlaceholder\(/);
  assert.match(messageBubble, /class="chat-inline-process-copy"/);
  assert.match(messageBubble, /function copyToolPreview\(tool: ChatDisplayToolHint, kind: ToolPreviewKind\): Promise<void> \{/);
  assert.match(messageBubble, /function toolCopyTitle\(tool: ChatDisplayToolHint, kind: ToolPreviewKind\): string \{/);
  assert.match(messageBubble, /text\('复制工具输入', 'Copy tool input'\)/);
  assert.match(messageBubble, /text\('复制工具输出', 'Copy tool output'\)/);
  assert.match(messageBubble, /const toolCopyState = reactive<Record<string, 'copied' \| 'error' \| undefined>>\(\{\}\);/);
  assert.match(messageBubble, /:open="shouldOpenToolDetails\(tool, toolIndex\)"/);
  assert.match(messageBubble, /function shouldOpenToolDetails\(tool: ChatDisplayToolHint, _index: number\): boolean \{/);
  assert.match(messageBubble, /return tool\.status === 'error';/);
  assert.match(
    messageBubble,
    /\.chat-inline-process-live-dot\s*\{[\s\S]*animation:\s*chat-tool-live-pulse/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-copy\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-block pre\s*\{[\s\S]*max-height:\s*min\(260px,\s*42vh\);/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-item\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-head-summary\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*overflow-wrap:\s*anywhere;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-detail\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-block\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-block-head\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/,
  );
  assert.match(
    messageBubble,
    /\.chat-inline-process-block pre\s*\{[\s\S]*overscroll-behavior:\s*contain;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*box-sizing:\s*border-box;[\s\S]*overflow-wrap:\s*anywhere;/,
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
  assert.match(messageResourceList, /import '\.\/message-resources\.css';/);
  assert.doesNotMatch(messageResourceList, /<style scoped>/);
  assert.match(
    messageResourcesCss,
    /\.chat-resource-card\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourcesCss,
    /\.chat-resource-image\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourcesCss,
    /\.chat-resource-video\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    messageResourcesCss,
    /\.chat-resource-file-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    messageResourcesCss,
    /\.chat-resource-file-actions a\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanelCss,
    /\.chat-inspector-panel\s*\{[\s\S]*animation:\s*chat-inspector-panel-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    inspectorPanelCss,
    /\.chat-inspector-panel__close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanelCss,
    /\.chat-inspector-panel__tab\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    inspectorPanelCss,
    /\.chat-inspector-summary-card,[\s\S]*\.chat-inspector-empty\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(inspectorPanel, /import '\.\/inspector-panel\.css';/);
  assert.doesNotMatch(inspectorPanel, /<style scoped>/);
  assert.match(inspectorPanelCss, /@keyframes chat-inspector-panel-in/);
  assert.match(inspectorPanelCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(overlaySurfacesCss, /\.cascade-menu\s*\{[\s\S]*border-radius:\s*12px;/);
});

test("composer, picker, and queue utilities keep the flatter control language", () => {
  assert.match(composerBar, /DialogRoot/);
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-mask-in 160ms ease;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*top:\s*50%;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*left:\s*50%;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\s*\{[\s\S]*z-index:\s*1501;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-agent-picker-enter 190ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-editor \.chat-composer-token\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-editor \.chat-composer-token-media\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-editor \.chat-composer-token-badge\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-preview\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-preview-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-composer-preview-mask-in 180ms ease;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-preview-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-composer-preview-enter 180ms cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\);/,
  );
  assert.match(composerBarCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-chip:focus-visible\s*\{[^}]*border-radius:\s*10px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-refcount\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-status\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-pool-insert\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-attachment-remove\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    overlaySurfacesCss,
    /\.chat-agent-picker-option__tag\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    queueRailCss,
    /\.chat-queue-rail__position,[\s\S]*\.chat-queue-rail__asset-count\s*\{[\s\S]*border-radius:\s*8px;/,
  );
});

test("conversation utility pills and live preview chrome avoid oversized capsules", () => {
  assert.match(conversationPane, /DialogRoot/);
  assert.match(conversationPane, /@click="\$emit\('toggle-tool-previews'\)"/);
  assert.match(conversationPane, /@click="\$emit\('toggle-thinking-blocks'\)"/);
  assert.match(conversationPane, /@click="\$emit\('refresh-session'\)"/);
  assert.match(conversationPane, /@click="\$emit\('open-record-browser'\)"/);
  assert.doesNotMatch(conversationPane, /triggerMenuAction\('toggle-tool-previews'\)/);
  assert.doesNotMatch(conversationPane, /triggerMenuAction\('toggle-thinking-blocks'\)/);
  assert.doesNotMatch(conversationPane, /triggerMenuAction\('refresh-session'\)/);
  assert.doesNotMatch(conversationPane, /toggleHostManagementExecFromMenu/);
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
  assert.match(markdownBlock, /import '\.\/markdown-block\.css';/);
  assert.doesNotMatch(markdownBlock, /<style scoped>/);
  assert.match(
    markdownBlockCss,
    /\.chat-markdown \.chat-inline-preview-trigger\s*\{[\s\S]*border-radius:\s*8px;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-dialog\s*\{[\s\S]*border-radius:\s*12px;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-dialog\s*\{[\s\S]*box-sizing:\s*border-box;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-live-preview-mask-in 0\.2s ease;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-live-preview-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-ghost\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    markdownBlockCss,
    /\.chat-live-preview-close\s*\{[\s\S]*border-radius:\s*10px;/,
  );
  assert.match(
    markdownBlockCss,
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
  assert.match(markdownBlockCss, /@keyframes chat-live-preview-mask-in/);
  assert.match(markdownBlockCss, /@keyframes chat-live-preview-dialog-in/);
  assert.match(conversationPane, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(markdownBlockCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-mobile-drawer\s*\{[\s\S]*z-index:\s*calc\(var\(--chat-layer-overlay\) \+ 1\);/,
  );
  assert.match(
    chatShellWorkspaceCss,
    /\.chat-inspector-sheet\s*\{[\s\S]*z-index:\s*var\(--chat-layer-inspector\);/,
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
    composerBarCss,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*flex-wrap:\s*nowrap;/,
  );
  assert.match(
    composerBarCss,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*overflow-x:\s*auto;/,
  );
  assert.match(
    composerBarCss,
    /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-composer-resource-pool\s*\{[\s\S]*scroll-snap-type:\s*x proximity;/,
  );
});

test("mobile record browser uses a dedicated sheet instead of permanently occupying chat chrome", () => {
  assert.match(
    chatRecordBrowserPanel,
    /compactViewportMediaQuery = window\.matchMedia\('\(max-width: 920px\)'\)/,
  );
  assert.match(chatRecordBrowserPanel, /chat-record-browser--sheet/);
  assert.match(chatRecordBrowserPanel, /import '\.\/chat-record-browser\.css';/);
  assert.doesNotMatch(chatRecordBrowserPanel, /<style scoped>/);
  assert.match(
    chatRecordBrowserCss,
    /\.chat-record-browser--sheet\s*\{[\s\S]*position:\s*fixed;/,
  );
  assert.match(
    chatRecordBrowserCss,
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
  assert.match(
    composerBar,
    /(syncViewportKeyboardOffset|syncKeyboardLiftFromViewport)/,
  );
  assert.match(composerBar, /@focus="handleEditorFocus"/);
  assert.match(
    composerBar,
    /:style="\{ '--chat-composer-keyboard-offset': composerKeyboardOffsetStyle \}"/,
  );
  assert.match(
    composerBarCss,
    /\.chat-composer-shell\s*\{[\s\S]*margin-bottom:\s*var\(--chat-composer-keyboard-offset,\s*0px\);/,
  );
});

test("chat shell defers the root-route history window and loads date buckets on demand", () => {
  assert.match(chatShellPage, /const CHAT_HISTORY_BOOTSTRAP_WINDOW_LIMIT = 12;/);
  assert.match(chatShellPage, /const CHAT_HISTORY_INITIAL_WINDOW_LIMIT = 24;/);
  assert.match(chatShellPage, /const CHAT_HISTORY_PAGE_LIMIT = 12;/);
  assert.match(chatShellPage, /const CHAT_HISTORY_AUTO_FILL_PAGE_LIMIT = 24;/);
  assert.match(chatShellPage, /const CHAT_HISTORY_DEFER_MS = 320;/);
  assert.match(chatShellPage, /let deferredInitialHistoryLoadTimer: number \| null = null;/);
  assert.match(chatShellPage, /let historyReplaceRequestController: AbortController \| null = null;/);
  assert.match(chatShellPage, /let historyDatesRequestController: AbortController \| null = null;/);
  assert.match(chatShellPage, /let recordBrowserSearchController: AbortController \| null = null;/);
  assert.match(chatShellPage, /let historyBeforePrefetchController: AbortController \| null = null;/);
  assert.match(chatShellPage, /let historyBeforePrefetchTimer: number \| null = null;/);
  assert.match(chatShellPage, /let historyBeforePrefetchIdleHandle: number \| null = null;/);
  assert.match(chatShellPage, /const prefetchedHistoryBefore = ref<\{/);
  assert.match(conversationPane, /const HISTORY_BEFORE_PREFETCH_TRIGGER_PX = 2600;/);
  assert.match(conversationPane, /const HISTORY_BEFORE_MATERIALIZE_TRIGGER_PX = 1800;/);
  assert.match(conversationPane, /const HISTORY_BEFORE_PREFETCH_VIEWPORTS = 8;/);
  assert.match(conversationPane, /const HISTORY_BEFORE_MATERIALIZE_VIEWPORTS = 5;/);
  assert.match(conversationPane, /const HISTORY_BROWSE_GUARD_MS = 6000;/);
  assert.match(conversationPane, /function historyBeforePrefetchTriggerPx\(metrics: ChatSessionScrollMetrics\): number \{/);
  assert.match(conversationPane, /function historyBeforeMaterializeTriggerPx\(metrics: ChatSessionScrollMetrics\): number \{/);
  assert.match(conversationPane, /function historyBeforeContinuationTriggerPx\(metrics: ChatSessionScrollMetrics\): number \{/);
  assert.match(conversationPane, /rootMargin: `\$\{preloadRootMargin\}px 0px 0px 0px`,/);
  assert.match(conversationPane, /function extendHistoryBrowseGuard\(nowMs = Date\.now\(\)\): void \{/);
  assert.match(conversationPane, /let historyPrependMutationPending = false;/);
  assert.match(conversationPane, /let historyPrependPendingBottomDistance: number \| null = null;/);
  assert.match(chatShellPage, /function scheduleDeferredInitialConversationLoad\(sessionKey: string\): void \{/);
  assert.match(chatShellPage, /async function runHistoryBeforePrefetch\(sessionKey: string\): Promise<void> \{/);
  assert.match(chatShellPage, /function scheduleHistoryBeforePrefetch\(sessionKey: string, delayMs = 180\): void \{/);
  assert.match(chatShellPage, /scheduleHistoryBeforePrefetch\(sessionKey, 0\);/);
  assert.match(chatShellPage, /function prefetchMoreHistoryBefore\(\): void \{/);
  assert.match(chatShellPage, /async function waitForHistoryBeforePrefetch\(/);
  assert.match(chatShellPage, /requestIdleCallback/);
  assert.match(
    chatShellPage,
    /const run = \(\) => \{[\s\S]*window\.clearTimeout\(historyBeforePrefetchTimer\);[\s\S]*window\.cancelIdleCallback\(historyBeforePrefetchIdleHandle\);[\s\S]*void runHistoryBeforePrefetch\(sessionKey\);/,
  );
  assert.match(
    chatShellPage,
    /const run = \(\) => \{[\s\S]*window\.clearTimeout\(historyAfterPrefetchTimer\);[\s\S]*window\.cancelIdleCallback\(historyAfterPrefetchIdleHandle\);[\s\S]*void runHistoryAfterPrefetch\(sessionKey\);/,
  );
  assert.match(chatShellPage, /@prefetch-more-before="prefetchMoreHistoryBefore"/);
  assert.match(
    chatShellPage,
    /watch\(selectedSessionKey, async \(sessionKey, previousKey\) => \{[\s\S]*connectChatSocket\(sessionKey\);[\s\S]*const shouldDeferInitialRootHistoryLoad = \([\s\S]*!previousKey[\s\S]*!routeSessionKey\.value[\s\S]*scheduleDeferredInitialConversationLoad\(sessionKey\);/,
  );
  assert.match(
    chatShellPage,
    /watch\(\s*\[routeSessionKey, \(\) => props\.shellMode, studioManagedSessions, observedSessions, sessionsLoading, bootstrapLoading\],/,
  );
  assert.match(
    chatShellPage,
    /if \(requested\) \{[\s\S]*optimisticStartupSessionKey\.value = requested;[\s\S]*if \(bootstrapLoading\.value\) \{[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(chatShellPage, /async function ensureSessionDatesLoaded\(sessionKey: string, force = false\): Promise<void> \{/);
  assert.match(chatShellPage, /if \(nextOpen && !historyDatesLoading\.value\) \{[\s\S]*ensureSessionDatesLoaded\(selectedSession\.value\.key\);/);
  assert.match(chatShellPage, /function abortRecordBrowserSearch\(\): void \{[\s\S]*recordBrowserSearchController\.abort\(\);/);
  assert.match(chatShellPage, /async function runRecordBrowserSearch\(\): Promise<void> \{[\s\S]*abortRecordBrowserSearch\(\);[\s\S]*signal: controller\?\.signal,/);
  assert.doesNotMatch(chatShellPage, /await loadSessionDates\(sessionKey\);/);
  assert.match(chatShellPage, /let prefetchedPayload = readMatchedHistoryBeforePrefetchPayload\(prefetchKey\);/);
  assert.match(chatShellPage, /if \(!prefetchedPayload\) \{\s*clearHistoryBeforePrefetch\(\);\s*\}/);
  assert.doesNotMatch(chatShellPage, /applyBootstrapPayload[\s\S]*scheduleHistoryBeforePrefetch\(bootstrapSessionKey\)/);
  assert.match(conversationPane, /&& scrollState\.value\.autoScrollLockedByUser/);
});

test("chat shell coalesces high-frequency tool partial output while keeping terminal tool events immediate", () => {
  assert.match(chatShellPage, /const CHAT_TOOL_STREAM_THROTTLE_MS = 80;/);
  assert.match(chatShellPage, /const CHAT_DEBUG_TRACE_STORAGE_KEY = 'openclaw-studio\.chat\.debug-stream-trace';/);
  assert.match(chatShellPage, /window\.__OPENCLAW_STUDIO_CHAT_TRACE__/);
  assert.match(chatShellPage, /function recordChatDebugTrace\(entry: ChatDebugTraceEntry\): void \{/);
  assert.match(chatShellPage, /kind: 'optimistic\.user'/);
  assert.match(chatShellPage, /const pendingTemporaryToolEvents = new Map<string, ChatTemporaryToolStreamEvent>\(\);/);
  assert.match(chatShellPage, /function temporaryToolEventKey\(event: ChatTemporaryToolStreamEvent\): string \{/);
  assert.match(chatShellPage, /function flushPendingTemporaryToolEvents\(\): void \{/);
  assert.match(chatShellPage, /function scheduleTemporaryToolStreamEvent\(event: ChatTemporaryToolStreamEvent\): void \{/);
  assert.match(chatShellPage, /pendingTemporaryToolEvents\.set\(temporaryToolEventKey\(event\), event\);/);
  assert.match(chatShellPage, /window\.setTimeout\(\(\) => \{[\s\S]*flushPendingTemporaryToolEvents\(\);[\s\S]*\}, CHAT_TOOL_STREAM_THROTTLE_MS\)/);
  assert.match(chatShellPage, /function handleTemporaryToolStreamEvent\(event: ChatTemporaryToolStreamEvent\): void \{/);
  assert.match(chatShellPage, /if \(terminalToolEvent\) \{[\s\S]*pendingTemporaryToolEvents\.delete\(temporaryToolEventKey\(event\)\);[\s\S]*applyTemporaryToolStreamEvent\(event\);/);
  assert.match(chatShellPage, /if \(event\.partial\) \{[\s\S]*scheduleTemporaryToolStreamEvent\(event\);[\s\S]*return;/);
  assert.match(chatShellPage, /if \(event\.kind === 'temporary\.tool'\) \{[\s\S]*handleTemporaryToolStreamEvent\(event\);/);
  assert.match(chatShellPage, /function clearPendingTemporaryToolEvents\(\): void \{/);
  assert.match(chatShellPage, /clearConversationState\(\): void \{[\s\S]*clearPendingTemporaryToolEvents\(\);/);
  assert.match(chatShellPage, /onBeforeUnmount\(\(\) => \{[\s\S]*clearPendingTemporaryToolEvents\(\);/);
});

test("conversation pane memoizes stable timeline subtrees so prepend and append updates do not repatch every bubble", () => {
  assert.match(conversationPane, /<MessageBubble[\s\S]*v-memo="timelineItemMemoKey\(item\)"/);
  assert.match(conversationPane, /:active-streaming-message-id="activeStreamingMessageId"/);
  assert.match(conversationPane, /function timelineItemMemoKey\(item: ChatRenderableItem\): unknown\[] \{/);
  assert.match(conversationPane, /item\.type === 'message_group'/);
  assert.match(conversationPane, /item\.overlay\.toolCalls\.map\(\(toolCall\) => `\$\{toolCall\.toolCallId\}:\$\{toolCall\.status\}:\$\{toolCall\.resultPreview\?\.length \|\| 0\}`\)\.join\('\|'\)/);
});

test("conversation pane virtualizes the timeline shell so only viewport-adjacent bubbles mount heavy content", () => {
  assert.match(conversationPane, /class="chat-conversation-thread__live-placeholder"/);
  assert.match(conversationPane, /const showActiveRunPlaceholder = computed\(\(\) => \{/);
  assert.match(conversationPane, /正在处理中，等待实时消息或工具过程返回。/);
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__live-placeholder-dot\s*\{[\s\S]*animation:\s*chat-thread-live-placeholder-pulse/,
  );
  assert.match(conversationPane, /const TIMELINE_VIRTUALIZE_MIN_ITEMS = 160;/);
  assert.match(conversationPane, /const TIMELINE_VIRTUALIZE_OVERSCAN_PX = 5200;/);
  assert.match(conversationPane, /const TIMELINE_ITEM_DEFAULT_HEIGHT = 280;/);
  assert.match(conversationPane, /const HISTORY_PREPEND_ANCHOR_STABILIZE_MS = 2200;/);
  assert.match(conversationPane, /const HISTORY_LATEST_BOTTOM_ANCHOR_STABILIZE_MS = 3600;/);
  assert.match(conversationPane, /scrollState\.value\.isPinnedToBottom/);
  assert.match(conversationPane, /let pinnedBottomRepairFrame: number \| null = null;/);
  assert.match(conversationPane, /function schedulePinnedBottomRepair\(\): void \{/);
  assert.match(conversationPane, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(conversationPane, /scrollToBottom\('auto', \{ force: true \}\)/);
  assert.match(conversationPane, /const HISTORY_LOADING_INDICATOR_DELAY_MS = 650;/);
  assert.match(conversationPane, /const timelineViewport = ref\(\{/);
  assert.match(conversationPane, /const timelineItemHeights = reactive<Record<string, number>>\(\{\}\);/);
  assert.match(conversationPane, /function timelineItemEstimatedHeight\(item: ChatRenderableItem, index: number\): number \{/);
  assert.match(conversationPane, /const shouldCompensateMeasuredHeights = Boolean\(/);
  assert.match(conversationPane, /let heightDeltaAboveViewport = 0;/);
  assert.match(conversationPane, /itemRect\.bottom <= containerRect\.top/);
  assert.match(conversationPane, /container\.scrollTop \+= heightDeltaAboveViewport;/);
  assert.match(conversationPane, /function estimateTextBlockHeight\(text: string\): number \{/);
  assert.match(conversationPane, /function estimateMessageGroupHeight\(item: Extract<ChatRenderableItem, \{ type: 'message_group' \}>\): number \{/);
  assert.match(conversationPane, /const timelineVirtualWindow = computed\(\(\) => \{/);
  assert.match(conversationPane, /if \(props\.forceEagerHistoryRender \|\| total <= TIMELINE_VIRTUALIZE_MIN_ITEMS\) \{/);
  assert.match(conversationPane, /function isTimelineItemVisible\(index: number\): boolean \{/);
  assert.match(conversationPane, /function shouldForceEagerTimelineItem\(index: number\): boolean \{/);
  assert.match(conversationPane, /:force-eager-render="shouldForceEagerTimelineItem\(itemIndex\)"/);
  assert.match(conversationPane, /:id="timelineItemAnchorId\(item\) \|\| undefined"/);
  assert.match(conversationPane, /class="chat-conversation-thread__item-shell"/);
  assert.match(conversationPane, /:style="timelineItemShellStyle\(item, itemIndex\)"/);
  assert.match(conversationPane, /v-if="isTimelineItemVisible\(itemIndex\)"/);
  assert.match(conversationPane, /class="chat-conversation-thread__item-placeholder"/);
  assert.match(conversationPane, /const showHistoryLoadingBeforeIndicator = ref\(false\);/);
  assert.match(conversationPane, /function scheduleHistoryLoadingIndicator\(kind: 'before' \| 'after', loading: boolean\): void \{/);
  assert.match(conversationPane, /class="chat-conversation-thread__loading-indicator chat-conversation-thread__loading-indicator--before"/);
  assert.match(conversationPane, /class="chat-conversation-thread__loading-indicator chat-conversation-thread__loading-indicator--after"/);
  assert.match(
    conversationPane,
    /\.chat-conversation-thread__loading-indicator\s*\{[\s\S]*height:\s*0;[\s\S]*position:\s*sticky;/,
  );
});

test("history prepend restores against the newest loaded message boundary instead of jumping to batch start", () => {
  assert.match(chatShellPage, /const historyPrependAnchorMessageId = ref<string \| null>\(null\);/);
  assert.match(chatShellPage, /:history-prepend-anchor-message-id="historyPrependAnchorMessageId"/);
  assert.match(chatShellPage, /armHistoryRenderStabilization\(\);[\s\S]*applyHistoryPagePayload\(hydratedPayload, 'replace'\);/);
  assert.match(chatShellPage, /armHistoryRenderStabilization\(\);[\s\S]*historyPayload\.value = payload;/);
  assert.match(chatShellPage, /armHistoryRenderStabilization\(\);[\s\S]*applyHistoryPagePayload\(payload, 'prepend'/);
  assert.match(chatShellPage, /armHistoryRenderStabilization\(\);[\s\S]*applyHistoryPagePayloadAppend\(payload\);/);
  assert.match(chatShellPage, /function finishHistoryRenderStabilization\(\): void \{/);
  assert.match(chatShellPage, /function armHistoryRenderStabilization\(timeoutMs = 2600\): void \{/);
  assert.match(chatShellPage, /historyPrependAnchorMessageId\.value = payload\.messages\[payload\.messages\.length - 1\]\?\.id \|\| null;/);
  assert.match(conversationPane, /historyPrependAnchorMessageId\?: string \| null;/);
  assert.match(conversationPane, /let prependRestoreBoundaryMessageId: string \| null = null;/);
  assert.match(conversationPane, /function resolveMessageBubbleElement\(messageId: string\): HTMLElement \| null \{/);
  assert.match(conversationPane, /function markThreadUserBrowseIntent\(\): void \{/);
  assert.match(conversationPane, /function readVisibleTimelineAnchor\(\): \{ itemId: string; offset: number \} \| null \{/);
  assert.match(conversationPane, /const HISTORY_PREPEND_USER_SCROLL_GRACE_MS = 260;/);
  assert.match(conversationPane, /function isThreadUserScrollRecent\(nowMs = Date\.now\(\)\): boolean \{/);
  assert.match(conversationPane, /function updateStableRestoreAnchorFromCurrentViewport\(metrics: ChatSessionScrollMetrics \| null = readScrollMetrics\(\)\): boolean \{/);
  assert.match(conversationPane, /let stableRestoreResumeTimer: number \| null = null;/);
  assert.match(conversationPane, /function scheduleStableRestoreAnchorResume\(delayMs: number\): void \{/);
  assert.match(conversationPane, /function refreshStableRestoreAnchorFromCurrentViewport\(\): void \{/);
  assert.match(conversationPane, /function scheduleStableRestoreAnchorRefreshFromCurrentViewport\(\): void \{/);
  assert.match(conversationPane, /stableRestoreAnchorItemId = anchor\.itemId;/);
  assert.match(conversationPane, /historyPrependPendingBottomDistance = bottomDistance;/);
  assert.match(conversationPane, /changed && \(stableRestoreAnchorItemId \|\| stableRestoreBottomDistance != null\)/);
  assert.match(conversationPane, /if \(isThreadUserScrollRecent\(nowMs\) && !clippedTowardLatestBeforeRestore\) \{/);
  assert.match(conversationPane, /scheduleStableRestoreAnchorResume\(HISTORY_PREPEND_USER_SCROLL_GRACE_MS - \(nowMs - lastThreadUserScrollAt\)\);/);
  assert.match(conversationPane, /@wheel\.passive="handleThreadWheel"/);
  assert.match(conversationPane, /markThreadUserBrowseIntent\(\): void \{[\s\S]*emit\('prefetch-more-before'\);/);
  assert.match(conversationPane, /metrics\.scrollTop <= historyBeforeMaterializeTriggerPx\(metrics\)[\s\S]*requestMoreBefore\(\);/);
  assert.match(conversationPane, /preserveHistoryBrowse = Boolean\([\s\S]*isHistoryBrowseGuardActive\(\)[\s\S]*previousScrollState\.autoScrollLockedByUser/);
  assert.match(conversationPane, /function restorePendingPrependBottomClipIfNeeded\(\): boolean \{/);
  assert.match(conversationPane, /onUpdated\(\(\) => \{[\s\S]*restorePendingPrependBottomClipIfNeeded\(\);/);
  assert.match(conversationPane, /historyPrependPendingBottomDistance = scrollBottomDistance\(metrics\);/);
  assert.match(conversationPane, /function restorePrependVisualAnchor\([\s\S]*restoreTimelineItemAnchor\(anchorItemId, anchorOffset\)/);
  assert.match(conversationPane, /restorePrependVisualAnchor\(anchorItemId, anchorOffset, boundaryMessageId\);/);
  assert.match(conversationPane, /emit\('history-before-render-settled'\);/);
  assert.match(conversationPane, /if \(!clearPrependPending && historyPrependMutationPending\) \{/);
  assert.match(conversationPane, /const desiredBottomOffset = Math\.min\(/);
  assert.match(conversationPane, /const HISTORY_BEFORE_AUTO_FILL_TARGET_MULTIPLIER = 3\.5;/);
  assert.match(conversationPane, /function requestMoreBeforeForAutoFill\(\): void \{/);
  assert.match(conversationPane, /function scheduleHistoryBeforeAutoFill\(\): void \{/);
  assert.match(conversationPane, /emit\('load-more-before', 'continuation'\);/);
  assert.doesNotMatch(conversationPane, /forceLatestBottomAnchor\(\);/);
  assert.match(conversationPane, /emit\('load-more-before', 'autofill'\);/);
  assert.match(messageBubble, /:data-chat-message-id="message\.id"/);
  assert.match(conversationPane, /function armLatestBottomAnchorStabilizer\(\): void \{/);
  assert.match(conversationPane, /initialLatestAnchorSettleUntil = Math\.max\(/);
  assert.match(conversationPane, /async function restoreLatestBottomAnchorIfNeeded\(\): Promise<void> \{/);
  assert.match(conversationPane, /const settling = Date\.now\(\) < initialLatestAnchorSettleUntil;/);
  assert.match(conversationPane, /if \(bottomDistance <= 40 && !settling\) \{/);
  assert.match(conversationPane, /if \(\s*!props\.selectedSession[\s\S]*\|\| props\.hasMoreAfter[\s\S]*\|\| scrollState\.value\.autoScrollLockedByUser[\s\S]*\|\| isHistoryBrowseGuardActive\(\)/);
  assert.match(conversationPane, /props\.hasMoreAfter[\s\S]*\|\| historyPrependMutationPending[\s\S]*\|\| scrollState\.value\.prependAnchor/);
  assert.match(conversationPane, /overflow-anchor:\s*none;/);
  assert.match(conversationPane, /scrollToBottom\('auto'\);/);
  assert.match(chatShellPage, /const shouldShowLoadingState = !prefetchedPayload;/);
  assert.match(chatShellPage, /if \(shouldShowLoadingState\) \{\s*historyLoadingBefore\.value = true;\s*\}/);
  assert.match(chatShellPage, /if \(!holdLockUntilRenderSettles && mode !== 'autofill' && sessionKey === selectedSessionKey\.value\) \{/);
});

test("chat shell bootstraps the first session rail quickly and hydrates lower-priority agents later", () => {
  assert.match(chatShellPage, /const activeStreamingMessageId = runtimeView\.activeStreamingMessageId;/);
  assert.match(chatShellPage, /type ChatShellWarmCacheSnapshot = \{/);
  assert.match(chatShellPage, /const CHAT_SHELL_WARM_CACHE_TTL_MS = 45_000;/);
  assert.match(chatShellPage, /const CHAT_SHELL_WARM_CACHE_STORAGE_KEY = 'openclaw-studio\.chat\.shell-warm-cache';/);
  assert.match(chatShellPage, /let chatShellWarmCache: ChatShellWarmCacheSnapshot \| null = null;/);
  assert.match(chatShellPage, /function rememberChatShellWarmCache\(\): void \{/);
  assert.match(chatShellPage, /window\.sessionStorage\.setItem\(\s*CHAT_SHELL_WARM_CACHE_STORAGE_KEY,/);
  assert.match(chatShellPage, /function restoreChatShellWarmCache\(expectedSessionKey: string \| null = null\): boolean \{/);
  assert.match(chatShellPage, /window\.sessionStorage\.getItem\(CHAT_SHELL_WARM_CACHE_STORAGE_KEY\)/);
  assert.match(chatShellPage, /const CHAT_SESSION_BOOTSTRAP_AGENT_LIMIT = 1;/);
  assert.match(chatShellPage, /const CHAT_SESSION_DEFERRED_HYDRATION_DELAY_MS = 180;/);
  assert.match(chatShellPage, /const CHAT_SESSION_BOOTSTRAP_ROW_LIMIT = 40;/);
  assert.match(chatShellPage, /let deferredSessionHydrationTimer: number \| null = null;/);
  assert.match(chatShellPage, /const organizerSourceState = ref<ChatSessionOrganizerState>\(createEmptyChatSessionOrganizerState\(\)\);/);
  assert.match(chatShellPage, /const optimisticStartupSessionKey = ref\(''\);/);
  assert.match(chatShellPage, /function applyOrganizer\(next: ChatSessionOrganizerState\): void \{[\s\S]*organizerSourceState\.value = next;/);
  assert.match(chatShellPage, /watch\(sessionRows, \(\) => \{[\s\S]*organizerSourceState\.value/);
  assert.match(chatShellPage, /function resolveBootstrapSessionKey\(\): string \{/);
  assert.match(chatShellPage, /async function loadSessionRowsForAgents\(/);
  assert.match(chatShellPage, /function scheduleDeferredSessionHydration\(/);
  assert.match(chatShellPage, /async function loadSessions\(options: \{ deferRemainingAgents\?: boolean \} = \{\}\): Promise<void> \{/);
  assert.match(chatShellPage, /const prioritizedAgentId = deriveAgentIdFromChatSessionKey\(/);
  assert.match(chatShellPage, /const immediateAgentCount = options\.deferRemainingAgents/);
  assert.match(chatShellPage, /const CHAT_SESSION_BOOTSTRAP_LOCAL_FETCH_OPTIONS = \{[\s\S]*limit: CHAT_SESSION_BOOTSTRAP_ROW_LIMIT,[\s\S]*includeDerivedTitles: false,[\s\S]*includeLastMessage: false,[\s\S]*localOnly: true,[\s\S]*\} as const;/);
  assert.match(chatShellPage, /const deferredAgents = options\.deferRemainingAgents[\s\S]*\? agents[\s\S]*: agents\.slice\(immediateAgentCount\);/);
  assert.match(chatShellPage, /scheduleDeferredSessionHydration\(deferredAgents, loadVersion, mergedRows\);/);
  assert.match(chatApi, /export function fetchChatSessions\([\s\S]*includeDerivedTitles\?: boolean;[\s\S]*includeLastMessage\?: boolean;[\s\S]*localOnly\?: boolean;/);
  assert.match(chatApi, /url\.searchParams\.set\('includeDerivedTitles', options\.includeDerivedTitles \? '1' : '0'\);/);
  assert.match(chatApi, /url\.searchParams\.set\('includeLastMessage', options\.includeLastMessage \? '1' : '0'\);/);
  assert.match(chatApi, /url\.searchParams\.set\('localOnly', options\.localOnly \? '1' : '0'\);/);
  assert.match(chatApi, /export function fetchChatBootstrap\(/);
  assert.match(chatApi, /export function buildChatStreamUrl\([\s\S]*bootstrapSnapshot\?: boolean;[\s\S]*\): string \{/);
  assert.match(chatApi, /url\.searchParams\.set\('bootstrapSnapshot', options\.bootstrapSnapshot \? '1' : '0'\);/);
  assert.match(chatShellPage, /bootstrapSnapshot: false,/);
  assert.match(chatShellPage, /new WebSocket\([\s\S]*bootstrapSnapshot=0[\s\S]*\)/);
  assert.match(chatApi, /const url = new URL\('\/api\/chat\/bootstrap'/);
  assert.match(chatShellPage, /async function bootstrapChatSurface\(\): Promise<void> \{/);
  assert.match(chatShellPage, /const restoredWarmCache = restoreChatShellWarmCache\(bootstrapSessionKey \|\| null\);/);
  assert.match(chatShellPage, /if \(restoredWarmCache\) \{[\s\S]*bootstrapLoading\.value = false;[\s\S]*return;[\s\S]*\}/);
  assert.match(chatShellPage, /let bootstrapPayload: ChatBootstrapPayload \| null = null;/);
  assert.match(chatShellPage, /bootstrapPayload = await loadChatBootstrap\(bootstrapSessionKey\);/);
  assert.match(chatShellPage, /const bootstrapHistoryLimit = sessionKey[\s\S]*CHAT_HISTORY_INITIAL_WINDOW_LIMIT[\s\S]*CHAT_HISTORY_BOOTSTRAP_WINDOW_LIMIT;/);
  assert.match(chatShellPage, /historyLimit: bootstrapHistoryLimit,/);
  assert.match(chatShellPage, /const bootstrapHistorySyncSkipSessionKeys = new Set<string>\(\);/);
  assert.match(chatShellPage, /if \(payload\.history\) \{[\s\S]*bootstrapHistorySyncSkipSessionKeys\.add\(bootstrapSessionKey\);/);
  assert.match(chatShellPage, /if \(bootstrapHistorySyncSkipSessionKeys\.delete\(sessionKey\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(chatShellPage, /chatHealth\.value = payload\.diagnostics \|\| null;/);
  assert.match(chatShellPage, /void loadAgents\(\)\.then\(\(\) => loadSessions\(\{ deferRemainingAgents: true \}\)\);/);
  assert.match(chatShellPage, /if \(!bootstrapPayload\?\.diagnostics\) \{[\s\S]*void loadHealth\(\);[\s\S]*\}/);
  assert.match(chatShellPage, /if \(!bootstrapPayload\?\.organizer\) \{[\s\S]*void loadOrganizer\(\);[\s\S]*\}/);
  assert.match(chatShellPage, /if \(!selectedSessionKey\.value\) \{[\s\S]*const rememberedSessionKey = resolveBootstrapSessionKey\(\);[\s\S]*selectSessionKeyLocally\(rememberedSessionKey\);/);
  assert.match(chatShellPage, /const hasPendingOptimisticStartup = \(/);
  assert.match(chatShellPage, /await loadSessions\(\{ deferRemainingAgents: true \}\);/);
  assert.match(chatShellPage, /onMounted\(async \(\) => \{[\s\S]*await bootstrapChatSurface\(\);/);
  assert.match(chatShellPage, /const exhaustedHistoryBeforeCursorBySession = new Map<string, string>\(\);/);
  assert.match(chatShellPage, /const exhaustedHistoryAfterCursorBySession = new Map<string, string>\(\);/);
  assert.match(
    fs.readFileSync(
      path.join(rootDir, "apps/web-vue/src/features/chat-v2/chat-session-scroll-state.ts"),
      "utf8",
    ),
    /&& params\.state\.autoScrollLockedByUser/,
  );
  assert.match(chatShellPage, /if \(exhaustedHistoryBeforeCursorBySession\.get\(sessionKey\) === beforeCursor\) \{/);
  assert.match(chatShellPage, /let historyBeforeMaterializeInFlight = false;/);
  assert.match(chatShellPage, /let historyBeforeMaterializeReleaseTimer: number \| null = null;/);
  assert.match(chatShellPage, /@history-before-render-settled="handleHistoryBeforeRenderSettled"/);
  assert.match(chatShellPage, /if \(\s*!sessionKey[\s\S]*\|\| historyBeforeMaterializeInFlight[\s\S]*\|\| historyLoadingBefore\.value[\s\S]*\|\| historyLoadingInitial\.value[\s\S]*\|\| !historyPageInfo\.value\.hasMoreBefore[\s\S]*\|\| !historyPageInfo\.value\.beforeCursor/);
  assert.match(chatShellPage, /historyBeforeMaterializeInFlight = true;/);
  assert.match(chatShellPage, /function holdHistoryBeforeMaterializeLockUntilRenderSettles\(timeoutMs = 2600\): void \{/);
  assert.match(chatShellPage, /function handleHistoryBeforeRenderSettled\(\): void \{/);
  assert.match(chatShellPage, /if \(!holdLockUntilRenderSettles\) \{[\s\S]*releaseHistoryBeforeMaterializeLock\(\);/);
  assert.match(chatShellPage, /const noProgress = \(/);
  assert.match(chatShellPage, /historyPageInfo\.value = \{ \.\.\.historyPageInfo\.value, hasMoreBefore: false, beforeCursor: null \};/);
  assert.match(chatShellPage, /const useWideHistoryPage = historyMode\.value === 'history' && !selectedHistoryDay\.value;/);
  assert.match(chatShellPage, /const requestLimit = mode === 'autofill' \|\| mode === 'continuation' \|\| useWideHistoryPage/);
  assert.match(chatShellPage, /prefetchedPayload = await waitForHistoryBeforePrefetch\(prefetchKey\);/);
  assert.match(chatShellPage, /if \(!holdLockUntilRenderSettles && mode !== 'autofill' && sessionKey === selectedSessionKey\.value\) \{/);
  assert.match(chatShellPage, /if \(requestCursor && exhaustedHistoryAfterCursorBySession\.get\(sessionKey\) === requestCursor\) \{/);
  assert.match(chatShellPage, /historyPageInfo\.value = \{ \.\.\.historyPageInfo\.value, hasMoreAfter: false, afterCursor: null \};/);
  assert.match(chatShellPage, /onBeforeUnmount\(\(\) => \{[\s\S]*rememberChatShellWarmCache\(\);/);
});
