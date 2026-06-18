# OpenClaw Studio 新壳地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `apps/web-vue-next` 并行前端壳，搭好设计系统（材质派 token + Tailwind v4）、Pinia 状态层、应用外壳骨架（单栏分组导航 + ⌘K 命令面板），并打通复用现有后端 API 的集成缝——为后续逐页迁移铺好地基。

**Architecture:** 在同一 monorepo 新增 workspace `apps/web-vue-next`（Vue 3 + vue-router + Tailwind v4 + Reka UI + Pinia，全部已装/已在旧壳验证）。设计系统按 `docs/界面设计守则.md` 落地（材质派 token、层次化）。导航用单栏分组（非 VS Code 活动栏）。复用旧壳 `shared/` 的 API 客户端契约（`getApiBase` / `getStudioRuntimeConfig`）作为集成缝，让新壳消费同一后端。最终切流靠 `apps/api/config.ts` 的 `webDistDir` 配置翻转，不改后端代码。

**Tech Stack:** Vue 3.5 · vue-router 4 · Tailwind CSS v4.3（`@tailwindcss/vite`）· Reka UI 2.9 · Pinia（新增）· lucide-vue-next · TypeScript · Vite

**参考原型（不照搬，仅视觉参考）：** `~/.gstack/projects/openclaw-studio/designs/chat-workbench-rebuild-20260617/app-shell-v2.html`

**设计宪法：** `docs/界面设计守则.md`（2026-06-17 材质派重写版）

---

## File Structure

```
apps/web-vue-next/
├── package.json                    # 新 workspace，deps 复刻 web-vue + pinia
├── vite.config.ts                  # 同构配置，@ 别名指向 src
├── tsconfig.json
├── index.html                      # Vite 入口
├── src/
│   ├── main.ts                     # createApp + router + pinia + tailwind 入口
│   ├── style/
│   │   ├── tokens.css              # §3-5 材质/圆角/阴影/配色 token（深浅双主题）
│   │   └── main.css                # @import tokens + @tailwind + 基础重置
│   ├── lib/
│   │   └── api-client.ts           # 复用旧壳 shared/ 的 API 契约（集成缝）
│   ├── stores/
│   │   ├── index.ts                # createPinia + 注册
│   │   └── ui-store.ts             # 导航折叠状态、主题（Pinia 首个 store）
│   ├── components/
│   │   ├── studio/
│   │   │   ├── StudioPanel.vue      # 材质面板原子（thin/thick/floating）
│   │   │   └── StudioButton.vue     # 按钮原子（primary/ghost/icon）
│   │   ├── nav/
│   │   │   ├── GlobalNav.vue        # 单栏分组导航（§6）
│   │   │   └── NavItem.vue          # 导航项（展开=图标+文字，折叠=图标+tooltip）
│   │   └── AppShell.vue             # 外壳布局（导航 + 内容区）
│   ├── features/
│   │   └── command-palette/
│   │       └── CommandPalette.vue   # ⌘K 快速跳转（§6）
│   ├── routes/
│   │   ├── index.ts                 # router（占位路由，逐页迁移时填充）
│   │   └── nav-manifest.ts          # 16 页面的分组导航清单（单数据源）
│   └── views/
│       └── PlaceholderView.vue      # 占位页（迁移期）
└── tests/
    └── unit/                        # Vitest 单测
```

**责任边界：**
- `style/tokens.css` = 唯一设计 token 源头，所有组件只用 token 不写魔法值。
- `lib/api-client.ts` = 新壳与后端之间的唯一缝，转发到旧壳 `shared/`（迁移期复用，避免重写网络层）。
- `routes/nav-manifest.ts` = 导航与路由的单一数据源，`GlobalNav` 和 `CommandPalette` 都读它。
- `stores/ui-store.ts` = 跨组件 UI 状态（导航折叠、主题），用 Pinia 替代旧壳的散落 ref。

---

## Task 1: 新建 web-vue-next workspace 骨架

**Files:**
- Create: `apps/web-vue-next/package.json`
- Create: `apps/web-vue-next/vite.config.ts`
- Create: `apps/web-vue-next/tsconfig.json`
- Create: `apps/web-vue-next/index.html`
- Modify: `package.json`（根 workspace 声明）

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "openclaw-studio-web-next",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "pinia": "^2.2.0",
    "reka-ui": "^2.9.5",
    "vue": "^3.5.13",
    "vue-router": "^4.5.0",
    "lucide-vue-next": "^1.0.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.3.0",
    "@tailwindcss/vite": "^4.3.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "@vue/test-utils": "^2.4.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: 注册到根 workspace**

Modify `package.json` 根文件 `workspaces` 字段：

```json
"workspaces": ["apps/api", "apps/web-vue", "apps/web-vue-next"]
```

- [ ] **Step 3: 创建 vite.config.ts**

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 4: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "src/**/*.d.ts"]
}
```

- [ ] **Step 5: 创建 index.html**

```html
<!doctype html>
<html lang="zh" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenClaw Studio</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: 安装依赖并验证 workspace 可识别**

Run: `cd /home/binbin/.openclaw/extensions/openclaw-studio && npm install`
Expected: 安装成功，`apps/web-vue-next` 出现在 workspace 列表，`node_modules/.bin/vite` 可用。

- [ ] **Step 7: 提交**

```bash
git add apps/web-vue-next/package.json apps/web-vue-next/vite.config.ts apps/web-vue-next/tsconfig.json apps/web-vue-next/index.html package.json package-lock.json
git commit -m "feat(web-next): scaffold parallel frontend workspace"
```

---

## Task 2: 设计 token 系统（材质派，深浅双主题）

**Files:**
- Create: `apps/web-vue-next/src/style/tokens.css`
- Create: `apps/web-vue-next/src/style/main.css`

依据：守则 §3（材质分层）、§4（圆角阴影）、§5（配色双主题）。token 从旧壳 `apps/web-vue/src/style.css` 的 `--mono-*` 值搬来，保持视觉连续。

- [ ] **Step 1: 创建 tokens.css（深色默认 + 浅色）**

```css
/* OpenClaw Studio 设计 token —— 材质派。唯一 token 源头。
   依据 docs/界面设计守则.md §3-5。禁止在组件里写魔法值。 */

:root,
[data-theme='dark'] {
  /* 系统色（§5） */
  --sys-blue: #0a84ff;
  --sys-green: #30d158;
  --sys-orange: #ff9f0a;
  --sys-red: #ff453a;
  --sys-teal: #64d2ff;
  --sys-purple: #bf5af2;

  /* 底 + 材质（§3）—— graphite 黑底，毛玻璃从桌面透出 */
  --surface-desktop: #000000;
  --material-thin: rgba(38, 38, 42, 0.55);     /* 侧栏、检视器 */
  --material-thick: rgba(28, 28, 30, 0.72);    /* 主舞台、输入区 */
  --material-floating: rgba(48, 48, 52, 0.92); /* 卡片、弹层、菜单 */
  --material-sidebar: rgba(28, 28, 30, 0.6);

  /* 文字四档（§5） */
  --text-primary: #f5f5f7;
  --text-secondary: #a8a8ad;
  --text-tertiary: #74747a;
  --text-quaternary: #48484c;

  /* 发丝线 + 填充（§5） */
  --hairline: rgba(255, 255, 255, 0.08);
  --hairline-strong: rgba(255, 255, 255, 0.14);
  --fill: rgba(120, 120, 128, 0.18);
  --fill-strong: rgba(120, 120, 128, 0.3);

  /* 材质模糊量级（§3） */
  --blur-thin: saturate(180%) blur(30px);
  --blur-thick: saturate(180%) blur(40px);
  --blur-floating: saturate(200%) blur(24px);

  /* 圆角层次（§4）—— 材料越浮越大 */
  --radius-control: 8px;
  --radius-panel: 12px;
  --radius-card: 14px;
  --radius-floating: 16px;
  --radius-pill: 980px;

  /* 阴影三档（§4）—— 多层柔和 elevation */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.28), 0 0 0 0.5px var(--hairline);
  --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.32), 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 0.5px var(--hairline);
  --shadow-3: 0 14px 36px rgba(0, 0, 0, 0.48), 0 4px 12px rgba(0, 0, 0, 0.36), 0 0 0 0.5px var(--hairline);

  /* 桌面环境光晕（§3，毛玻璃透出处） */
  --ambient-1: radial-gradient(circle at 12% 16%, color-mix(in srgb, var(--sys-blue) 16%, transparent), transparent 42%);
  --ambient-2: radial-gradient(circle at 88% 84%, color-mix(in srgb, var(--sys-teal) 10%, transparent), transparent 42%);

  /* accent 派生 */
  --accent: var(--sys-blue);
  --accent-soft: color-mix(in srgb, var(--accent) 20%, transparent);
}

[data-theme='light'] {
  --surface-desktop: #ececee;
  --material-thin: rgba(248, 248, 250, 0.72);
  --material-thick: rgba(255, 255, 255, 0.82);
  --material-floating: rgba(255, 255, 255, 0.96);
  --material-sidebar: rgba(244, 244, 246, 0.72);

  --text-primary: #1d1d1f;
  --text-secondary: #5a5a60;
  --text-tertiary: #86868d;
  --text-quaternary: #aeaeb2;

  --hairline: rgba(0, 0, 0, 0.1);
  --hairline-strong: rgba(0, 0, 0, 0.18);
  --fill: rgba(120, 120, 128, 0.12);
  --fill-strong: rgba(120, 120, 128, 0.24);

  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 0.5px var(--hairline);
  --shadow-2: 0 4px 14px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 0.5px var(--hairline);
  --shadow-3: 0 14px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 0.5px var(--hairline);

  --sys-blue: #007aff;
  --accent: var(--sys-blue);
  --accent-soft: color-mix(in srgb, var(--accent) 20%, transparent);

  --ambient-1: radial-gradient(circle at 12% 16%, color-mix(in srgb, var(--sys-blue) 12%, transparent), transparent 42%);
  --ambient-2: radial-gradient(circle at 88% 84%, color-mix(in srgb, var(--sys-teal) 8%, transparent), transparent 42%);
}
```

- [ ] **Step 2: 创建 main.css（Tailwind v4 + 基础重置）**

```css
@import 'tailwindcss';
@import './tokens.css';

/* Tailwind v4 CSS-first 配置：把 token 映射成 theme */
@theme {
  --color-accent: var(--accent);
  --color-surface: var(--surface-desktop);
  --color-panel: var(--material-thick);
  --radius-panel: var(--radius-panel);
  --radius-card: var(--radius-card);
}

/* cascade layer：让 utility 能覆盖 token（守则 §3） */
@layer base {
  * {
    box-sizing: border-box;
  }
  html,
  body {
    height: 100%;
    margin: 0;
  }
  body {
    background: var(--surface-desktop);
    background-image: var(--ambient-1), var(--ambient-2);
    color: var(--text-primary);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/web-vue-next/src/style/tokens.css apps/web-vue-next/src/style/main.css
git commit -m "feat(web-next): design token system (material, dual theme)"
```

---

## Task 3: API 集成缝（复用旧壳 shared 客户端契约）

**Files:**
- Create: `apps/web-vue-next/src/lib/api-client.ts`

新壳迁移期复用旧壳 `apps/web-vue/src/shared/` 的 API 客户端，避免重写网络层。这层只做转发 + 类型再导出，是切流的唯一缝。

- [ ] **Step 1: 创建 api-client.ts（转发到旧壳 shared）**

```ts
// 新壳与后端的唯一集成缝。迁移期复用旧壳 shared/ 的契约，
// 逐页迁移完成后可物理内联。现在转发以避免重复实现网络/鉴权逻辑。

export {
  getApiBase,
  getWebSocketBasePath,
  joinApiPath,
  resolveStudioAuthorizationHeader,
  withStudioAuthorization,
} from '../../web-vue/src/shared/api';

export {
  getStudioRuntimeConfig,
  getStudioAppBasePath,
  getStudioApiBasePath,
  getStudioWebSocketBasePath,
  type StudioRuntimeConfig,
} from '../../web-vue/src/shared/runtime-config';
```

- [ ] **Step 2: 验证类型可解析**

Run: `cd apps/web-vue-next && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20`
Expected: 无错误（或仅有 "No inputs found" 直到 main.ts 建好——若有 tsconfig include 报错，先建空 `src/main.ts` 占位再验证）。

- [ ] **Step 3: 提交**

```bash
git add apps/web-vue-next/src/lib/api-client.ts
git commit -m "feat(web-next): API client seam reusing existing shared contract"
```

---

## Task 4: Pinia 状态层 + UI store

**Files:**
- Create: `apps/web-vue-next/src/stores/index.ts`
- Create: `apps/web-vue-next/src/stores/ui-store.ts`
- Test: `apps/web-vue-next/tests/unit/ui-store.test.ts`

- [ ] **Step 1: 写失败测试 — 导航折叠状态切换**

```ts
// tests/unit/ui-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '@/stores/ui-store';

describe('useUiStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('导航默认展开，可切换折叠', () => {
    const ui = useUiStore();
    expect(ui.navCollapsed).toBe(false);
    ui.toggleNav();
    expect(ui.navCollapsed).toBe(true);
  });

  it('主题默认深色，可切换浅色', () => {
    const ui = useUiStore();
    expect(ui.theme).toBe('dark');
    ui.toggleTheme();
    expect(ui.theme).toBe('light');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/ui-store.test.ts`
Expected: FAIL — `Cannot find module '@/stores/ui-store'`

- [ ] **Step 3: 创建 ui-store.ts**

```ts
// stores/ui-store.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type Theme = 'dark' | 'light';

export const useUiStore = defineStore('ui', () => {
  const navCollapsed = ref(false);
  const theme = ref<Theme>('dark');

  function toggleNav() {
    navCollapsed.value = !navCollapsed.value;
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  return { navCollapsed, theme, toggleNav, toggleTheme, applyTheme };
});
```

- [ ] **Step 4: 创建 stores/index.ts**

```ts
// stores/index.ts
import { createPinia } from 'pinia';

export const pinia = createPinia();
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/ui-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 提交**

```bash
git add apps/web-vue-next/src/stores apps/web-vue-next/tests/unit/ui-store.test.ts
git commit -m "feat(web-next): Pinia + UI store (nav collapse, theme)"
```

---

## Task 5: 导航清单单一数据源（16 页面）

**Files:**
- Create: `apps/web-vue-next/src/routes/nav-manifest.ts`

导航和命令面板都读这一份数据，避免两处维护。对应守则 §6 的总览/运维/管理/系统四组。

- [ ] **Step 1: 创建 nav-manifest.ts**

```ts
// routes/nav-manifest.ts
// 导航与命令面板的单一数据源。新增页面只改这里。
export type NavGroupKey = 'overview' | 'operations' | 'management' | 'system';

export interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: string; // lucide 图标名，后续迁移期可用 emoji 占位
  badge?: number;
  future?: boolean; // 未上线页面
}

export interface NavGroup {
  key: NavGroupKey;
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: 'overview',
    title: '总览',
    items: [{ key: 'dashboard', to: '/dashboard', label: '仪表盘', icon: 'LayoutDashboard' }],
  },
  {
    key: 'operations',
    title: '运维',
    items: [
      { key: 'chat', to: '/chat', label: '会话工作台', icon: 'MessagesSquare' },
      { key: 'room', to: '/room', label: '协作空间', icon: 'Users', future: true },
      { key: 'workflow', to: '/workflow', label: '工作流', icon: 'Workflow', future: true },
      { key: 'skills', to: '/skills', label: '技能管理', icon: 'Sparkles' },
      { key: 'files', to: '/files', label: '文件管理', icon: 'FolderClosed' },
      { key: 'terminal', to: '/terminal', label: '维护终端', icon: 'SquareTerminal' },
    ],
  },
  {
    key: 'management',
    title: '管理',
    items: [
      { key: 'agents', to: '/agents', label: 'Agent 管理', icon: 'Bot' },
      { key: 'channels', to: '/channels', label: '频道管理', icon: 'Radio' },
      { key: 'connectors', to: '/channel-connectors', label: '渠道连接', icon: 'Cable' },
      { key: 'gateway', to: '/model-gateway', label: '模型网关', icon: 'Globe' },
      { key: 'cron', to: '/cron', label: '定时任务', icon: 'Clock' },
      { key: 'config', to: '/config', label: '系统配置', icon: 'Settings' },
    ],
  },
  {
    key: 'system',
    title: '系统',
    items: [
      { key: 'system', to: '/system', label: '系统状态', icon: 'ShieldCheck' },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
```

- [ ] **Step 2: 提交**

```bash
git add apps/web-vue-next/src/routes/nav-manifest.ts
git commit -m "feat(web-next): nav manifest single source of truth"
```

---

## Task 6: 路由 + 占位视图

**Files:**
- Create: `apps/web-vue-next/src/routes/index.ts`
- Create: `apps/web-vue-next/src/views/PlaceholderView.vue`

- [ ] **Step 1: 创建 PlaceholderView.vue**

```vue
<!-- views/PlaceholderView.vue -->
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="placeholder">
    <div class="placeholder__card">
      <h1 class="placeholder__title">{{ title }}</h1>
      <p class="placeholder__hint">该页面待从旧壳迁移。地基完成后按逐页迁移计划填充。</p>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  padding: 24px;
}
.placeholder__card {
  background: var(--material-thin);
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  padding: 20px 24px;
}
.placeholder__title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
}
.placeholder__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: 创建 routes/index.ts（从 nav-manifest 生成路由）**

```ts
// routes/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import PlaceholderView from '@/views/PlaceholderView.vue';
import { allNavItems } from './nav-manifest';

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    ...allNavItems.map((item) => ({
      path: item.to,
      name: item.key,
      component: PlaceholderView,
      props: { title: item.label },
    })),
    { path: '/', redirect: '/dashboard' },
  ],
});
```

- [ ] **Step 3: 提交**

```bash
git add apps/web-vue-next/src/routes/index.ts apps/web-vue-next/src/views/PlaceholderView.vue
git commit -m "feat(web-next): router + placeholder views from manifest"
```

---

## Task 7: 原子组件（材质面板 + 按钮）

**Files:**
- Create: `apps/web-vue-next/src/components/studio/StudioPanel.vue`
- Create: `apps/web-vue-next/src/components/studio/StudioButton.vue`
- Test: `apps/web-vue-next/tests/unit/studio-components.test.ts`

材质面板是守则 §3 三种材质的可复用原子，全项目统一。

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/studio-components.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StudioPanel from '@/components/studio/StudioPanel.vue';
import StudioButton from '@/components/studio/StudioButton.vue';

describe('StudioPanel', () => {
  it('按 material 属性应用对应材质 class', () => {
    const w = mount(StudioPanel, { props: { material: 'thick' } });
    expect(w.classes()).toContain('studio-panel--thick');
  });
  it('默认材质为 thin', () => {
    const w = mount(StudioPanel);
    expect(w.classes()).toContain('studio-panel--thin');
  });
});

describe('StudioButton', () => {
  it('variant=primary 应用主按钮样式', () => {
    const w = mount(StudioButton, { props: { variant: 'primary' } });
    expect(w.classes()).toContain('studio-btn--primary');
  });
  it('点击触发 click 事件', async () => {
    const w = mount(StudioButton);
    await w.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/studio-components.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 创建 StudioPanel.vue**

```vue
<!-- components/studio/StudioPanel.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    material?: 'thin' | 'thick' | 'floating';
    radius?: 'panel' | 'card' | 'floating';
  }>(),
  { material: 'thin', radius: 'panel' },
);
</script>

<template>
  <div :class="['studio-panel', `studio-panel--${material}`, `studio-panel--r-${radius}`]">
    <slot />
  </div>
</template>

<style scoped>
.studio-panel {
  border: 0.5px solid var(--hairline);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
.studio-panel--thin {
  background: var(--material-thin);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
}
.studio-panel--thick {
  background: var(--material-thick);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
}
.studio-panel--floating {
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  -webkit-backdrop-filter: var(--blur-floating);
  box-shadow: var(--shadow-3);
}
.studio-panel--r-panel {
  border-radius: var(--radius-panel);
}
.studio-panel--r-card {
  border-radius: var(--radius-card);
}
.studio-panel--r-floating {
  border-radius: var(--radius-floating);
}
</style>
```

- [ ] **Step 4: 创建 StudioButton.vue**

```vue
<!-- components/studio/StudioButton.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'icon';
    disabled?: boolean;
  }>(),
  { variant: 'ghost', disabled: false },
);
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    :class="['studio-btn', `studio-btn--${variant}`, { 'is-disabled': disabled }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.studio-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background 0.12s;
}
.studio-btn--primary {
  background: var(--accent);
  color: #fff;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
}
.studio-btn--primary:hover {
  filter: brightness(1.08);
}
.studio-btn--ghost {
  background: var(--fill);
  color: var(--text-secondary);
  padding: 6px 12px;
}
.studio-btn--ghost:hover {
  background: var(--fill-strong);
  color: var(--text-primary);
}
.studio-btn--icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--text-secondary);
}
.studio-btn--icon:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/studio-components.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 提交**

```bash
git add apps/web-vue-next/src/components/studio apps/web-vue-next/tests/unit/studio-components.test.ts
git commit -m "feat(web-next): StudioPanel + StudioButton atoms"
```

---

## Task 8: 单栏分组导航（GlobalNav + NavItem）

**Files:**
- Create: `apps/web-vue-next/src/components/nav/NavItem.vue`
- Create: `apps/web-vue-next/src/components/nav/GlobalNav.vue`
- Test: `apps/web-vue-next/tests/unit/global-nav.test.ts`

对应守则 §6：单栏分组、图标+文字同列、当前页高亮、可折叠（折叠态 tooltip 向右弹不遮挡）。

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/global-nav.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import GlobalNav from '@/components/nav/GlobalNav.vue';

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/dashboard', component: { template: '<div/>' } }, { path: '/chat', component: { template: '<div/>' } }],
  });
}

describe('GlobalNav', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('渲染四个分组标题', () => {
    const w = mount(GlobalNav, { global: { plugins: [router()] } });
    expect(w.text()).toContain('总览');
    expect(w.text()).toContain('运维');
    expect(w.text()).toContain('管理');
    expect(w.text()).toContain('系统');
  });

  it('点击导航项触发路由跳转', async () => {
    const r = router();
    await r.push('/dashboard');
    const w = mount(GlobalNav, { global: { plugins: [r] } });
    await w.find('[data-nav-key="chat"]').trigger('click');
    await flushPromises();
    expect(r.currentRoute.value.path).toBe('/chat');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/global-nav.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 创建 NavItem.vue**

```vue
<!-- components/nav/NavItem.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { NavItem } from '@/routes/nav-manifest';
import { useUiStore } from '@/stores/ui-store';

const props = defineProps<{ item: NavItem }>();
const route = useRoute();
const ui = useUiStore();
const active = computed(() => route.path === props.item.to);
</script>

<template>
  <RouterLink :to="item.to" :data-nav-key="item.key" :class="['nav-item', { active, collapsed: ui.navCollapsed }]" :data-tip="item.label">
    <span class="nav-item__icon">{{ item.label.charAt(0) }}</span>
    <span v-if="!ui.navCollapsed" class="nav-item__label">{{ item.label }}</span>
    <span v-if="!ui.navCollapsed && item.badge" class="nav-item__badge">{{ item.badge }}</span>
  </RouterLink>
</template>

<style scoped>
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 10px;
  border-radius: var(--radius-control);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  text-decoration: none;
  transition: background 0.1s;
  position: relative;
}
.nav-item:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--text-primary);
  font-weight: 500;
}
.nav-item.active .nav-item__icon {
  color: var(--accent);
}
.nav-item__icon {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 600;
}
.nav-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-item__badge {
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--sys-orange);
  color: var(--surface-desktop);
  font-size: 9px;
  font-weight: 700;
  display: grid;
  place-items: center;
  padding: 0 4px;
}
.nav-item.collapsed {
  justify-content: center;
}
/* 折叠态 tooltip 向右弹，固定 left 不遮挡内容（守则 §6） */
.nav-item.collapsed::after {
  content: attr(data-tip);
  position: fixed;
  opacity: 0;
  pointer-events: none;
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  color: var(--text-primary);
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 7px;
  border: 0.5px solid var(--hairline-strong);
  box-shadow: var(--shadow-3);
  white-space: nowrap;
  z-index: 200;
  left: 76px;
  transition: opacity 0.1s 0.15s;
}
.nav-item.collapsed:hover::after {
  opacity: 1;
}
</style>
```

- [ ] **Step 4: 创建 GlobalNav.vue**

```vue
<!-- components/nav/GlobalNav.vue -->
<script setup lang="ts">
import { useUiStore } from '@/stores/ui-store';
import { navGroups } from '@/routes/nav-manifest';
import NavItem from './NavItem.vue';

const ui = useUiStore();
</script>

<template>
  <nav :class="['global-nav', { collapsed: ui.navCollapsed }]">
    <div class="global-nav__top">
      <div class="global-nav__brand">◉</div>
      <span v-if="!ui.navCollapsed" class="global-nav__brandname">OpenClaw Studio</span>
      <button class="global-nav__collapse" :title="ui.navCollapsed ? '展开' : '收起'" @click="ui.toggleNav()">«</button>
    </div>

    <div class="global-nav__list">
      <div v-for="group in navGroups" :key="group.key" class="global-nav__group">
        <div v-if="!ui.navCollapsed" class="global-nav__gtitle">{{ group.title }}</div>
        <div v-else class="global-nav__gsep"></div>
        <NavItem v-for="item in group.items" :key="item.key" :item="item" />
      </div>
    </div>
  </nav>
</template>

<style scoped>
.global-nav {
  background: var(--material-sidebar);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  border: 0.5px solid var(--hairline);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 240px;
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.global-nav.collapsed {
  width: 56px;
}
.global-nav__top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
}
.global-nav__brand {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--sys-blue), var(--sys-teal));
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}
.global-nav__brandname {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.global-nav__collapse {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.global-nav__collapse:hover {
  background: var(--fill);
}
.global-nav__list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px 12px;
}
.global-nav__group {
  margin-top: 6px;
}
.global-nav__gtitle {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-quaternary);
  letter-spacing: 0.05em;
  padding: 8px 10px 4px;
  white-space: nowrap;
}
.global-nav__gsep {
  height: 0.5px;
  background: var(--hairline);
  margin: 8px 14px;
}
</style>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd apps/web-vue-next && npx vitest run tests/unit/global-nav.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 提交**

```bash
git add apps/web-vue-next/src/components/nav apps/web-vue-next/tests/unit/global-nav.test.ts
git commit -m "feat(web-next): single-column grouped global nav"
```

---

## Task 9: 应用外壳 + 挂载

**Files:**
- Create: `apps/web-vue-next/src/components/AppShell.vue`
- Create: `apps/web-vue-next/src/App.vue`
- Create: `apps/web-vue-next/src/main.ts`

- [ ] **Step 1: 创建 AppShell.vue**

```vue
<!-- components/AppShell.vue -->
<script setup lang="ts">
import GlobalNav from '@/components/nav/GlobalNav.vue';
import { useUiStore } from '@/stores/ui-store';
const ui = useUiStore();
</script>

<template>
  <div class="app-shell">
    <GlobalNav />
    <main class="app-shell__content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: auto 1fr;
  height: 100vh;
  padding: 10px;
  gap: 10px;
}
.app-shell__content {
  background: var(--material-thick);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  border: 0.5px solid var(--hairline);
  overflow: hidden;
  min-width: 0;
}
</style>
```

- [ ] **Step 2: 创建 App.vue**

```vue
<!-- App.vue -->
<script setup lang="ts">
import AppShell from '@/components/AppShell.vue';
</script>

<template>
  <AppShell />
</template>
```

- [ ] **Step 3: 创建 main.ts**

```ts
// main.ts
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './routes';
import { pinia } from './stores';
import { useUiStore } from './stores/ui-store';
import './style/main.css';

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount('#app');

// 应用初始主题
useUiStore().applyTheme();
```

- [ ] **Step 4: 启动 dev server 视觉验证**

Run: `cd apps/web-vue-next && npx vite --port 5177`
Expected: 浏览器打开 `http://localhost:5177`，看到单栏分组导航（总览/运维/管理/系统）+ 内容区占位。点导航项路由切换、点 « 折叠导航、主题 token 生效（深色毛玻璃）。

- [ ] **Step 5: 提交**

```bash
git add apps/web-vue-next/src/components/AppShell.vue apps/web-vue-next/src/App.vue apps/web-vue-next/src/main.ts
git commit -m "feat(web-next): app shell + mount"
```

---

## Task 10: ⌘K 命令面板

**Files:**
- Create: `apps/web-vue-next/src/features/command-palette/CommandPalette.vue`

对应守则 §6：全局快速跳转，键盘可达。

- [ ] **Step 1: 创建 CommandPalette.vue**

```vue
<!-- features/command-palette/CommandPalette.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { allNavItems } from '@/routes/nav-manifest';

const router = useRouter();
const open = ref(false);
const query = ref('');

const results = computed(() => {
  const q = query.value.trim();
  if (!q) return allNavItems;
  return allNavItems.filter((i) => i.label.includes(q));
});

function openPalette() {
  open.value = true;
  query.value = '';
}
function close() {
  open.value = false;
}
function go(key: string) {
  const item = allNavItems.find((i) => i.key === key);
  if (item) router.push(item.to);
  close();
}
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openPalette();
  }
  if (e.key === 'Escape') close();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="cmd-backdrop" @click="close">
      <div class="cmd-palette" @click.stop>
        <input v-model="query" class="cmd-input" placeholder="跳转到页面…" autofocus />
        <div class="cmd-list">
          <button v-for="item in results" :key="item.key" class="cmd-item" @click="go(item.key)">
            <span class="cmd-item__icon">{{ item.label.charAt(0) }}</span>
            {{ item.label }}
          </button>
          <div v-if="results.length === 0" class="cmd-empty">无匹配页面</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cmd-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: grid;
  place-items: start center;
  padding-top: 90px;
  z-index: 300;
}
.cmd-palette {
  width: 540px;
  max-width: 90vw;
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  -webkit-backdrop-filter: var(--blur-floating);
  border: 0.5px solid var(--hairline-strong);
  border-radius: 14px;
  box-shadow: var(--shadow-3);
  padding: 8px;
}
.cmd-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  padding: 9px 11px;
}
.cmd-list {
  max-height: 340px;
  overflow-y: auto;
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 11px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.cmd-item:hover {
  background: var(--accent);
  color: #fff;
}
.cmd-item__icon {
  width: 20px;
  text-align: center;
}
.cmd-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: 挂载到 AppShell**

Modify `apps/web-vue-next/src/components/AppShell.vue` template，在 `.app-shell` 内末尾加：

```vue
    <CommandPalette />
```

并在 script 加 import：

```ts
import CommandPalette from '@/features/command-palette/CommandPalette.vue';
```

- [ ] **Step 3: 视觉验证**

Run: `cd apps/web-vue-next && npx vite --port 5177`
Expected: 按 Cmd/Ctrl+K 弹出命令面板，输入"终端"过滤，回车/点击跳转，Esc 关闭。

- [ ] **Step 4: 提交**

```bash
git add apps/web-vue-next/src/features/command-palette apps/web-vue-next/src/components/AppShell.vue
git commit -m "feat(web-next): ⌘K command palette"
```

---

## Task 11: 类型检查 + 构建验证

**Files:**
- 无新增，验证整壳可构建。

- [ ] **Step 1: 运行全部单测**

Run: `cd apps/web-vue-next && npx vitest run`
Expected: 所有测试 PASS（ui-store 2 + studio-components 4 + global-nav 2 = 8 tests）。

- [ ] **Step 2: 运行类型检查**

Run: `cd apps/web-vue-next && npx tsc -p tsconfig.json --noEmit`
Expected: 无错误。若有 `.vue` 文件未识别，给 tsconfig 加 `"vue"` 类型或检查 include。

- [ ] **Step 3: 运行生产构建**

Run: `cd apps/web-vue-next && npx vite build`
Expected: 构建成功，产出 `apps/web-vue-next/dist/`，含 `index.html` + `assets/`。

- [ ] **Step 4: 提交（若有构建产物修正）**

```bash
git add -A apps/web-vue-next
git commit -m "chore(web-next): verify typecheck + build green" --allow-empty
```

---

## Self-Review

**1. Spec coverage（对照守则 + 新壳地基需求）：**
- §3 材质分层 → Task 2 tokens + Task 7 StudioPanel ✓
- §4 圆角阴影 → Task 2 tokens ✓
- §5 双主题 → Task 2 tokens + Task 4 ui-store theme ✓
- §6 单栏导航 → Task 5/8 ✓
- §6 ⌘K 命令面板 → Task 10 ✓
- §6 页面顶栏/检视器 → 地基阶段暂未（占位视图，逐页迁移计划覆盖）
- 集成缝（复用后端） → Task 3 ✓
- 状态层（Pinia） → Task 4 ✓
- 切流机制（webDistDir） → 本计划不切，留到全部页面迁移完（记录于后续计划）
- **缺口**：无 —— 地基该有的都有；具体页面迁移属后续计划。

**2. Placeholder scan：** 无 TBD/TODO/留空步骤。每个步骤含真实代码或真实命令。

**3. Type consistency：** `NavItem`（manifest）↔ NavItem.vue props 一致；`useUiStore` 的 `navCollapsed`/`theme`/`toggleNav`/`toggleTheme`/`applyTheme` 在 Task 4 定义、Task 8/9 消费，名称一致；`StudioPanel` 的 `material` 取值 `'thin'|'thick'|'floating'` 与 token 一致。✓

---

## 完成标志

- [ ] `apps/web-vue-next` 可 `vite dev` 启动，单栏分组导航 + ⌘K 可用
- [ ] 8 个单测全绿
- [ ] `tsc --noEmit` + `vite build` 通过
- [ ] 设计 token 双主题切换正常
- [ ] 地基完成后，后续按「逐页迁移计划」把旧壳页面一个个搬过来（每个领域一份独立计划）
