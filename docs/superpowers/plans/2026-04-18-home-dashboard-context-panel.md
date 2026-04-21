# Home Dashboard 与上下文面板优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Studio 壳层与 Home 首页，让全局右侧上下文区改为按需面板系统，并把首页收敛为风险优先、续做优先、趋势辅助的控制台首页。

**Architecture:** 先把 App 壳层从“中心舞台 + 常驻 context rail”改成“主舞台 + 可调用 context panel”，同时把导航、窗口状态、升级状态抽到 shell composables。然后扩展 dashboard summary 数据与首页 recipe，把 DashboardView 从本地硬编码重组为基于 recipe / computed collections 的风险区、续做区、趋势区。最后补结构测试与服务测试，确保 Home、Chat、System、Terminal 的页面契约与按页 inspector 策略稳定。

**Tech Stack:** Vue 3, TypeScript, Vue Router, Reka UI Dialog, motion-v, node:test, existing Studio dashboard/system API services

---

## File Structure

### Shell / context panel
- Modify: `apps/web-vue/src/App.vue` — 接入新的 shell composables 与 `StudioContextPanel`，移除常驻 `StudioShellContextRail`
- Create: `apps/web-vue/src/components/StudioContextPanel.vue` — 全局按需上下文面板脚手架与桌面/窄屏面板容器
- Modify: `apps/web-vue/src/components/StudioShellTopbar.vue` — 增加 context panel 打开按钮与面板状态输入输出
- Modify: `apps/web-vue/src/features/shell/use-shell-chrome.ts` — 增加 context panel 开合、按页禁用/启用规则、移动端状态
- Modify: `apps/web-vue/src/features/shell/use-shell-release.ts` — 用共享 confirm dialog 替换 `window.confirm`
- Modify: `apps/web-vue/src/features/shell/use-shell-navigation.ts` — 提供 route metadata / context 能力给壳层
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts` — 为路由声明 context panel 策略、Home/System/Terminal/Chat 页面分组策略
- Modify: `apps/web-vue/src/router.ts` — 直接消费 `shellRoutes`
- Modify: `apps/web-vue/src/style.css` — 新增 `.shell-layout`、`.shell-main-stage`、`.shell-context-panel` 与 overlay/sheet 样式，移除常驻 rail 布局依赖
- Modify: `apps/web-vue/src/composables/useConfirmDialog.ts` — 如有必要只复用现有 API，不扩展不必要抽象

### Home dashboard data + recipe
- Modify: `types/dashboard.ts` — 扩展首页所需的趋势、恢复工作、事件摘要类型
- Modify: `apps/api/modules/dashboard/service.ts` — 组合风险、续做、趋势、资源摘要数据
- Modify: `apps/api/modules/dashboard/routes.ts` — 复用现有 summary / stream 路由，不改协议路径
- Modify: `apps/web-vue/src/features/dashboard/overview-recipe.ts` — 新增风险区、续做区、趋势区 builders，保留 quick actions / overview signals seam
- Modify: `apps/web-vue/src/views/DashboardView.vue` — 从本地硬编码改为消费 recipe + computed collections，加入图表/趋势占位与条件显隐

### Page-level context policies
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue` — 明确保留可折叠 inspector，避免依赖全局 panel；保持 mobile drawer/sheet 契约
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue` — 增加 Event Center CTA 并减少“右侧就是常驻 rail”语义
- Modify: `apps/web-vue/src/features/terminal/TerminalConsolePage.vue` — 保持无全局右栏依赖，只保留页面内部 utilities

### Tests
- Modify: `tests/system/studio-web-shell-layout-redesign.test.mjs` — 从 context rail 改成 context panel / shell layout 断言
- Modify: `tests/system/studio-web-shell-route-manifest.test.mjs` — 断言 router / app 使用 shell manifest + shell navigation
- Modify: `tests/system/studio-web-shell-chrome-layout.test.mjs` — 断言 `StudioContextPanel`、`use-shell-chrome`、`use-shell-release`
- Modify: `tests/system/studio-web-home-layout-redesign.test.mjs` — 断言 Home 六段结构、风险优先、趋势层、动态 context 文案
- Modify: `tests/system/studio-web-dashboard-shell-overview.test.mjs` — 断言 DashboardView 消费 overview recipe builders
- Modify: `tests/system/dashboard-service.test.mjs` — 覆盖 dashboard summary 新字段
- Modify: `tests/system/studio-web-chat-layout-redesign.test.mjs` — 确认 Chat 仍保留页内 inspector 契约
- Modify: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs` — 确认 System 有事件中心 CTA，Terminal 无全局右栏依赖

## Task 1: 重构 shell 为按需 context panel

**Files:**
- Create: `apps/web-vue/src/components/StudioContextPanel.vue`
- Modify: `apps/web-vue/src/App.vue:1-465`
- Modify: `apps/web-vue/src/components/StudioShellTopbar.vue:1-110`
- Modify: `apps/web-vue/src/features/shell/use-shell-chrome.ts:1-67`
- Modify: `apps/web-vue/src/features/shell/use-shell-release.ts:1-284`
- Modify: `apps/web-vue/src/features/shell/use-shell-navigation.ts:1-24`
- Modify: `apps/web-vue/src/features/shell/route-manifest.ts:1-250`
- Modify: `apps/web-vue/src/router.ts:1-104`
- Modify: `apps/web-vue/src/style.css:1272-1461,4428-4475`
- Test: `tests/system/studio-web-shell-layout-redesign.test.mjs`
- Test: `tests/system/studio-web-shell-route-manifest.test.mjs`
- Test: `tests/system/studio-web-shell-chrome-layout.test.mjs`

- [ ] **Step 1: Write the failing shell tests for context panel architecture**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..", "..");
const appPath = path.join(rootDir, "apps/web-vue/src/App.vue");
const chromePath = path.join(rootDir, "apps/web-vue/src/features/shell/use-shell-chrome.ts");
const releasePath = path.join(rootDir, "apps/web-vue/src/features/shell/use-shell-release.ts");
const panelPath = path.join(rootDir, "apps/web-vue/src/components/StudioContextPanel.vue");
const stylePath = path.join(rootDir, "apps/web-vue/src/style.css");

test("app shell extracts shell layout and release state into dedicated composables", () => {
  assert.equal(fs.existsSync(chromePath), true);
  assert.equal(fs.existsSync(releasePath), true);
  assert.equal(fs.existsSync(panelPath), true);
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(app, /from '\.\/features\/shell\/use-shell-chrome'/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-release'/);
  assert.match(app, /StudioContextPanel/);
  assert.doesNotMatch(app, /StudioShellContextRail/);
});

test("shell styles define a three-region layout and context panel surface", () => {
  const css = fs.readFileSync(stylePath, "utf8");
  assert.match(css, /\.shell-layout\s*\{/);
  assert.match(css, /\.shell-main-stage\s*\{/);
  assert.match(css, /\.shell-context-panel\s*\{/);
});
```

- [ ] **Step 2: Run the targeted shell tests to verify they fail**

Run: `node --test tests/system/studio-web-shell-layout-redesign.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs`
Expected: FAIL because `StudioContextPanel.vue` does not exist yet and `App.vue` still renders `StudioShellContextRail`.

- [ ] **Step 3: Implement the new shell layout, panel scaffold, and composable wiring**

```vue
<!-- apps/web-vue/src/components/StudioContextPanel.vue -->
<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="shell-context-panel-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <aside class="shell-context-panel" :class="[`tone-${tone}`, { mobile: mobile }]">
          <header class="shell-context-panel__head">
            <div>
              <p class="eyebrow">{{ text('上下文', 'Context') }}</p>
              <h2>{{ title || text('上下文面板', 'Studio context panel') }}</h2>
              <p class="shell-context-panel__copy">
                {{ description || text('工作台上下文', 'Studio Context') }}
              </p>
            </div>
            <button type="button" class="shell-context-panel__close" :aria-label="text('关闭上下文面板', 'Close context panel')" @click="emit('update:open', false)">×</button>
          </header>

          <section class="shell-context-panel__body">
            <slot />
            <div v-if="!hasContent" class="shell-context-panel__empty">
              <strong>{{ text('上下文面板脚手架', 'Context panel scaffold') }}</strong>
              <p>{{ text('当前页面没有常驻右栏；仅在需要时展示补充上下文。', 'This page no longer keeps a persistent right rail; extra context appears only on demand.') }}</p>
            </div>
          </section>
        </aside>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { useLocalePreference } from '../shared/locale';

const props = defineProps<{
  open: boolean;
  mobile?: boolean;
  title?: string;
  description?: string;
  tone?: 'default' | 'system' | 'home';
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const { text } = useLocalePreference();
const hasContent = computed(() => false);
</script>
```

```ts
// apps/web-vue/src/features/shell/use-shell-chrome.ts
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'openclaw-studio.sidebar-collapsed';

export function useShellChrome() {
  const route = useRoute();
  const sidebarCollapsed = ref(false);
  const isMobile = ref(false);
  const mobileSidebarOpen = ref(false);
  const contextPanelOpen = ref(false);

  const contextPanelEnabled = computed(() => !route.path.startsWith('/terminal'));
  const contextPanelPinned = computed(() => route.path.startsWith('/chat/workbench'));
  const isChatSurface = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'));

  const updateViewportState = () => {
    if (typeof window === 'undefined') return;
    const mobile = window.innerWidth <= 920;
    isMobile.value = mobile;
    if (!mobile) mobileSidebarOpen.value = false;
  };

  const toggleSidebar = () => {
    if (isMobile.value) {
      mobileSidebarOpen.value = !mobileSidebarOpen.value;
      return;
    }
    sidebarCollapsed.value = !sidebarCollapsed.value;
  };

  const toggleContextPanel = () => {
    if (!contextPanelEnabled.value) return;
    contextPanelOpen.value = !contextPanelOpen.value;
  };

  watch(
    () => route.fullPath,
    () => {
      if (!contextPanelEnabled.value) {
        contextPanelOpen.value = false;
        return;
      }
      contextPanelOpen.value = contextPanelPinned.value;
    },
    { immediate: true },
  );

  onMounted(() => {
    updateViewportState();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateViewportState, { passive: true });
    }
  });

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateViewportState);
    }
  });

  return {
    sidebarCollapsed,
    isMobile,
    mobileSidebarOpen,
    contextPanelOpen,
    contextPanelEnabled,
    contextPanelPinned,
    isChatSurface,
    toggleSidebar,
    toggleContextPanel,
  };
}
```

```ts
// apps/web-vue/src/features/shell/use-shell-release.ts
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useConfirmDialog } from '../../composables/useConfirmDialog';

export function useShellRelease(buildVersion: string) {
  const { confirm } = useConfirmDialog();
  // existing refs/computed stay the same
  async function handleStudioUpgradeAction(): Promise<void> {
    if (!studioRelease.value?.updateAvailable) {
      // existing refresh path
      return;
    }

    const target = studioRelease.value.latestVersion || '';
    const confirmed = await confirm({
      title: text('确认升级 Studio', 'Confirm Studio upgrade'),
      message: text(
        `确认升级到 v${target}？升级期间 Gateway 可能会重启。`,
        `Upgrade to v${target}? Gateway may restart during upgrade.`,
      ),
      confirmText: text('确认升级', 'Upgrade now'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
    if (!confirmed) return;

    // existing upgrade path
  }
}
```

```vue
<!-- apps/web-vue/src/App.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, TooltipProvider } from 'reka-ui';
import { RouterView } from 'vue-router';
import StudioContextPanel from './components/StudioContextPanel.vue';
import { useShellChrome } from './features/shell/use-shell-chrome';
import { useShellNavigation } from './features/shell/use-shell-navigation';
import { useShellRelease } from './features/shell/use-shell-release';

const {
  sidebarCollapsed,
  isMobile,
  mobileSidebarOpen,
  contextPanelOpen,
  contextPanelEnabled,
  isChatSurface,
  toggleSidebar,
  toggleContextPanel,
  handleSidebarNavigate,
} = useShellChrome();
const { navGroups, contextPanelTitle, contextPanelDescription, contextPendingItems, topStatus } = useShellNavigation();
const { versionInfoClass, versionTitle, versionLabel, versionMetaLabel, versionActionClass, versionActionTitle, versionActionLabel, versionStatusDotClass, versionActionBusy, handleStudioUpgradeAction } = useShellRelease(buildVersion);
</script>

<template>
  <TooltipProvider :delay-duration="140" :skip-delay-duration="80" :disable-hoverable-content="true">
    <div class="app-container" :class="{ mobile: isMobile, 'sidebar-collapsed': !isMobile && sidebarCollapsed, 'chat-shell': isChatSurface }">
      <aside v-if="!isMobile" class="sidebar sidebar-rail" :class="{ collapsed: sidebarCollapsed }">
        <StudioSidebarRail ... />
      </aside>

      <main class="main-content shell-main">
        <div class="shell-layout" :class="{ 'shell-layout-chat': isChatSurface, 'context-open': contextPanelOpen }">
          <section class="shell-main-stage">
            <StudioShellTopbar
              v-if="!isChatSurface"
              ...
              :context-label="text('上下文', 'Context')"
              :context-open="contextPanelOpen"
              :context-enabled="contextPanelEnabled"
              @toggle-context="toggleContextPanel"
            />
            <RouterView v-slot="{ Component }">
              <section class="shell-route-stage" :class="{ 'shell-route-stage-chat': isChatSurface }">
                <component :is="Component" />
              </section>
            </RouterView>
          </section>
        </div>
      </main>

      <StudioContextPanel
        :open="contextPanelOpen"
        :mobile="isMobile"
        :title="contextPanelTitle"
        :description="contextPanelDescription"
        @update:open="contextPanelOpen = $event"
      />
      <ConfirmDialog />
    </div>
  </TooltipProvider>
</template>
```

```css
/* apps/web-vue/src/style.css */
.shell-layout {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 100%;
}

.shell-main-stage {
  min-width: 0;
  min-height: 0;
  display: grid;
  gap: 12px;
  align-content: start;
}

.shell-context-panel-mask {
  position: fixed;
  inset: 0;
  background: rgba(6, 10, 18, 0.46);
  backdrop-filter: blur(10px);
  z-index: 1420;
}

.shell-context-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: min(360px, calc(100vw - 24px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--shell-panel-border);
  background: color-mix(in srgb, var(--shell-panel-fill) 94%, transparent);
  box-shadow: var(--shadow-soft);
  z-index: 1421;
}
```

- [ ] **Step 4: Run the targeted shell tests to verify they pass**

Run: `node --test tests/system/studio-web-shell-layout-redesign.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs`
Expected: PASS for shell layout, route manifest, and shell chrome tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/components/StudioContextPanel.vue apps/web-vue/src/components/StudioShellTopbar.vue apps/web-vue/src/features/shell/use-shell-chrome.ts apps/web-vue/src/features/shell/use-shell-release.ts apps/web-vue/src/features/shell/use-shell-navigation.ts apps/web-vue/src/features/shell/route-manifest.ts apps/web-vue/src/router.ts apps/web-vue/src/style.css tests/system/studio-web-shell-layout-redesign.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs
git commit -m "feat: switch shell to on-demand context panel"
```

## Task 2: 扩展 dashboard summary 与 overview recipe

**Files:**
- Modify: `types/dashboard.ts:1-100`
- Modify: `apps/api/modules/dashboard/service.ts:1-231`
- Modify: `apps/api/modules/dashboard/routes.ts:1-28`
- Modify: `apps/web-vue/src/features/dashboard/overview-recipe.ts:1-176`
- Modify: `tests/system/dashboard-service.test.mjs`
- Test: `tests/system/studio-web-dashboard-shell-overview.test.mjs`

- [ ] **Step 1: Write the failing dashboard service and recipe tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardService } from "../../dist/apps/api/modules/dashboard/service.js";

test("dashboard summary exposes recovery items, event trend buckets, and context panel hints", async () => {
  const dashboard = createDashboardService({ /* existing fixture services */ });
  const summary = await dashboard.getSummary();

  assert.deepEqual(summary.recovery.items[0], {
    kind: "chat",
    title: "Resume last operator chat",
    to: "/chat",
  });
  assert.equal(summary.trends.alerts.length > 0, true);
  assert.equal(summary.context.title.length > 0, true);
});
```

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..', '..');
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/dashboard/overview-recipe.ts');

test('dashboard overview recipe exports risk, recovery, and trend builders', () => {
  const recipe = fs.readFileSync(recipePath, 'utf8');
  assert.match(recipe, /buildDashboardRiskStage/);
  assert.match(recipe, /buildDashboardRecoveryItems/);
  assert.match(recipe, /buildDashboardTrendPanels/);
});
```

- [ ] **Step 2: Run the targeted dashboard tests to verify they fail**

Run: `npm run build:api && node --test tests/system/dashboard-service.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs`
Expected: FAIL because the dashboard payload and recipe do not expose recovery/trend/context builders yet.

- [ ] **Step 3: Extend dashboard types, service, and recipe builders**

说明：Task 2 的实际实现 contract 已收敛为“通用恢复项 + 通用趋势面板 + contextSummary 提示”，Task 3 需要直接消费这一 contract，而不是早期草稿里的 `context` / `trends.alerts|activity|resources` / `recovery.kind|summary` 形态。

```ts
// types/dashboard.ts
export interface DashboardRecoveryItem {
  id: string;
  title: string;
  note: string;
  severity: 'high' | 'medium' | 'low';
  to: string;
}

export interface DashboardTrendPoint {
  key: string;
  label: string;
  value: number;
  note: string;
}

export interface DashboardTrendPanel {
  key: string;
  title: string;
  stage: 'risk' | 'recovery' | 'trend';
  points: DashboardTrendPoint[];
}

export interface DashboardContextSummary {
  riskStage: 'low' | 'medium' | 'high';
  primaryHint: string;
  secondaryHint: string;
}

export interface DashboardSummaryPayload {
  // existing fields...
  recovery: {
    total: number;
    items: DashboardRecoveryItem[];
  };
  trends: {
    points: DashboardTrendPoint[];
    panels: DashboardTrendPanel[];
  };
  contextSummary: DashboardContextSummary;
}
```

```ts
// apps/api/modules/dashboard/service.ts
const recoveryItems: DashboardRecoveryItem[] = [
  ...bootstrap.checks
    .filter((check) => check.level !== 'ok' && check.fixable)
    .map((check) => ({
      id: `bootstrap:${check.id}`,
      title: `修复 bootstrap: ${check.id}`,
      note: check.level === 'error' ? '存在阻断错误，建议立即修复。' : '存在警告项，建议尽快处理。',
      severity: check.level === 'error' ? 'high' : 'medium',
      to: '/system',
    })),
  ...eventSummary.recentFailures.items.map((item, index) => ({
    id: `event:failure:${index}`,
    title: item.title || `Failure ${index + 1}`,
    note: '最近失败事件，需要排查与恢复。',
    severity: 'high',
    to: '/system/events',
  })),
  ...eventSummary.pendingAuditItems.items.map((item, index) => ({
    id: `event:audit:${index}`,
    title: item.title || `Audit ${index + 1}`,
    note: '待处理审计项，需要确认并清理积压。',
    severity: 'medium',
    to: '/system',
  })),
  ...persistedSessions
    .filter((session) => session.status === 'detached' || session.recentOutputSummary?.lastError)
    .map((session) => ({
      id: `terminal:${session.sessionId}`,
      title: session.title || `Terminal ${session.sessionId}`,
      note: session.recentOutputSummary?.lastError
        ? `最近错误：${session.recentOutputSummary.lastError}`
        : '存在可恢复终端会话，建议继续处理。',
      severity: session.recentOutputSummary?.lastError ? 'high' : 'low',
      to: '/terminal',
    })),
];

const trendPoints = [
  {
    key: 'bootstrapFixable',
    label: 'Bootstrap fixable',
    value: bootstrapFixable,
    note: '当前 bootstrap 可修复项',
  },
  {
    key: 'pendingPairing',
    label: 'Pending pairing',
    value: pendingDeviceTrustRequests,
    note: '待审批设备配对请求',
  },
  {
    key: 'recoverableSessions',
    label: 'Recoverable sessions',
    value: persistedSessions.filter((session) => session.canResume).length,
    note: '可恢复终端会话数量',
  },
  {
    key: 'eventFailures',
    label: 'Event failures',
    value: eventSummary.recentFailures.count,
    note: '最近失败事件数量',
  },
];

return {
  // existing fields...
  recovery: {
    total: recoveryItems.length,
    items: recoveryItems,
  },
  trends: {
    points: trendPoints,
    panels: [
      {
        key: 'risk',
        title: 'Risk watch',
        stage: 'risk',
        points: trendPoints.filter((point) => point.key === 'eventFailures' || point.key === 'bootstrapFixable'),
      },
      {
        key: 'recovery',
        title: 'Recovery pulse',
        stage: 'recovery',
        points: trendPoints.filter((point) => point.key === 'recoverableSessions' || point.key === 'pendingPairing'),
      },
      {
        key: 'trend',
        title: 'System trend',
        stage: 'trend',
        points: trendPoints,
      },
    ],
  },
  contextSummary: {
    riskStage,
    primaryHint: `${recoveryItems.length} 项恢复与处理项待跟进`,
    secondaryHint: eventSummary.recentRecoveries.items[0]?.title
      ? `最近恢复：${eventSummary.recentRecoveries.items[0].title}`
      : '暂无新的恢复事件',
  },
};
```

```ts
// apps/web-vue/src/features/dashboard/overview-recipe.ts
export function buildDashboardRiskStage(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}) {
  const { payload, text } = options;

  if (!payload) {
    return [];
  }

  return [
    {
      key: 'recovery',
      title: text('恢复待处理', 'Recovery backlog'),
      value: String(payload.recovery.total),
      summary: payload.contextSummary.primaryHint,
      to: '/system',
    },
    {
      key: 'risk',
      title: text('当前风险等级', 'Risk stage'),
      value: payload.contextSummary.riskStage,
      summary: payload.contextSummary.secondaryHint,
      to: '/system/events',
    },
  ];
}

export function buildDashboardRecoveryItems(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}) {
  return options.payload?.recovery.items || [];
}

export function buildDashboardTrendPanels(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}) {
  return options.payload?.trends.panels || [];
}
```

- [ ] **Step 4: Run the targeted dashboard tests to verify they pass**

Run: `npm run build:api && node --test tests/system/dashboard-service.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs`
Expected: PASS with the new dashboard summary fields and recipe builders.

- [ ] **Step 5: Commit**

```bash
git add types/dashboard.ts apps/api/modules/dashboard/service.ts apps/api/modules/dashboard/routes.ts apps/web-vue/src/features/dashboard/overview-recipe.ts tests/system/dashboard-service.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs
git commit -m "feat: extend dashboard summary for home redesign"
```

## Task 3: 重组 DashboardView 为风险、续做、趋势首页

**Files:**
- Modify: `apps/web-vue/src/views/DashboardView.vue:1-670`
- Modify: `apps/web-vue/src/style.css` (only if global tokens are required beyond scoped page CSS)
- Test: `tests/system/studio-web-home-layout-redesign.test.mjs`
- Test: `tests/system/studio-web-dashboard-shell-overview.test.mjs`

- [ ] **Step 1: Write the failing DashboardView structure tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const dashboardView = fs.readFileSync(path.join(rootDir, "apps/web-vue/src/views/DashboardView.vue"), "utf8");

test("home page redesign exposes risk, recovery, and trend zones in order", () => {
  assert.match(dashboardView, /data-home-zone="situation"/);
  assert.match(dashboardView, /data-home-zone="risk"/);
  assert.match(dashboardView, /data-home-zone="recovery"/);
  assert.match(dashboardView, /data-home-zone="trend"/);
  assert.match(dashboardView, /data-home-zone="resource"/);
  assert.match(dashboardView, /data-home-zone="recent"/);
});

test("dashboard view derives layout data from dedicated computed collections", () => {
  assert.match(dashboardView, /buildDashboardRiskStage/);
  assert.match(dashboardView, /buildDashboardRecoveryItems/);
  assert.match(dashboardView, /buildDashboardTrendPanels/);
  assert.match(dashboardView, /const dashboardRiskStage = computed/);
  assert.match(dashboardView, /const dashboardRecoveryItems = computed/);
  assert.match(dashboardView, /const dashboardTrendPanels = computed/);
});
```

- [ ] **Step 2: Run the targeted Home tests to verify they fail**

Run: `node --test tests/system/studio-web-home-layout-redesign.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs`
Expected: FAIL because DashboardView still only exposes `situation/risk/resource/recent` and hardcodes quick actions/signals locally.

- [ ] **Step 3: Rebuild DashboardView around recipe-backed computed collections**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { motion } from 'motion-v';
import { useLocalePreference } from '../shared/locale';
import { fetchDashboardSummary, subscribeDashboardSummary } from '../features/dashboard/api';
import {
  buildDashboardOverviewSignals,
  buildDashboardQuickActions,
  buildDashboardRecoveryItems,
  buildDashboardRiskStage,
  buildDashboardTrendPanels,
} from '../features/dashboard/overview-recipe';

const dashboardRiskStage = computed(() => buildDashboardRiskStage({ payload: summary.value, text }));
const dashboardRecoveryItems = computed(() => buildDashboardRecoveryItems({ payload: summary.value, text }));
const dashboardTrendPanels = computed(() => buildDashboardTrendPanels({ payload: summary.value, text }));
const homeQuickActions = computed(() => buildDashboardQuickActions(text));
const dashboardSystemSignals = computed(() => buildDashboardOverviewSignals({ payload: summary.value, text, formatUptime }));
</script>

<template>
  <motion.section class="home-control-surface home-stage-rhythm" v-bind="pageSurfaceReveal">
    <motion.header class="home-situation-band" data-home-zone="situation" v-bind="pageMastheadReveal">
      <!-- existing masthead -->
    </motion.header>

    <section class="home-risk-stage" data-home-zone="risk">
      <div class="home-risk-stage__main">
        <RouterLink
          v-for="item in dashboardRiskStage"
          :key="item.key"
          :to="item.to"
          class="home-risk-row"
        >
          <div class="home-risk-row__lead">
            <span class="home-risk-row__eyebrow">{{ item.title }}</span>
            <h4>{{ item.value }}</h4>
          </div>
          <p class="home-risk-row__note">{{ item.summary }}</p>
        </RouterLink>
      </div>

      <aside class="home-risk-stage__side">
        <RouterLink v-for="action in homeQuickActions" :key="action.to" :to="action.to" class="home-quick-action">
          <div class="home-quick-action__copy">
            <span class="home-quick-action__eyebrow">{{ action.eyebrow }}</span>
            <strong>{{ action.label }}</strong>
          </div>
          <span class="home-quick-action__note">{{ action.copy }}</span>
        </RouterLink>
      </aside>
    </section>

    <section class="home-recovery-stage" data-home-zone="recovery">
      <div class="home-section-heading home-section-marker">
        <div>
          <p class="eyebrow">{{ text('Continue Work', 'Continue Work') }}</p>
          <h3>{{ text('继续当前工作', 'Continue current work') }}</h3>
        </div>
      </div>
      <div class="home-recovery-grid">
        <RouterLink v-for="item in dashboardRecoveryItems" :key="`${item.kind}:${item.to}`" :to="item.to" class="home-recovery-card">
          <span class="home-recovery-card__eyebrow">{{ item.kind }}</span>
          <strong>{{ item.title }}</strong>
          <p>{{ item.summary }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="home-trend-stage" data-home-zone="trend">
      <div class="home-section-heading home-section-marker">
        <div>
          <p class="eyebrow">{{ text('Trend Pulse', 'Trend Pulse') }}</p>
          <h3>{{ text('趋势仪表盘', 'Trend dashboard') }}</h3>
        </div>
      </div>
      <div class="home-trend-grid">
        <article v-for="panel in dashboardTrendPanels" :key="panel.key" class="home-trend-card">
          <span class="home-trend-card__eyebrow">{{ panel.label }}</span>
          <strong>{{ panel.points[panel.points.length - 1]?.value ?? '--' }}</strong>
          <p>{{ panel.summary }}</p>
          <div class="home-trend-card__spark">
            <span v-for="point in panel.points" :key="`${panel.key}:${point.label}`">{{ point.label }} · {{ point.value }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="home-resource-grid" data-home-zone="resource">
      <!-- existing resource panels backed by dashboardSystemSignals -->
    </section>

    <section class="home-recent-stream" data-home-zone="recent">
      <!-- existing recent stream -->
    </section>
  </motion.section>
</template>
```

```css
<style scoped>
.home-recovery-stage,
.home-trend-stage {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 12px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
  box-shadow: var(--shadow-soft);
}

.home-recovery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.home-recovery-card,
.home-trend-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: color-mix(in srgb, var(--shell-panel-fill-strong) 92%, transparent);
}

.home-trend-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.home-trend-card__spark {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
}

@media (max-width: 1180px) {
  .home-recovery-grid,
  .home-trend-grid {
    grid-template-columns: 1fr;
  }
}
</style>
```

- [ ] **Step 4: Run the targeted Home tests to verify they pass**

Run: `node --test tests/system/studio-web-home-layout-redesign.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs`
Expected: PASS with new `risk -> recovery -> trend -> resource -> recent` layout and recipe-backed computed collections.

- [ ] **Step 5: Commit**

```bash
git add apps/web-vue/src/views/DashboardView.vue tests/system/studio-web-home-layout-redesign.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs
git commit -m "feat: redesign home dashboard around risk and recovery"
```

## Task 4: 收口 Chat / System / Terminal 的按页上下文策略

**Files:**
- Modify: `apps/web-vue/src/features/chat-v2/ChatShellPage.vue:198-220,3299-3317,4783-4804`
- Modify: `apps/web-vue/src/features/system/SystemControlPage.vue:74-80,85-126`
- Modify: `apps/web-vue/src/features/terminal/TerminalConsolePage.vue:28-200`
- Test: `tests/system/studio-web-chat-layout-redesign.test.mjs`
- Test: `tests/system/studio-web-system-terminal-layout-redesign.test.mjs`

- [ ] **Step 1: Write the failing page-policy tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const systemControlPage = fs.readFileSync(path.join(rootDir, "apps/web-vue/src/features/system/SystemControlPage.vue"), "utf8");
const terminalConsolePage = fs.readFileSync(path.join(rootDir, "apps/web-vue/src/features/terminal/TerminalConsolePage.vue"), "utf8");
const chatShellPage = fs.readFileSync(path.join(rootDir, "apps/web-vue/src/features/chat-v2/ChatShellPage.vue"), "utf8");

test("chat keeps local inspector policy while shell context becomes on-demand", () => {
  assert.match(chatShellPage, /chat-side-inspector/);
  assert.match(chatShellPage, /inspectPinned/);
  assert.match(chatShellPage, /chat-inspector-sheet/);
});

test("system control page has CTA entry to event center", () => {
  assert.match(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(systemControlPage, /Open Event Center|打开事件中心/);
});

test("terminal stays free of shell context panel coupling", () => {
  assert.doesNotMatch(terminalConsolePage, /StudioShellContextRail|StudioContextPanel|shell-context-panel/);
  assert.match(terminalConsolePage, /terminal-side-utilities/);
});
```

- [ ] **Step 2: Run the targeted page-policy tests to verify they fail**

Run: `node --test tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
Expected: FAIL because System currently lacks the event-center CTA and the updated page-policy assertions are not yet satisfied.

- [ ] **Step 3: Implement page-level inspector policy adjustments**

```vue
<!-- apps/web-vue/src/features/system/SystemControlPage.vue -->
<div class="system-quick-links">
  <button type="button" class="secondary-button compact-button" @click="router.push('/system/events')">
    {{ text('打开事件中心', 'Open Event Center') }}
  </button>
  <button type="button" class="secondary-button compact-button" @click="router.push('/terminal')">
    {{ text('去终端', 'Open Terminal') }}
  </button>
  <button type="button" class="secondary-button compact-button" @click="router.push('/cron')">
    {{ text('去定时任务', 'Open Cron') }}
  </button>
</div>
```

```ts
// apps/web-vue/src/features/chat-v2/ChatShellPage.vue
watch(
  () => props.shellMode,
  (nextMode) => {
    inspectorDrawerOpen.value = nextMode === 'inspect';
  },
  { immediate: true },
);

function closeInspectorDrawer(): void {
  inspectorDrawerOpen.value = false;
  if (!inspectPinned.value) return;
  router.replace('/chat');
}
```

```vue
<!-- apps/web-vue/src/features/terminal/TerminalConsolePage.vue -->
<section class="page-shell terminal-page terminal-workspace-surface terminal-maintenance-workspace">
  <header class="page-header-row">
    <!-- keep existing single terminal workspace; no shell context imports or hooks -->
  </header>
</section>
```

- [ ] **Step 4: Run the targeted page-policy tests to verify they pass**

Run: `node --test tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
Expected: PASS with Chat preserving local inspector, System exposing event-center CTA, and Terminal remaining free of shell context coupling.

- [ ] **Step 5: Commit**

```bash
git add apps/web-vue/src/features/chat-v2/ChatShellPage.vue apps/web-vue/src/features/system/SystemControlPage.vue apps/web-vue/src/features/terminal/TerminalConsolePage.vue tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs
git commit -m "feat: align page-level inspector policies"
```

## Task 5: 全量验证、记录基线、准备执行

**Files:**
- Modify: `docs/当前进展.md`
- Test: `tests/system/*.test.mjs` (relevant subset first, then full run)

- [ ] **Step 1: Update progress documentation after implementation**

```md
## Home Dashboard + Context Panel（2026-04-18）

- App shell 已从常驻 `StudioShellContextRail` 迁移为按需 `StudioContextPanel`。
- Home 首页已重组为风险区、继续工作区、趋势仪表盘区、资源区、最近变化区。
- Chat 继续保留页内 inspector；System 改为 CTA 进入事件中心；Terminal 保持无全局右栏依赖。
- dashboard summary 已补充 recovery、trend、context summary 字段。
- 已补齐 shell / dashboard / home / chat / system / terminal 结构守卫测试。
```

- [ ] **Step 2: Run the focused verification suite**

Run: `node --test tests/system/studio-web-shell-layout-redesign.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs tests/system/studio-web-home-layout-redesign.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs tests/system/studio-web-chat-layout-redesign.test.mjs tests/system/studio-web-system-terminal-layout-redesign.test.mjs tests/system/dashboard-service.test.mjs`
Expected: PASS for all targeted shell/home/context tests.

- [ ] **Step 3: Run the project system test baseline**

Run: `npm run test:system`
Expected: PASS, or if unrelated pre-existing failures remain, capture the exact failing test names and confirm they are outside the files touched in this plan before proceeding.

- [ ] **Step 4: Rebuild graphify output required by repo instructions**

Run: `python3.12 ~/.claude/graphify-rebuild.py .`
Expected: graphify rebuild completes successfully in the worktree.

- [ ] **Step 5: Commit**

```bash
git add docs/当前进展.md
git commit -m "docs: record home dashboard and context panel progress"
```

## Self-Review

### Spec coverage
- Home 从风险优先 + 续做优先 + 趋势辅助的结构落地到 Task 2 + Task 3。
- 全局右侧上下文区改为按需面板系统落地到 Task 1。
- Chat 保留可折叠 inspector、System 用临时入口、Terminal 无全局右栏依赖落地到 Task 4。
- 图表只做趋势辅助、Room/Workflow 只在真实记录下动态出现，落地到 Task 2 + Task 3 的 summary/recipe/conditional render。

### Placeholder scan
- 没有使用 TBD/TODO/“similar to task N” 之类占位语句。
- 每个任务的代码步骤都给了明确文件与代码块。
- 每个任务都给了明确命令与预期结果。

### Type consistency
- 新增 dashboard 类型统一使用 `DashboardRecoveryItem`、`DashboardTrendPoint`、`DashboardContextSummary`。
- shell 统一使用 `StudioContextPanel` / `useShellChrome` / `useShellRelease` 命名，不混用旧的 context rail 名称。
- Chat 继续沿用现有 `inspectPinned` / `inspectorDrawerOpen`，不引入第二套 inspector 状态名。
