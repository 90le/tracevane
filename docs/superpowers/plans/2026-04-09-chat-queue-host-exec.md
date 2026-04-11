# Studio Chat 队列与宿主管理 Exec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Studio Chat 实现每 session 待发送队列与宿主管理 Exec 双开关能力，并消除运行中第二条消息“消失”的竞态。

**Architecture:** 队列和 session 临时控制状态都放到 Studio chat service 的内存态，通过新增 HTTP 接口与 chat 实时事件同步给前端；全局宿主管理 Exec 开关持久化到 `plugins.entries.studio.config`，最终由 hook 判断全局开关与 session 临时开关同时满足后才放行。

**Tech Stack:** TypeScript, Vue 3, Studio API router, in-memory session state, node:test, existing chat websocket/event stream

---

### Task 1: 锁定服务端队列与控制状态契约

**Files:**
- Modify: `types/chat.ts`
- Modify: `tests/chat/service.session-actions.test.mjs`
- Modify: `tests/chat/studio-delivery-hooks.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖宿主管理 Exec 双开关**

```js
test('buildStudioBeforeToolCallResult only allows host-management exec when global and session switches are both enabled', () => {
  // default off => blocked
  // global on only => blocked
  // session on only => blocked
  // both on => undefined
});
```

- [ ] **Step 2: 写失败测试，覆盖 queue/controls 基本接口行为**

```js
test('session queue survives refresh-style reads but session controls and queue are memory-only', async () => {
  // create session
  // enqueue item
  // read queue + controls back from service
  // assert entry exists and control state round-trips
});
```

- [ ] **Step 3: 扩展 chat 类型**

```ts
export interface ChatQueuedMessageItem { /* ... */ }
export interface ChatQueuePayload { /* ... */ }
export interface ChatSessionControlState { /* ... */ }
```

- [ ] **Step 4: 运行最小验证，确认当前失败**

Run: `npm run build:api`
Expected: FAIL 或测试断言失败，因为新类型/行为尚未实现

### Task 2: 实现服务端 session 队列与控制状态

**Files:**
- Modify: `apps/api/modules/chat/service.ts`
- Modify: `apps/api/modules/chat/routes.ts`
- Modify: `apps/api/modules/chat/contract.ts`
- Modify: `types/chat.ts`

- [ ] **Step 1: 扩展 `StudioManagedSessionState`**

```ts
interface StudioManagedSessionState {
  // existing fields
  pendingQueue: ChatQueuedMessageItem[];
  controls: ChatSessionControlState;
}
```

- [ ] **Step 2: 为新建/加载 session 提供默认值**

```ts
pendingQueue: [],
controls: {
  allowHostManagementExec: false,
  updatedAt: null,
},
```

- [ ] **Step 3: 增加 queue/controls service 方法**

```ts
getQueue(sessionKey)
enqueue(sessionKey, payload)
patchQueueEntry(sessionKey, entryId, payload)
deleteQueueEntry(sessionKey, entryId)
getControls(sessionKey)
patchControls(sessionKey, payload)
```

- [ ] **Step 4: 注册新路由**

```ts
router.get('/api/chat/sessions/:sessionKey/queue', ...)
router.post('/api/chat/sessions/:sessionKey/queue', ...)
router.patch('/api/chat/sessions/:sessionKey/queue/:entryId', ...)
router.delete('/api/chat/sessions/:sessionKey/queue/:entryId', ...)
router.get('/api/chat/sessions/:sessionKey/controls', ...)
router.patch('/api/chat/sessions/:sessionKey/controls', ...)
```

- [ ] **Step 5: 运行编译验证**

Run: `npm run build:api`
Expected: PASS

### Task 3: 实现自动 FIFO 续发与 blocked 转换

**Files:**
- Modify: `apps/api/modules/chat/service.ts`
- Modify: `lib/studio-delivery-hooks.ts`
- Modify: `tests/chat/service.session-actions.test.mjs`

- [ ] **Step 1: 抽出真实发送内部方法**

```ts
async function performDirectSend(sessionKey: string, payload: ChatSendRequest): Promise<ChatSendAck> {
  // existing send body
}
```

- [ ] **Step 2: 新增 `flushQueueIfIdle`**

```ts
async function flushQueueIfIdle(sessionKey: string): Promise<void> {
  // no activeRunId => shift next queued item
  // validate host-management exec permissions
  // blocked => keep item, mark blockedReason
  // allowed => performDirectSend
}
```

- [ ] **Step 3: 在 terminal runtime 收口点触发 flush**

```ts
if (runtime.state === 'completed' || runtime.state === 'aborted' || runtime.state === 'error') {
  void flushQueueIfIdle(sessionKey);
}
```

- [ ] **Step 4: 增加测试**

```js
test('queued entries flush in FIFO order after active run settles', async () => {});
test('queued host-management exec becomes blocked when session toggle is off before dispatch', async () => {});
```

- [ ] **Step 5: 运行测试**

Run: `npm run build:api && node --test tests/chat/service.session-actions.test.mjs tests/chat/studio-delivery-hooks.test.mjs`
Expected: PASS

### Task 4: 扩展实时事件与前端 API

**Files:**
- Modify: `types/chat.ts`
- Modify: `apps/web-vue/src/features/chat/api.ts`
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`

- [ ] **Step 1: 增加流事件类型**

```ts
| { kind: 'queue.state'; sessionKey: string; emittedAt: string; queue: ChatQueuedMessageItem[]; }
| { kind: 'session.controls'; sessionKey: string; emittedAt: string; controls: ChatSessionControlState; }
```

- [ ] **Step 2: 增加前端 API 封装**

```ts
fetchChatQueue()
enqueueChatMessage()
patchQueuedChatMessage()
deleteQueuedChatMessage()
fetchChatSessionControls()
patchChatSessionControls()
```

- [ ] **Step 3: 在 socket/bootstrap 时同步新事件**

```ts
handle queue.state
handle session.controls
```

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck:web`
Expected: PASS

### Task 5: 替换前端“禁止发送”临时逻辑为真正队列栏

**Files:**
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Modify: `apps/web-vue/src/features/chat-v2/ComposerBar.vue`
- Modify: `apps/web-vue/src/style.css`

- [ ] **Step 1: 删除运行中直接报错的发送分支**

```ts
if (activeRuntime.value?.activeRunId) {
  await enqueueChatMessage(...)
  return
}
```

- [ ] **Step 2: 新增队列栏状态与编辑态**

```ts
const pendingQueue = ref<ChatQueuedMessageItem[]>([])
const queueEditingEntryId = ref('')
```

- [ ] **Step 3: 在 composer 上方渲染队列栏**

```vue
<section class="chat-queue-rail">
  <!-- queued items -->
</section>
```

- [ ] **Step 4: 实现编辑/删除交互**

```ts
function editQueuedMessage(entryId: string) { /* hydrate composer */ }
async function saveQueueEdit(entryId: string) { /* patch queue */ }
async function removeQueuedMessage(entryId: string) { /* delete queue */ }
```

- [ ] **Step 5: 运行前端构建**

Run: `npm run typecheck:web && npm run build:web`
Expected: PASS

### Task 6: 实现全局显眼开关与 session 临时开关

**Files:**
- Modify: `types/config.ts`
- Modify: `apps/api/modules/config/service.ts`
- Modify: `apps/web-vue/src/features/config/ConfigEditorPage.vue`
- Modify: `lib/studio-delivery-hooks.ts`
- Modify: `index.ts`

- [ ] **Step 1: 为 config summary/update 增加 Studio Chat 宿主管理 Exec 设置**

```ts
studioChat: {
  allowHostManagementExecInStudioChat: boolean;
}
```

- [ ] **Step 2: 读写到 `plugins.entries.studio.config.chat`**

```ts
openclawConfig.plugins.entries.studio.config.chat.allowHostManagementExecInStudioChat = ...
```

- [ ] **Step 3: 在安全页增加显眼警示卡**

```vue
<section class="studio-chat-exec-guard-card warning-card">
  <!-- strong label + explanation + toggle -->
</section>
```

- [ ] **Step 4: 在 chat 页头部增加 session 临时开关**

```vue
<button class="session-host-exec-toggle">...</button>
```

- [ ] **Step 5: hook 根据全局+session 状态双重校验**

```ts
if (!globalEnabled || !sessionEnabled) return blocked;
```

- [ ] **Step 6: 运行验证**

Run: `npm run build:api && npm run typecheck:web`
Expected: PASS

### Task 7: 文档、回归与提交

**Files:**
- Modify: `docs/当前进展.md`
- Modify: `docs/聊天设计方案.md`
- Modify: `docs/聊天契约.md`
- Modify: `docs/系统架构.md`

- [ ] **Step 1: 更新文档**

```md
- 新增 session 级待发送队列
- 新增 Studio Chat 宿主管理 Exec 双开关
- 刷新保留 / 重启清空 的状态边界
```

- [ ] **Step 2: 运行回归**

Run: `npm run build:api && npm run typecheck:web && npm run build:web && node --test tests/chat/service.session-actions.test.mjs tests/chat/studio-delivery-hooks.test.mjs`
Expected: PASS

- [ ] **Step 3: 中文提交**

```bash
git add docs/superpowers/specs/2026-04-09-chat-queue-host-exec-design.md \
  docs/superpowers/plans/2026-04-09-chat-queue-host-exec.md \
  apps/api/modules/chat/service.ts \
  apps/api/modules/chat/routes.ts \
  apps/api/modules/config/service.ts \
  apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  apps/web-vue/src/features/config/ConfigEditorPage.vue \
  lib/studio-delivery-hooks.ts \
  types/chat.ts \
  types/config.ts \
  tests/chat/service.session-actions.test.mjs \
  tests/chat/studio-delivery-hooks.test.mjs
git commit -m "实现 Studio Chat 队列与宿主管理 Exec 双开关"
```
