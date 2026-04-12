# Studio Foundations Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working foundation slice of the Studio total redesign: unified shell route metadata, extracted shell chrome/state, an upgrade-sync inventory baseline, and a dashboard that consumes the new shell seams.

**Architecture:** Keep the existing “插件壳 + 模块化 API + Vue 工作台” structure intact, but add two new seams before deep domain rewrites: (1) a shell metadata seam that owns navigation and route grouping, and (2) an upgrade-sync seam that snapshots the current Studio surface for future OpenClaw upgrades. This plan intentionally stops before Config / Agents / Channels / Skills / Cron / Chat / Room / Workflow deep rewrites so those subsystems can each get their own follow-up plans.

**Tech Stack:** Vue 3, Vue Router, TypeScript, node:test, existing Studio API modules, CSS in `apps/web-vue/src/style.css`, Node scripts in `scripts/`

---

## Scope check

The approved spec spans multiple independent subsystems. Do **not** try to implement the whole blueprint in one plan. This plan covers only the first executable slice:

- Phase 0: upgrade-sync baseline
- Phase 1: shell / routing / dashboard foundation

Write separate follow-up plans before implementing these areas:

- `Config / Agents / Channels / Skills / Cron` management-domain redesign
- `Chat / Sessions` runtime-domain redesign
- `System / Terminal` system-domain redesign
- `Room / Workflow` detailed design + implementation plan **after** user requirement sync

## File structure and responsibilities

### New files to create

- `apps/web-vue/src/features/shell/route-manifest.ts` — one source of truth for current + future shell route metadata and nav grouping
- `apps/web-vue/src/features/shell/use-shell-navigation.ts` — localized nav-group adapter derived from the route manifest
- `apps/web-vue/src/features/shell/use-shell-chrome.ts` — shell layout state (`isMobile`, sidebar collapse, mobile drawer) extracted from `App.vue`
- `apps/web-vue/src/components/StudioContextPanel.vue` — right-side context panel scaffold for alerts / pending / recent changes
- `apps/web-vue/src/features/dashboard/overview-recipe.ts` — dashboard-to-shell mapping layer for quick actions and overview sections
- `scripts/studio-domain-inventory.mjs` — generates a machine-readable snapshot of web routes, API modules, and test surfaces for future upgrade diffing
- `docs/superpowers/inventories/studio-domain-inventory.json` — generated inventory artifact committed to the repo
- `tests/system/studio-web-shell-route-manifest.test.mjs` — regression test for unified shell route metadata
- `tests/system/studio-web-shell-chrome-layout.test.mjs` — regression test for extracted shell chrome + context panel
- `tests/system/studio-domain-inventory.test.mjs` — regression test for the upgrade-sync inventory script
- `tests/system/studio-web-dashboard-shell-overview.test.mjs` — regression test for dashboard overview recipe wiring

### Existing files to modify

- `apps/web-vue/src/App.vue` — stop owning nav metadata and shell layout state directly; consume new shell adapters
- `apps/web-vue/src/router.ts` — derive routes from `route-manifest.ts`
- `apps/web-vue/src/style.css` — add shell grid / context panel / dashboard overview foundation styles
- `apps/web-vue/src/views/DashboardView.vue` — stop hardcoding quick-action semantics; consume `overview-recipe.ts`
- `apps/web-vue/src/main.ts` — keep the boot path stable; only touch if a new shell stylesheet import is necessary
- `package.json` — add `studio:inventory` script

### Existing files to use for regression coverage

- `tests/system/studio-web-sidebar-primitives.test.mjs`
- `tests/system/studio-web-dashboard-recipe.test.mjs`
- `tests/system/studio-web-page-chrome-density.test.mjs`

---

### Task 1: Unify shell route metadata

**Files:**
- Create: `apps/web-vue/src/features/shell/route-manifest.ts`
- Create: `apps/web-vue/src/features/shell/use-shell-navigation.ts`
- Modify: `apps/web-vue/src/router.ts`
- Modify: `apps/web-vue/src/App.vue`
- Test: `tests/system/studio-web-shell-route-manifest.test.mjs`
- Regression: `tests/system/studio-web-sidebar-primitives.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const manifestPath = path.join(rootDir, 'apps/web-vue/src/features/shell/route-manifest.ts');
const navPath = path.join(rootDir, 'apps/web-vue/src/features/shell/use-shell-navigation.ts');
const routerPath = path.join(rootDir, 'apps/web-vue/src/router.ts');
const appPath = path.join(rootDir, 'apps/web-vue/src/App.vue');

test('shell route manifest defines grouped current routes and future placeholders', () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.match(manifest, /key:\s*'overview'/);
  assert.match(manifest, /key:\s*'operations'/);
  assert.match(manifest, /key:\s*'management'/);
  assert.match(manifest, /key:\s*'system'/);
  assert.match(manifest, /key:\s*'dashboard'/);
  assert.match(manifest, /key:\s*'chat'/);
  assert.match(manifest, /key:\s*'config'/);
  assert.match(manifest, /key:\s*'room'/);
  assert.match(manifest, /future:\s*true/);
});

test('router and app consume shell route metadata instead of local mock navigation', () => {
  assert.equal(fs.existsSync(navPath), true);
  const router = fs.readFileSync(routerPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(router, /from '\.\/features\/shell\/route-manifest'/);
  assert.match(router, /shellRoutes/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-navigation'/);
  assert.doesNotMatch(app, /useUiContent/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-shell-route-manifest.test.mjs`
Expected: FAIL because `route-manifest.ts` and `use-shell-navigation.ts` do not exist, and `App.vue` still imports `useUiContent`.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/shell/route-manifest.ts`

```ts
import type { RouteRecordRaw } from 'vue-router';

const DashboardView = () => import('../../views/DashboardView.vue');
const AgentsView = () => import('../../views/AgentsView.vue');
const ChatView = () => import('../../views/ChatView.vue');
const ChannelsView = () => import('../../views/ChannelsView.vue');
const SkillsView = () => import('../../views/SkillsView.vue');
const CronView = () => import('../../views/CronView.vue');
const TerminalView = () => import('../../views/TerminalView.vue');
const ConfigView = () => import('../../views/ConfigView.vue');
const SystemView = () => import('../../views/SystemView.vue');
const DreamingView = () => import('../../views/DreamingView.vue');
const ChatShellPage = () => import('../chat-v2/ChatShellPage.vue');
const AgentsControlPage = () => import('../agents/AgentsControlPage.vue');
const AgentDocsPage = () => import('../agents/AgentDocsPage.vue');
const AgentBindingsPage = () => import('../agents/AgentBindingsPage.vue');
const AgentAdvancedPage = () => import('../agents/AgentAdvancedPage.vue');
const AgentSessionsPage = () => import('../agents/AgentSessionsPage.vue');
const ChannelsControlPage = () => import('../channels/ChannelsControlPage.vue');
const ChannelProviderSettingsPage = () => import('../channels/ChannelProviderSettingsPage.vue');
const ChannelAccountDetailPage = () => import('../channels/ChannelAccountDetailPage.vue');
const ChannelAccessControlPage = () => import('../channels/ChannelAccessControlPage.vue');
const ChannelPairingPage = () => import('../channels/ChannelPairingPage.vue');
const ChannelBindingsPage = () => import('../channels/ChannelBindingsPage.vue');

export type ShellNavLeaf = {
  key: string;
  title: { zh: string; en: string };
  to: string;
  enabled: boolean;
  future?: boolean;
};

export type ShellNavGroup = {
  key: 'overview' | 'operations' | 'management' | 'system';
  title: { zh: string; en: string };
  items: ShellNavLeaf[];
};

export const shellNavGroups: ShellNavGroup[] = [
  {
    key: 'overview',
    title: { zh: '总览', en: 'Overview' },
    items: [
      { key: 'dashboard', title: { zh: '总览', en: 'Dashboard' }, to: '/dashboard', enabled: true },
    ],
  },
  {
    key: 'operations',
    title: { zh: '运营', en: 'Operations' },
    items: [
      { key: 'chat', title: { zh: 'Chat / Sessions', en: 'Chat / Sessions' }, to: '/chat', enabled: true },
      { key: 'room', title: { zh: 'Room', en: 'Room' }, to: '/room', enabled: false, future: true },
      { key: 'workflow', title: { zh: 'Workflow', en: 'Workflow' }, to: '/workflow', enabled: false, future: true },
      { key: 'terminal', title: { zh: '终端', en: 'Terminal' }, to: '/terminal', enabled: true },
    ],
  },
  {
    key: 'management',
    title: { zh: '管理', en: 'Management' },
    items: [
      { key: 'config', title: { zh: '配置', en: 'Config' }, to: '/config', enabled: true },
      { key: 'agents', title: { zh: 'Agents', en: 'Agents' }, to: '/agents', enabled: true },
      { key: 'channels', title: { zh: 'Channels', en: 'Channels' }, to: '/channels', enabled: true },
      { key: 'skills', title: { zh: 'Skills', en: 'Skills' }, to: '/skills', enabled: true },
      { key: 'cron', title: { zh: 'Cron', en: 'Cron' }, to: '/cron', enabled: true },
    ],
  },
  {
    key: 'system',
    title: { zh: '系统', en: 'System' },
    items: [
      { key: 'system', title: { zh: '系统', en: 'System' }, to: '/system', enabled: true },
      { key: 'dreaming', title: { zh: 'Dreaming', en: 'Dreaming' }, to: '/dreaming', enabled: true },
    ],
  },
];

export const shellRoutes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView },
  {
    path: '/agents',
    component: AgentsView,
    children: [
      { path: '', component: AgentsControlPage },
      { path: ':agentId', component: AgentsControlPage },
      { path: ':agentId/docs', component: AgentDocsPage },
      { path: ':agentId/bindings', component: AgentBindingsPage },
      { path: ':agentId/sessions', component: AgentSessionsPage },
      { path: ':agentId/advanced', component: AgentAdvancedPage },
    ],
  },
  {
    path: '/chat',
    component: ChatView,
    children: [
      { path: '', component: ChatShellPage, props: { shellMode: 'chat' } },
      { path: 'workbench', component: ChatShellPage, props: { shellMode: 'inspect' } },
      { path: 's/:sessionRef', component: ChatShellPage, props: { shellMode: 'chat' } },
    ],
  },
  {
    path: '/channels',
    component: ChannelsView,
    children: [
      { path: '', component: ChannelsControlPage },
      { path: ':type', component: ChannelsControlPage },
      { path: ':type/settings', component: ChannelProviderSettingsPage },
      { path: ':type/accounts/:accountId', component: ChannelAccountDetailPage },
      { path: ':type/accounts/:accountId/access', component: ChannelAccessControlPage },
      { path: ':type/accounts/:accountId/pairing', component: ChannelPairingPage },
      { path: ':type/bindings', component: ChannelBindingsPage },
    ],
  },
  { path: '/skills', component: SkillsView },
  { path: '/cron', component: CronView },
  { path: '/dreaming', component: DreamingView },
  { path: '/terminal', component: TerminalView },
  { path: '/config', component: ConfigView },
  { path: '/system', component: SystemView },
];
```

`apps/web-vue/src/features/shell/use-shell-navigation.ts`

```ts
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import { shellNavGroups } from './route-manifest';

export function useShellNavigation() {
  const { text } = useLocalePreference();

  const navGroups = computed(() => shellNavGroups.map((group) => ({
    label: text(group.title.zh, group.title.en),
    items: group.items
      .filter((item) => item.enabled)
      .map((item) => ({
        label: text(item.title.zh, item.title.en),
        to: item.to,
      })),
  })));

  return { navGroups };
}
```

`apps/web-vue/src/router.ts`

```ts
import { createRouter, createWebHistory } from 'vue-router';
import { getStudioAppBasePath } from './shared/runtime-config';
import { shellRoutes } from './features/shell/route-manifest';

function getRouterBase(): string {
  return getStudioAppBasePath();
}

export const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes: shellRoutes,
});
```

`apps/web-vue/src/App.vue` (script excerpt)

```ts
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTrigger, TooltipProvider } from 'reka-ui';
import { RouterView, useRoute } from 'vue-router';
import StudioSidebarRail from './components/StudioSidebarRail.vue';
import { useShellNavigation } from './features/shell/use-shell-navigation';
import { useLocalePreference, type Locale } from './shared/locale';
import { useThemePreference, type ThemeMode } from './shared/theme';

const { locale, setLocale, text } = useLocalePreference();
const { navGroups } = useShellNavigation();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-sidebar-primitives.test.mjs`
Expected: PASS. The new test should confirm that `App.vue` and `router.ts` use the shell metadata seam, and the existing sidebar primitive test should stay green.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/shell/route-manifest.ts \
  apps/web-vue/src/features/shell/use-shell-navigation.ts \
  apps/web-vue/src/router.ts \
  apps/web-vue/src/App.vue \
  tests/system/studio-web-shell-route-manifest.test.mjs

git commit -m "壳层：统一路由清单"
```

### Task 2: Extract shell chrome state and add the right-side context panel scaffold

**Files:**
- Create: `apps/web-vue/src/features/shell/use-shell-chrome.ts`
- Create: `apps/web-vue/src/components/StudioContextPanel.vue`
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/style.css`
- Test: `tests/system/studio-web-shell-chrome-layout.test.mjs`
- Regression: `tests/system/studio-web-page-chrome-density.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const appPath = path.join(rootDir, 'apps/web-vue/src/App.vue');
const chromePath = path.join(rootDir, 'apps/web-vue/src/features/shell/use-shell-chrome.ts');
const panelPath = path.join(rootDir, 'apps/web-vue/src/components/StudioContextPanel.vue');
const stylePath = path.join(rootDir, 'apps/web-vue/src/style.css');

test('app shell extracts layout state into a shell composable and renders a context panel scaffold', () => {
  assert.equal(fs.existsSync(chromePath), true);
  assert.equal(fs.existsSync(panelPath), true);
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /from '\.\/features\/shell\/use-shell-chrome'/);
  assert.match(app, /StudioContextPanel/);
  assert.doesNotMatch(app, /function updateViewportState\(/);
  assert.doesNotMatch(app, /function toggleSidebar\(/);
});

test('shell styles define a three-region layout and context panel surface', () => {
  const css = fs.readFileSync(stylePath, 'utf8');
  assert.match(css, /\.shell-layout\s*\{/);
  assert.match(css, /\.shell-context-panel\s*\{/);
  assert.match(css, /\.shell-main-stage\s*\{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-shell-chrome-layout.test.mjs`
Expected: FAIL because the shell composable and context panel files do not exist yet, and `App.vue` still owns sidebar viewport logic inline.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/shell/use-shell-chrome.ts`

```ts
import { onMounted, onUnmounted, ref, watch } from 'vue';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'openclaw-studio.sidebar-collapsed';

export function useShellChrome() {
  const sidebarCollapsed = ref(false);
  const isMobile = ref(false);
  const mobileSidebarOpen = ref(false);

  function updateViewportState() {
    if (typeof window === 'undefined') return;
    const mobile = window.innerWidth <= 920;
    isMobile.value = mobile;
    if (!mobile) mobileSidebarOpen.value = false;
  }

  function syncSidebarPreference() {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    sidebarCollapsed.value = saved === 'true';
  }

  function persistSidebarPreference(value: boolean) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
  }

  function toggleSidebar() {
    if (isMobile.value) {
      mobileSidebarOpen.value = !mobileSidebarOpen.value;
      return;
    }
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function handleSidebarNavigate() {
    if (isMobile.value) mobileSidebarOpen.value = false;
  }

  onMounted(() => {
    updateViewportState();
    syncSidebarPreference();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateViewportState, { passive: true });
    }
  });

  watch(sidebarCollapsed, (value) => {
    if (!isMobile.value) persistSidebarPreference(value);
  });

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateViewportState);
    }
  });

  return {
    isMobile,
    mobileSidebarOpen,
    sidebarCollapsed,
    toggleSidebar,
    handleSidebarNavigate,
  };
}
```

`apps/web-vue/src/components/StudioContextPanel.vue`

```vue
<template>
  <aside class="shell-context-panel" :class="{ compact: compact }">
    <section class="shell-context-section">
      <p class="eyebrow">{{ text('ALERTS', 'ALERTS') }}</p>
      <h3>{{ text('待处理与风险', 'Pending and Risk') }}</h3>
      <ul class="shell-context-list">
        <li>{{ text('当前阶段先接入壳层占位，后续改成真实告警数据。', 'Use shell placeholders first, then replace them with real alert data.') }}</li>
        <li>{{ text('右侧面板未来承载告警、待处理、最近变更。', 'This panel will host alerts, pending items, and recent changes later.') }}</li>
      </ul>
    </section>

    <section class="shell-context-section">
      <p class="eyebrow">{{ text('NEXT', 'NEXT') }}</p>
      <h3>{{ text('后续接入点', 'Next integration points') }}</h3>
      <ul class="shell-context-list">
        <li>Dashboard summary</li>
        <li>System diagnostics</li>
        <li>Config diff preview</li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../shared/locale';

defineProps<{
  compact?: boolean;
}>();

const { text } = useLocalePreference();
</script>
```

`apps/web-vue/src/App.vue` (template + script excerpts)

```vue
<template>
  <TooltipProvider :delay-duration="140" :skip-delay-duration="80" :disable-hoverable-content="true">
    <div class="app-container shell-layout" :class="{ mobile: isMobile, 'sidebar-collapsed': !isMobile && sidebarCollapsed, 'chat-shell': isChatSurface }">
      <aside v-if="!isMobile" class="sidebar sidebar-rail" :class="{ collapsed: sidebarCollapsed }">
        <!-- existing StudioSidebarRail remains here -->
      </aside>

      <main class="main-content shell-main shell-main-stage" :class="{ 'chat-surface-route': isChatSurface, 'shell-main-chat': isChatSurface }">
        <RouterView v-slot="{ Component }">
          <section class="shell-route-stage" :class="{ 'shell-route-stage-chat': isChatSurface }">
            <component :is="Component" />
          </section>
        </RouterView>
      </main>

      <StudioContextPanel v-if="!isChatSurface && !isMobile" />
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import StudioContextPanel from './components/StudioContextPanel.vue';
import { useShellChrome } from './features/shell/use-shell-chrome';

const {
  isMobile,
  mobileSidebarOpen,
  sidebarCollapsed,
  toggleSidebar,
  handleSidebarNavigate,
} = useShellChrome();
</script>
```

`apps/web-vue/src/style.css` (additive excerpt)

```css
.shell-layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 320px;
  min-height: 100vh;
}

.shell-main-stage {
  min-width: 0;
  padding-right: 0;
}

.shell-context-panel {
  position: sticky;
  top: 0;
  align-self: start;
  min-height: 100vh;
  padding: 24px 20px;
  border-left: 1px solid var(--glass-stroke-soft);
  background: var(--glass-surface-2);
  backdrop-filter: blur(16px);
}

.shell-context-section + .shell-context-section {
  margin-top: 24px;
}

.shell-context-list {
  margin: 12px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-shell-chrome-layout.test.mjs tests/system/studio-web-page-chrome-density.test.mjs`
Expected: PASS. The new shell-chrome test confirms extraction + context panel scaffolding, and the existing density regression stays green.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/shell/use-shell-chrome.ts \
  apps/web-vue/src/components/StudioContextPanel.vue \
  apps/web-vue/src/App.vue \
  apps/web-vue/src/style.css \
  tests/system/studio-web-shell-chrome-layout.test.mjs

git commit -m "壳层：抽离布局状态"
```

### Task 3: Add the upgrade-sync inventory baseline

**Files:**
- Create: `scripts/studio-domain-inventory.mjs`
- Create: `docs/superpowers/inventories/studio-domain-inventory.json`
- Modify: `package.json`
- Test: `tests/system/studio-domain-inventory.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-domain-inventory.json');

test('studio inventory script writes a machine-readable baseline for routes, api modules, and test surfaces', () => {
  const result = spawnSync('node', ['scripts/studio-domain-inventory.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outputPath), true);

  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.ok(Array.isArray(payload.webRoutes));
  assert.ok(Array.isArray(payload.apiModules));
  assert.ok(Array.isArray(payload.webFeatures));
  assert.ok(Array.isArray(payload.testSuites));
  assert.ok(payload.webRoutes.includes('/dashboard'));
  assert.ok(payload.apiModules.includes('config'));
  assert.ok(payload.webFeatures.includes('chat-v2'));
  assert.ok(payload.testSuites.includes('tests/system/config-service.test.mjs'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-domain-inventory.test.mjs`
Expected: FAIL because the script and generated JSON file do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`scripts/studio-domain-inventory.mjs`

```js
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const routerPath = path.join(rootDir, 'apps/web-vue/src/router.ts');
const featuresDir = path.join(rootDir, 'apps/web-vue/src/features');
const apiModulesDir = path.join(rootDir, 'apps/api/modules');
const testsDir = path.join(rootDir, 'tests');
const outputPath = path.join(rootDir, 'docs/superpowers/inventories/studio-domain-inventory.json');

function listNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(absolute, nextPrefix));
      continue;
    }
    result.push(nextPrefix);
  }
  return result.sort();
}

function readRoutes() {
  const source = fs.readFileSync(routerPath, 'utf8');
  return Array.from(source.matchAll(/path:\s*'([^']+)'/g)).map((match) => match[1]);
}

const payload = {
  generatedAt: new Date().toISOString(),
  webRoutes: readRoutes(),
  apiModules: listNames(apiModulesDir),
  webFeatures: listNames(featuresDir),
  testSuites: listFiles(testsDir, 'tests').filter((file) => file.endsWith('.test.mjs') || file.endsWith('.test.ts')),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${path.relative(rootDir, outputPath)}`);
```

`package.json` (script excerpt)

```json
{
  "scripts": {
    "studio:inventory": "node scripts/studio-domain-inventory.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

`docs/superpowers/inventories/studio-domain-inventory.json`

```json
{
  "generatedAt": "2026-04-12T00:00:00.000Z",
  "webRoutes": ["/", "/dashboard", "/agents", "/chat", "/channels", "/skills", "/cron", "/dreaming", "/terminal", "/config", "/system"],
  "apiModules": ["agents", "channels", "chat", "config", "cron", "dashboard", "skills", "system", "terminal"],
  "webFeatures": ["agents", "channels", "chat", "chat-v2", "config", "cron", "dashboard", "skills", "system", "terminal"],
  "testSuites": ["tests/chat/chat-runtime-view-model.test.ts", "tests/system/config-service.test.mjs"]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-domain-inventory.test.mjs`
Expected: PASS. The script should write `docs/superpowers/inventories/studio-domain-inventory.json` and the payload should include routes, modules, features, and test suites.

- [ ] **Step 5: Commit**

```bash
git add \
  scripts/studio-domain-inventory.mjs \
  docs/superpowers/inventories/studio-domain-inventory.json \
  package.json \
  tests/system/studio-domain-inventory.test.mjs

git commit -m "同步：加入域清单基线"
```

### Task 4: Wire the dashboard to the new shell foundation

**Files:**
- Create: `apps/web-vue/src/features/dashboard/overview-recipe.ts`
- Modify: `apps/web-vue/src/views/DashboardView.vue`
- Modify: `apps/web-vue/src/style.css`
- Test: `tests/system/studio-web-dashboard-shell-overview.test.mjs`
- Regression: `tests/system/studio-web-dashboard-recipe.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const recipePath = path.join(rootDir, 'apps/web-vue/src/features/dashboard/overview-recipe.ts');
const dashboardPath = path.join(rootDir, 'apps/web-vue/src/views/DashboardView.vue');

test('dashboard overview recipe derives quick actions from the shell foundation', () => {
  assert.equal(fs.existsSync(recipePath), true);
  const recipe = fs.readFileSync(recipePath, 'utf8');
  assert.match(recipe, /from '\.\.\/shell\/route-manifest'/);
  assert.match(recipe, /buildDashboardQuickActions/);
  assert.match(recipe, /buildDashboardOverviewSignals/);
});

test('dashboard view consumes the overview recipe instead of hardcoding all quick-action semantics locally', () => {
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  assert.match(dashboard, /from '\.\.\/features\/dashboard\/overview-recipe'/);
  assert.match(dashboard, /buildDashboardQuickActions/);
  assert.match(dashboard, /buildDashboardOverviewSignals/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-dashboard-shell-overview.test.mjs`
Expected: FAIL because `overview-recipe.ts` does not exist and `DashboardView.vue` still owns all overview mapping logic inline.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/dashboard/overview-recipe.ts`

```ts
import type { DashboardSummaryPayload } from '../../../../../types/dashboard';
import { shellNavGroups } from '../shell/route-manifest';

type QuickAction = {
  eyebrow: string;
  label: string;
  copy: string;
  to: string;
};

type OverviewSignal = {
  label: string;
  value: string;
  detail: string;
};

function managementRoutes() {
  return shellNavGroups.find((group) => group.key === 'management')?.items.filter((item) => item.enabled) || [];
}

export function buildDashboardQuickActions(text: (zh: string, en: string) => string): QuickAction[] {
  const routes = managementRoutes();
  return routes.slice(0, 4).map((item) => ({
    eyebrow: text('快速入口', 'Quick entry'),
    label: text(item.title.zh, item.title.en),
    copy: text('从总览直接进入该管理域。', 'Jump straight into this management domain from the overview.'),
    to: item.to,
  }));
}

export function buildDashboardOverviewSignals(summary: DashboardSummaryPayload | null, text: (zh: string, en: string) => string): OverviewSignal[] {
  if (!summary) {
    return [
      {
        label: text('状态', 'Status'),
        value: '--',
        detail: text('等待 Dashboard summary。', 'Waiting for dashboard summary.'),
      },
    ];
  }

  return [
    {
      label: text('Gateway', 'Gateway'),
      value: summary.gateway.connected ? text('在线', 'Online') : text('离线', 'Offline'),
      detail: summary.gateway.url || '--',
    },
    {
      label: text('传输模式', 'Transport'),
      value: summary.transport.mode,
      detail: summary.transport.entryUrl || '--',
    },
    {
      label: text('当前版本', 'Current version'),
      value: summary.release.currentVersion || '--',
      detail: summary.release.latestVersion || '--',
    },
  ];
}
```

`apps/web-vue/src/views/DashboardView.vue` (script excerpt)

```ts
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { motion } from 'motion-v';
import { useLocalePreference } from '../shared/locale';
import { fetchDashboardSummary, subscribeDashboardSummary } from '../features/dashboard/api';
import { buildDashboardOverviewSignals, buildDashboardQuickActions } from '../features/dashboard/overview-recipe';
import type { DashboardSummaryPayload } from '../../../../types/dashboard';
import { pageMastheadReveal, pageSurfaceReveal } from '../shared/motion';

const { locale, text } = useLocalePreference();
const summary = ref<DashboardSummaryPayload | null>(null);

const dashboardQuickActions = computed(() => buildDashboardQuickActions(text));
const dashboardSystemSignals = computed(() => buildDashboardOverviewSignals(summary.value, text));
```

`apps/web-vue/src/style.css` (additive excerpt)

```css
.dashboard-action-belt,
.dashboard-overview-river,
.dashboard-signal-runway {
  container-type: inline-size;
}

.dashboard-domain-stream__list {
  display: grid;
  gap: 12px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-dashboard-shell-overview.test.mjs tests/system/studio-web-dashboard-recipe.test.mjs`
Expected: PASS. The new dashboard recipe test should confirm the recipe seam exists and the existing dashboard recipe regression should stay green.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/dashboard/overview-recipe.ts \
  apps/web-vue/src/views/DashboardView.vue \
  apps/web-vue/src/style.css \
  tests/system/studio-web-dashboard-shell-overview.test.mjs

git commit -m "总览：接入壳层配方"
```

### Task 5: Run the foundation gate and document the next planning split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-12-studio-foundations-phase-0-1.md`
- Verify: `apps/web-vue/src/App.vue`
- Verify: `apps/web-vue/src/router.ts`
- Verify: `scripts/studio-domain-inventory.mjs`
- Verify: `apps/web-vue/src/views/DashboardView.vue`

- [ ] **Step 1: Write the verification checklist into the plan footer**

```md
## Foundation exit criteria

- Shell navigation comes from one route manifest source.
- `App.vue` no longer owns shell viewport state inline.
- A right-side context panel scaffold exists for non-chat routes.
- `npm run studio:inventory` writes a committed inventory baseline.
- Dashboard quick actions and overview signals consume a dedicated mapping layer.
- All targeted node tests pass.
- `npm run typecheck:web` passes.
- Each completed task is committed with a short Chinese commit message.

## Required follow-up plans

1. Management domain redesign plan (`Config / Agents / Channels / Skills / Cron`)
2. Runtime domain redesign plan (`Chat / Sessions`)
3. System domain redesign plan (`System / Terminal`)
4. Room / Workflow detailed co-design plan with user sync first
```

- [ ] **Step 2: Run the full foundation verification gate**

Run: `node --test tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs tests/system/studio-web-sidebar-primitives.test.mjs tests/system/studio-web-dashboard-recipe.test.mjs tests/system/studio-web-page-chrome-density.test.mjs && npm run typecheck:web && npm run studio:inventory`
Expected: PASS. All targeted shell / dashboard / inventory regressions pass, TypeScript stays green, and the inventory file is freshly regenerated.

- [ ] **Step 3: Fix only the seam that failed and keep the diff local**

Apply one of these exact fix paths before re-running the gate:

- Navigation / route failure → edit only `apps/web-vue/src/features/shell/route-manifest.ts`, `apps/web-vue/src/features/shell/use-shell-navigation.ts`, or `apps/web-vue/src/router.ts`
- Shell layout failure → edit only `apps/web-vue/src/features/shell/use-shell-chrome.ts`, `apps/web-vue/src/components/StudioContextPanel.vue`, `apps/web-vue/src/App.vue`, or `apps/web-vue/src/style.css`
- Inventory failure → edit only `scripts/studio-domain-inventory.mjs`, `package.json`, or `docs/superpowers/inventories/studio-domain-inventory.json`
- Dashboard overview failure → edit only `apps/web-vue/src/features/dashboard/overview-recipe.ts`, `apps/web-vue/src/views/DashboardView.vue`, or `apps/web-vue/src/style.css`

Then stage only the corrected files for that seam before the next gate run.

- [ ] **Step 4: Re-run the full foundation verification gate**

Run: `node --test tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-shell-chrome-layout.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/studio-web-dashboard-shell-overview.test.mjs tests/system/studio-web-sidebar-primitives.test.mjs tests/system/studio-web-dashboard-recipe.test.mjs tests/system/studio-web-page-chrome-density.test.mjs && npm run typecheck:web && npm run studio:inventory`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the gate result and plan split note**

```bash
git add \
  docs/superpowers/plans/2026-04-12-studio-foundations-phase-0-1.md \
  docs/superpowers/inventories/studio-domain-inventory.json

git commit -m "计划：完成基础阶段收口"
```
