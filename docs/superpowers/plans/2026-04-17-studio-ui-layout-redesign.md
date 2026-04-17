# Studio 前端 UI 布局重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Studio 落成新的页面语法：`Home` 做总控首页，`Chat` 做 IM/workspace 主工作区，`Operate` 承载 `agents/channels/cron` 运营域，`System/Terminal` 承载治理与维护双入口，并统一壳层、导航和主舞台规则。

**Architecture:** 保留现有 Vue Router 与模块化 feature 边界，不新开第二套前端。实现分 6 个可验证阶段推进：先锁定新的 shell/home/layout 契约，再改平台壳层与导航，其后分别落地 Home、Chat、Operate、System/Terminal，最后做文档和总验证。`Config / Skills` 本轮只调整到次级入口，不重做其页面骨架；`Room / Workflow` 只预留导航位置。

**Tech Stack:** TypeScript, Vue 3, Vue Router, Reka UI, shared app shell styles in `apps/web-vue/src/style.css`, node:test system contract tests

---

## Scope Split

原 spec 覆盖多个模块，但它们共享同一个前端壳层与统一布局语法，因此本计划按“一个共享基础层 + 五个落地阶段”执行，而不是把每个模块拆成互不相干的独立项目。这样每个阶段都能形成可运行、可测试的软件，并且不会失去壳层重构的整体一致性。

## File Map

**Platform Shell**
- Create: `extensions/openclaw-studio/apps/web-vue/src/components/StudioShellTopbar.vue`
- Create: `extensions/openclaw-studio/apps/web-vue/src/components/StudioShellContextRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/App.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/router.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/data/mock.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/components/StudioSidebarRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`

**Home**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/views/DashboardView.vue`

**Chat**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue`

**Operate**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/cron/CronControlPage.vue`

**System / Terminal**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/system/SystemControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/terminal/TerminalConsolePage.vue`

**Tests**
- Create: `extensions/openclaw-studio/tests/system/studio-web-shell-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-home-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-operate-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs`

**Docs**
- Modify: `extensions/openclaw-studio/docs/当前进展.md`

---

### Task 1: 锁定新壳层与页面语法契约

**Files:**
- Create: `extensions/openclaw-studio/tests/system/studio-web-shell-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-home-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-chat-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-operate-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Create: `extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs`

- [ ] **Step 1: 写 shell 契约失败测试，锁定 topbar、context rail 和 Home/Chat/Operate/System/Terminal 导航语义**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, '..', '..');
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), 'utf8');

const appVue = read('apps/web-vue/src/App.vue');
const routerSource = read('apps/web-vue/src/router.ts');
const uiContentSource = read('apps/web-vue/src/data/mock.ts');

test('shell redesign introduces topbar, context rail, and task-group navigation', () => {
  assert.match(appVue, /StudioShellTopbar/);
  assert.match(appVue, /StudioShellContextRail/);
  assert.match(appVue, /shell-main-grid/);

  assert.match(routerSource, /path:\s*['"]\/home['"]/);
  assert.match(routerSource, /alias:\s*\[?['"]\/dashboard['"]/);

  assert.match(uiContentSource, /Home/);
  assert.match(uiContentSource, /Operate/);
  assert.match(uiContentSource, /Terminal/);
});
```

- [ ] **Step 2: 写页面骨架失败测试，锁定 Home、Chat、Operate、System/Terminal 的主舞台类名**

```js
test('home uses a control-surface layout instead of equal-weight card walls', () => {
  const dashboardView = read('apps/web-vue/src/views/DashboardView.vue');
  assert.match(dashboardView, /home-control-surface/);
  assert.match(dashboardView, /home-risk-stage/);
  assert.match(dashboardView, /home-recent-stream/);
});

test('chat keeps transcript as the only primary stage', () => {
  const chatShellPage = read('apps/web-vue/src/features/chat-v2/ChatShellPage.vue');
  assert.match(chatShellPage, /chat-main-stage/);
  assert.match(chatShellPage, /chat-side-inspector/);
  assert.doesNotMatch(chatShellPage, /chat-shell-session-browser\s+chat-shell-diagnostics\s+chat-thread/);
});

test('operate modules share a workspace grammar', () => {
  const agentsWorkspace = read('apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue');
  const channelsWorkspace = read('apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue');
  const cronPage = read('apps/web-vue/src/features/cron/CronControlPage.vue');
  assert.match(agentsWorkspace, /operate-workspace-shell/);
  assert.match(channelsWorkspace, /operate-workspace-shell/);
  assert.match(cronPage, /operate-workspace-shell/);
  assert.match(cronPage, /operate-stage-task-head/);
});
```

- [ ] **Step 3: 跑新测试，确认当前实现确实失败**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
node --test \
  tests/system/studio-web-shell-layout-redesign.test.mjs \
  tests/system/studio-web-home-layout-redesign.test.mjs \
  tests/system/studio-web-chat-layout-redesign.test.mjs \
  tests/system/studio-web-operate-layout-redesign.test.mjs \
  tests/system/studio-web-system-terminal-layout-redesign.test.mjs \
  tests/system/studio-web-mobile-layout-guardrails.test.mjs
```

Expected:

```text
FAIL because StudioShellTopbar / StudioShellContextRail / home-control-surface / operate-workspace-shell do not exist yet
```

- [ ] **Step 4: 提交测试契约基线**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/tests/system/studio-web-shell-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-home-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-chat-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-operate-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-system-terminal-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "测试：锁定 Studio 新布局骨架契约"
```

---

### Task 2: 重建平台壳层、导航与全局布局骨架

**Files:**
- Create: `extensions/openclaw-studio/apps/web-vue/src/components/StudioShellTopbar.vue`
- Create: `extensions/openclaw-studio/apps/web-vue/src/components/StudioShellContextRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/App.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/router.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/data/mock.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/components/StudioSidebarRail.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-shell-layout-redesign.test.mjs`

- [ ] **Step 1: 新建 topbar 组件，承载搜索、状态摘要、主题与语言切换入口**

```vue
<template>
  <header class="studio-shell-topbar">
    <div class="studio-shell-topbar__lead">
      <p class="eyebrow">Studio</p>
      <strong>{{ text('统一工作台', 'Unified workspace') }}</strong>
    </div>

    <div class="studio-shell-topbar__center">
      <button type="button" class="shell-command-trigger">
        {{ text('搜索 / 命令', 'Search / Command') }}
      </button>
    </div>

    <div class="studio-shell-topbar__actions">
      <span class="shell-topbar-pill">{{ text('待处理', 'Pending') }} {{ pendingCount }}</span>
      <span class="shell-topbar-pill">{{ text('风险', 'Risk') }} {{ riskCount }}</span>
      <button type="button" class="secondary-button compact-button" @click="$emit('toggle-theme')">
        {{ themeLabel }}
      </button>
      <button type="button" class="secondary-button compact-button" @click="$emit('toggle-locale')">
        {{ localeLabel }}
      </button>
    </div>
  </header>
</template>
```

- [ ] **Step 2: 新建右侧 context rail 组件，承载 alerts / pending / recent changes，而不是让这些块继续散落到各页**

```vue
<template>
  <aside class="studio-shell-context-rail">
    <section class="shell-context-card">
      <p class="eyebrow">Alerts</p>
      <h3>{{ text('当前风险', 'Current risks') }}</h3>
      <ul>
        <li v-for="item in alerts" :key="item.title">{{ item.title }}</li>
      </ul>
    </section>

    <section class="shell-context-card">
      <p class="eyebrow">Pending</p>
      <h3>{{ text('待处理', 'Pending work') }}</h3>
      <ul>
        <li v-for="item in pending" :key="item.title">{{ item.title }}</li>
      </ul>
    </section>
  </aside>
</template>
```

- [ ] **Step 3: 把 App、router、nav data 接到新 IA：`/home` 主入口、`Home / Chat / Operate / System / Terminal` 一级导航、`Config / Skills` 次级入口**

```ts
// apps/web-vue/src/router.ts
export const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/home', alias: ['/dashboard'], component: DashboardView },
    { path: '/agents', component: AgentsView },
    { path: '/channels', component: ChannelsView },
    { path: '/cron', component: CronView },
    { path: '/chat', component: ChatView },
    { path: '/system', component: SystemView },
    { path: '/terminal', component: TerminalView },
    { path: '/config', component: ConfigView },
    { path: '/skills', component: SkillsView },
  ],
});
```

```ts
// apps/web-vue/src/data/mock.ts
const primaryNavItems = computed(() => [
  { to: '/home', icon: 'dashboard', label: text('Home', 'Home') },
  { to: '/chat', icon: 'chat', label: text('Chat', 'Chat') },
  { to: '/agents', icon: 'agents', label: text('Operate', 'Operate'), children: ['/agents', '/channels', '/cron'] },
  { to: '/system', icon: 'system', label: text('System', 'System') },
  { to: '/terminal', icon: 'terminal', label: text('Terminal', 'Terminal') },
]);

const utilityNavItems = computed(() => [
  { to: '/config', icon: 'config', label: text('Config', 'Config') },
  { to: '/skills', icon: 'skills', label: text('Skills', 'Skills') },
]);
```

```vue
<!-- apps/web-vue/src/App.vue -->
<StudioShellTopbar
  :pending-count="contextPending.length"
  :risk-count="contextAlerts.length"
  :theme-label="themeMode"
  :locale-label="locale"
  @toggle-theme="setThemeMode(themeMode === 'dark' ? 'light' : 'dark')"
  @toggle-locale="setLocale(locale === 'zh' ? 'en' : 'zh')"
/>

<main class="shell-main-grid" :class="{ 'shell-main-grid-chat': isChatSurface }">
  <section class="shell-center-stage">
    <RouterView />
  </section>
  <StudioShellContextRail :alerts="contextAlerts" :pending="contextPending" />
</main>
```

- [ ] **Step 4: 跑壳层定向验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-shell-layout-redesign.test.mjs \
  tests/system/studio-web-mobile-layout-guardrails.test.mjs
```

Expected:

```text
PASS typecheck
PASS shell layout contract tests
```

- [ ] **Step 5: 提交壳层与导航重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/components/StudioShellTopbar.vue \
  extensions/openclaw-studio/apps/web-vue/src/components/StudioShellContextRail.vue \
  extensions/openclaw-studio/apps/web-vue/src/App.vue \
  extensions/openclaw-studio/apps/web-vue/src/router.ts \
  extensions/openclaw-studio/apps/web-vue/src/data/mock.ts \
  extensions/openclaw-studio/apps/web-vue/src/components/StudioSidebarRail.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-shell-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "重构：更新 Studio 平台壳层与导航骨架"
```

---

### Task 3: 把 Dashboard 重构成 Home 总控首页

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/views/DashboardView.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/data/mock.ts`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-home-layout-redesign.test.mjs`

- [ ] **Step 1: 先写 Home 主画布结构，让首页从“模块河流”改成“态势 + 风险 + 资源摘要 + 推荐动作 + 最近变化”**

```vue
<motion.section class="home-control-surface" v-bind="pageSurfaceReveal">
  <section class="home-situation-band">
    <article class="home-situation-meter" v-for="metric in homeSituationMetrics" :key="metric.label">
      <span>{{ metric.label }}</span>
      <strong>{{ metric.value }}</strong>
    </article>
  </section>

  <section class="home-risk-stage">
    <div class="home-risk-stage__main">
      <h3>{{ text('风险与待处理', 'Risks and pending') }}</h3>
    </div>
    <div class="home-risk-stage__side">
      <button v-for="action in homeQuickActions" :key="action.to" type="button" class="home-quick-action">
        {{ action.label }}
      </button>
    </div>
  </section>

  <section class="home-resource-grid"></section>
  <section class="home-recent-stream"></section>
</motion.section>
```

- [ ] **Step 2: 把 Dashboard 的旧文案、旧指标和旧区块名更新到 Home 心智，不再继续使用 recovery-only 叙述**

```ts
const homeSituationMetrics = computed(() => [
  { label: text('运行中会话', 'Active sessions'), value: summary?.chat.activeSessions || '--' },
  { label: text('异常项目', 'Risk items'), value: summary?.system.riskCount || '--' },
  { label: text('待处理', 'Pending'), value: summary?.pending.count || '--' },
  { label: text('最近变更', 'Recent changes'), value: summary?.changes.count || '--' },
]);

const homeQuickActions = computed(() => [
  { to: '/chat', label: text('进入 Chat', 'Open Chat') },
  { to: '/agents', label: text('管理 Agents', 'Open Agents') },
  { to: '/system', label: text('检查 System', 'Open System') },
]);
```

- [ ] **Step 3: 跑 Home 定向验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test tests/system/studio-web-home-layout-redesign.test.mjs
```

Expected:

```text
PASS typecheck
PASS home layout test
```

- [ ] **Step 4: 提交 Home 重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/views/DashboardView.vue \
  extensions/openclaw-studio/apps/web-vue/src/data/mock.ts \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-home-layout-redesign.test.mjs
git commit -m "重构：将 Dashboard 收口为 Home 总控首页"
```

---

### Task 4: 把 Chat 收口成“会话 rail + 对话主舞台 + 按需 inspector”

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-chat-layout-redesign.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs`

- [ ] **Step 1: 先把 Chat 顶层骨架改成新的舞台语法，确保 transcript 永远在中间主区**

```vue
<section class="chat-shell-layout">
  <aside class="chat-session-rail">
    <SessionListPanel />
  </aside>

  <section class="chat-main-stage">
    <div class="chat-stage-task-head">
      <div>
        <p class="eyebrow">Chat</p>
        <h2>{{ activeSessionTitle }}</h2>
      </div>
    </div>
    <ConversationPane />
  </section>

  <aside v-if="inspectorOpen" class="chat-side-inspector">
    <section class="surface-tabs"></section>
  </aside>
</section>
```

- [ ] **Step 2: 把 records / runtime / tools / details 全部收进 inspector tabs，不再与 transcript 并权**

```vue
<nav class="chat-inspector-tabs" :aria-label="text('聊天侧栏', 'Chat inspector')">
  <button v-for="tab in inspectorTabs" :key="tab.id" type="button" class="surface-tab" :class="{ active: activeInspectorTab === tab.id }">
    {{ tab.label }}
  </button>
</nav>
<section class="chat-inspector-panel" v-if="activeInspectorTab === 'records'">
  <ChatRecordBrowserPanel />
</section>
<section class="chat-inspector-panel" v-else-if="activeInspectorTab === 'runtime'"></section>
<section class="chat-inspector-panel" v-else-if="activeInspectorTab === 'tools'"></section>
```

- [ ] **Step 3: 补 mobile guardrails：会话 rail 下沉到 drawer，inspector 下沉到 sheet，不压碎 composer**

```vue
<DialogRoot v-model:open="mobileSessionRailOpen">
  <DialogContent as-child>
    <aside class="chat-mobile-session-drawer">
      <SessionListPanel />
    </aside>
  </DialogContent>
</DialogRoot>

<DialogRoot v-model:open="mobileInspectorOpen">
  <DialogContent as-child>
    <section class="chat-mobile-inspector-sheet">
      <ChatRecordBrowserPanel />
    </section>
  </DialogContent>
</DialogRoot>
```

- [ ] **Step 4: 跑 Chat 定向验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-chat-layout-redesign.test.mjs \
  tests/system/studio-web-mobile-layout-guardrails.test.mjs \
  tests/system/studio-web-chat-shell-foundation.test.mjs \
  tests/system/studio-web-chat-mobile-sidebar.test.mjs
```

Expected:

```text
PASS typecheck
PASS chat layout tests
PASS existing chat shell/mobile sidebar tests
```

- [ ] **Step 5: 提交 Chat 布局收口**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ChatShellPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/ConversationPane.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/chat-v2/SessionListPanel.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-chat-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "重构：收口 Chat 主舞台与侧栏语法"
```

---

### Task 5: 把 Agents / Channels / Cron 统一进 Operate 工作台语法

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/cron/CronControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Test: `extensions/openclaw-studio/tests/system/studio-web-operate-layout-redesign.test.mjs`

- [ ] **Step 1: 在三类页面的外壳统一引入 `operate-workspace-shell`、`operate-resource-rail`、`operate-stage` 与 `operate-stage-task-head` 类名**

```vue
<section class="page-shell operate-workspace-shell">
  <aside class="panel-card operate-resource-rail"></aside>
  <section class="operate-stage">
    <article class="panel-card operate-stage-header">
      <div class="operate-stage-task-head">
        <div>
          <p class="eyebrow">Operate</p>
          <h3>{{ currentTitle }}</h3>
        </div>
        <div class="page-actions"></div>
      </div>
    </article>
    <RouterView />
  </section>
</section>
```

- [ ] **Step 2: 把 Agents 深页全部改成“深任务面”，不再重复 page-header-row**

```vue
<div class="operate-stage-task-head">
  <div>
    <p class="eyebrow">{{ agentId }}</p>
    <h3>{{ text('文档任务', 'Docs task') }}</h3>
    <p>{{ text('这里只处理当前 Agent 文档，不重复工作台外壳。', 'Only handle the current agent docs here without repeating workspace chrome.') }}</p>
  </div>
  <div class="page-actions">
    <button type="button" class="primary-button compact-button">{{ text('保存', 'Save') }}</button>
  </div>
</div>
```

- [ ] **Step 3: 把 Channels 与 Cron 收到同一语法：左侧选对象 / 中间当前任务 / 右侧次级 tabs，不再继续大卡并排**

```vue
<section class="operate-stage-panel-grid">
  <div class="operate-stage-main-panel">
    <div class="operate-stage-task-head">
      <div>
        <p class="eyebrow">{{ selectedChannel?.type || detail?.job.id }}</p>
        <h3>{{ stageTitle }}</h3>
      </div>
    </div>
  </div>

  <aside class="operate-stage-side-panel">
    <nav class="surface-tabs">
      <button class="surface-tab">{{ text('上下文', 'Context') }}</button>
      <button class="surface-tab">{{ text('历史', 'History') }}</button>
    </nav>
  </aside>
</section>
```

- [ ] **Step 4: 跑 Operate 定向验证**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
node --test \
  tests/system/studio-web-operate-layout-redesign.test.mjs \
  tests/system/studio-web-agents-workbench.test.mjs \
  tests/system/studio-web-channels-workspace.test.mjs
```

Expected:

```text
PASS typecheck
PASS operate layout tests
PASS existing agents/channels workspace tests
```

- [ ] **Step 5: 提交 Operate 工作台重构**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentsControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentDocsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentBindingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentSessionsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/agents/AgentAdvancedPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelsControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelAccessControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelPairingPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/channels/ChannelBindingsPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/cron/CronControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/tests/system/studio-web-operate-layout-redesign.test.mjs
git commit -m "重构：统一 Operate 工作台布局语法"
```

---

### Task 6: 收口 System / Terminal、更新进展文档并做总验证

**Files:**
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/system/SystemControlPage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/features/terminal/TerminalConsolePage.vue`
- Modify: `extensions/openclaw-studio/apps/web-vue/src/style.css`
- Modify: `extensions/openclaw-studio/docs/当前进展.md`
- Test: `extensions/openclaw-studio/tests/system/studio-web-system-terminal-layout-redesign.test.mjs`
- Test: `extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs`

- [ ] **Step 1: 把 System 改成“health strip + topic nav + 当前主题主视图 + 右侧 raw/diagnostics”的控制塔语法**

```vue
<section class="page-shell system-control-surface">
  <header class="system-health-strip"></header>
  <div class="system-control-grid">
    <aside class="system-topic-rail"></aside>
    <section class="system-main-stage">
      <div class="operate-stage-task-head">
        <div>
          <p class="eyebrow">System</p>
          <h3>{{ activeTabLabel }}</h3>
        </div>
      </div>
    </section>
    <aside class="system-raw-inspector"></aside>
  </div>
</section>
```

- [ ] **Step 2: 把 Terminal 改成“工具条 + 终端画布 + 右侧工具面板”，确保 terminal canvas 永远是主舞台**

```vue
<section class="page-shell terminal-workspace-surface">
  <header class="terminal-toolbar-strip"></header>
  <div class="terminal-workspace-grid">
    <section class="terminal-main-canvas">
      <TerminalCanvas />
    </section>
    <aside class="terminal-side-utilities">
      <section class="panel-card terminal-utility-panel"></section>
    </aside>
  </div>
</section>
```

- [ ] **Step 3: 更新 `docs/当前进展.md`，把 Home / Chat / Operate / System / Terminal 的新布局语法写入当前状态摘要**

```md
### Layout Redesign

- 平台壳层已收口为 `Home / Chat / Operate / System / Terminal`
- `Home` 现为总控首页，不再是等权入口墙
- `Chat` 现固定为 `session rail + conversation stage + inspector`
- `Operate` 统一覆盖 `agents / channels / cron`
- `System / Terminal` 现分别收口为控制塔与维护工作区
```

- [ ] **Step 4: 运行总验证并重建 graphify**

Run:

```bash
cd /home/binbin/.openclaw/extensions/openclaw-studio
npm run typecheck --workspace=apps/web-vue
npm run build --workspace=apps/web-vue
node --test \
  tests/system/studio-web-shell-layout-redesign.test.mjs \
  tests/system/studio-web-home-layout-redesign.test.mjs \
  tests/system/studio-web-chat-layout-redesign.test.mjs \
  tests/system/studio-web-operate-layout-redesign.test.mjs \
  tests/system/studio-web-system-terminal-layout-redesign.test.mjs \
  tests/system/studio-web-mobile-layout-guardrails.test.mjs
python3.12 ~/.claude/graphify-rebuild.py /home/binbin/.openclaw/extensions/openclaw-studio/.worktrees/studio-confirm-dialog-unification
```

Expected:

```text
PASS typecheck
PASS build
PASS all listed layout tests
graphify rebuild completes successfully
```

- [ ] **Step 5: 提交 System / Terminal 收口与文档同步**

```bash
cd /home/binbin/.openclaw
git add \
  extensions/openclaw-studio/apps/web-vue/src/features/system/SystemControlPage.vue \
  extensions/openclaw-studio/apps/web-vue/src/features/terminal/TerminalConsolePage.vue \
  extensions/openclaw-studio/apps/web-vue/src/style.css \
  extensions/openclaw-studio/docs/当前进展.md \
  extensions/openclaw-studio/tests/system/studio-web-system-terminal-layout-redesign.test.mjs \
  extensions/openclaw-studio/tests/system/studio-web-mobile-layout-guardrails.test.mjs
git commit -m "重构：完成 System 与 Terminal 新布局收口"
```

---

## Self-Review

### Spec coverage
- 平台壳层：Task 2
- 一级 / 二级导航重组：Task 2
- Home 总控首页：Task 3
- Chat IM/workspace 主舞台：Task 4
- Operate (`agents/channels/cron`) 工作台：Task 5
- System / Terminal 双入口：Task 6
- mobile guardrails：Task 1 / 4 / 6
- `room / workflow` 预留：Task 2（导航层预留，不加正式页面）

### Placeholder scan
- 未使用 `TBD`、`TODO`、`similar to`。
- 每个任务都给了明确文件、代码片段、命令和预期结果。

### Type / naming consistency
- 新壳层统一使用 `StudioShellTopbar`、`StudioShellContextRail`。
- 页面骨架统一使用 `shell-main-grid`、`home-control-surface`、`chat-main-stage`、`operate-workspace-shell`、`system-control-surface`、`terminal-workspace-surface`。
- 没有在后续任务里改名成第二套类名。
