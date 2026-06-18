import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const queuedMessageRail = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/QueuedMessageRail.vue'),
  'utf8',
);
const queueRailCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/queue-rail.css'),
  'utf8',
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ConversationPane.vue'),
  'utf8',
);

function assertInOrder(source, parts) {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.notEqual(index, -1, `Missing sequence part: ${part}`);
    cursor = index + part.length;
  }
}

test('chat shell owns queue expansion state and clears it on empty queues and session changes', () => {
  assertInOrder(chatShellPage, [
    'const mobileSessionDrawerOpen = ref(false);',
    'const queueRailExpanded = ref(false);',
    'const mobileQueueSheetOpen = ref(false);',
  ]);
  assert.match(chatShellPage, /function applyQueueState\(sessionKey: string, items: ChatQueuedMessageItem\[\]\): void \{[\s\S]*if \(sessionKey === selectedSessionKey\.value && items\.length === 0\) \{[\s\S]*queueRailExpanded\.value = false;[\s\S]*mobileQueueSheetOpen\.value = false;[\s\S]*\}/);
  assert.match(
    chatShellPage,
    /watch\(selectedSessionKey, async \(sessionKey, previousKey\) => \{[\s\S]*flushComposerDraftSave\(previousKey\);[\s\S]*queueRailExpanded\.value = false;[\s\S]*mobileQueueSheetOpen\.value = false;[\s\S]*if \(!sessionKey\) \{[\s\S]*composerDocument\.value = createEmptyComposerDocument\(\);[\s\S]*composerAttachments\.value = \[\];[\s\S]*restoreComposerDraftForSession\(sessionKey\);/,
  );
});

test('conversation pane keeps inline rail ownership separate from the mobile sheet path', () => {
  assert.match(conversationPane, /<QueuedMessageRail[\s\S]*:summary-expanded="queueRailExpanded"[\s\S]*@update:summary-expanded="\$emit\('update:queue-rail-expanded', \$event\)"[\s\S]*@open-sheet="openQueueSheet"/);
  assert.match(conversationPane, /<DialogRoot[\s\S]*:open="Boolean\(selectedSession && isCompactViewport && mobileQueueSheetOpen && queuedItems\.length\)"[\s\S]*@update:open="handleQueueSheetOpenChange"/);
  assert.match(conversationPane, /class="chat-conversation-pane__queue-sheet"/);
  assert.match(conversationPane, /<QueuedMessageRail[\s\S]*:presentation-mode="'sheet'"/);
});

test('queued message rail hides empty queues and switches to a dedicated sheet presentation mode', () => {
  assert.match(queuedMessageRail, /import '\.\/queue-rail\.css';/);
  assert.doesNotMatch(queuedMessageRail, /<style scoped>/);
  assert.match(queuedMessageRail, /<section[\s\S]*v-if="items\.length"[\s\S]*class="chat-queue-rail"/);
  assert.match(queuedMessageRail, /:data-presentation-mode="presentationMode"/);
  assert.match(queuedMessageRail, /presentationMode\?: 'rail' \| 'sheet';/);
  assert.match(queuedMessageRail, /v-if="presentationMode === 'rail'"/);
  assert.match(queuedMessageRail, /v-if="summaryExpanded \|\| presentationMode === 'sheet'"/);
  assert.match(queueRailCss, /\.chat-queue-rail\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(
    queueRailCss,
    /\.chat-queue-rail\[data-presentation-mode='rail'\]\s+\.chat-queue-rail__panel\s*\{[\s\S]*max-height:\s*min\(30dvh,\s*280px\);[\s\S]*overflow-y:\s*auto;/,
  );
  assert.match(queueRailCss, /\.chat-queue-rail__summary-trigger\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(queueRailCss, /\.chat-queue-rail__position,[\s\S]*\.chat-queue-rail__asset-count\s*\{[\s\S]*border-radius:\s*8px;/);
});

test('queued message rail collapsed summary exposes the next queued item instead of generic copy only', () => {
  assert.match(queuedMessageRail, /const summaryDetail = computed\(\(\) => \{/);
  assert.match(queuedMessageRail, /firstItem\.status === 'blocked' && firstItem\.blockedReason/);
  assert.match(queuedMessageRail, /`首条：\$\{preview\}`/);
  assert.match(queuedMessageRail, /`Next: \$\{preview\}`/);
  assert.match(queuedMessageRail, /const QUEUE_SUMMARY_PREVIEW_LIMIT = 96;/);
  assert.match(queuedMessageRail, /function compactQueuePreview\(value: string, limit = QUEUE_SUMMARY_PREVIEW_LIMIT\): string \{/);
});

test('queued message rail bounds long previews without dropping full edit text', () => {
  assert.match(queuedMessageRail, /const QUEUE_ITEM_PREVIEW_LIMIT = 360;/);
  assert.match(queuedMessageRail, /\{\{ queuedItemPreview\(item\) \|\| text\('无预览文本', 'No preview text'\) \}\}/);
  assert.match(queuedMessageRail, /\{\{ compactQueuePreview\(item\.blockedReason, QUEUE_ITEM_PREVIEW_LIMIT\) \}\}/);
  assert.match(queuedMessageRail, /function isQueuePreviewWhitespace\(code: number\): boolean \{/);
  assert.match(queuedMessageRail, /for \(let index = 0; index < value\.length; index \+= 1\)/);
  assert.match(queuedMessageRail, /value\.charCodeAt\(index\)/);
  assert.match(queuedMessageRail, /function queuedItemPreview\(item: ChatQueuedMessageItem\): string \{/);
  assert.match(queuedMessageRail, /compactQueuePreview\(item\.previewText \|\| item\.text \|\| '', QUEUE_ITEM_PREVIEW_LIMIT\)/);
  assert.match(queuedMessageRail, /editingText\.value = item\.text \|\| item\.previewText \|\| '';/);

  const compactStart = queuedMessageRail.indexOf('function compactQueuePreview');
  assert.notEqual(compactStart, -1);
  const compactEnd = queuedMessageRail.indexOf('function queuedItemPreview', compactStart);
  assert.notEqual(compactEnd, -1);
  const compactSource = queuedMessageRail.slice(compactStart, compactEnd);
  assert.doesNotMatch(compactSource, /replace\(|\.trim\(\)|\.slice\(/);
});

test('queued message edit focuses the textarea and restores focus after keyboard or button cancel', () => {
  assert.match(queuedMessageRail, /import \{ computed, nextTick, ref, watch \} from 'vue';/);
  assert.match(queuedMessageRail, /ref="railRoot"/);
  assert.match(queuedMessageRail, /tabindex="-1"/);
  assert.match(queuedMessageRail, /:data-queue-edit-trigger-id="item\.id"/);
  assert.match(queuedMessageRail, /:data-queue-edit-entry-id="item\.id"/);
  assert.match(queuedMessageRail, /@keydown\.escape\.prevent="cancelEdit\(\{ restoreFocus: true \}\)"/);
  assert.match(queuedMessageRail, /@click="cancelEdit\(\{ restoreFocus: true \}\)"/);
  assert.match(queuedMessageRail, /const railRoot = ref<HTMLElement \| null>\(null\);/);
  assert.match(queuedMessageRail, /function focusQueuedEditTextarea\(entryId: string\): void \{/);
  assert.match(queuedMessageRail, /querySelectorAll<HTMLTextAreaElement>\('\[data-queue-edit-entry-id\]'\)/);
  assert.match(queuedMessageRail, /item\.dataset\.queueEditEntryId === normalizedEntryId/);
  assert.match(queuedMessageRail, /field\.focus\(\{ preventScroll: true \}\);/);
  assert.match(queuedMessageRail, /field\.setSelectionRange\(textLength, textLength\);/);
  assert.match(queuedMessageRail, /void nextTick\(\(\) => \{[\s\S]*focusQueuedEditTextarea\(item\.id\);/);
  assert.match(queuedMessageRail, /function focusQueuedEditTrigger\(entryId: string\): void \{/);
  assert.match(queuedMessageRail, /querySelectorAll<HTMLButtonElement>\('\[data-queue-edit-trigger-id\]'\)/);
  assert.match(queuedMessageRail, /button\.dataset\.queueEditTriggerId === normalizedEntryId/);
  assert.match(queuedMessageRail, /trigger\.focus\(\{ preventScroll: true \}\);/);
  assert.match(queuedMessageRail, /function cancelEdit\(options: \{ restoreFocus\?: boolean \} = \{\}\): void \{/);
  assert.match(queuedMessageRail, /void nextTick\(\(\) => \{[\s\S]*focusQueuedEditTrigger\(entryId\);/);
});

test('active-run sends publish an optimistic queued item before waiting for backend enqueue', () => {
  assert.match(chatShellPage, /function buildOptimisticQueuedMessageItem\(params: \{/);
  assert.match(chatShellPage, /function applyOptimisticQueueItem\(sessionKey: string, item: ChatQueuedMessageItem\): void \{/);
  assertInOrder(chatShellPage, [
    'const optimisticQueueItem = buildOptimisticQueuedMessageItem({',
    'applyOptimisticQueueItem(sessionKey, optimisticQueueItem);',
    'composerDocument.value = createEmptyComposerDocument();',
    'const queuedSendPayload: ChatSendRequest = {',
    '...sendPayload,',
    'flushWhenIdle: true,',
    '};',
    'const queuePayload: ChatQueuePayload = await enqueueChatMessage(sessionKey, queuedSendPayload);',
    'applyQueueState(sessionKey, queuePayload.items);',
  ]);
  const sendStart = chatShellPage.indexOf('async function sendMessage');
  assert.notEqual(sendStart, -1);
  const sendEnd = chatShellPage.indexOf('async function patchQueuedMessage', sendStart);
  assert.notEqual(sendEnd, -1);
  const sendSource = chatShellPage.slice(sendStart, sendEnd);
  assert.equal(sendSource.match(/buildComposerSendPlan\(/g)?.length, 1);
  assert.doesNotMatch(sendSource, /enqueueChatMessage\(sessionKey, buildComposerSendPlan/);
  assert.match(chatShellPage, /if \(rollbackOptimisticQueueItem\) \{[\s\S]*removeOptimisticQueueItem\(rollbackOptimisticQueueItem\.sessionKey, rollbackOptimisticQueueItem\.itemId\);[\s\S]*\}/);
});

test('blocked queued retry preserves composer document, file refs, and flush intent', () => {
  assert.match(chatShellPage, /async function retryQueuedMessage\(entryId: string\): Promise<void> \{/);
  assertInOrder(chatShellPage, [
    'const request: ChatPatchQueueEntryRequest = {',
    'text: currentItem.text,',
    'clientRequestId: currentItem.clientRequestId || undefined,',
    'composerDocument: currentItem.composerDocument,',
    'fileRefs: currentItem.fileRefs,',
    'attachments: currentItem.attachments,',
    'flushWhenIdle: true,',
    '};',
    'const queuePayload = await patchChatQueueEntry(selectedSession.value.key, entryId, request);',
  ]);
});
