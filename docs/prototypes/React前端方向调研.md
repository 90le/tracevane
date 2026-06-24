# Tracevane React 前端方向调研

> 日期：2026-06-18
> 更新：2026-06-21
> 范围：前端重新设计方向与 React 落地记录
> 决策：新前端以 React + TypeScript + Vite + shadcn/ui ownership + Tailwind CSS v4 为目标实现方向。Aurora 原型只作为视觉参考，生产前端已收敛到 `apps/web`。

## 已核验来源

- shadcn/ui 官方文档：Vite 安装、Tailwind v4 支持、Sidebar、Data Table、Chart 等页面。
- Tailwind CSS v4.0 官方发布说明。
- TanStack Query React 官方概览。
- TanStack Table 官方介绍。
- React 官方新项目指引。
- Vite 官方指南。
- shadcn-vue 与 Reka UI 文档，作为 Vue 替代路径参考。
- 2026-06-18 抓取 GitHub 仓库数据：shadcn/ui、shadcn-vue、Reka UI、MUI、Ant Design、Radix Primitives、Base UI、Tailwind CSS、TanStack Query、TanStack Table。
- 2026-06-18 抓取 npm 最近一周下载数据：shadcn、shadcn-vue、reka-ui、tailwindcss、Radix、Base UI、MUI、Ant Design、TanStack React/Vue 包。
- 2026-06-21 复核官方落地资料：
  - React 新项目建议：`https://react.dev/learn/start-a-new-react-project`
  - Vite 指南：`https://vite.dev/guide/`
  - Tailwind CSS v4 + Vite：`https://tailwindcss.com/docs/installation/using-vite`
  - shadcn/ui Vite 安装：`https://ui.shadcn.com/docs/installation/vite`
  - shadcn/ui Tailwind v4：`https://ui.shadcn.com/docs/tailwind-v4`
  - React Router：`https://reactrouter.com/start/declarative/installation`
  - TanStack Query React：`https://tanstack.com/query/latest/docs/framework/react/overview`

## 当前证据

如果 Tracevane 明确使用 shadcn/ui 作为核心方向，React 是最匹配的实现路线：

- shadcn/ui 官方支持 Vite 和 Tailwind v4，组件模型是“复制源码进项目后自主管理”，不是不可控的黑盒组件库。
- shadcn/ui 覆盖 Tracevane 需要的关键表面：Sidebar、Data Table、Chart、Dialog、Sheet、Command、Form、Tabs、Menu、Tooltip。
- Tailwind v4 的 CSS-first token 模式适合 Tracevane 建立统一设计系统，避免继续堆全局 CSS。
- TanStack Query 和 TanStack Table 是 React 生态中高采用度的服务端状态和密集表格方案，同时保持 headless，可承载 Tracevane 的自定义工作台。
- Vue 仍可通过 shadcn-vue + Reka UI 实现类似路线，但用户已明确新方向使用 React，因此 Vue 不再作为目标实现方向。

2026-06-18 捕获的流行度信号：

| 包 / 仓库 | 信号 |
| --- | --- |
| shadcn/ui | 116,855 GitHub stars |
| Tailwind CSS | 95,612 GitHub stars; 120,379,051 npm downloads last week |
| MUI | 98,427 GitHub stars; 9,792,763 npm downloads last week |
| Ant Design | 98,377 GitHub stars; 3,227,905 npm downloads last week |
| Radix Primitives | 18,986 GitHub stars; `@radix-ui/react-dialog` 60,359,925 npm downloads last week |
| TanStack Query | 49,782 GitHub stars; `@tanstack/react-query` 58,954,254 npm downloads last week |
| TanStack Table | 28,103 GitHub stars; `@tanstack/react-table` 14,845,781 npm downloads last week |
| shadcn-vue | 10,137 GitHub stars; 93,181 npm downloads last week |
| Reka UI | 6,561 GitHub stars; 1,335,046 npm downloads last week |

## 实现方向

当前实现方向：

- React + TypeScript + Vite，作为纯客户端 SPA。
- shadcn/ui 作为组件 ownership 和交互基线。
- Tailwind CSS v4 管理 token、布局工具类和主题变量。
- shadcn 组件底层优先使用 Radix UI primitives。
- TanStack Query 管理 API 请求、缓存、失效、重试和 mutation。
- TanStack Table 承载密集表格和对象列表。
- Zustand 或 TanStack Store 只在 React Context / URL state 不够时承载本地工作台状态。
- xterm.js / Monaco / CodeMirror 这类专业引擎只用于维护终端和编辑器表面。

2026-06-21 落地状态：

- `apps/web` 目录已收敛到 `apps/web`；旧 Vue/raw prototype 渲染路径不再作为生产目标。
- Vite 升级到 Vite 8，React 插件使用 `@vitejs/plugin-react`，Tailwind v4 使用 `@tailwindcss/vite`。
- Aurora 原型的 HTML 片段通过 Vite raw import 映射为 React page component，`pages-data.js` 的 mount 行为重写为 React `useEffect` DOM adapter；`/model-gateway` 已从 raw fragment 迁移为真实 React 页面。
- React shell 负责 hash 路由、左侧分组导航、轻顶栏、命令面板、Sheet/Dialog/Toast、主题/配色切换、移动导航、状态三态和 health 查询。
- 前端目标已经从“视觉重构”升级为“功能重做”。原型片段只作为视觉/交互合同；真实功能必须逐页迁移到 React component + TanStack Query + 现有后端 API。
- 新增 `/platforms` 平台集成总览和 `/platforms/openclaw`、`/platforms/openclaw/:section` OpenClaw 子域，集中承载 OpenClaw 配置、扩展、Agent/渠道、服务、doctor/recovery 等支撑面；MCP、IM 渠道、CLI Agents、模型网关等 Tracevane 主工作流仍保留在各自主域。
- 旧 Vue 源码、Vue Router、Nuxt UI、Reka UI、lucide-vue、motion-v 等 Vue 方向依赖已移除；保留 CodeMirror、xterm、markdown 相关库作为 Workspace IDE 后续专业表面基础。
- lucide 图标改为实际用到的 subset，避免导入全部 icon 带来首包膨胀。

功能迁移架构详见 `docs/前端功能架构.md`。

## 设计后果

设计不应照抄 shadcn/ui 官网 demo 皮肤，而要吸收它的稳定部分：

- 源码自主管理，Tracevane token 精确可控；
- 行、表、tabs、sidebar、command palette、sheet、drawer、context menu、tooltip、form；
- 通过 CSS variables 做深浅主题；
- 可访问 primitives 和键盘优先工作流；
- 仪表盘图表和摘要块只在服务状态判断时使用。

对 Tracevane 来说，shadcn 默认的“卡片 + 图表 dashboard”需要克制。Tracevane 是本地 AI Agent 控制工作台，主要表面应是行、表、面板、工具栏、检视器、终端 / 编辑器窗格和状态条。

## 拒绝 / 降级路线

- 保留 Vue 作为目标实现方向：用户已明确改为 React，Vue 仅保留为历史背景。
- shadcn-vue + Reka UI 作为主路径：不再作为目标路线，除非未来明确反转 React 决策。
- MUI 或 Ant Design 作为主 UI 系统：采用度高，但更偏供应商形态，不如 shadcn 适合 Tracevane 自有工作台表面。
- 原样复制 shadcn/ui 官网或 dashboard 样式：Tracevane 是本地 Agent 工作流控制台，不是通用 SaaS dashboard。
- 回到上一轮纯 macOS 材质派：上一轮已被撤回；可以保留选择性材质，但不能作为唯一美学路线。

## 风险

- React 重写会放弃现有 Vue UI，因此实现前必须用 API 合同测试和页面级原型验收保护行为。
- shadcn/ui 提供组件源码，不提供完整企业应用壳；Tracevane 必须自己定义布局、密度和状态管理约定。
- TanStack Table 是 headless，虚拟滚动、列宽、键盘行为、批量选择和移动适配都需要单独设计。
- 维护终端 IDE 需要专业引擎和性能验证，不能只靠通用组件库。

## 验证计划

React 落地阶段：

- 保留 `docs/prototypes/` 作为视觉和交互源，不再把它当作未落地实验。
- React page 必须覆盖全部原型路由；已迁移路由应从 raw fragment 转为真实 React component。
- React functional route 必须覆盖平台集成总览和 OpenClaw Platform 子域，并明确使用现有 API。
- 每个页面支持深浅主题、基础交互、移动/桌面渲染和命令面板导航。
- 确认只消费现有后端 API，不扩大后端范围。
- 替换旧路由后，用 typecheck/build、Playwright 11 路由 smoke、状态流转 smoke 和截图检查作为当前验收。

2026-06-21 已验证：

- `npm run typecheck:web`
- `npm run build:web`
- `npm run typecheck:api`
- `npm run build:api`
- `git diff --check`
- Playwright 本地 dev smoke：11 个 hash 路由、dashboard 三态、深色主题、命令面板、Sheet、Model Gateway Provider 选中、Approvals 批准、Recovery 应用修复、移动 IDE 导航；截图输出到 `.tmp/react-aurora-smoke/`。

## 2026-06-18 Codex 工具接入决策

本轮按 shadcn 官方 `CLI` / `Skills` / `MCP` 文档重新检查了哪些内容适合现在安装到 Codex：

- 已配置：`shadcn` MCP，写入 `~/.codex/config.toml` 的 `[mcp_servers.shadcn]`，命令为 `npx -y shadcn@latest mcp`。用途是让后续 Codex 能直接查询 shadcn registry、组件和示例模式。
- 暂不运行：`shadcn` CLI 的 `init` / `add`。当前仍是 HTML 原型阶段，没有 React 前端壳和 `components.json`，运行 CLI 会提前创建/修改项目依赖。
- 暂不安装：shadcn Skills。官方 Skills 适合已经有 shadcn 项目时读取 `components.json`、安装组件和约束实现；当前没有目标 React 项目，安装收益低，且容易把原型阶段推进到落地阶段。

后续如果需要继续引入 shadcn 组件文件，再在当前 React 前端内生成 `components.json` 并按组件逐个落地；不要把 shadcn 官网 dashboard 皮肤原样复制进 Tracevane。
