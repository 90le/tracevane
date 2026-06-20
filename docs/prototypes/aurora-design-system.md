# Tracevane Aurora 设计体系

> 状态：Active 设计基线（取代 V8 durable shell 成为新的视觉与体系基线）
> 日期：2026-06-19
> 范围：前端重构原型阶段的统一设计语言。先用独立 HTML/CSS/JS 原型验证，确认后用 React + shadcn/ui + Tailwind CSS 落地。

本文件是 Tracevane 全部页面的设计宪法，定义视觉语言、token、组件规范、布局骨架、页面形态映射和跨页一致性约束。所有原型和将来的 React 组件都以本文件为准。

---

## 1. 设计理念

Tracevane 是本地优先的 AI Agent 控制工作台。设计目标是让用户在三秒内回答：现在能不能工作、下一步做什么、从哪里继续。

三条不可动摇的准绳：

1. **任务优先**：界面回答用户意图，不复刻后端模块目录。后端按前端需要补接口和数据，前端不被现有字段绑住。
2. **层次化，禁止堆叠**：主对象层在主舞台，关联层进检视器 / Sheet / 子页面，低频配置默认不可见。
3. **美观服务清晰**：装饰随信息密度退让。密集区（终端、表格、日志、代码）用实色、低阴影；空旷区（仪表盘、空状态）允许材质和氛围更舒展。

视觉风格命名 **Aurora**：柔和整体背景 + 极淡极光氛围层 + 抬升的实色面板 + 克制的强调色 + 清晰的字号字重层级。浅色默认，深色有真实纵深，避免纯黑纯白。

---

## 2. 设计 Token

所有 token 以 CSS 变量定义，深浅主题与配色通过 `data-theme` / `data-palette` 切换。React 落地时映射为 Tailwind v4 `@theme` + CSS variables。

### 2.1 颜色（语义优先，不直接用色值）

| 角色 | 变量 | 说明 |
| --- | --- | --- |
| 画布底 | `--bg` / `--canvas` | 整页背景，浅色 off-white，深色近黑不纯黑 |
| 面板 | `--panel` / `--panel-2` / `--panel-3` | 三级抬升面板，越浮越亮（浅色）/越亮（深色） |
| 文字 | `--ink-strong` / `--ink` / `--muted` / `--subtle` | 四档文字层级 |
| 分隔线 | `--line` / `--line-2` | 发丝线与稍重边界 |
| 主色 | `--primary` / `--primary-soft` / `--primary-line` / `--primary-ink` | 行动主色 |
| 语义 | `--green` / `--amber` / `--red` / `--teal` / `--violet` + 对应 `-soft` | 成功 / 警告 / 危险 / 连接·恢复 / 外部 |
| 极光氛围 | `--aurora-1/2/3` | 仅用于全局氛围层，禁止做成离散光球 |

规则：
- primary 用蓝（默认），teal 用作连接 / 自愈 / 恢复辅助。
- 配色方案：`blue`(默认) / `teal` / `violet` / `graphite`，仅切换 primary 与 aurora，语义色不变。
- 任何页面不被单一色相支配；禁止纯紫、纯米色、纯深蓝铺满整页。
- 深色背景禁止纯黑 `#000`，浅色禁止刺眼纯白。

### 2.2 圆角

| 对象 | 圆角 |
| --- | --- |
| 控件、按钮、输入框、行 | 9px (`--radius-sm`) |
| 面板、卡片、代码块 | 12px (`--radius`) |
| hero、大容器、弹层 | 18px (`--radius-lg`) |
| 胶囊 tag / pill / segmented | 999px |

### 2.3 阴影（三档，柔和，禁止硬边）

| 档 | 变量 | 用途 |
| --- | --- | --- |
| sm | `--shadow-sm` | 常驻面板、行 hover |
| md | `--shadow-md` | hero、抬起卡片、连接卡 hover |
| lg | `--shadow-lg` | Sheet、命令面板、弹层 |

焦点统一用 ring：`--ring`（primary 半透 3px），深浅两套都可见。

### 2.4 间距与字号

- 基础字号 14px，行高 1.45。字距为 0，不用负字距。
- 页面内容最大宽度 `min(100%, 1320px)` 居中；密集工作台页（IDE）可铺满。
- 区块间距 18px，面板内 padding 14-22px，行内 padding 11-12px。
- hero 标题用 `clamp(22px, 2.6vw, 30px)`；面板标题 14px；卡片大数字 21-26px、字重 680-700。
- 字号只随容器形态分级，不随视口宽度线性缩放正文。

### 2.5 字体

- 正文：Inter + 系统中文（PingFang SC / Microsoft YaHei）。
- 等宽：JetBrains Mono（时间、token、日志、代码、kbd）。

---

## 3. 应用壳骨架

全项目共享一套外壳，保证导航、密度、交互一致。

```text
┌──────────┬───────────────────────────────────────────┐
│ Sidebar  │ Topbar (面包屑 + 全局动作)                  │
│ 品牌      ├───────────────────────────────────────────┤
│ 命令入口  │ Page (主舞台，按页面形态组织)               │
│ 分组导航  │                                            │
│ 折叠/主题 │                                            │
└──────────┴───────────────────────────────────────────┘
  Sheet / Drawer / 命令面板 / Dialog 浮层叠加在上层
```

- **侧栏**：左侧单栏分组导航，品牌 + ⌘K 命令入口 + 分组导航 + 底部折叠/主题/设置。分组标签小字大写。当前项 primary 左条 + soft 底。可折叠为纯图标条，折叠态才用 tooltip。
- **顶栏**：60px 轻量工具条。左侧面包屑 + 当前页标题；右侧搜索、实时状态点、页面主操作。不画交通灯，不做营销 hero。
- **主舞台**：按页面形态组织，最大宽度居中（IDE 类铺满）。
- **浮层**：Sheet（对象详情/设置，右侧滑入）、命令面板（⌘K，键盘可达）、Dialog（危险/确认）、Drawer（移动导航）。
- **移动端**：侧栏变抽屉 + scrim，顶栏搜索收起，主舞台优先，卡片单列回流，禁止横向溢出。

导航分组（按 Tracevane 定位）：总览 / 运行 / 连接 / 证据 / 系统。

---

## 4. 组件规范

| 组件 | 规则 |
| --- | --- |
| 按钮 | 主操作 `btn-primary`（实色渐变 + 投影），次级默认描边，`btn-ghost` 透明，图标按钮 36px 方形。一屏一个主操作。 |
| 命令面板 | ⌘K 打开，分组（导航/动作/视图），支持输入过滤、上下键、回车执行、esc 关闭。是导航补充不是替代。 |
| Sheet | 右侧滑入，header(标题+来源) / body(说明+键值+日志) / footer(关闭+执行建议动作)。对象详情和设置都走 Sheet。 |
| 状态点 / tag | 圆点 + 文字表达状态(在线/降级/阻塞)；tag 胶囊表达分类(bad/warn/ok/info/mute)。 |
| segmented | 时间范围/视图模式切换，不用一排按钮。 |
| 行 row | 列表项左图标 + 主副文 + 右 tag/时间，hover 抬底色，点击进 Sheet。列表操作走 hover/右键，不常驻按钮。 |
| 卡片 | 仅用于少量摘要、可重复对象或弹层，不作为默认布局单位。禁止卡中卡。 |
| sparkline | 趋势用细柱，不喧宾夺主，强调当前值用 primary 实柱。 |
| 代码/日志块 | 实色底 + mono + 复制，密集区材质退后。 |
| 图标 | lucide。React 落地用 lucide-react。不用 emoji 作正式图标。 |

焦点、hover、loading、empty、disabled、error 状态都要可见但克制。

### 4.1 交互模式选择（重要：不要一律用 Sheet）

不同动作必须用恰当的交互模式。把所有按钮都接成右侧抽屉是反模式，会误导后续设计师/工程师，也违背“高频路径 ≤2 步”。按下表选择：

| 场景 | 交互模式 | 不要用 |
| --- | --- | --- |
| 切换状态 / 设为默认 / 启停 | 行内控件（toggle、segmented、按钮就地生效） | Sheet |
| 编辑单个字段 | 行内编辑（点击变输入框，回车保存） | Sheet |
| 编辑一组配置（endpoint、provider 表单） | 进入子页面或右侧 Drawer 表单（带保存条） | Dialog |
| 危险/不可逆动作（删除、apply、rollback、写凭据） | Dialog 确认（说明影响 + 二次确认） | 静默执行 |
| 查看只读详情 / 证据 / 日志 | Sheet（右侧滑入，只读为主） | Dialog |
| 展开同级更多信息（行的子项、hunks） | 行内展开 / 折叠区（accordion） | 跳转 |
| 切换对象（列表选中） | 就地更新右侧检视器，不弹层 | Sheet |
| 跨页面跳转 | 路由跳转 + 命令面板 | Sheet |
| 运行长动作（smoke、test、apply） | 就地按钮 → 行内进度/结果 + Toast，详情可进 Sheet | 只弹 Sheet |

原则：Sheet 主要承载“只读详情 / 证据”，Dialog 承载“确认与危险动作”，行内/Drawer 承载“编辑”，选中走“就地检视器”。原型里要体现这种多样性，让落地工程师看清每种动作的正确归宿。

---

## 5. 页面形态

新建页面前先选一种形态，不要每页发明布局。

| 形态 | 用途 | 结构 |
| --- | --- | --- |
| Summary | 仅仪表盘 | hero readiness + 接入态势卡 + 关注队列（待处理/动态） |
| List-Detail | 模型网关、CLI Agents、Providers、IM 渠道、文件证据 | 搜索/筛选 + 对象行 + 选中详情进 Sheet 或右侧检视器 |
| Workbench | 工作区 IDE、终端、Git、预览 | 内部活动栏/文件树 + 多 tab 主舞台 + 底部终端/任务 + 检视器 |
| Status Console | 模型网关概览、自愈守护、长任务 | 当前状态 + 建议动作 + 紧凑事实 + 服务/检查行 + 日志进 Sheet |
| Settings | 安全配置、视图设置 | 分组表单行 + 内联校验 + 保存条 + 高级折叠 |

---

## 6. 首屏预算

每页首屏只保证：一个标题/选中对象身份、一个状态摘要、一个主操作、一个本地导航控件（需要时）、一个活跃工作面。其余内容必须说明为何可见，否则收进 Sheet / 折叠 / 菜单。两个区域解释同一状态就删一个。

---

## 7. 验收检查

- 桌面与移动视口无重叠、无横向溢出。
- 深浅双主题：文字对比、hairline、hover、focus、状态色都清晰。
- 全项目视觉语言统一（token / 圆角 / 配色 / 交互），无页面间割裂。
- 每页通过层次化验证：主对象明确、高频路径 ≤2 步、低频默认收起、无主界面堆一切。
- 长文本/长路径/长 token/宽表格不撑破容器。
- 命令面板键盘可达；Sheet/Dialog 可 esc 关闭；列表项操作不靠常驻按钮排挤。
- 真实浏览器多视口截图覆盖主要交互面。

---

## 8. 当前原型（共 10 页 + 共享资产）

共享：`app/styles.css`（token + 外壳 + 全部组件）、`app/{states,router,pages,shell}.js`（数据契约/路由/注册/外壳），入口 `app.html`。

- `pages/dashboard.html` — 仪表盘（Summary，含三态演示）。
- `pages/model-gateway.html` — 模型网关（多视图：概览/Provider/配置/模型/账号池/接入/用量）。
- `pages/ide.html` — 工作区 IDE（Workbench，含手机端纵向堆叠 + 文件树抽屉）。
- `pages/chat.html` — 会话 / Agent 工作台（Chat Workbench，含手机端会话/检视器抽屉）。
- `pages/cli-agents.html` — CLI Agents（List-Detail：profile/会话/权限）。
- `pages/im-channels.html` — IM 渠道（List-Detail：账号/会话/配置 + 投递证据）。
- `pages/external.html` — 外部连接（MCP/OAuth/集成）。
- `pages/files.html` — 文件证据（Rows + Inspector + diff 预览）。
- `pages/approvals.html` — 审批（待审批 + 风险/diff 预览 + 批准/拒绝）。
- `pages/recovery.html` — 自愈守护（Status Console：备份→预览→应用→校验→回滚 + 服务）。
- `pages/long-tasks.html` — 长任务（List-Detail：进度/暂停/停止/证据）。

全部从本体系延展，共享同一外壳与交互模式。

## 8.1 域边界（避免页面间职责重复）

模型网关与 CLI Agents 都会出现 Codex/Claude Code/OpenCode 等对象，必须按单一真相划清职责，避免重复入口：

| 关注点 | 归属页面 | 说明 |
| --- | --- | --- |
| Provider / endpoint / 模型 / 账号池 | 模型网关 | 路由的唯一真相 |
| 路由如何应用到客户端（App Connection：apply/rollback/diff） | 模型网关 · 客户端接入 | “流量去哪、写入哪个客户端配置” |
| 模型路由的选择与变更 | 模型网关 | CLI Agents 页只读引用，按钮跳转网关，不在本页编辑 |
| Agent 工作目录 / persona / 权限 / 原生 session / 会话 | CLI Agents | Agent 实例“怎么跑”的唯一真相 |

规则：
- CLI Agents 不提供第二处路由编辑入口；“模型路由”字段只读 + 跳转模型网关。
- 模型网关「客户端接入」不重复 Agent 实例管理；涉及工作目录/权限/会话时跳转 CLI Agents。
- 两页互相 cross-link，让用户清楚“在哪改什么”。

---

## 9. 落地映射（原型概念 → React）

| 原型概念 | React / shadcn 组件 |
| --- | --- |
| 应用壳 | `Sidebar` + `Collapsible` + 自定义 Topbar |
| 命令面板 | `CommandDialog` / `CommandGroup` / `CommandItem` |
| Sheet | `Sheet` (Header/Content/Footer) |
| 对象列表 | `Table` / `DataTable`（TanStack Table）+ row 选中 |
| 状态/趋势 | `Badge` + 自定义状态点 + sparkline 组件 |
| 表单设置 | `Form` + `Input` + 内联校验 + 保存条 |
| 主题/配色 | CSS variables + `data-theme`/`data-palette` |
| 服务端数据 | TanStack Query；按前端需要约定新聚合接口 |

原型阶段允许使用前端假数据呈现尚未存在的聚合（如可用率、投递率聚合）；这些在落地阶段由后端按前端约定补接口，不视为后端已就绪。

## 10.1 状态三态（v2 补充）

每个数据区都必须有 loading / empty / error 三态，禁止默认“有数据且正常”。共享能力 `AuroraShell.states(container, kind, opts)`：

- `skeleton-rows` / `skeleton-cards`：骨架屏占位（shimmer 动画）。
- `loading`：spinner + 文案。
- `empty`：图标 + 标题 + 说明 + 可选动作（如“配置模型网关”）。
- `error`：错误图标 + 说明 + 重试按钮（onRetry 回调）。

仪表盘「接入态势」已内置状态演示器（数据/加载/空/错误切换），作为实现样板。落地 React 时映射 TanStack Query 的 `isLoading/isError/data` 直接复用。

---

## 10. v2 修订记录（glm-5.2 审视后的推翻与补充）

对 Aurora v1 的批评及由此产生的硬性修订：

1. **信息架构重定**：CLI Agents 从「连接」移到「运行」。理由——管理 Agent 实例（工作目录/persona/权限/session）是运行时关注点；「连接」只保留真正管连接的页面（模型网关、IM 渠道、外部连接）。已同步全部 10 页侧栏与 `界面设计守则.md` §9。
2. **Providers 不再单列**：Provider/endpoint/模型管理是模型网关内置能力，合并进网关，避免页面碎片化。
3. **新增「外部连接」组项**：MCP / 外部服务授权作为连接面的明确归属（导航占位，待设计）。
4. **交互模式收敛**：v1 引入了 viewbar / wizard / drawer / dialog / sheet / toast / accordion / inline-edit / toggle / segmented 共 10 种，过多。§8.2 硬约束：交互收敛为 7 类有限集，wizard 默认拆成 Drawer/子页面，禁止再发明新模式。
5. **待修（v3 候选）**：模型网关页 7 视图大杂烩违反自身层次化原则，需拆分为独立子页面；aurora 氛围装饰层与守则“禁止装饰背景”冲突，需改为结构性纵深；loading/empty/error 三态组件缺失，待补；仪表盘 hero 编辑性文案需改为可操作控制面。
