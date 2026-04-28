import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const queuedMessageRail = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue'),
  'utf8',
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
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
  assert.match(chatShellPage, /watch\(selectedSessionKey, async \(sessionKey, previousKey\) => \{[\s\S]*composerDocument\.value = createEmptyComposerDocument\(\);[\s\S]*composerAttachments\.value = \[\];[\s\S]*queueRailExpanded\.value = false;[\s\S]*mobileQueueSheetOpen\.value = false;/);
});

test('conversation pane keeps inline rail ownership separate from the mobile sheet path', () => {
  assert.match(conversationPane, /<QueuedMessageRail[\s\S]*:summary-expanded="queueRailExpanded"[\s\S]*@update:summary-expanded="\$emit\('update:queue-rail-expanded', \$event\)"[\s\S]*@open-sheet="openQueueSheet"/);
  assert.match(conversationPane, /<DialogRoot[\s\S]*:open="Boolean\(selectedSession && isCompactViewport && mobileQueueSheetOpen && queuedItems\.length\)"[\s\S]*@update:open="handleQueueSheetOpenChange"/);
  assert.match(conversationPane, /class="chat-conversation-pane__queue-sheet"/);
  assert.match(conversationPane, /<QueuedMessageRail[\s\S]*:presentation-mode="'sheet'"/);
});

test('queued message rail hides empty queues and switches to a dedicated sheet presentation mode', () => {
  assert.match(queuedMessageRail, /<section v-if="items\.length" class="chat-queue-rail"/);
  assert.match(queuedMessageRail, /presentationMode\?: 'rail' \| 'sheet';/);
  assert.match(queuedMessageRail, /v-if="presentationMode === 'rail'"/);
  assert.match(queuedMessageRail, /v-if="summaryExpanded \|\| presentationMode === 'sheet'"/);
});

test('queued message rail collapsed summary exposes the next queued item instead of generic copy only', () => {
  assert.match(queuedMessageRail, /const summaryDetail = computed\(\(\) => \{/);
  assert.match(queuedMessageRail, /firstItem\.status === 'blocked' && firstItem\.blockedReason/);
  assert.match(queuedMessageRail, /`首条：\$\{preview\}`/);
  assert.match(queuedMessageRail, /`Next: \$\{preview\}`/);
  assert.match(queuedMessageRail, /function compactQueuePreview\(value: string\): string \{/);
});

test('active-run sends publish an optimistic queued item before waiting for backend enqueue', () => {
  assert.match(chatShellPage, /function buildOptimisticQueuedMessageItem\(params: \{/);
  assert.match(chatShellPage, /function applyOptimisticQueueItem\(sessionKey: string, item: ChatQueuedMessageItem\): void \{/);
  assertInOrder(chatShellPage, [
    'const optimisticQueueItem = buildOptimisticQueuedMessageItem({',
    'applyOptimisticQueueItem(sessionKey, optimisticQueueItem);',
    'composerDocument.value = createEmptyComposerDocument();',
    'const queuePayload: ChatQueuePayload = await enqueueChatMessage(sessionKey, buildComposerSendPlan({',
    'flushWhenIdle: true,',
    '}).payload);',
    'applyQueueState(sessionKey, queuePayload.items);',
  ]);
  assert.doesNotMatch(chatShellPage, /await enqueueChatMessage\(sessionKey, \{\s*\.\.\.sendPayload,/);
  assert.match(chatShellPage, /if \(rollbackOptimisticQueueItem\) \{[\s\S]*removeOptimisticQueueItem\(rollbackOptimisticQueueItem\.sessionKey, rollbackOptimisticQueueItem\.itemId\);[\s\S]*\}/);
});
