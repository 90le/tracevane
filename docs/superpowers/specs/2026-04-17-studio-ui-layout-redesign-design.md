# Studio 前端 UI 布局重构设计

**日期：** 2026-04-17

## 目标

为 `OpenClaw Studio` 制定一份覆盖平台壳层与主模块页面骨架的前端 UI 布局重构设计，目标不是继续在现有页面上微调卡片和间距，而是对首页、导航和主工作区进行一次真正的重组，解决以下问题：

1. 当前多个页面仍带有明显后台卡片墙气质，缺少稳定的“主舞台”。
2. 模块之间布局语言不统一，切换页面时像在使用不同产品。
3. 顶层导航与二级入口仍偏功能罗列，不够贴近日常任务流。
4. `chat` 已经逐步形成 IM / workspace 方向，但管理域尚未完全进入同一体系。
5. 如果不先冻结页面骨架与信息架构，后续继续补模块能力只会继续放大结构混乱。

本设计覆盖：

- 平台壳层
- 一级 / 二级导航重组
- `Home / Chat / Agents / Channels / Cron / System / Terminal` 的桌面端骨架
- 跨模块共享布局规则
- mobile guardrails
- `room / workflow` 的预留策略

本设计不覆盖：

- 像素级视觉稿
- 最终视觉 token、动效细节
- 逐页面组件 API 拆分
- `room / workflow` 的正式页面骨架

## 已确认决策

- 本轮范围是 **壳层 + 各主模块布局骨架**，不是只改首页，也不是只做 chat。
- 产出深度到 **每个模块的桌面端布局分区**，不直接展开到完整 wireframe。
- 允许重组 **一级导航 + 二级入口结构**。
- 全局节奏以 **chat / sessions 优先** 为锚点，但不是把所有模块都强行 IM 化。
- 本轮目标是 **全新设计所有页面**，不是在现有后台式布局上继续局部修补。
- 风格基底采用 **双态**：
  - `chat` 像 IM / workspace
  - 管理域像 control tower
- 首页承担 **真正总控首页** 职责，而不是 launcher。
- `room / workflow` 本轮 **先不纳入，只在导航中预留位置**。
- `Terminal` **保留一级入口**。

## 约束

- 必须延续现有 `platform shell + modular apps` 的方向，不能重新退回成单体后台。
- 必须遵守现有 UI guardrails：主区域优先、次级内容后撤、chat/terminal 不做卡片墙。
- 不能为了统一风格而抹平模块的任务差异。
- 不能把 `chat` 的主舞台重新做回“session browser + diagnostics pane + thread”三向同权结构。
- 不能让 `system / cron / terminal` 为了追求 IM 感而失去治理和诊断效率。
- 设计必须兼容未来 `room / workflow` 进入壳层，而不是形成死结构。

## 方案比较

### 方案 A：双轨壳层（采用）

一套统一平台壳层之下，按任务节奏区分两种主工作流表面：

- `chat / sessions` 采用 IM / workspace 语言
- 管理域采用 control tower / workbench 语言

优点：

- 最符合当前已确认的产品方向。
- `chat` 可以保持强主舞台，不被后台布局拖回去。
- `agents / channels / cron / system / terminal` 可以保留状态密度与治理效率。
- 首页可以自然承担总控角色，而不会变成某一类页面的变种。

缺点：

- 需要更严格的共享规则，否则容易滑成两套割裂产品。

### 方案 B：全域 IM 化

所有模块尽量都改成 `rail + stage + inspector` 节奏。

优点：

- 视觉风格最统一，现代感最强。

缺点：

- `system / cron / terminal` 这类高状态密度模块会被压成不自然的形态。
- 过度追求统一会损失运维与治理效率。

### 方案 C：全域中控化

除 chat 外，所有模块都围绕 control tower / dashboard 逻辑展开。

优点：

- 治理与运维感最强，适合总控台心智。

缺点：

- `chat` 会显得像外挂。
- 容易重新掉回后台卡片矩阵。

**结论：采用方案 A。**

## 总体结构

Studio 重组为 **一个平台壳层 + 两种主工作流表面 + 一个总控首页**。

### 1. 平台壳层

平台壳层负责固定的跨模块能力：

- 一级导航
- 顶部全局控制条
- 全局搜索 / 命令面板
- 告警 / 待处理 / 最近变化入口
- 主题 / 语言 / 当前实例状态
- 跨模块资源跳转

平台壳层不承担具体业务配置与业务详情，而是作为所有模块共享的操作底座与视觉底座。

### 2. Chat / Sessions 表面

这是 Studio 的默认主工作流，目标是 IM / workspace。

固定语法：

- 轻量 session rail
- conversation stage
- 按需展开 inspector

核心原则：

- transcript 永远是绝对主区域
- composer 必须紧邻 transcript
- runtime / tools / records / details 都属于次级区
- 不允许与 conversation 形成默认三栏同权结构

### 3. 管理域表面

覆盖：

- `agents`
- `channels`
- `cron`
- `system`
- `terminal`

目标不是传统后台，而是运营与治理导向的工作台。

固定语法：

- overview / task head
- 资源导航或主题导航
- 当前任务主工作区
- 次级任务面板 / inspector

核心原则：

- 默认只允许一个主任务语义
- 状态、历史、诊断、附属动作必须后撤到次级区
- 不再做“多个大卡同层争抢注意力”的结构

### 4. Home 表面

首页单独作为总控首页，不是 launcher，也不是其它模块的轻变体。

首页负责：

- 全局态势
- 风险与待处理
- 关键资源摘要
- 推荐动作
- 最近变化

首页不承担深操作，不在首页塞入完整资源工作台。

## 顶层导航与信息架构

一级导航不再按模块功能清单横向罗列，而改成任务导向的信息架构。

### 推荐一级导航

1. `Home`
2. `Chat`
3. `Operate`
4. `System`
5. `Terminal`

### 入口组织

#### Home

承载总控首页。

#### Chat

承载：

- `chat / sessions`

这是默认主工作区。

#### Operate

承载：

- `agents`
- `channels`
- `cron`

这三个模块共同组成日常资源运营域：配置、查看状态、执行动作、进入深编辑。

#### System

承载：

- `system`
- 与环境、诊断、运行态相关的二级主题入口

#### Terminal

保留一级入口，但在分组语义上与 `System` 成对：它不只是工具，而是直接维护与介入入口。

### 次级入口策略

`Config / Skills` 不再与所有一级域平权竞争，建议收进壳层的次级常驻入口区，作为平台能力管理入口。

这意味着整体节奏从“功能目录”切换为：

- 先看 `Home`
- 日常进入 `Chat`
- 管理资源进入 `Operate`
- 环境治理进入 `System`
- 直接维护进入 `Terminal`

### 预留入口

- `Room`
- `Workflow`

本轮只在导航结构中预留未来位置，不进入正式页面骨架设计。

## 各主模块桌面端骨架

统一原则：所有主模块都采用 **Task Head + Primary Stage + Secondary Context** 的节奏，不再使用满屏同权卡片墙。

### 1. Home

**用途：** Studio 总控首页。

**骨架：**

- 顶部：全局态势带
- 中部主区：风险 / 待处理双主块
- 下部：资源总览 + 推荐动作 + 最近变化

**规则：**

- 首页主任务是判断“哪里异常、下一步该进哪”。
- 不做等权九宫格。
- 每个资源块只保留摘要和跳转，不展开完整工作台。

### 2. Chat

**用途：** 默认主工作区。

**骨架：**

- 左：固定 session rail
- 中：conversation stage
- 右：按需展开 inspector（records / runtime / tools / details）

**规则：**

- transcript 与 composer 永远是唯一主舞台。
- inspector 默认弱化，不与对话并权。
- “看、发、切换、回溯”必须保持一气呵成。

### 3. Agents

**用途：** 资源运营 + 当前 agent 工作台。

**骨架：**

- 左：agent list / filter / quick create
- 中：当前 agent 的 overview + detail workspace
- 右：任务面板（bindings / sessions / docs / actions，tabs 化）

**规则：**

- overview、bindings、sessions、docs 不再作为多个同权卡片并排。
- 进入某个 agent 后，中间是当前任务区，右侧才是补充上下文。
- 深编辑页应继承同一工作台语法，而不是再像独立后台页。

### 4. Channels

**用途：** provider / account / pairing / access / bindings 的分层运营。

**骨架：**

- 左：provider/account 导航树或列表
- 中：当前对象主工作区
- 右：配对、权限、绑定、健康状态等任务面板

**规则：**

- channels 采用“资源导航 → 进入对象 → 执行任务”的工作台节奏。
- pairing / access / bindings 不再散成多个平级大卡块。
- provider、account、凭据相关深页都共用同一父级工作台语法。

### 5. Cron

**用途：** 任务定义、调度、运行记录、失败处理。

**骨架：**

- 左：job list + status filter
- 中：job workspace（definition / schedule / destinations）
- 右：run history / failure context / quick actions

**规则：**

- 主舞台是“当前 job 的编辑与运行态”，不是统计卡矩阵。
- 运行历史、失败原因与次级动作进入右侧任务面板。

### 6. System

**用途：** 健康、诊断、版本、环境、升级。

**骨架：**

- 顶：health / risk / version strip
- 左：system topic nav
- 中：当前系统主题主视图
- 右：raw diagnostics / logs / remediation hints

**规则：**

- System 可以更偏 control tower，但仍必须有唯一主视图。
- 原始诊断、日志、明细不默认铺满整页。

### 7. Terminal

**用途：** 直接介入与维护。

**骨架：**

- 顶：环境 / 连接 / 状态工具条
- 中：terminal canvas
- 右：可展开 side utilities（快捷命令、最近输出锚点、维护说明）

**规则：**

- terminal 画布必须绝对主导。
- 所有辅助说明与快捷内容后撤到侧区。
- Terminal 不允许被后台卡片化。

## 跨模块共享布局规则

为了避免每个模块重新发明自己的页面语法，Studio 固定以下共享规则。

### 规则 1：固定页面语法

所有主页面尽量落到统一语法：

- `Task Head`
- `Primary Stage`
- `Context Rail / Inspector`
- `Deep Task Surface`

这套语法保证用户在切页时不再像换产品。

### 规则 2：资源模块从“浏览全部”改成“选择对象后处理它”

对 `agents / channels / cron` 这类资源型模块，统一采用：

- 左侧资源导航 / 筛选
- 中间当前对象工作区
- 右侧任务或上下文面板

不再使用多组大卡片平铺承担所有职责。

### 规则 3：次级内容全部后撤

以下内容默认不得占据主舞台：

- diagnostics
- runtime 明细
- 历史记录
- usage
- tool cards
- raw payload
- 次级说明块

它们统一进入：

- tabs
- collapse
- drawer
- inspector
- secondary rail

### 规则 4：深编辑页继承父工作台语法

像这些 deep surfaces：

- agent bindings
- channel provider settings
- channel account detail
- access control
- cron detail
- system detail surfaces

都不再做成独立后台页，而是作为父模块工作台中的深任务面。

### 规则 5：首页、Chat、Terminal 不许被卡片墙化

以下页面必须保持明确主舞台：

- `Home`：总控画布
- `Chat`：conversation stage
- `Terminal`：terminal canvas

这是整个重构的硬约束。

### 规则 6：壳层统一，但允许双轨语言

必须统一的内容：

- 平台壳层
- spacing rhythm
- header syntax
- panel layering
- empty / error / loading language
- 操作反馈方式

允许不同的内容：

- Chat 的 IM / workspace 节奏
- 管理域的 control tower / workbench 节奏

目标是 **同体系，不同任务表面**，而不是强做一模一样的页面。

## Mobile Guardrails

虽然本轮主产出只到桌面端骨架，但 mobile 底线必须先冻结。

### 统一原则

- mobile 下优先单列
- 不把桌面三栏硬压成一列长墙
- 次级区全部下沉到 `sheet / tabs / drawer / accordion`
- 主舞台优先级保持不变

### 模块规则

#### Home

- 先看态势与风险
- 资源总览后置
- 卡块减少并改成更强分组

#### Chat

- 会话列表收进 drawer 或 bottom dock
- conversation + composer 继续保持主舞台
- inspector 内容不得长期占据顶部和底部可视区

#### Agents / Channels / Cron

- 左侧资源导航收进切换面板
- 中间当前对象工作区保留
- 右侧任务面板下沉为 tabs 或 sheet

#### System

- topic nav 收起
- 诊断明细后置

#### Terminal

- 终端画布保持绝对优先
- 工具说明与附属面板后撤

## Room / Workflow 预留策略

- 在顶层导航结构中保留未来进入位置。
- 不纳入本轮页面骨架设计。
- 未来进入时，优先作为与 `Chat` 相邻的运行型工作流域，而不是塞回后台式管理入口。
- 其进入方式必须兼容当前壳层，而不打破 `Home / Chat / Operate / System / Terminal` 的主轴节奏。

## 实施边界

这份设计文档只冻结 **布局与信息架构层**，作为后续实现计划与模块落地的依据。

本轮实现计划应明确：

- 平台壳层结构
- 一级 / 二级导航重组
- 各主模块桌面端骨架
- mobile guardrails
- 主舞台与次级区划分规则
- `room / workflow` 预留方式

本轮实现计划不需要直接展开：

- 视觉 token 体系
- 最终动效规范
- 每个页面逐像素 wireframe
- 细到组件 API 的实现方案

## 结论

本轮 UI 布局重构不是继续优化单个页面，而是为 Studio 冻结一套新的页面语法：

- `Home` 做总控首页
- `Chat` 做默认主工作区
- `Operate` 承载资源运营域
- `System / Terminal` 形成维护与治理双入口
- 平台壳层统一，模块表面双轨
- 主舞台明确，次级内容后撤

这样后续继续实现页面时，才不会再次滑回“后台卡片墙 + 各模块各说各话”的旧轨道。