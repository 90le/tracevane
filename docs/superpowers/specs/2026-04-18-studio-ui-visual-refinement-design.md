# Studio 前端视觉系统与 UI/UX 精修设计

**日期：** 2026-04-18

## 目标

在 `2026-04-17-studio-ui-layout-redesign-design.md` 已冻结的平台壳层与页面骨架之上，为 `OpenClaw Studio` 制定第二阶段的视觉系统与 UI/UX 精修设计。

本轮目标不是继续局部调色或替换几张卡片，而是建立一套可跨 `Home / Chat / Operate / System / Terminal` 复用的产品级视觉语言，解决以下问题：

1. 当前全站虽然已有新的页面骨架，但视觉层级、间距、面板语言、状态表达仍不够统一。
2. 页面之间切换时，产品感和完成度不稳定，整体 UI 质感仍不足。
3. 深色与浅色体验尚未通过同一套语义化规则收敛。
4. 中文与英文场景下的排版密度和控件节奏还没有被作为设计输入条件统一处理。
5. 如果不先冻结视觉基础系统与共享组件语法，后续继续做页面优化只会再次演变成逐页修补。

本设计覆盖：

- 全站视觉方向与设计原则
- 设计 token 的语义层定义
- light / dark 双主题约束
- 中英文双语排版约束
- 共享 UI 语言与状态表达
- `Home / Chat / Operate / System / Terminal` 的页面域表达
- 响应式与窄屏视觉规则
- 实施顺序与验收标准

本设计不覆盖：

- `room / workflow` 的正式视觉设计
- 最终逐像素视觉稿
- 逐组件 API 级别实现细节
- 宣传站式品牌页语言

## 已确认决策

- 第二阶段范围是 **全站视觉系统 + UI/UX 精修**，不是只优化单页。
- 优先级先做 **全站一致性**，再做页面个性强化。
- 设计方向采用 **成熟 SaaS 产品秩序感 + AI / DevTool 工作台专注感 + 克制的 future / studio 气质**。
- `Home` 仍是控制首页；`Chat` 仍是全局锚点；`Terminal` 保持一级入口。
- 必须同时支持：
  - 中文 / English
  - 浅色 / 深色
- 视觉精修必须服务现有布局骨架，而不是推翻第一阶段信息架构。
- 页面角色允许不同，但不允许看起来像五个不同产品。

## 设计方向比较

### 方案 A：纯企业后台化

特点：强调稳定、中性、低风险，尽量减少表达性。

优点：

- 容易统一。
- 对控制台场景安全。

缺点：

- 很容易重新掉回传统后台质感。
- 无法体现 Studio 的产品辨识度与工作台气质。
- `Chat / Terminal` 会显得过于迟钝。

### 方案 B：重未来感 / 重视觉特效

特点：大面积渐变、玻璃、发光、强烈装饰性。

优点：

- 第一眼冲击力强。
- 能快速拉高“看起来像 AI 产品”的印象。

缺点：

- 很容易牺牲可读性与长时间使用舒适度。
- 对 `System / Operate / Terminal` 这类高信息密度场景不友好。
- 设计会快速失控，后续扩展难统一。

### 方案 C：成熟 SaaS 基底 + 克制 studio accent（采用）

特点：

- 用企业级 SaaS 的信息秩序做底。
- 用 AI / DevTool 工作台的专注感做核心工作流体验。
- 只在关键层级加入少量 future / studio 表达。

优点：

- 兼顾可用性、质感和产品辨识度。
- 适合 `Home / Chat / Operate / System / Terminal` 同时收敛。
- 最利于后续模块扩展时持续复用。

缺点：

- 需要更严格的设计规则，否则容易被实现阶段逐步稀释。

**结论：采用方案 C。**

## 总体设计框架

第二阶段采用三层设计框架：

1. **Foundation**：定义全站视觉基础系统。
2. **Shared UI Language**：定义组件与页面共享语法。
3. **Page Expression**：在统一语言上区分页面角色与气质。

原则是：**先统一产品语言，再允许页面表达差异。**

## 第一层：Foundation（视觉基础系统）

### 1. 颜色系统

颜色不按页面单独命名，而按语义角色组织。

必须至少建立以下角色：

- `bg-app`：应用总背景
- `bg-subtle`：弱背景层
- `surface-1`：基础面板层
- `surface-2`：提升面板层
- `surface-3`：高关注面板层
- `text-primary`：主文字
- `text-secondary`：次级文字
- `text-muted`：弱提示文字
- `border-subtle`：弱边框
- `border-strong`：强边框
- `accent-primary`：品牌主强调色
- `accent-soft`：强调色弱背景
- `success`
- `warning`
- `danger`
- `info`
- `focus-ring`

规则：

- 深浅主题都必须基于同一套语义角色映射。
- 强调色只用于焦点、激活、关键 CTA、流式状态与局部高亮，不能泛滥。
- `success / warning / danger / info` 的语义严格固定，跨页面不得漂移。
- `System` 与 `Operate` 的状态色优先服务判断效率，不能被装饰性颜色覆盖。

### 2. 面板层级

全站面板统一为有限层级，而不是每个页面自由发挥：

- **Base Surface**：主背景上的基础工作面
- **Raised Surface**：需要强调但仍属主页面语境的面板
- **Overlay Surface**：drawer、sheet、dialog、popover 等叠层容器
- **Danger Surface**：危险操作、不可逆动作、错误诊断的专用层

规则：

- 面板差异优先通过背景亮度、边框、内阴影、轻微投影表达，而不是堆叠夸张特效。
- glass / glow 只允许作为局部 accent，不允许成为主面板默认风格。
- `Chat` 的 tool 输出、`System` 的 raw 区、`Operate` 的次级详情，都应映射到明确的次级 surface，而不是临时样式。

### 3. 字体与排版

建立稳定的文字层级，而不是依赖局部字号修补：

- Page Title
- Section Title
- Card / Panel Title
- Body
- Secondary Body
- Label / Meta
- Code / Mono

规则：

- 页面标题明显强于区块标题，区块标题明显强于正文。
- `Chat / Terminal / System` 允许更高频使用等宽字体，但只能用于代码、命令、运行态、标识符等技术信息。
- 中文环境下保持紧凑、稳重；英文环境下避免标题过松或按钮过长破坏布局。
- 行高优先服务长时间阅读舒适性，而不是追求视觉“紧”。

### 4. 间距与密度

需要固定 spacing rhythm，而不是逐页调值：

- 页面级间距
- 区块级间距
- 面板内边距
- 列表项间距
- 表单控件垂直节奏
- chip / badge / tabs 的紧凑密度

规则：

- `Home` 可以拥有最大呼吸感。
- `Chat` 需要最稳定的阅读节奏。
- `Operate / System` 允许中高密度，但必须有清晰分组。
- `Terminal` 维持最少装饰性间距，优先服务主画布。

### 5. 圆角、边框、阴影

建立统一规则：

- 小圆角：输入、chip、badge、小按钮
- 中圆角：面板、卡片、列表容器
- 大圆角：一级工作区、重要总览容器

规则：

- 圆角要有等级，不能每个元素都一样。
- 边框是全站秩序的重要来源，尤其在浅色主题下必须承担结构区分职责。
- 阴影用于层级，不用于装饰性漂浮感堆叠。

### 6. 动效基线

动效应该统一轻量、短促、服务状态变化：

- hover
- focus
- active
- tabs / segmented 切换
- panel 展开收起
- drawer / sheet 进入退出
- loading / streaming 状态

规则：

- 动效优先表达结构变化和焦点变化。
- 不允许出现与控制台任务无关的炫技动画。
- `Chat` 的 streaming 与 `Terminal` 的运行感可以更“活”，但必须克制。

## 第二层：Shared UI Language（共享 UI 语言）

### 1. App Shell

全站壳层需要统一：

- sidebar / primary nav
- top bar / global controls
- 页面内容起始线
- 全局搜索 / 命令入口
- 语言与主题切换
- 告警与待处理提示入口

规则：

- 壳层本身不喧宾夺主。
- 选中态、hover、focus 要一致。
- 各模块切换时视觉感受应连续，而不是壳层和页面脱节。

### 2. Page Head / Task Head

所有主页面统一采用稳定头部语法：

- 页面标题
- 一句话说明或状态摘要
- 关键统计 / 状态标签
- 页面级主操作
- 次级筛选或视图切换

规则：

- 不要每页重新设计标题区。
- 页面 head 优先承担“这里是什么、当前状态如何、现在能做什么”。
- 页面主操作数量严格收敛，避免标题区工具条泛滥。

### 3. Summary Strip

用于 `Home / Operate / System` 的上层摘要带：

- 风险提示
- 健康状态
- 数量摘要
- 环境标识
- 最近异常

规则：

- summary strip 是“先判断态势”的入口，不是详细数据表。
- 其视觉层级高于普通卡片，低于页面标题与主舞台。

### 4. Card / Panel 语言

全站统一面板语法：

- 标题
- 辅助描述
- 元信息区
- 主体区
- 操作区
- footer 或 secondary action

规则：

- 不允许出现大量只有外框不同、结构却完全无规律的卡片。
- 卡片可以按用途分层，但必须共享相同语法骨架。
- `Home` 的总览卡、`Operate` 的模块卡、`System` 的诊断块应“同语法不同气质”。

### 5. Tabs / Chips / Segmented Controls

规则：

- tabs 用于并列主题切换。
- chips 用于状态、筛选、轻量标记。
- segmented controls 用于强互斥视图。
- mobile / 窄屏下优先支持横向滚动，而不是压缩到不可读。

### 6. Forms

统一输入组件的节奏：

- label
- helper text
- field state
- validation
- inline action

规则：

- 表单错误、警告、禁用态跨页面一致。
- 深浅主题下 focus ring 与边框都必须清晰可见。
- 中文和英文下标签长度都不能破坏对齐秩序。

### 7. Lists / Rows / Tables

统一列表与对象行语法：

- 主标题
- 副信息
- 状态点 / badge
- 时间 / owner / category 等 meta
- 右侧 quick actions

规则：

- 资源型列表必须一眼区分对象名、状态、最近变化、可操作性。
- hover 和 selected 要明显，但不能抢主内容。
- 空行与密行都必须保持节奏，不做视觉杂讯列表。

### 8. 状态反馈语言

统一以下状态：

- empty
- loading
- streaming
- success
- warning
- danger
- disabled
- active
- selected
- focused

规则：

- 同一状态跨页面的颜色、图标、边框和背景 tint 层级保持一致。
- 不允许 `Chat`、`Operate`、`System` 各自定义一套危险语义。
- danger 相关表达要优先服务决策，不做情绪化装饰。

### 9. Inspector / Drawer / Sheet / Dialog

这些容器承担次级上下文，不可与主舞台争权：

- `Chat` inspector：session facts / artifacts / references / runtime
- `Operate` side panels：bindings / permissions / history / docs
- `System` raw / logs / remediation
- `Terminal` utilities / quick commands / hints
- confirm dialog：统一语气、层级、按钮语法

规则：

- 主内容在前，次级内容后撤。
- dialog、sheet、drawer 采用统一 overlay surface 语言。
- 确认操作、危险操作、可逆操作要有不同的视觉权重与文案强度。

## 第三层：Page Expression（页面域表达）

这一层不允许推翻共享语言，只允许在统一系统上表达页面角色差异。

### 1. Home：产品级控制首页

定位：`Home` 是控制首页，不是 launcher，不是普通 dashboard。

结构重点：

- 第一屏先给全局态势、风险摘要、待处理事项、快捷动作。
- 中段给 `Chat / Operate / System` 的资源摘要入口。
- 后段放 recent activity、execution、latest sessions 等连续性信息。

视觉原则：

- `Home` 是全站最有产品感的一页。
- 可以使用少量更明显的品牌高光、渐变边缘、光感层，但必须克制。
- 数据卡依然保持企业级稳定感，不能做成营销页。

关键词：**总览、优先级、行动入口、可信度**

### 2. Chat：专注对话工作台

定位：`Chat` 是 Studio 的默认主工作区。

结构重点：

- 左 rail 更轻、更稳，支持 pinned / recent / history 等层级。
- 中间 conversation stage 是唯一主舞台。
- 右侧 inspector 变成结构化上下文区，而不是信息杂物区。
- composer 是页面主控件之一，必须始终清晰可见。

视觉原则：

- `Chat` 是全站最安静、最专注的一页。
- 强调内容可读性、气泡层级、工具输出层次和输入区主控感。
- accent 只用于 focus、active、streaming 和关键操作。

关键词：**专注、节奏、信息层级、持续工作感**

### 3. Operate：模块化运营控制域

定位：统一承载 `agents / channels / cron` 的运营工作台。

结构重点：

- overview-first，再进入具体对象与任务处理。
- 共享一套 `page head + summary strip + main workspace + side detail` 语法。
- Agents 强调状态、能力、可操作性。
- Channels 强调连接、路由、配置结构。
- Cron 强调任务编排、执行监控、失败处理。

视觉原则：

- `Operate` 是全站最模块化的一组页面。
- 借鉴 capability blocks 的组织方式，但仍然是控制台，不是展示页。
- 域内所有页面必须比现在更像同一产品语系。

关键词：**模块化、状态感、操作确定性、一致控制面**

### 4. System：技术诊断控制塔

定位：全站技术深度最强的一页，但不能显乱。

结构重点：

- 上层 health / risk / environment strip。
- 中层 main stage tabs 承载 overview / diagnostics / metrics / raw。
- 下层或侧边承载 detail cards、anomaly list、facts、logs。

视觉原则：

- `System` 可以更冷、更硬朗、更高对比。
- 强调边框秩序、数据节奏和技术权威感。
- 允许少量 technical texture，但只能作为背景氛围，不能干扰信息判断。

关键词：**诊断、可信、分层、技术权威感**

### 5. Terminal：沉浸式维护工作区

定位：顶层维护入口，不是普通辅助页。

结构重点：

- terminal canvas 永远是绝对主舞台。
- toolbar 轻量化，不把噪音压到终端上方。
- utilities、preset、session info、维护说明都必须次级化。

视觉原则：

- `Terminal` 是全站最克制的一页。
- 最少装饰、最少品牌炫技，让终端内容自己成为视觉中心。
- 深浅主题下都必须保证长时间使用舒适度和可读性。

关键词：**沉浸、稳定、工具性、低干扰**

## 双主题与双语约束

### 1. Light / Dark

要求：

- 不能先只做 dark，再被动补 light。
- 两套主题必须共享同一语义 token，而不是两套独立样式。
- 同一状态在双主题中语义不得漂移。

重点检查项：

- panel 边界是否足够清晰
- hover / focus 是否可见
- muted text 是否仍可读
- warning / danger 是否有足够区分
- terminal / code 区的对比度是否稳定

### 2. 中文 / English

要求：

- 标题长度、按钮宽度、标签密度、导航项长度按双语共同校验。
- 不允许只以英文设计，最后中文挤爆。
- 也不允许只按中文压缩，导致英文场景松散失衡。

重点检查项：

- page title 是否换行失控
- button / tabs / chips 是否挤压布局
- 表单标签与 helper text 是否保持节奏
- 左 rail、summary strip、dialog 标题在双语下是否仍平衡

## 响应式与窄屏规则

响应式不是实现补丁，而是视觉系统的一部分。

统一原则：

- 主舞台优先。
- 次级 rail / inspector / utilities 下沉。
- tabs / chips 支持横向滚动。
- sheet / drawer / accordion 承担窄屏次级内容容器职责。
- 不允许页面一缩窄就退化成长条信息堆叠。

分域要求：

- `Chat`：conversation stage + composer 继续优先；session rail 收进 drawer。
- `Operate`：主 workspace 保持核心；侧区收进 sheet / tabs。
- `System`：overview / main stage 优先；topic nav 与 raw detail 后撤。
- `Terminal`：terminal canvas 绝对优先；工具与说明后撤。
- `Home`：先给态势与风险，再给资源摘要。

## 参考来源吸收方式

本轮不直接模仿某一产品，而是从参考资产中抽取元素类别。

### 1. AI / DevTool 类

适合借给：

- `Chat`
- `Terminal`
- `System`

可借元素：

- 深色主基底
- 低噪音 chrome
- 强 focus 态
- secondary surface 中承载工具输出与技术信息
- 稳定的 `rail + stage + inspector` 工作台结构

### 2. Productivity / SaaS 类

适合借给：

- `Home`
- `Operate`

可借元素：

- overview-first 的信息组织
- 清晰的卡片语法
- 企业级可信感
- 成熟的 empty / loading / error 状态
- CTA 克制但明确

### 3. Infra / Observability 类

适合借给：

- `System`
- `Operate`
- 部分 `Home`

可借元素：

- status strip
- health / risk hierarchy
- 数据与告警分层
- 技术感强但不混乱的面板秩序

### 4. Design Tool / Creative Tool 类

适合借给：

- 全站壳层
- 头部节奏
- 面板精致度
- hover / focus / transition 微交互

可借元素：

- 更精细的 panel layering
- 更成熟的留白与层级
- 少量 luminous accent
- 精致但不抢注意力的微交互

## 实施顺序

第二阶段实施顺序必须固定：

1. **先建立全站 design tokens**
   - color roles
   - typography scale
   - spacing scale
   - radius
   - border
   - shadow
   - motion baseline
   - surface tiers

2. **再统一共享基础组件语言**
   - button
   - input / textarea / select
   - tabs / chips / segmented controls
   - card / panel / section head
   - list row / table row
   - empty / loading / error / success / danger
   - confirm dialog

3. **然后收口 shell 与 page grammar**
   - app shell
   - sidebar / topbar
   - page header
   - summary strip
   - main stage
   - side inspector
   - action area

4. **最后才进入页面域表达**
   - `Home`
   - `Chat`
   - `Operate`
   - `System`
   - `Terminal`

这样可以避免重新回到“每页单独设计”的旧模式。

## Do / Don’t

### Do

- 用统一 token 控制全站颜色、层级、间距和状态。
- 用共享 panel grammar 组织页面。
- 用 overview-first 组织复杂信息。
- 用克制 accent 提升焦点和辨识度。
- 让页面角色不同，但产品语言连续。

### Don’t

- 不要每页独立定义 button / input / card 风格。
- 不要滥用渐变、玻璃、阴影、发光。
- 不要把 raw technical information 默认全量摊开。
- 不要为了未来感牺牲可读性和判断效率。
- 不要让某一页出现只在本页成立的特殊交互语法。
- 不要在浅色和深色主题中改变状态语义。

## 验收标准

### 1. 视觉层

- 全站看起来像同一个成熟产品。
- 深浅主题都成立。
- 中文与英文都自然。
- UI 质感明显高于当前版本。

### 2. 结构层

- 用户一眼能分清总览、主操作区、次级信息区、危险或诊断区。
- 页面 head、summary strip、main stage、side context 的关系清晰。
- 切页时结构感连续，不再像切到不同产品。

### 3. 体验层

- `Home` 更像控制首页。
- `Chat` 更专注。
- `Operate` 更统一。
- `System` 更可信。
- `Terminal` 更沉浸。

### 4. 工程层

- 后续新增页面可以复用这套语言。
- 不需要每做一个模块就重新定义一套视觉规则。
- 主题、语言、状态样式可以通过语义层稳定扩展。

## 结论

第二阶段的目标不是把 Studio 做成更花哨，而是把它做成更成熟。

最终应收敛成一句话：

**以企业级 SaaS 的秩序感为底，以 AI / DevTool 工作台的专注感为核，以少量 future / studio 气质做表达。**

在这个原则下：

- `Home` 是产品级控制首页
- `Chat` 是专注对话工作台
- `Operate` 是模块化运营控制域
- `System` 是技术诊断控制塔
- `Terminal` 是沉浸式维护工作区

这样 Studio 才能在不牺牲可用性的前提下，真正拥有统一、精致、可扩展的 UI/UX 体系。
