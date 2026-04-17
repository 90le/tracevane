# Studio 确认对话框全量收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 OpenClaw Studio 前端现有所有 `window.confirm` 迁移到同一套 Studio 自有确认对话框，并保持原有业务触发时机与文案语义不变。

**Architecture:** 在 `apps/web-vue/src/shared/` 下新增一个最小共享确认层：`useConfirmDialog.ts` 负责保存唯一的待确认状态并返回 `Promise<boolean>`，`ConfirmDialog.vue` 负责在应用根部渲染统一确认弹窗。业务页面只把 `window.confirm(...)` 改成 `await confirm({...})`；离页确认继续保留在各页面自己的 `onBeforeRouteLeave` 中，但改为走同一套异步确认 UI。

**Tech Stack:** TypeScript, Vue 3, Vue Router 4, shared global CSS in `apps/web-vue/src/style.css`, `node:test` source contract tests, `tsc` typecheck

---

## Execution Boundary

- 在专用 worktree 中执行实现，不要直接在当前主工作区动手。
- 只修改 `extensions/openclaw-studio/apps/web-vue/src/` 与 `extensions/openclaw-studio/tests/system/`。
- 不新增新的测试框架；继续使用现有 `node:test` 文件契约测试和 `npm run typecheck --workspace=apps/web-vue`。
- 每完成一轮可验证改动都单独提交一次中文 commit。
- 完成代码改动后运行：

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
python3.12 ~/.claude/graphify-rebuild.py .
```

## File Map

**Shared confirm foundation**

- Create: `extensions/openclaw-studio/apps/web-vue/src/shared/composables/useConfirmDialog.ts`
- Create: `extensions/openclaw-studio/apps/web-vue/src/shared/components/ConfirmDialog.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/App.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`

**Pages to migrate**

- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/dreaming/DreamingControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/system/SystemControlPage.vue`

**Tests**

- Create: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-foundation.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-migration.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`

---

### Task 1: 先锁定共享确认层和迁移范围的失败测试

**Files:**
- Create: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-foundation.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-migration.test.mjs`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`

- [ ] **Step 1: 写共享确认层失败测试，锁定 App 挂载点与共享文件契约**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

test('app mounts a shared confirm dialog host', () => {
  const dialogPath = path.join(rootDir, 'apps/web-vue/src/shared/components/ConfirmDialog.vue');
  const composablePath = path.join(rootDir, 'apps/web-vue/src/shared/composables/useConfirmDialog.ts');

  assert.ok(fs.existsSync(dialogPath), 'ConfirmDialog.vue should exist');
  assert.ok(fs.existsSync(composablePath), 'useConfirmDialog.ts should exist');

  const app = read('apps/web-vue/src/App.vue');
  const dialog = read('apps/web-vue/src/shared/components/ConfirmDialog.vue');
  const composable = read('apps/web-vue/src/shared/composables/useConfirmDialog.ts');

  assert.match(app, /import ConfirmDialog from '\.\/shared\/components\/ConfirmDialog\.vue';/);
  assert.match(app, /<ConfirmDialog\s*\/>/);
  assert.match(dialog, /class="studio-confirm-mask"/);
  assert.match(dialog, /class="studio-confirm-dialog"/);
  assert.match(dialog, /class="studio-confirm-actions"/);
  assert.match(composable, /export interface ConfirmDialogOptions/);
  assert.match(composable, /async function confirm\(options: ConfirmDialogOptions\): Promise<boolean>/);
  assert.match(composable, /activeConfirmDialog/);
});
```

- [ ] **Step 2: 写迁移范围失败测试，锁定“全量去掉 window.confirm”**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const confirmFiles = [
  'apps/web-vue/src/App.vue',
  'apps/web-vue/src/features/agents/AgentSessionsPage.vue',
  'apps/web-vue/src/features/agents/AgentBindingsPage.vue',
  'apps/web-vue/src/features/channels/ChannelBindingsPage.vue',
  'apps/web-vue/src/features/channels/ChannelAccessControlPage.vue',
  'apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue',
  'apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue',
  'apps/web-vue/src/features/channels/ChannelsControlPage.vue',
  'apps/web-vue/src/features/chat-v2/ChatShellPage.vue',
  'apps/web-vue/src/features/cron/CronControlPage.vue',
  'apps/web-vue/src/features/dreaming/DreamingControlPage.vue',
  'apps/web-vue/src/features/system/SystemControlPage.vue',
];

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

test('confirm migration removes browser confirm from all scoped pages', () => {
  for (const filePath of confirmFiles) {
    const source = read(filePath);
    assert.doesNotMatch(source, /window\.confirm/);
  }
});

test('destructive pages import the shared confirm composable', () => {
  assert.match(read('apps/web-vue/src/features/agents/AgentSessionsPage.vue'), /useConfirmDialog/);
  assert.match(read('apps/web-vue/src/features/channels/ChannelsControlPage.vue'), /useConfirmDialog/);
  assert.match(read('apps/web-vue/src/features/chat-v2/ChatShellPage.vue'), /useConfirmDialog/);
  assert.match(read('apps/web-vue/src/features/system/SystemControlPage.vue'), /useConfirmDialog/);
});
```

- [ ] **Step 3: 把 channels 深页测试从“依赖 window.confirm”改成“依赖共享确认流”**

```js
test('deep-edit pages still guard against accidental navigation with shared confirm dialogs', () => {
  assert.match(providerSettingsPage, /onBeforeRouteLeave/);
  assert.doesNotMatch(providerSettingsPage, /window\.confirm/);
  assert.match(providerSettingsPage, /await confirm\(/);

  assert.match(accountDetailPage, /onBeforeRouteLeave/);
  assert.doesNotMatch(accountDetailPage, /window\.confirm/);
  assert.match(accountDetailPage, /await confirm\(/);

  assert.match(accessControlPage, /onBeforeRouteLeave/);
  assert.doesNotMatch(accessControlPage, /window\.confirm/);
  assert.match(accessControlPage, /await confirm\(/);
});
```

- [ ] **Step 4: 运行测试，确认现在确实失败**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
node --test \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs \
  tests/system/studio-web-confirm-dialog-migration.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs
```

Expected:

```text
FAIL because ConfirmDialog.vue and useConfirmDialog.ts do not exist yet
FAIL because scoped files still contain window.confirm
```

- [ ] **Step 5: 提交失败测试基线**

```bash
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" add \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs \
  tests/system/studio-web-confirm-dialog-migration.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" commit -m "测试：锁定确认对话框迁移契约"
```

### Task 2: 实现共享确认对话框基础设施并挂到 App 根部

**Files:**
- Create: `extensions/openclaw-studio/apps/web-vue/src/shared/composables/useConfirmDialog.ts`
- Create: `extensions/openclaw-studio/apps/web-vue/src/shared/components/ConfirmDialog.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/App.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-foundation.test.mjs`

- [ ] **Step 1: 写最小共享 confirm composable，实现唯一活动确认状态**

```ts
import { shallowRef } from 'vue';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

export interface ActiveConfirmDialog {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: 'default' | 'danger';
}

const activeConfirmDialog = shallowRef<ActiveConfirmDialog | null>(null);
let resolveActiveConfirm: ((value: boolean) => void) | null = null;

function settleConfirm(value: boolean): void {
  const resolve = resolveActiveConfirm;
  resolveActiveConfirm = null;
  activeConfirmDialog.value = null;
  resolve?.(value);
}

export function useConfirmDialog() {
  async function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (resolveActiveConfirm) {
      settleConfirm(false);
    }

    activeConfirmDialog.value = {
      title: options.title,
      message: options.message,
      detail: options.detail || '',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'default',
    };

    return await new Promise<boolean>((resolve) => {
      resolveActiveConfirm = resolve;
    });
  }

  return {
    activeConfirmDialog,
    confirm,
    confirmAccept: () => settleConfirm(true),
    confirmCancel: () => settleConfirm(false),
  };
}
```

- [ ] **Step 2: 写共享 ConfirmDialog 组件，负责遮罩、Esc、取消和确认按钮**

```vue
<template>
  <Teleport to="body">
    <div v-if="activeConfirmDialog" class="studio-confirm-mask" @click="confirmCancel"></div>
    <section
      v-if="activeConfirmDialog"
      class="studio-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-confirm-title"
      aria-describedby="studio-confirm-description"
    >
      <div class="skills-section-head compact">
        <h4 id="studio-confirm-title">{{ activeConfirmDialog.title }}</h4>
        <p id="studio-confirm-description">{{ activeConfirmDialog.message }}</p>
      </div>

      <div v-if="activeConfirmDialog.detail" class="studio-confirm-detail">
        {{ activeConfirmDialog.detail }}
      </div>

      <div class="studio-confirm-actions">
        <button type="button" class="secondary-button" @click="confirmCancel">
          {{ activeConfirmDialog.cancelLabel }}
        </button>
        <button
          type="button"
          class="primary-button"
          :class="{ danger: activeConfirmDialog.tone === 'danger' }"
          @click="confirmAccept"
        >
          {{ activeConfirmDialog.confirmLabel }}
        </button>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useConfirmDialog } from '../composables/useConfirmDialog';

const { activeConfirmDialog, confirmAccept, confirmCancel } = useConfirmDialog();

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeConfirmDialog.value) {
    confirmCancel();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEscape);
  if (activeConfirmDialog.value) {
    confirmCancel();
  }
});
</script>
```

- [ ] **Step 3: 在 App 根部挂载 ConfirmDialog，并补共享样式**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTrigger, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute } from 'vue-router';
import StudioSidebarRail from './components/StudioSidebarRail.vue';
import ConfirmDialog from './shared/components/ConfirmDialog.vue';
// existing imports...
</script>

<template>
  <TooltipProvider :delay-duration="140" :skip-delay-duration="80" :disable-hoverable-content="true">
    <div class="app-container" :class="{ mobile: isMobile, 'sidebar-collapsed': !isMobile && sidebarCollapsed, 'chat-shell': isChatSurface }">
      <!-- existing app shell -->
      <main class="main-content shell-main" :class="{ 'chat-surface-route': isChatSurface, 'shell-main-chat': isChatSurface }">
        <RouterView v-slot="{ Component }">
          <section class="shell-route-stage" :class="{ 'shell-route-stage-chat': isChatSurface }">
            <component :is="Component" />
          </section>
        </RouterView>
      </main>
      <ConfirmDialog />
    </div>
  </TooltipProvider>
</template>
```

```css
.studio-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(6, 12, 20, 0.58);
  backdrop-filter: blur(8px);
}

.studio-confirm-dialog {
  position: fixed;
  inset: 50% auto auto 50%;
  z-index: 1301;
  width: min(460px, calc(100vw - 32px));
  padding: 18px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--surface-strong) 94%, transparent);
  box-shadow: var(--shadow);
  transform: translate(-50%, -50%);
}

.studio-confirm-detail {
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.studio-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.primary-button.danger {
  background: linear-gradient(135deg, rgba(255, 154, 154, 0.94), rgba(255, 206, 174, 0.9));
  color: #1b1414;
}
```

- [ ] **Step 4: 运行基础测试和 typecheck，确认共享层可用**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test tests/system/studio-web-confirm-dialog-foundation.test.mjs
```

Expected:

```text
PASS typecheck
PASS tests/system/studio-web-confirm-dialog-foundation.test.mjs
```

- [ ] **Step 5: 提交共享确认基础设施**

```bash
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" add \
  apps/web-vue/src/shared/composables/useConfirmDialog.ts \
  apps/web-vue/src/shared/components/ConfirmDialog.vue \
  apps/web-vue/src/App.vue \
  apps/web-vue/src/style.css \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" commit -m "前端：新增共享确认对话框基础设施"
```

### Task 3: 迁移 agents / channels / system / cron / dreaming 的普通确认操作

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/App.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/dreaming/DreamingControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/system/SystemControlPage.vue`
- Test: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-migration.test.mjs`

- [ ] **Step 1: 先迁移 agents 与 channels 的删除确认**

```ts
import { useConfirmDialog } from '../../shared/composables/useConfirmDialog';

const { confirm } = useConfirmDialog();

async function removeBinding(bindingId: string): Promise<void> {
  if (!agentId.value || !bindingId) return;
  const ok = await confirm({
    title: text('确认删除绑定', 'Confirm binding deletion'),
    message: text('确定删除这条绑定吗？', 'Delete this binding?'),
    confirmLabel: text('删除', 'Delete'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!ok) return;

  bindingBusy.value = true;
  // existing delete flow...
}
```

```ts
async function deleteProvider(): Promise<void> {
  if (!channel.value) return;
  const channelType = channel.value.type;
  const ok = await confirm({
    title: text('确认删除频道', 'Confirm provider deletion'),
    message: text(
      `确定删除频道 ${channelType} 吗？该频道的账号和绑定也会一起移除。`,
      `Delete provider ${channelType}? Its accounts and bindings will also be removed.`
    ),
    confirmLabel: text('删除频道', 'Delete provider'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!ok) return;

  workspace.clearMessages();
  workspace.busyKey.value = 'delete-channel';
  // existing delete flow...
}
```

```ts
async function removeSession(sessionId: string): Promise<void> {
  if (!agentId.value || !sessionId) return;
  const ok = await confirm({
    title: text('确认删除会话', 'Confirm session deletion'),
    message: text('确定删除这条会话吗？该操作不可恢复。', 'Delete this session? This action cannot be undone.'),
    confirmLabel: text('删除会话', 'Delete session'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!ok) return;

  sessionBusy.value = true;
  // existing delete flow...
}
```

- [ ] **Step 2: 再迁移 App / System / Cron / Dreaming 的确认入口**

```ts
import { useConfirmDialog } from './shared/composables/useConfirmDialog';

const { confirm } = useConfirmDialog();

async function handleStudioUpgradeAction(): Promise<void> {
  // existing early returns...
  const target = studioRelease.value.latestVersion || '';
  const confirmed = await confirm({
    title: text('确认升级 Studio', 'Confirm Studio upgrade'),
    message: text(
      `确认升级到 v${target}？升级期间 Gateway 可能会重启。`,
      `Upgrade to v${target}? Gateway may restart during upgrade.`
    ),
    confirmLabel: text('开始升级', 'Start upgrade'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!confirmed) return;

  studioUpgradeBusy.value = true;
  // existing upgrade flow...
}
```

```ts
function confirmGroundedAction(action: DreamingActionKind): Promise<boolean> {
  if (action === 'reset-diary') {
    return confirm({
      title: text('确认重置 Dream Diary 回填', 'Confirm Dream Diary reset'),
      message: text(
        '这会移除 DREAMS.md 里由 grounded backfill 写入的条目。继续吗？',
        'This removes grounded backfill entries from DREAMS.md. Continue?'
      ),
      confirmLabel: text('继续清理', 'Continue'),
      cancelLabel: text('取消', 'Cancel'),
      tone: 'danger',
    });
  }

  return confirm({
    title: text('确认清理 grounded short-term', 'Confirm grounded short-term cleanup'),
    message: text(
      '这会清理仅由 grounded replay 产生、且还没有 live support 的 short-term 条目。继续吗？',
      'This clears grounded-only short-term entries that still lack live support. Continue?'
    ),
    confirmLabel: text('继续清理', 'Continue'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
}
```

- [ ] **Step 3: 跑迁移测试，确认普通动作确认已全部脱离 window.confirm**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs \
  tests/system/studio-web-confirm-dialog-migration.test.mjs
```

Expected:

```text
PASS typecheck
PASS both confirm dialog system tests
```

- [ ] **Step 4: 提交普通动作确认迁移**

```bash
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" add \
  apps/web-vue/src/App.vue \
  apps/web-vue/src/features/agents/AgentSessionsPage.vue \
  apps/web-vue/src/features/agents/AgentBindingsPage.vue \
  apps/web-vue/src/features/channels/ChannelBindingsPage.vue \
  apps/web-vue/src/features/channels/ChannelsControlPage.vue \
  apps/web-vue/src/features/cron/CronControlPage.vue \
  apps/web-vue/src/features/dreaming/DreamingControlPage.vue \
  apps/web-vue/src/features/system/SystemControlPage.vue \
  tests/system/studio-web-confirm-dialog-migration.test.mjs
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" commit -m "前端：迁移管理页确认对话框"
```

### Task 4: 迁移 chat destructive actions 与 channels 离页确认，并完成总验证

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-foundation.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-confirm-dialog-migration.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-channels-deep-pages.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-chat-exec-confirm-dialog.test.mjs`

- [ ] **Step 1: 把 channels 三个离页守卫改成 await confirm 的异步放行**

```ts
import { useConfirmDialog } from '../../shared/composables/useConfirmDialog';

const { confirm } = useConfirmDialog();

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true;
  return await confirm({
    title: text('确认离开页面', 'Confirm page leave'),
    message: text('当前还有未保存更改，确定要离开这个页面吗？', 'You have unsaved changes. Leave this page anyway?'),
    confirmLabel: text('离开页面', 'Leave page'),
    cancelLabel: text('继续编辑', 'Keep editing'),
    tone: 'danger',
  });
});
```

- [ ] **Step 2: 把 ChatShellPage 的删除文件夹、批量删除、单条删除都改成共享 confirm**

```ts
import { useConfirmDialog } from '../../shared/composables/useConfirmDialog';

const { confirm } = useConfirmDialog();

if (payload.action === 'delete') {
  const confirmed = await confirm({
    title: text('确认删除文件夹', 'Confirm folder deletion'),
    message: text('删除文件夹后，其中会话会自动回到根目录。确认继续？', 'Delete this folder and return its chats to root?'),
    confirmLabel: text('删除文件夹', 'Delete folder'),
    cancelLabel: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!confirmed) {
    return;
  }
  const response = await deleteChatFolder(payload.folderId);
  // existing success flow...
}
```

```ts
const confirmed = await confirm({
  title: text('确认批量删除会话', 'Confirm batch chat deletion'),
  message: text(
    `将删除 ${sessionKeys.length} 个会话，并清理本地与远端记录。确认继续？`,
    `Delete ${sessionKeys.length} chats from Studio and the gateway?`
  ),
  confirmLabel: text('删除会话', 'Delete chats'),
  cancelLabel: text('取消', 'Cancel'),
  tone: 'danger',
});
if (!confirmed) {
  return;
}
```

```ts
const confirmed = await confirm({
  title: text('确认删除会话', 'Confirm chat deletion'),
  message: text('删除后会同时清理本地和远端会话记录，确认继续？', 'Delete this chat from both local Studio state and the gateway?'),
  confirmLabel: text('删除会话', 'Delete chat'),
  cancelLabel: text('取消', 'Cancel'),
  tone: 'danger',
});
if (!confirmed) {
  return;
}
```

- [ ] **Step 3: 跑总验证，包括 typecheck、确认迁移测试、channels 深页测试和图谱重建**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs \
  tests/system/studio-web-confirm-dialog-migration.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs \
  tests/system/studio-web-chat-exec-confirm-dialog.test.mjs
python3.12 ~/.claude/graphify-rebuild.py .
```

Expected:

```text
PASS typecheck
PASS all listed node tests
graphify rebuild finishes without error and refreshes graphify-out/GRAPH_REPORT.md
```

- [ ] **Step 4: 提交 chat 与离页确认迁移完成版**

```bash
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" add \
  apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  apps/web-vue/src/features/channels/ChannelAccessControlPage.vue \
  apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue \
  apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue \
  tests/system/studio-web-confirm-dialog-foundation.test.mjs \
  tests/system/studio-web-confirm-dialog-migration.test.mjs \
  tests/system/studio-web-channels-deep-pages.test.mjs \
  graphify-out/GRAPH_REPORT.md
git -C "/home/binbin/.openclaw/extensions/openclaw-studio" commit -m "前端：完成确认对话框全量收口"
```

---

## Self-Review

### Spec coverage

- 共享确认组件：Task 2
- 轻量 `confirm()` 调用层：Task 2
- 普通动作确认迁移：Task 3 + Task 4
- channels 离页确认迁移：Task 4
- 保持业务逻辑不变：Task 3 / Task 4 只改确认入口
- 测试与验收：Task 1 / Task 3 / Task 4
- 图谱重建：Task 4

### Placeholder scan

- 已避免 `TODO` / `TBD` / “后续再补” 之类占位语句。
- 每个需要改代码的步骤都给出了具体文件和代码块。
- 每个验证步骤都给出了精确命令和期望结果。

### Type consistency

- 统一使用 `ConfirmDialogOptions` / `activeConfirmDialog` / `confirm()` / `confirmAccept()` / `confirmCancel()`。
- 页面侧统一使用 `const { confirm } = useConfirmDialog();`。
- 所有离页确认统一返回 `await confirm({...})`。
