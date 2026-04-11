# Studio Chat Surface IM 化与当前会话记录检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Studio Chat 收口成稳定的 IM 风格主界面，完成 `全部 / 文件夹 / 归档` 会话列表、紧凑待发送队列、当前会话聊天记录面板，以及三端一致的加载/空态/错误/响应式行为。

**Architecture:** 复用现有 `chat-v2` shell、队列接口和 history/search/dates 能力，但把“会话搜索”“当前会话记录检索”“主线程消息流”拆成三条独立状态轨道。后端只扩展现有 history index 与 search 契约；前端通过新建记录浏览状态和面板组件，把当前绑在 `ConversationPane` 顶部的历史搜索抽离成独立 record browser。

**Tech Stack:** TypeScript, Vue 3, Reka UI dialogs/popovers, Studio API router, in-memory chat session state, history index store, node:test, tsx test runner

---

## Frontend Boundary

- 所有界面级改造只落在 `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/`。
- 允许在 `chat-v2` 内做局部重设计，只要最终满足 spec 的信息架构、状态边界与响应式目标。
- 不再为旧 `features/chat/` 补同类 UI 能力，旧实现只作为兼容层保留。

---

## File Map

**Backend**

- Modify: `extensions/openclaw-studio/types/chat.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/routes.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/service.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/history-index.ts`

**Frontend**

- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat/api.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionFilterBar.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionRowList.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-filters.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-view-model.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-shared.css`
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue`
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/chat-record-browser-state.ts`
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListScopeTabs.vue`
- Modify: `extensions/openclaw-studio/lib/chat-session-list-state.ts`

**Tests**

- Modify: `extensions/openclaw-studio/tests/chat/service.history-page.test.mjs`
- Modify: `extensions/openclaw-studio/tests/chat/chat-session-list-state.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-record-browser.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-queue-bar.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-session-list-im.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-shell-foundation.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-mobile-sidebar.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-responsive-rendering.test.mjs`

**Docs**

- Modify: `extensions/openclaw-studio/docs/当前进展.md`

---

### Task 1: 扩展 history/search 契约，支持记录面板过滤与结果定位

**Files:**
- Modify: `extensions/openclaw-studio/types/chat.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/routes.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/service.ts`
- Modify: `extensions/openclaw-studio/apps/api/modules/chat/history-index.ts`
- Modify: `extensions/openclaw-studio/tests/chat/service.history-page.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定 role/content filter 与结果定位字段**

```js
test('searchHistory filters current-session history by role and content kind', async () => {
  const onlyAssistant = await context.services.chat.searchHistory(sessionKey, {
    query: 'keyword',
    role: 'assistant',
    content: 'all',
    limit: 10,
  });
  assert.deepEqual(onlyAssistant.messages.map((message) => message.id), ['m2']);

  const onlyCode = await context.services.chat.searchHistory(sessionKey, {
    query: 'SELECT',
    role: 'all',
    content: 'code',
    limit: 10,
  });
  assert.deepEqual(onlyCode.messages.map((message) => message.id), ['m4']);
  assert.equal(onlyCode.matches[0]?.messageId, 'm4');
});
```

- [ ] **Step 2: 扩展共享类型，给 search query 和返回体一个稳定契约**

```ts
export type ChatHistorySearchRoleFilter = 'all' | 'user' | 'assistant' | 'tool';
export type ChatHistorySearchContentFilter = 'all' | 'text' | 'resource' | 'code';

export interface ChatHistorySearchMatch {
  messageId: string;
  role: ChatMessageRole;
  createdAt: string | null;
  day: string | null;
  snippet: string;
}

export interface ChatHistorySearchPayload {
  checkedAt: string;
  session: ChatSessionRow;
  query: string;
  roleFilter: ChatHistorySearchRoleFilter;
  contentFilter: ChatHistorySearchContentFilter;
  matches: ChatHistorySearchMatch[];
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
  runtime: ChatRuntimeState;
  diagnostics: ChatDiagnostics;
  pageInfo: ChatHistoryPageInfo;
}
```

- [ ] **Step 3: 在 history index 中为角色、内容种类和 snippet 建索引**

```ts
export interface ChatHistoryIndexItem {
  id: string;
  role: string;
  createdAt: string | null;
  dayKey: string | null;
  previewText: string;
  snippet: string;
  hasResources: boolean;
  hasCode: boolean;
  runId: string | null;
  messageIndex: number;
}

function detectCodeContent(message: ChatMessageItem): boolean {
  return /```[\s\S]+```/.test(message.text || '');
}
```

- [ ] **Step 4: 扩展路由和 service 搜索方法，接收 `role/content` 查询参数**

```ts
router.get('/api/chat/sessions/:sessionKey/search', async (req, res, routeCtx, params) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  sendJson(res, 200, await routeCtx.services.chat.searchHistory(params.sessionKey, {
    query: url.searchParams.get('q') || '',
    role: (url.searchParams.get('role') || 'all') as ChatHistorySearchRoleFilter,
    content: (url.searchParams.get('content') || 'all') as ChatHistorySearchContentFilter,
    before: url.searchParams.get('before'),
    after: url.searchParams.get('after'),
    limit: readLimit(req, 50),
  }));
});
```

- [ ] **Step 5: 运行后端验证，确认新契约和索引工作正常**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm run build:api && node --test tests/chat/service.history-page.test.mjs`

Expected:

```text
PASS tests/chat/service.history-page.test.mjs
```

- [ ] **Step 6: 提交后端 history/search 基础层**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/types/chat.ts \
  extensions/openclaw-studio/apps/api/modules/chat/routes.ts \
  extensions/openclaw-studio/apps/api/modules/chat/service.ts \
  extensions/openclaw-studio/apps/api/modules/chat/history-index.ts \
  extensions/openclaw-studio/tests/chat/service.history-page.test.mjs
git commit -m "feat: extend chat history search for record browser filters"
```

### Task 2: 新建当前会话记录浏览状态与面板，替换 ConversationPane 顶部历史筛选条

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat/api.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/chat-record-browser-state.ts`
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-record-browser.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定“聊天记录”入口和记录面板骨架**

```js
test('conversation pane exposes a record-browser entry instead of inline history filters', () => {
  assert.match(conversationPane, /聊天记录/);
  assert.doesNotMatch(conversationPane, /class="chat-conversation-pane__filter-bar"/);
  assert.match(chatShellPage, /<ChatRecordBrowserPanel/);
});
```

- [ ] **Step 2: 扩展前端 API，给记录面板传递 role/content 过滤条件**

```ts
export function searchChatHistory(
  sessionKey: string,
  options: {
    query: string;
    role?: ChatHistorySearchRoleFilter;
    content?: ChatHistorySearchContentFilter;
    before?: string | null;
    limit?: number;
  },
): Promise<ChatHistorySearchPayload> {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/search`, window.location.origin);
  url.searchParams.set('q', options.query);
  url.searchParams.set('role', options.role || 'all');
  url.searchParams.set('content', options.content || 'all');
  return requestChatJson<ChatHistorySearchPayload>(`${url.pathname}${url.search}`);
}
```

- [ ] **Step 3: 新建记录浏览状态 composable，和主消息流状态解耦**

```ts
export function useChatRecordBrowserState() {
  const open = ref(false);
  const query = ref('');
  const roleFilter = ref<ChatHistorySearchRoleFilter>('all');
  const contentFilter = ref<ChatHistorySearchContentFilter>('all');
  const loading = ref(false);
  const errorMessage = ref('');
  const payload = ref<ChatHistorySearchPayload | null>(null);

  const groupedMatches = computed(() => groupSearchMatchesByDay(payload.value?.matches || []));

  return { open, query, roleFilter, contentFilter, loading, errorMessage, payload, groupedMatches };
}
```

- [ ] **Step 4: 新建 `ChatRecordBrowserPanel.vue`，桌面走右侧抽屉，移动端走 Dialog sheet**

```vue
<template>
  <DialogRoot v-if="compact" :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="chat-record-browser-mask" />
      <DialogContent as-child>
        <section class="chat-record-browser chat-record-browser--sheet">
          <!-- query / role / content / grouped results -->
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <aside v-else-if="open" class="chat-record-browser chat-record-browser--dock">
    <!-- same result list -->
  </aside>
</template>
```

- [ ] **Step 5: 在 `ConversationPane` 增加“聊天记录”按钮，并移除顶部 inline history filter**

```vue
<button
  v-if="selectedSession"
  type="button"
  class="chat-conversation-pane__icon-btn chat-conversation-pane__icon-btn--desktop-secondary"
  :class="{ active: recordBrowserOpen }"
  :title="text('聊天记录', 'Chat records')"
  @click="$emit('toggle-record-browser')"
>
  ☰
</button>
```

- [ ] **Step 6: 在 `ChatShellPage` 接管记录浏览状态、检索、跳转高亮与刷新保留**

```ts
const recordBrowser = useChatRecordBrowserState();

async function runRecordBrowserSearch(): Promise<void> {
  if (!selectedSessionKey.value || !recordBrowser.query.value.trim()) return;
  recordBrowser.loading.value = true;
  recordBrowser.payload.value = await searchChatHistory(selectedSessionKey.value, {
    query: recordBrowser.query.value.trim(),
    role: recordBrowser.roleFilter.value,
    content: recordBrowser.contentFilter.value,
    limit: 50,
  });
  recordBrowser.loading.value = false;
}
```

- [ ] **Step 7: 运行前端类型检查和记录面板结构测试**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm run typecheck:web && node --test tests/system/studio-web-chat-record-browser.test.mjs`

Expected:

```text
PASS tests/system/studio-web-chat-record-browser.test.mjs
```

- [ ] **Step 8: 提交记录浏览面板与状态拆分**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/chat/api.ts \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/chat-record-browser-state.ts \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue \
  extensions/openclaw-studio/tests/system/studio-web-chat-record-browser.test.mjs
git commit -m "feat: add current-chat record browser panel"
```

### Task 3: 把待发送队列收口为紧凑栏 + 展开面板，并保证空队列不显示

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-queue-bar.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-shell-foundation.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定“无队列不显示、默认折叠、移动端用 sheet”**

```js
test('queue rail stays hidden when empty and expands into a compact summary first', () => {
  assert.match(queuedMessageRail, /v-if="items.length"/);
  assert.match(queuedMessageRail, /summaryExpanded/);
  assert.match(chatShellPage, /mobileQueueSheetOpen/);
});
```

- [ ] **Step 2: 把 `QueuedMessageRail` 改成“摘要头 + 可展开正文”结构**

```vue
<template>
  <section v-if="items.length" class="chat-queue-rail" :class="{ expanded: expanded }">
    <button type="button" class="chat-queue-rail__summary" @click="$emit('toggle-expanded')">
      <strong>{{ text(`待发送 ${items.length}`, `Queued ${items.length}`) }}</strong>
      <span>{{ firstPreview }}</span>
    </button>
    <div v-if="expanded" class="chat-queue-rail__list">
      <!-- existing item editor -->
    </div>
  </section>
</template>
```

- [ ] **Step 3: 在 `ChatShellPage` 为桌面展开和手机 sheet 建独立开关**

```ts
const queueExpandedBySession = ref<Record<string, boolean>>({});
const mobileQueueSheetOpen = ref(false);

const selectedQueueExpanded = computed(() => Boolean(queueExpandedBySession.value[selectedSessionKey.value || '']));
```

- [ ] **Step 4: 保持已入队消息立刻可见，且空队列时完全收起**

```ts
const selectedQueuedItems = computed(() => queuedItemsBySession.value[selectedSessionKey.value || ''] || []);
const shouldShowQueueRail = computed(() => selectedQueuedItems.value.length > 0);
```

- [ ] **Step 5: 运行队列 UI 结构测试与前端类型检查**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm run typecheck:web && node --test tests/system/studio-web-chat-queue-bar.test.mjs tests/system/studio-web-chat-shell-foundation.test.mjs`

Expected:

```text
PASS tests/system/studio-web-chat-queue-bar.test.mjs
PASS tests/system/studio-web-chat-shell-foundation.test.mjs
```

- [ ] **Step 6: 提交队列栏压缩与移动端展开行为**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  extensions/openclaw-studio/tests/system/studio-web-chat-queue-bar.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-chat-shell-foundation.test.mjs
git commit -m "feat: compact chat queue rail into expandable panel"
```

### Task 4: 重构会话列表为 `全部 / 文件夹 / 归档`，并扩展会话元数据搜索/筛选

**Files:**
- Create: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListScopeTabs.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionFilterBar.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionRowList.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-filters.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-view-model.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-shared.css`
- Modify: `extensions/openclaw-studio/lib/chat-session-list-state.ts`
- Modify: `extensions/openclaw-studio/tests/chat/chat-session-list-state.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-session-list-im.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-mobile-sidebar.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定三分区 tabs 与 IM 化元信息搜索**

```js
test('session list exposes all folders archived scope tabs and metadata search', () => {
  assert.match(sessionListPanel, /<SessionListScopeTabs/);
  assert.match(sessionFilterBar, /Search title, agent, preview, source/);
});
```

- [ ] **Step 2: 扩展 list-state 过滤函数，搜索 title/agent/preview/source/folder 标签**

```ts
export function sessionMatchesListFilter(params: {
  selectedAgentId: string;
  selectedSourceId: string;
  sessionAgentId: string;
  sessionSourceId: string;
  normalizedQuery: string;
  searchableText: string;
}): boolean {
  if (params.selectedAgentId !== 'all' && params.sessionAgentId !== params.selectedAgentId) return false;
  if (params.selectedSourceId !== 'all' && params.sessionSourceId !== params.selectedSourceId) return false;
  return !params.normalizedQuery || params.searchableText.toLowerCase().includes(params.normalizedQuery);
}
```

- [ ] **Step 3: 在 view model 中加入 `listScope`，让 `全部 / 文件夹 / 归档` 成为顶层模式**

```ts
const listScope = ref<'all' | 'folders' | 'archived'>('all');

const baseActiveSessions = computed(() => listScope.value === 'all' ? rootActiveSessions.value : []);
const baseArchivedSessions = computed(() => listScope.value === 'archived' ? params.archivedSessions.value : []);
const visibleFolderEntries = computed(() => listScope.value === 'folders' ? filteredFolders.value : []);
```

- [ ] **Step 4: 新建 `SessionListScopeTabs.vue`，并把它插入 `SessionListPanel` 头部和筛选条之间**

```vue
<template>
  <nav class="chat-session-scope-tabs" aria-label="Chat scope tabs">
    <button :class="{ active: modelValue === 'all' }" @click="$emit('update:model-value', 'all')">全部</button>
    <button :class="{ active: modelValue === 'folders' }" @click="$emit('update:model-value', 'folders')">文件夹</button>
    <button :class="{ active: modelValue === 'archived' }" @click="$emit('update:model-value', 'archived')">归档</button>
  </nav>
</template>
```

- [ ] **Step 5: 扩展 `SessionFilterBar`，让筛选面板至少支持 `Agent + Source` 两类结构化条件**

```vue
<div class="chat-shell-session-filter-field">
  <span>{{ text('来源', 'Source') }}</span>
  <div class="chat-shell-session-filter-agent-list">
    <button :class="{ active: selectedSourceFilter === 'all' }" @click="$emit('update:selected-source-filter', 'all')">
      {{ text('全部来源', 'All sources') }}
    </button>
  </div>
</div>
```

- [ ] **Step 6: 运行状态层和移动端结构测试**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && node --test tests/chat/chat-session-list-state.test.mjs tests/system/studio-web-chat-session-list-im.test.mjs tests/system/studio-web-chat-mobile-sidebar.test.mjs`

Expected:

```text
PASS tests/chat/chat-session-list-state.test.mjs
PASS tests/system/studio-web-chat-session-list-im.test.mjs
PASS tests/system/studio-web-chat-mobile-sidebar.test.mjs
```

- [ ] **Step 7: 提交会话列表 IA 重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListScopeTabs.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionFilterBar.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionRowList.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-filters.ts \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-view-model.ts \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/session-list-shared.css \
  extensions/openclaw-studio/lib/chat-session-list-state.ts \
  extensions/openclaw-studio/tests/chat/chat-session-list-state.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-chat-session-list-im.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-chat-mobile-sidebar.test.mjs
git commit -m "feat: rebuild chat session list as im-style scopes"
```

### Task 5: 统一加载/空态/错误态，并完成桌面、平板、手机三档响应式重排

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-shell-foundation.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-chat-responsive-rendering.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定四类状态和手机端面板重排**

```js
test('chat shell exposes loading empty error ready surfaces for list queue and record browser', () => {
  assert.match(chatShellPage, /historyErrorMessage/);
  assert.match(sessionListPanel, /chat-shell-session-list__empty/);
  assert.match(recordBrowser, /chat-record-browser__empty/);
  assert.match(queuedMessageRail, /chat-queue-rail__empty/);
});
```

- [ ] **Step 2: 把会话列表、记录面板、队列栏统一成 `loading / empty / error / ready` 四态渲染**

```vue
<template v-if="loading">
  <div class="chat-record-browser__state">{{ text('正在检索记录...', 'Loading records...') }}</div>
</template>
<template v-else-if="errorMessage">
  <div class="chat-record-browser__state error">{{ errorMessage }}</div>
</template>
<template v-else-if="!groupedMatches.length">
  <div class="chat-record-browser__state empty">{{ text('没有匹配结果。', 'No matching records.') }}</div>
</template>
```

- [ ] **Step 3: 在 `ConversationPane` 和 `ChatShellPage` 里把手机端入口重排到底部动作栏和独立 sheet**

```ts
const isCompactViewport = useCompactViewport();
const mobileRecordBrowserOpen = computed({
  get: () => isCompactViewport.value && recordBrowser.open.value,
  set: (value) => { recordBrowser.open.value = value; },
});
```

- [ ] **Step 4: 运行 UI 基础和响应式结构测试**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm run typecheck:web && node --test tests/system/studio-web-chat-shell-foundation.test.mjs tests/system/studio-web-chat-responsive-rendering.test.mjs`

Expected:

```text
PASS tests/system/studio-web-chat-shell-foundation.test.mjs
PASS tests/system/studio-web-chat-responsive-rendering.test.mjs
```

- [ ] **Step 5: 提交状态面与响应式收口**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatRecordBrowserPanel.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/QueuedMessageRail.vue \
  extensions/openclaw-studio/tests/system/studio-web-chat-shell-foundation.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-chat-responsive-rendering.test.mjs
git commit -m "feat: align chat surface states and responsive layout"
```

### Task 6: 文档更新、全量验证与交付提交

**Files:**
- Modify: `extensions/openclaw-studio/docs/当前进展.md`

- [ ] **Step 1: 更新当前进展文档，记录本轮 Chat surface 收口**

```md
## 2026-04-11

- Chat 会话列表重构为 `全部 / 文件夹 / 归档`
- 当前会话聊天记录面板上线，支持完整历史检索、角色/内容过滤与结果跳转
- 待发送队列收口为紧凑栏 + 移动端 sheet
- 三端状态面统一为 loading / empty / error / ready
```

- [ ] **Step 2: 运行后端、前端、system 组合验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run build:api
npm run typecheck:web
npm run build:web
node --test tests/chat/service.history-page.test.mjs tests/chat/chat-session-list-state.test.mjs
node --test \
  tests/system/studio-web-chat-record-browser.test.mjs \
  tests/system/studio-web-chat-queue-bar.test.mjs \
  tests/system/studio-web-chat-session-list-im.test.mjs \
  tests/system/studio-web-chat-shell-foundation.test.mjs \
  tests/system/studio-web-chat-mobile-sidebar.test.mjs \
  tests/system/studio-web-chat-responsive-rendering.test.mjs
```

Expected:

```text
All selected API, web, and system tests pass with exit code 0.
```

- [ ] **Step 3: 运行聊天表面 smoke**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm run smoke:chat:im`

Expected:

```text
The acceptance runner exits with code 0 and no unhandled browser errors.
```

- [ ] **Step 4: 提交最终文档与实现收口**

```bash
cd /home/binbin/.openclaw
git add extensions/openclaw-studio/docs/当前进展.md
git commit -m "docs: update chat surface im rollout progress"
```

- [ ] **Step 5: 生成交付摘要**

```text
- backend search/index filters shipped
- record browser shipped
- queue bar compacted
- session list IA rebuilt
- responsive/state regressions verified
```
