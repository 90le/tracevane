# 前端重建设计方案（apps/web）

> 日期：2026-06-22
> 状态：设计已确认，进入实现计划
> 范围：删除现有 `apps/web-vue` 前端，按项目定位/目标/架构重建为 `apps/web`，优先完成 Model Gateway，其余域后续迭代。

## 1. 背景与动机

`apps/web-vue` 当前是 React + Vite + Tailwind v4 + Aurora 原型 raw 渲染，存在四类问题，需整体重建：

1. **功能不够**：多数页面只读展示，缺少真正的写操作/控制流（创建、编辑、apply/rollback、确认流）。
2. **架构乱**：原型 HTML 片段 raw 渲染 + page-mounts + 手写 hash 路由，组件/状态/数据层边界不清。
3. **视觉/原型偏离**：raw 渲染导致与 Aurora 原型偏离，未真正落地组件化设计系统。
4. **技术栈/工程基础**：目录名 `web-vue` 名实不符；缺少 shadcn 组件拥有制、类型化 API 层和清晰数据层。

## 2. 关键决策

| 维度 | 决策 |
| --- | --- |
| 技术栈 | React + Vite + Tailwind v4 + **shadcn/ui 真正落地**（components.json + Radix primitives）；TanStack Query 管服务端状态；React Router 真路由（不再手写 hash） |
| 设计系统 | 把 Aurora 视觉语言重建为 Tailwind v4 `@theme` token，再把 shadcn/Radix 组件主题化到 Aurora；Aurora 原型 `styles.css` 作为 token 与页面形态的真相源 |
| 目录 | 新建 `apps/web`，删除 `apps/web-vue`，同步迁移 installer/pack/workspace/plugin/dist/dev 等发布路径 |
| 后端 | 优先只消费现有 API；确需聚合/任务化视图时允许新增 BFF/聚合端点，但必须先按 research-first 记录 |
| 重建策略 | **大爆炸**：立即删 `apps/web-vue`，脚手架 `apps/web`，先做满 Model Gateway，其余路由暂不存在，后续计划逐域补齐 |

## 3. 目录架构

```
apps/web/
├─ index.html
├─ components.json            # shadcn 拥有制
├─ src/
│  ├─ app/                    # 仅应用壳
│  │  ├─ AppShell.tsx         # 左侧分组导航 + 轻顶栏 + content outlet
│  │  ├─ navigation.ts        # 分组导航清单（总览/运行/连接/证据/系统）
│  │  ├─ router.tsx           # React Router 真路由
│  │  ├─ CommandPalette.tsx
│  │  └─ providers.tsx        # Theme + QueryClient + Toast/Dialog/Sheet
│  ├─ design/                 # Aurora 设计系统（基于 token 重建）
│  │  ├─ theme.css            # Tailwind v4 @theme token（深浅 + 4 配色）
│  │  └─ ui/                  # 主题化到 Aurora 的 shadcn 组件
│  ├─ shared/                 # 跨域布局原语 + 状态视图
│  │  ├─ layouts/             # ListDetail / Workbench / StatusConsole / RowsInspector
│  │  └─ states/              # Loading / Empty / Error / Skeleton
│  ├─ lib/
│  │  ├─ api/                 # 类型化 fetch client + 各域端点模块
│  │  └─ query/               # TanStack Query hooks（query + mutation）
│  └─ features/
│     └─ model-gateway/       # 首个域，完整功能
└─ （其余 feature 后续计划补齐）
```

- 共享 TS 契约继续来自仓库级 `types/`。
- 每个 feature 自包含：`page` + `components` + `hooks`(query/mutation) + `api` 绑定 + 本地 `types`。
- 文件保持聚焦，单一职责；文件过大是职责过载的信号。

## 4. 设计系统（Aurora on shadcn）

- 以 Aurora 原型 `docs/prototypes/app/styles.css` 的 token、应用壳气质和页面形态为真相源。
- 用 Tailwind v4 `@theme` 定义颜色/圆角/阴影/状态色/深浅主题/4 配色 token。
- shadcn 组件（Sidebar/Sheet/Dialog/Command/Tabs/Form/DataTable/Tooltip 等）主题化到 Aurora，获得可访问性与键盘优先交互。
- 4 个页面形态（List-Detail / Workbench / Status Console / Rows+Inspector）沉淀为 `shared/layouts/` 可复用原语。
- 信息密集区（表格/终端/日志/代码）实色面板、细边框、低阴影；卡片只用于少量摘要或重复对象。

## 5. 数据流与错误处理

- 数据链路：`lib/api/<域>.ts`（类型化端点封装）→ `lib/query/<域>.ts`（TanStack Query hooks）→ feature 组件。
- 每个视图用 `shared/states` 标准化 loading/empty/error 三态。
- 写操作（mutation）一律走确认弹层，成功后 refetch 相关证据 query。
- 错误：类型化 API 错误本地化呈现；未支持端点渲染显式"不支持"状态，绝不伪装成功；危险写入显示备份/回滚证据。

## 6. Model Gateway（首个域，按已锁定 IA 落地）

严格遵循 `docs/模型网关信息架构契约.md` 与 `docs/模型网关详细目标.md`，`data-view` 集合：`overview / providers / providercfg / models / accounts / apps / usage`。

- **概览 Overview**：实时路由状态、路由检查、关注项（不是 KPI 卡墙）；客户端接入（App Connection）作为概览下钻子页。
- **服务商 Providers**：单表工作台，行级动作（配置 / smoke / 账号池）；新建区分 API Provider 与 Codex 账户登录两个入口；删除进入配置危险区。
- **服务商配置（子页 providercfg）**：`cfg` 分区 基础 / Endpoint / 模型 / 高级 + save-bar；endpoint profiles 与模型目录用结构化行编辑。
- **模型 Models**：模型目录表，别名就地编辑，设为默认。
- **账号池 Accounts**：仅账号制 Provider 显示入口，否则显式边界状态。
- **客户端接入 Apps**：preview / apply / rollback 走确认 + 明确 targetPath/backup 证据。
- **用量 Usage**：来自 live API 的模型请求/token 汇总，空数据用空态，不伪造行。

完成口径（来自 `模型网关详细目标.md`）：route/client/account/provider/model 流程在桌面/移动端通过，并通过 API 验证；危险写入有确认/证据；未实现端点显式不支持。

## 7. 执行顺序（大爆炸）

1. **发布路径迁移**：`apps/web-vue` → `apps/web` 改写 `package.json` workspaces、`pack.sh`、`install-tracevane.sh`、`openclaw.plugin.json`、dist/静态路径、dev 脚本。
2. **删除** `apps/web-vue`。
3. **脚手架** `apps/web`：应用壳 + 设计系统 + 数据层 + shadcn 初始化。
4. **构建 Model Gateway** 至完成口径。
5. **验证**：`typecheck:web` / `build:web` / 系统合同测试 / Playwright 桌面+移动 smoke。
6. 其余域（dashboard/chat/ide/cli-agents/im-channels/external/files/recovery/long-tasks/platforms 等）在后续计划逐个补齐。

## 8. 验收与测试

- `npm run typecheck:web`、`npm run build:web` 通过。
- 新增 Model Gateway 系统合同测试：断言页面消费正确 API、渲染锁定 IA、`data-view` 集合一致。
- Playwright 桌面 + 移动 smoke：无横向溢出、无 console error，覆盖 overview/providers/providercfg/models/accounts/apps/usage 切换与关键写入确认流。
- 发布迁移回归：`bash -n install-tracevane.sh`、`bash -n pack.sh`、release 元数据与 dist 路径校验。

## 9. 非目标 / 边界

- 本期只交付 Model Gateway 完整功能 + 新前端壳；其余域留待后续计划。
- 不恢复 Dreaming、旧插件管理、通用 OpenClaw CRUD、旧模型链路诊断矩阵。
- 不照抄 shadcn 官网 dashboard 皮肤；shadcn 只作为组件拥有制底座，视觉以 Aurora 为准。
- 后端如新增聚合端点，必须先在 `docs/研究先行开发清单.md` 记录来源/理由/风险/验证计划。
