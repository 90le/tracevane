import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
  'utf8',
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const chatRecordBrowserPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue'),
  'utf8',
);
const chatRecordBrowserState = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/chat-record-browser-state.ts'),
  'utf8',
);
const chatApi = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/api.ts'),
  'utf8',
);

test('conversation pane exposes a chat-records entry and removes inline history filters', () => {
  assert.match(conversationPane, /聊天记录/);
  assert.match(conversationPane, /Chat records/);
  assert.match(conversationPane, /@click="\$emit\('open-record-browser'\)"/);
  assert.doesNotMatch(conversationPane, /chat-conversation-pane__filter-bar/);
  assert.doesNotMatch(conversationPane, /chat-conversation-pane__filter-sheet/);
});

test('chat shell mounts the current-session record browser and wires result jumps', () => {
  assert.match(chatShellPage, /useChatRecordBrowserState/);
  assert.match(chatShellPage, /defineAsyncComponent\(\(\) => import\('\.\/ChatRecordBrowserPanel\.vue'\)\)/);
  assert.match(chatShellPage, /<ChatRecordBrowserPanel/);
  assert.match(chatShellPage, /<ChatRecordBrowserPanel\s+v-if="recordBrowserOpen"/);
  assert.match(chatShellPage, /:theme="resolvedTheme"/);
  assert.match(chatShellPage, /:available-days="historyDays"/);
  assert.match(chatShellPage, /:selected-day="recordBrowserSelectedDay"/);
  assert.match(chatShellPage, /@open-record-browser="toggleRecordBrowser"/);
  assert.match(chatShellPage, /@jump-to-message="handleRecordBrowserJump"/);
  assert.match(chatShellPage, /@jump-to-day="handleRecordBrowserDayJump"/);
  assert.match(chatShellPage, /closeRecordBrowser\(\)/);
  assert.match(chatShellPage, /handleSearchResultJump\(messageId/);
});

test('record browser jumps reuse visible history windows and avoid delayed smooth-scroll handoff', () => {
  const jumpSource = chatShellPage.match(/async function handleSearchResultJump\(messageId: string, day: string \| null = null\): Promise<void> \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(chatShellPage, /function currentConversationWindowIncludesMessage\(messageId: string, day: string \| null = null\): boolean \{/);
  assert.match(chatShellPage, /async function revealConversationMessage\(messageId: string\): Promise<boolean> \{/);
  assert.match(jumpSource, /const alreadyVisible = currentConversationWindowIncludesMessage\(messageId,\s*day\);/);
  assert.match(jumpSource, /if \(!alreadyVisible\) \{[\s\S]*await loadConversationWindowAnchor\(sessionKey, messageId, day\);/);
  assert.match(jumpSource, /await revealConversationMessage\(messageId\);/);
  assert.doesNotMatch(jumpSource, /scrollIntoView\(\{\s*behavior:\s*'smooth'/);
});

test('record browser search invalidates stale responses and keeps role/content/day filters usable without keywords', () => {
  const searchSource = chatShellPage.match(/async function runRecordBrowserSearch\(\): Promise<void> \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(chatShellPage, /let recordBrowserSearchVersion = 0;/);
  assert.match(searchSource, /const requestVersion = \+\+recordBrowserSearchVersion;/);
  assert.match(searchSource, /recordBrowserSearchVersion !== requestVersion/);
  assert.match(searchSource, /const hasCriteria = Boolean\(query \|\| recordBrowserRoleFilter\.value !== 'all' \|\| recordBrowserContentFilter\.value !== 'all' \|\| recordBrowserSelectedDay\.value\);/);
  assert.match(searchSource, /if \(!hasCriteria\) \{[\s\S]*recordBrowserClearResults\(\);[\s\S]*return;/);
  assert.doesNotMatch(searchSource, /if \(!query\) \{[\s\S]*recordBrowserClearResults\(\);[\s\S]*return;/);
});

test('record browser panel exposes loading, empty, error, and ready surfaces on desktop and mobile', () => {
  assert.match(chatRecordBrowserPanel, /DialogRoot/);
  assert.match(chatRecordBrowserPanel, /DialogPortal/);
  assert.match(chatRecordBrowserPanel, /type="date"/);
  assert.match(chatRecordBrowserPanel, /selectedDay/);
  assert.match(chatRecordBrowserPanel, /jump-to-day/);
  assert.match(chatRecordBrowserPanel, /:class="\[\s*'chat-record-browser-mask',\s*`theme-\$\{theme\}`\s*\]"/);
  assert.match(chatRecordBrowserPanel, /:class="\[\s*'chat-record-browser',\s*'chat-record-browser--sheet',\s*`theme-\$\{theme\}`\s*\]"/);
  assert.match(chatRecordBrowserPanel, /:class="\[\s*'chat-record-browser',\s*'chat-record-browser--dock',\s*`theme-\$\{theme\}`\s*\]"/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser--sheet/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser--dock/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser__surface--loading/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser__surface--empty/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser__surface--error/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser__groups/);
  assert.match(chatRecordBrowserPanel, /chat-record-browser__match/);
  assert.match(chatRecordBrowserPanel, /selectedResultMessageId/);
  assert.match(chatRecordBrowserPanel, /jump-to-message/);
  assert.match(chatRecordBrowserPanel, /const hasNonQueryFilters = computed\(\(\) => props\.roleFilter !== 'all' \|\| props\.contentFilter !== 'all'\)/);
  assert.match(chatRecordBrowserPanel, /const hasSearchCriteria = computed\(\(\) => hasQuery\.value \|\| hasNonQueryFilters\.value \|\| Boolean\(props\.selectedDay\)\)/);
  assert.match(chatRecordBrowserPanel, /const searchDisabled = computed\(\(\) => props\.loading \|\| !hasSearchCriteria\.value\)/);
  assert.match(chatRecordBrowserPanel, /v-else-if="!hasSearchCriteria"/);
  assert.match(chatRecordBrowserPanel, /v-else-if="!hasQuery && !hasNonQueryFilters && selectedDay"/);
  assert.match(chatRecordBrowserPanel, /:global\(\.chat-record-browser\.theme-light\)/);
  assert.match(chatRecordBrowserPanel, /:global\(\.chat-record-browser\.theme-dark\)/);
});

test('chat record browser state keeps the browser state isolated from the main timeline', () => {
  assert.match(chatRecordBrowserState, /selectedDay/);
  assert.match(chatRecordBrowserState, /selectedResultMessageId/);
  assert.match(chatRecordBrowserState, /groupSearchMatchesByDay/);
  assert.match(chatRecordBrowserState, /hasActiveFilters/);
  assert.match(chatRecordBrowserState, /function reset\(\): void \{/);
});

test('chat search API forwards role, content, and day filters for the record browser', () => {
  assert.match(chatApi, /searchChatHistory\(/);
  const searchFunctionSource = chatApi.match(/export function searchChatHistory[\s\S]*?\n\}/)?.[0] || '';
  assert.match(searchFunctionSource, /url\.searchParams\.set\('role'/);
  assert.match(searchFunctionSource, /url\.searchParams\.set\('content'/);
  assert.match(searchFunctionSource, /url\.searchParams\.set\('day'/);
  assert.match(chatShellPage, /day: recordBrowserSelectedDay\.value/);
});
