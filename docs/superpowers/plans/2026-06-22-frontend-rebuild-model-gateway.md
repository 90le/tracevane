# 前端重建（apps/web）+ Model Gateway 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `apps/web-vue`，重建为 `apps/web`（React + Vite + Tailwind v4 + shadcn/ui，Aurora 设计系统、类型化数据层），并把 Model Gateway 做到完成口径。

**Architecture:** 大爆炸式：迁移发布路径 → 删除旧前端 → 脚手架新前端壳/设计系统/数据层 → 按 Aurora 原型与锁定 IA 实现 Model Gateway 七个 data-view → 验证。Feature-sliced，shadcn 真正落地，TanStack Query + React Router。

**Tech Stack:** React 18, Vite 8, Tailwind CSS v4, shadcn/ui, Radix, TanStack Query, React Router v7, TypeScript, node:test, Playwright。

**设计真相源：** 视觉/IA = `docs/prototypes/pages/model-gateway.html` + `docs/prototypes/data/pages-data.js` + `docs/prototypes/app/styles.css`；契约 = `docs/模型网关信息架构契约.md` + `docs/模型网关详细目标.md`；API 类型 = `types/model-gateway.ts` + 现 `apps/web-vue` Model Gateway 代码。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `apps/web/package.json` | 前端包元数据、依赖、脚本（替代 web-vue） |
| `apps/web/vite.config.ts` | Vite + React + Tailwind v4 插件 |
| `apps/web/components.json` | shadcn 拥有制配置 |
| `apps/web/src/design/theme.css` | Aurora token（深浅 + 4 配色），从原型 styles.css 提炼 |
| `apps/web/src/design/ui/*` | 主题化的 shadcn 组件 |
| `apps/web/src/app/providers.tsx` | Theme + QueryClient + Toast/Dialog/Sheet provider |
| `apps/web/src/app/router.tsx` | React Router 路由表 |
| `apps/web/src/app/AppShell.tsx` | 左导航 + 顶栏 + outlet |
| `apps/web/src/app/navigation.ts` | 分组导航清单 |
| `apps/web/src/shared/layouts/*` | ListDetail/Workbench/StatusConsole/RowsInspector |
| `apps/web/src/shared/states/*` | Loading/Empty/Error/Skeleton |
| `apps/web/src/lib/api/client.ts` | 类型化 fetch client（错误归一、baseUrl） |
| `apps/web/src/lib/api/model-gateway.ts` | Model Gateway 端点封装 |
| `apps/web/src/lib/query/model-gateway.ts` | Model Gateway TanStack Query hooks |
| `apps/web/src/features/model-gateway/ModelGatewayPage.tsx` | 4 主 tab + 子视图调度 |
| `apps/web/src/features/model-gateway/views/*` | overview/providers/providercfg/models/accounts/apps/usage |
| `tests/system/web-model-gateway.test.mjs` | IA/API 消费合同测试 |
| `scripts/smoke-web-model-gateway.mjs` | Playwright 桌面+移动 smoke |
| 发布相关 | `package.json`(根)、`pack.sh`、`install-tracevane.sh`、`openclaw.plugin.json`、dev 脚本 |

---

## Phase 0：验证与准备（research-first 门禁）

### Task 0.1：核验现有发布路径引用

**Files:** 只读

- [ ] **Step 1:** 列出所有引用 `apps/web-vue` 的位置
  Run: `grep -rn "apps/web-vue\|web-vue" package.json pack.sh install-tracevane.sh openclaw.plugin.json scripts tsconfig.json 2>/dev/null`
  Expected: 输出全部命中行（workspaces、build:web、dist 拷贝、静态资源路径、dev 脚本）。逐条记录为 Phase 1 迁移清单。

- [ ] **Step 2:** 确认 web 构建产物落地路径与 OpenClaw 静态挂载路径
  Run: `grep -rn "web-vue/dist\|/dist\|staticDir\|webDir" pack.sh install-tracevane.sh openclaw.plugin.json index.ts apps/api 2>/dev/null | grep -i web`
  Expected: 明确 dist 输出与后端/installer 引用路径，记录下来。

### Task 0.2：核验 Model Gateway API 契约与 Aurora IA

**Files:** 只读

- [ ] **Step 1:** 读取并记录 API 形态
  Run: `sed -n '1,200p' types/model-gateway.ts; ls apps/web-vue/src/app/ModelGatewayPage.tsx`
  记录：`/api/model-gateway/{status,runtime,providers,app-connections,usage}`、`/account-providers/*`、`detect-provider`、`active-provider`、provider POST/PUT/DELETE、account login/refresh/enable/disable/cooldown 的请求与响应字段。

- [ ] **Step 2:** 读取 Aurora 原型 IA 与挂载逻辑
  Run: `sed -n '1,400p' docs/prototypes/pages/model-gateway.html; grep -n "model-gateway" docs/prototypes/data/pages-data.js`
  记录每个 data-view（overview/providers/providercfg/models/accounts/apps/usage）的 DOM 结构、class（viewbar/hero/panel/route-row/cfg/save-bar/kpi-grid…）和交互槽位。

- [ ] **Step 3:** 核验前端栈当前官方资料（research-first）
  Run: `echo "核验: vite.dev/guide, tailwindcss.com/docs/installation/using-vite, ui.shadcn.com/docs/installation/vite + tailwind-v4, tanstack query react, react-router v7"`
  把来源/日期/结论追加到 `docs/研究先行开发清单.md`（已有 React 方向记录，此处补 shadcn 真正落地与 apps/web 目录迁移决策）。

- [ ] **Step 4: Commit**
  ```bash
  git add docs/研究先行开发清单.md
  git commit -m "docs: record apps/web rebuild + shadcn adoption research"
  ```

---

## Phase 1：发布路径迁移（先迁移，再删除，降低风险）

### Task 1.1：根 package.json workspace 与脚本

**Files:** Modify `package.json`

- [ ] **Step 1:** 把 `workspaces` 与 `dev:web`/`build:web`/`typecheck:web`/`dev:web:smoke` 中的 `apps/web-vue` 改为 `apps/web`（按 Task 0.1 清单逐条）。
- [ ] **Step 2:** Run: `node -e "require('./package.json')"` Expected: 无报错（JSON 合法）。
- [ ] **Step 3: Commit** `git add package.json && git commit -m "build: point web workspace/scripts to apps/web"`

### Task 1.2：pack.sh / install-tracevane.sh / openclaw.plugin.json / 后端静态路径

**Files:** Modify `pack.sh`, `install-tracevane.sh`, `openclaw.plugin.json`, 及 Task 0.1 命中的后端静态路径

- [ ] **Step 1:** 按 Task 0.1 清单，将所有 `apps/web-vue` 路径改为 `apps/web`（构建、dist 拷贝、静态挂载、清理目录）。
- [ ] **Step 2:** Run: `bash -n install-tracevane.sh && bash -n pack.sh` Expected: 语法检查通过。
- [ ] **Step 3:** Run: `grep -rn "web-vue" package.json pack.sh install-tracevane.sh openclaw.plugin.json scripts apps/api index.ts 2>/dev/null || echo CLEAN` Expected: `CLEAN`（无残留引用）。
- [ ] **Step 4: Commit** `git add -A && git commit -m "build: migrate release/static paths web-vue -> web"`

---

## Phase 2：删除旧前端 + 脚手架新前端工具链

### Task 2.1：删除 apps/web-vue

**Files:** Delete `apps/web-vue/`

- [ ] **Step 1:** Run: `git rm -r apps/web-vue`
- [ ] **Step 2:** Run: `git status --short | grep web-vue | head` Expected: 全部显示为删除（`D`）。
- [ ] **Step 3: Commit** `git commit -m "chore: remove legacy apps/web-vue frontend"`

### Task 2.2：脚手架 apps/web 构建工具链

**Files:** Create `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`

- [ ] **Step 1:** 创建 `apps/web/package.json`（name `@binbin/tracevane-web` 或沿用旧 name，scripts: `dev`/`build`/`typecheck`），依赖：`react`、`react-dom`、`react-router-dom`、`@tanstack/react-query`、`vite`、`@vitejs/plugin-react`、`tailwindcss@4`、`@tailwindcss/vite`、`typescript`、`lucide-react`、Radix 依赖。版本对齐被删 web-vue 的 package.json（从 git 历史取：`git show HEAD~2:apps/web-vue/package.json`）。
- [ ] **Step 2:** 创建 `vite.config.ts`：`@vitejs/plugin-react` + `@tailwindcss/vite`，dev server 端口 5176，proxy `/api` → `http://127.0.0.1:3761`。
- [ ] **Step 3:** 创建 `tsconfig.json`、`index.html`（挂载 `#root`，title `Tracevane`）、`src/main.tsx`（渲染 `<App/>` 占位）。
- [ ] **Step 4:** Run: `npm install` (根) Expected: 安装成功。
- [ ] **Step 5:** Run: `npm run build:web` Expected: 空 App 构建通过。
- [ ] **Step 6: Commit** `git add apps/web && git commit -m "feat(web): scaffold apps/web build toolchain"`

---

## Phase 3：设计系统（Aurora token + shadcn）

### Task 3.1：Tailwind v4 token（Aurora）

**Files:** Create `apps/web/src/design/theme.css`, Modify `apps/web/src/main.tsx`

- [ ] **Step 1:** 从 `docs/prototypes/app/styles.css` 提炼 token，写入 `theme.css`：`@import "tailwindcss";` + `@theme { … }`（颜色、状态色、圆角、阴影、字号）；深浅主题与 4 配色用 `:root`/`[data-theme]`/`[data-palette]` CSS 变量。
- [ ] **Step 2:** 在 `main.tsx` `import "./design/theme.css"`。
- [ ] **Step 3:** Run: `npm run build:web` Expected: 通过，产物含 token CSS。
- [ ] **Step 4: Commit** `git add apps/web/src && git commit -m "feat(web): Aurora design tokens on Tailwind v4"`

### Task 3.2：shadcn 初始化与核心组件

**Files:** Create `apps/web/components.json`, `apps/web/src/design/ui/*`

- [ ] **Step 1:** 创建 `components.json`（style、tailwind v4、aliases 指向 `src/design/ui`）。
- [ ] **Step 2:** 引入并主题化核心组件：`button`、`sidebar`、`sheet`、`dialog`、`command`、`tabs`、`input`、`table`、`tooltip`、`badge`、`sonner`(toast)。组件类名引用 Aurora token，使其视觉对齐原型。
- [ ] **Step 3:** Run: `npm run typecheck:web && npm run build:web` Expected: 通过。
- [ ] **Step 4: Commit** `git add apps/web && git commit -m "feat(web): adopt shadcn ui themed to Aurora"`

### Task 3.3：状态三态与布局原语

**Files:** Create `apps/web/src/shared/states/{Loading,Empty,ErrorState,Skeleton}.tsx`, `apps/web/src/shared/layouts/{ListDetail,Workbench,StatusConsole,RowsInspector}.tsx`

- [ ] **Step 1:** 写 `shared/states/*`：标准 loading/empty/error/skeleton 组件，接受 title/description/action props。
- [ ] **Step 2:** 写 `shared/layouts/*`：按 `docs/prototypes/app/styles.css` 的页面形态 class 封装为 React 布局组件（grid/响应式断点 520/768/920/1080/1240/1600，≤1080 检视器抽屉化）。
- [ ] **Step 3:** Run: `npm run typecheck:web` Expected: 通过。
- [ ] **Step 4: Commit** `git add apps/web/src/shared && git commit -m "feat(web): shared state views and page-form layouts"`

---

## Phase 4：应用壳 + 路由 + 数据层基础

### Task 4.1：providers 与 QueryClient

**Files:** Create `apps/web/src/app/providers.tsx`, `apps/web/src/lib/query/client.ts`

- [ ] **Step 1:** `lib/query/client.ts` 导出配置好的 `QueryClient`（默认 staleTime、retry 策略）。
- [ ] **Step 2:** `app/providers.tsx`：包裹 `QueryClientProvider` + Theme provider（读写 `data-theme`/`data-palette`，localStorage 持久化）+ Toast/Sonner + Dialog/Sheet 根。
- [ ] **Step 3:** Run: `npm run typecheck:web` Expected: 通过。
- [ ] **Step 4: Commit** `git add apps/web/src && git commit -m "feat(web): app providers and query client"`

### Task 4.2：类型化 API client

**Files:** Create `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/api/errors.ts`

- [ ] **Step 1: 写失败测试** `tests/system/web-api-client.test.mjs`：断言 client 对非 2xx JSON 错误归一为 `{code,message}`，对 `model_gateway_*_unsupported` 标记 `unsupported=true`。
- [ ] **Step 2:** Run: `node --test tests/system/web-api-client.test.mjs` Expected: FAIL（模块不存在）。
- [ ] **Step 3:** 实现 `client.ts`（`request<T>(path, init)`：拼 baseUrl、JSON、错误归一、AbortSignal 透传）和 `errors.ts`（错误类型与 unsupported 判定）。把可被 node 测试的纯逻辑（错误归一）拆为可导入函数。
- [ ] **Step 4:** Run: `node --test tests/system/web-api-client.test.mjs` Expected: PASS。
- [ ] **Step 5: Commit** `git add apps/web/src/lib tests/system/web-api-client.test.mjs && git commit -m "feat(web): typed api client with error normalization"`

### Task 4.3：导航清单 + AppShell + 路由

**Files:** Create `apps/web/src/app/navigation.ts`, `AppShell.tsx`, `router.tsx`, Modify `src/main.tsx`

- [ ] **Step 1:** `navigation.ts`：分组导航清单（总览/运行/连接/证据/系统）。本期只有 `/model-gateway` 为真实路由，其余项标 `status:"coming-soon"`。
- [ ] **Step 2:** `AppShell.tsx`：shadcn Sidebar（分组+折叠）+ 轻顶栏 + CommandPalette 触发 + `<Outlet/>`；移动端导航抽屉化。
- [ ] **Step 3:** `router.tsx`：React Router，`/` 重定向 `/model-gateway`，`/model-gateway` → `ModelGatewayPage`（占位），coming-soon 路由渲染统一"建设中"页。`main.tsx` 渲染 `<RouterProvider/>` 包在 providers 内。
- [ ] **Step 4:** Run: `npm run build:web` Expected: 通过。
- [ ] **Step 5:** Run: `npm run dev:restart`，浏览器访问 `http://127.0.0.1:5176/model-gateway` Expected: 壳渲染、导航可切换、coming-soon 页正常、无 console error。
- [ ] **Step 6: Commit** `git add apps/web/src && git commit -m "feat(web): app shell, grouped nav, real router"`

---

## Phase 5：Model Gateway 数据层

### Task 5.1：端点封装

**Files:** Create `apps/web/src/lib/api/model-gateway.ts`, `apps/web/src/features/model-gateway/types.ts`

- [ ] **Step 1:** `types.ts`：从 `types/model-gateway.ts` 导入/再导出本域类型（status/runtime/provider/appConnection/usage/accountProvider）。
- [ ] **Step 2:** `lib/api/model-gateway.ts`：按 Task 0.2 记录的契约封装所有端点函数（`getStatus`/`getProviders`/`getAppConnections`/`getUsage`/`detectProvider`/`setActiveProvider`/`saveProvider`/`deleteProvider`/account login/refresh/enable/disable/cooldown 等），全部走 `lib/api/client`。
- [ ] **Step 3:** Run: `npm run typecheck:web` Expected: 通过。
- [ ] **Step 4: Commit** `git add apps/web/src && git commit -m "feat(web): model-gateway api bindings"`

### Task 5.2：Query/Mutation hooks

**Files:** Create `apps/web/src/lib/query/model-gateway.ts`

- [ ] **Step 1:** 为每个读端点写 `useXQuery`（queryKey 规范化），为写操作写 `useXMutation`（onSuccess invalidate 相关 queryKey）。
- [ ] **Step 2:** Run: `npm run typecheck:web` Expected: 通过。
- [ ] **Step 3: Commit** `git add apps/web/src/lib/query && git commit -m "feat(web): model-gateway query/mutation hooks"`

---

## Phase 6：Model Gateway 视图（按 Aurora 原型逐 view 移植）

> 每个 view 任务统一形态：从 `docs/prototypes/pages/model-gateway.html` 对应 data-view 区段移植 DOM/class 到 React 组件，用 Phase 5 hooks 绑定真实数据，套 `shared/states` 三态，写操作走确认弹层。完成口径见 `docs/模型网关详细目标.md`。

### Task 6.0：ModelGatewayPage 调度 + viewbar

**Files:** Create `apps/web/src/features/model-gateway/ModelGatewayPage.tsx`, `views/index.ts`

- [ ] **Step 1:** 实现 4 主 tab（概览/服务商/模型/用量）+ 子视图状态（`data-view`: overview/providers/providercfg/models/accounts/apps/usage），用 URL search param（如 `?view=`、`?tab=`、`?app=`）驱动，支持 deep-link。
- [ ] **Step 2:** Run: `npm run typecheck:web` Expected: 通过。
- [ ] **Step 3: Commit** `git add apps/web/src/features && git commit -m "feat(web): model gateway page scaffold + view router"`

### Task 6.1：Overview view

**Files:** Create `apps/web/src/features/model-gateway/views/OverviewView.tsx`

- [ ] **Step 1:** 移植原型 overview 区段：实时路由状态、路由检查、关注项（**不做 KPI 卡墙**，不伪造 incidents）。数据来自 `useStatusQuery`/`useProvidersQuery`/`useAppConnectionsQuery` 的 `activeRoutes`/health/client 行。客户端接入入口下钻到 apps 子视图。
- [ ] **Step 2:** 三态：loading skeleton / 空态 / 错误态。
- [ ] **Step 3:** Run: `npm run dev:restart`，访问 `/model-gateway` Expected: overview 渲染真实路由/健康/客户端行，空数据显示空态，无 console error，无横向溢出。
- [ ] **Step 4: Commit** `git add apps/web/src/features && git commit -m "feat(web): model gateway overview view"`

### Task 6.2：Providers view（单表工作台）

**Files:** Create `views/ProvidersView.tsx`

- [ ] **Step 1:** 移植 providers 表：identity/type/status + 行级动作（配置/smoke/账号池）。新建区分"API Provider"与"Codex 账户登录"两个入口；删除进入配置危险区（不在行内直接删）。
- [ ] **Step 2:** 三态 + 移动端行字段标签可见。
- [ ] **Step 3:** Run: dev 验证 providers 列表渲染、行动作可点、桌面/移动无溢出。
- [ ] **Step 4: Commit** `git commit -am "feat(web): model gateway providers view"`

### Task 6.3：Provider config 子页（providercfg）

**Files:** Create `views/ProviderConfigView.tsx`

- [ ] **Step 1:** 移植 `cfg` 分区 基础 / Endpoint / 模型 / 高级 + `save-bar`；endpoint profiles 与模型目录用**结构化行编辑**（id/name/baseUrl/protocol/auth/enabled；模型 id/alias/context/maxOutput/默认/能力 flags）。保存前校验：空模型、重复模型 ID、重复 alias、默认模型悬空。
- [ ] **Step 2:** 保存调用 provider POST/PUT；detect 用 `detect-provider`；危险写入走确认弹层。
- [ ] **Step 3:** Run: dev 验证创建/编辑分区流、保存确认、桌面/移动无溢出。
- [ ] **Step 4: Commit** `git commit -am "feat(web): provider config child view"`

### Task 6.4：Models view

**Files:** Create `views/ModelsView.tsx`

- [ ] **Step 1:** 移植模型目录表；别名就地编辑（inline controlled editor，保存写所属 Provider catalog via PUT）；`设为默认` 更新 Provider 默认模型。
- [ ] **Step 2:** Run: dev 验证别名编辑保存、设默认生效。
- [ ] **Step 3: Commit** `git commit -am "feat(web): model gateway models view"`

### Task 6.5：Account pool view（accounts）

**Files:** Create `views/AccountPoolView.tsx`

- [ ] **Step 1:** 仅账号制 Provider 显示账户表（mask 邮箱/plan/过期/状态）；非账号 Provider 显示显式边界状态。动作：刷新 token、启停账户、清冷却、Codex 账户登录入口（页面内验证码 + 授权按钮，不自动开窗）。
- [ ] **Step 2:** Run: dev 验证账户表与边界态、动作触发。
- [ ] **Step 3: Commit** `git commit -am "feat(web): account pool view"`

### Task 6.6：App Connections view（apps）

**Files:** Create `views/AppConnectionsView.tsx`

- [ ] **Step 1:** 移植客户端接入：Codex/Claude Code/OpenCode/OpenClaw 的 preview/apply/rollback；preview sheet 显示 `targetPath`，apply/rollback 确认命名目标配置文件与备份行为，结果显示 `backupPath`/`restoredFrom`，成功后 refetch app-connections 与 provider 路由证据。
- [ ] **Step 2:** 支持 `?tab=connections&app=<cli>` deep-link 高亮对应卡片。
- [ ] **Step 3:** Run: dev 验证 preview/apply/rollback 确认流与证据显示。
- [ ] **Step 4: Commit** `git commit -am "feat(web): app connections view with evidence"`

### Task 6.7：Usage view

**Files:** Create `views/UsageView.tsx`

- [ ] **Step 1:** 移植用量：模型数/总请求/总 tokens + 模型 token 图表 + "模型/请求次数/Token 消耗"表。数据来自 `useUsageQuery`；**空数据用空态、延迟无证据显示 `-`，不伪造行**。
- [ ] **Step 2:** Run: dev 验证真实/空两种数据。
- [ ] **Step 3: Commit** `git commit -am "feat(web): model gateway usage view"`

---

## Phase 7：验证与验收

### Task 7.1：系统合同测试

**Files:** Create `tests/system/web-model-gateway.test.mjs`

- [ ] **Step 1: 写测试**：断言 `ModelGatewayPage` 暴露 `data-view` 集合 `overview/providers/providercfg/models/accounts/apps/usage`，且各 view 引用了正确的 `lib/api/model-gateway` 函数（静态源码断言，参照旧 `tests/system/tracevane-web-model-gateway-page.test.mjs` 形态，从 `git show` 取参考）。
- [ ] **Step 2:** Run: `node --test tests/system/web-model-gateway.test.mjs` Expected: PASS。
- [ ] **Step 3: Commit** `git add tests/system/web-model-gateway.test.mjs && git commit -m "test(web): model gateway IA/API contract"`

### Task 7.2：Playwright 桌面+移动 smoke

**Files:** Create `scripts/smoke-web-model-gateway.mjs`, Modify `package.json`(脚本入口)

- [ ] **Step 1:** 写 Playwright 脚本：dev 起服后访问 `/model-gateway`，在 1440/900/390 宽度切换 overview/providers/providercfg/models/accounts/apps/usage，断言 `scrollWidth===clientWidth`（无横向溢出）、无 console error/warning。
- [ ] **Step 2:** Run: `npm run dev:restart && node scripts/smoke-web-model-gateway.mjs --json` Expected: `ok=true`。
- [ ] **Step 3: Commit** `git add scripts package.json && git commit -m "test(web): playwright smoke for model gateway"`

### Task 7.3：全量验收 + 发布回归

- [ ] **Step 1:** Run: `npm run typecheck:web && npm run build:web` Expected: 通过。
- [ ] **Step 2:** Run: `bash -n install-tracevane.sh && bash -n pack.sh && ./pack.sh --no-source-sync --output-dir /tmp/tracevane-web-rebuild 0.1.70 2>&1 | tail -5` Expected: 打包成功，tarball 含 `apps/web` 产物，无 `web-vue` 残留。
- [ ] **Step 3:** Run: `npm run dev:restart`；`curl -s http://127.0.0.1:3761/api/system/health` Expected: version `0.1.70`，前端 `http://127.0.0.1:5176` title `Tracevane`，`/model-gateway` 可用。
- [ ] **Step 4: Commit**（若有收尾改动）`git commit -am "chore(web): model gateway acceptance pass"`

### Task 7.4：更新目标与进度文档

**Files:** Modify `docs/前端功能架构.md`, `docs/当前进展.md`

- [ ] **Step 1:** `前端功能架构.md`：记录新 `apps/web` 架构（feature-sliced、shadcn 真正落地、类型化数据层），并说明 Aurora 片段 raw 渲染方案已被组件化取代。
- [ ] **Step 2:** `当前进展.md`：更新前端状态——`apps/web` 重建、Model Gateway 完整功能落地、其余域待后续计划；更新验证基线。
- [ ] **Step 3: Commit** `git add docs && git commit -m "docs: record apps/web rebuild + model gateway completion"`

---

## Self-Review 结论

- **Spec 覆盖**：spec 第 1-9 节均有对应任务（架构→Phase2-4、设计系统→Phase3、数据流→Phase4-5、Model Gateway 七 view→Phase6、错误/不支持→client+各 view、测试→Phase7、发布迁移→Phase1）。
- **占位扫描**：无 TBD；view 任务以 Aurora 原型对应区段 + 锁定 IA 为具体来源，非空泛"实现页面"。
- **类型一致**：API 函数名/类型在 Phase 5 定义并被 Phase 6 引用；`data-view` 集合在 Task 6.0 与 7.1 一致。
- **风险**：精确 JSX 依赖 Phase 0 对现有 API 形态与原型 DOM 的核验结果——这是 research-first 门禁要求的正确顺序，不是占位。
