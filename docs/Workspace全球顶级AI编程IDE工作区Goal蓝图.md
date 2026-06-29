# Tracevane Workspace 全球顶级 AI 编程 IDE 工作区 Goal 蓝图

> 状态：Active Codex Goal Blueprint
> 创建：2026-06-29
> 当前阶段：Phase 0/1 — 先清理不恰当代码与文档，并把后续重建范围锁定到 IDE Core UI/UX
> 当前适用范围：Tracevane Workspace IDE 主体、Terminal 前端体验、Git、Search、Files、Editor、Command Palette、Status、布局持久化、桌面/平板/手机响应式 UI/UX，以及支撑这些能力的最小后端契约；写作、渲染、预览增强仅作为未来扩展，不是当前主线
> 执行原则：先 IDE，后 AI；先终端/Git/搜索/文件/编辑器真实能力，后视觉装饰；先删除错误方向，后建设长期平台。

---

## 0. 本蓝图与 Codex Goal 的关系

本文件是当前 Codex Goal 的详细执行宪章。Codex Goal 工具已经创建总目标，但工具不支持直接改写已创建目标正文；因此，后续所有推进、清理、提交、验收与阶段复盘均以本蓝图为更详细的目标说明。

当前 Codex Goal 的核心含义被展开为：

> 把 Tracevane Workspace 重新确立为 **IDE-first、AI-native、可无限扩展的全球顶级 AI 编程 IDE 工作区**。第一阶段先暂停视觉概念推进，清理当前前后端 IDE 工作区里不恰当、误导性、重复、半成品或偏离 IDE-first 方向的代码与文档；随后在清理后的基础上建立可执行的长期产品/架构路线，优先恢复并巩固 IDE 核心能力、Terminal 前端体验、Git、Search、Files、Editor、Command Palette、Status、工作区前后端契约、基础布局、桌面/平板/手机响应式 UI/UX 与可扩展边界。

**Codex Goal 文本修正声明：** 当前 Codex 工具内的 active goal 是早期超大目标，残留了“写作、预览、渲染”等宽泛表述；工具只允许标记 complete/blocked，不能原地改写 objective。因此本蓝图覆盖旧 objective 的歧义：当前执行目标只推进 IDE 工作区本体和 UI/UX，包括 IDE 主体框架、Terminal 前端体验、Git、Search、Files、Editor、Command Palette、Status Bar、布局持久化、桌面/平板/手机适配与支撑这些能力的最小前后端契约。写作、渲染、预览增强不是 Phase 0/1/2 的目标，也不是当前代码清理或前端重设计的验收范围。

本蓝图不是一次 UI 美化任务，也不是继续在旧框架上“补几个按钮”。它是一次面向长期产品的重新定向：**Tracevane 首先必须成为可靠、可扩展、专业的 Web IDE 工作区；AI、证据、Agent、IM、平台集成只能作为 IDE 平台上的扩展层；写作、渲染、预览增强暂时只作为未来可选扩展，而不能反过来破坏 IDE 基础心智。**

### 0.1 当前重建口径：推翻旧前端壳，而不是修补旧页面

用户已经明确否定当前工作区前端：它不像 IDE，像说明文档页、概念展示页或临时拼装页面。后续执行必须承认这一点，并按以下口径推进：

- **要重建的是 IDE 前端框架本身**：Workspace Shell、Activity Rail、Side Panel、Editor Stage、Bottom Terminal Panel、Status Bar、Command Palette 和响应式 mode system。
- **不是给旧页面换皮肤**：禁止继续在旧卡片、旧说明页、旧 AI 展示面板上追加按钮或渐变色来伪装“重构完成”。
- **优先真实前端能力**：Terminal、Git、Search、Files、Editor 这些用户每天工作的能力，必须先有清楚 owner、状态、错误、命令、快捷入口和移动端交互。
- **手机端是主线，不是附属**：AI 时代用户会在手机端阅读、搜索、跑终端、审查 Git、轻量编辑；手机必须是单任务 IDE 控制台，而不是桌面三栏缩小版。
- **AI 只能作为 IDE 上的增强层**：AI 面板、证据、Agent handoff 不能替代 IDE 主体，也不能抢走 Terminal/Git/Search/Editor 的默认视觉重心。
- **阶段验收看可工作能力，不看概念图**：如果没有更好的终端输入、搜索跳转、Git 审查、文件编辑、布局恢复和移动端任务流，就不能称为完成重构。

---

## 1. 最高产品目标

### 1.1 北极星

Tracevane Workspace 的北极星是：

> 一个本地优先、IDE-first、AI-native、可扩展、响应式的专业工作区，让用户在桌面、平板、手机上都能完成真实项目的阅读、编辑、运行、调试、终端、Git、搜索、AI 协作和证据审查。

它应该接近或超越以下产品在各自方向上的优点：

- VS Code / VS Code Web：成熟 IDE 心智、Activity Bar、Explorer、Editor、Panel、Command Palette、扩展生态。
- Eclipse Theia：可白标、可扩展、可深度定制的 Web/Desktop IDE 平台路线。
- Cursor / Windsurf：AI 与 IDE 深度结合，而不是外挂聊天。
- Replit / Bolt.new / StackBlitz：项目运行、终端、AI 生成与应用闭环。
- GitHub Codespaces / Gitpod / Coder：工作区、容器、远程开发和浏览器 IDE 的生产级形态。
- iPad/手机开发工作流：小屏下不是缩小桌面 IDE，而是任务流、命令、审查、终端、AI 控制台。

### 1.2 产品一句话

Tracevane Workspace 是一个 **AI 时代的可扩展 Web IDE 操作系统**：

```text
Project Workspace
  = Files
  + Editor
  + Terminal
  + Git
  + Search
  + Command System
  + Extension System
  + AI Context
  + Evidence / Review
  + Responsive Workbench
```

### 1.3 绝对优先级

优先级必须按以下顺序执行：

1. **IDE 基础能力**：Files、Editor、Terminal、Git、Search、Command Palette、Status Bar、布局恢复。
2. **Terminal / Git / Search 前端可用性**：终端会话、输入、移动端键盘、Git 审查、Search 跳转必须成为第一批真实工作流，而不是装饰面板。
3. **工作台架构**：可扩展的 shell、pane、panel、command、context、layout、state。
4. **响应式体验**：桌面、平板、手机分别是不同交互范式，不是简单压缩；手机端也必须能完成终端、Git 审查、搜索跳转和轻编辑。
5. **AI 编程层**：上下文收集、代码建议、diff、命令执行审批、证据交接。
6. **工作区 UI/UX**：桌面端信息密度、手机端单任务流、终端输入体验、面板切换与状态反馈。
7. **生态与个性化**：插件、面板、命令、主题、Agent、平台集成。
8. **视觉品牌与动效**：只在上述基础可靠后增强；不能先做“看起来像产品”的空壳。

---

## 2. 必须承认的当前问题

当前 Workspace/IDE 前端和文档存在以下系统性问题：

1. **IDE 心智不稳定**：页面一会像文件管理器，一会像说明文档，一会像 AI 展示页，不像一个真实 IDE。
2. **概念文档过多**：多个“重设计”“原型”“总纲”“目标”并存，互相冲突，容易让后续实现继续跑偏。
3. **过早视觉化**：在 IDE 基础能力尚未稳定之前，做了过多概念页、卡片、说明文案和品牌化首屏。
4. **AI 层反客为主**：AI/证据/Agent 相关面板容易压过编辑器、文件、终端等核心 IDE 能力。
5. **响应式不是真响应式**：移动端不能只是隐藏面板或横向挤压；手机需要单任务流与底部模式切换。
6. **前后端边界混乱风险**：Terminal、CLI Agents、Workspace、File Manager、Evidence 之间容易互相拥有对方生命周期。
7. **旧文档和旧代码残留**：历史阶段文档、半成品 UI、旧路线测试会误导继续维护错误方向。
8. **并行开发污染风险**：当前工作区有大量其他人未提交改动，任何清理和提交都必须严格只处理本代理修改的文件。

本 Goal 的第一动作不是继续开发新说明页或新视觉概念，而是 **停止错误增量、建立边界、清理不恰当残留**；下一步重建也必须围绕 IDE 主体、Terminal、Git、Search、Files、Editor 和移动端真实工作流，而不是围绕预览/写作/渲染。

第一季最重要的产品任务是 **Workspace IDE 前端全面重建**：

1. 删除或隔离不恰当的前后端 IDE 工作区代码、文档、测试残留。
2. 把 `/workspace` 从“说明页式/卡片式/AI 展示式页面”重新变成 IDE shell。
3. 按 Terminal First、Files/Editor Core、Search Core、Git Core、Command/Status、Responsive Hardening 的顺序做真实能力。
4. 所有 UI/UX 设计必须服务于工作效率、信息密度、可恢复布局、移动端可操作性和扩展边界。
5. 任何不能增强 IDE 主体能力的视觉方案，都必须推迟或删除。

本 Goal 当前也不是渲染/预览/写作增强任务：

- 不碰新的渲染引擎。
- 不做预览增强、预览主题、富媒体渲染或视觉阅读体验。
- 不建设写作产品线。
- 不把 AI 内容生成、文档润色或发布工作流列为当前验收。
- 当前先完成 IDE 工作区本体：文件、编辑器、终端、Git、搜索、命令、布局、前后端契约、桌面端和手机端 UI/UX。


---

## 3. 第一阶段：清理目标

### 3.1 清理的目的

Phase 0 的目标不是“删得越多越好”，而是清除会误导产品方向、增加维护噪音或让用户看到半成品的内容。

清理必须达成：

- 仓库中只有一个清晰的 Workspace 最高方向：IDE-first AI-native Workbench。
- 删除或降级不再适用的“推翻式视觉原型”“第一季展示页”“半成品说明页”。
- 不让旧文档继续指挥后续实现。
- 不破坏当前可运行的 Workspace IDE 基线。
- 不误删其他开发者正在修改的文件。

### 3.2 第一阶段允许清理的对象

允许优先处理：

1. **已确认 clean 且明显过期的文档**
   - 例如重复的原型稿、旧重设计总纲、被当前蓝图替代的阶段性研究。
2. **已确认由本代理上阶段引入且被用户否定的代码**
   - 例如 Season One、演示页、非 IDE 的概念工作室路由或组件。
3. **测试中的旧目标断言**
   - 若测试要求保留错误方向文案，应更新为验证 IDE-first 蓝图和旧残留删除。
4. **README / 索引中的旧入口**
   - 必须指向本蓝图和少量权威文档，避免十几个入口并列。
5. **无引用、无运行路径、无产品价值的临时文件**
   - 删除前必须通过 grep / git ls-files / import 检查。

### 3.3 第一阶段暂不允许清理的对象

以下内容暂不删除，除非完成进一步审计：

1. 当前仍被 `/workspace` 使用的 Workbench、Monaco、Dockview、Terminal、Explorer、Git、Search 代码。
2. 其他人正在修改的 dirty 文件。
3. 后端文件、终端、Git、Agent API 中尚未确认是否被现有测试依赖的代码。
4. 与 File Manager 当前提交相关的 SQLite 元数据改动。
5. 用户数据、配置、运行态目录、缓存、真实项目文件。
6. 任何需要数据库迁移或破坏兼容性的删除。

### 3.4 清理判定标准

一个文件或模块如果满足以下任一条件，可以进入删除/重写候选：

- 描述或实现了被用户明确否定的“说明文档页式 IDE”“第一季重建工作室”“围绕一个实时任务”等旧概念。
- 与 IDE-first 目标冲突，把 Workspace 设计成卡片展示页、管理后台或 Agent 说明页。
- 与其他文档重复 70% 以上，且没有独立可执行价值。
- 只提供概念文案，不约束代码、测试、架构或验收。
- 已经没有 import、route、test、README 引用。
- 留下会让下一个开发者误以为这是当前方向。

---

## 4. 后续建设目标

### 4.1 IDE Core

IDE Core 是 Workspace 的底座，必须长期稳定。

必须具备：

- File Explorer：目录树、文件打开、新建、重命名、删除、拖拽、搜索、上下文菜单。
- Editor：Monaco 或等价编辑器、多标签、保存、dirty 状态、语言识别、diff、查找替换。
- Terminal：真实 PTY、会话恢复、cwd、任务、日志、移动端输入优化、命令审查。
- Git：分支、变更、diff、stage、commit、history、冲突提示。
- Search：文件名与内容搜索，结果可打开、可投递上下文。
- Command Palette：所有重要动作必须可命令化。
- Layout：桌面可拖拽/拆分/恢复；平板可双栏；手机单任务流。
- Status Bar：分支、保存、编码、运行、终端、AI/证据状态。
- Keymap：核心快捷键、可配置、跨平台。
- Persistence：打开文件、布局、终端会话、工作区根目录恢复。

### 4.2 Extension Layer

Tracevane 必须支持无限扩展，不能把所有功能硬塞进 Workbench 主文件。

扩展点至少包括：

- Activity：左侧/底部模式入口。
- Panel：侧栏、底栏、右栏、浮层。
- Editor Contribution：编辑器 toolbar、右键、inline actions、diff actions。
- Command：命令注册、权限、快捷键、上下文条件。
- Context Provider：文件、选区、终端输出、Git diff、搜索结果进入 AI 上下文。
- Evidence Provider：测试结果、命令记录、diff、日志、审查项。
- Agent Provider：Codex、Claude Code、OpenCode、自定义 agent。
- Preview/Rendering Provider：未来可选扩展；当前不推进渲染或预览增强。
- Writing Provider：未来可选扩展；当前不作为主线。
- Theme/Layout Provider：主题、密度、布局 preset。

### 4.3 AI-native Layer

AI 不是聊天框，而是 IDE 工作流的一部分。

必须实现的方向：

- AI 能看见明确上下文：打开文件、选中文本、终端输出、Git diff、测试结果。
- AI 的修改必须以 diff / patch / file operation 形式呈现。
- 高风险操作必须审批：写文件、删除、运行命令、安装依赖、提交 Git。
- AI 输出必须可追踪：记录来源上下文、命令、证据、结果。
- AI 当前优先帮助编程：解释代码、生成补丁、生成测试、总结终端/Git/错误证据；写作扩展不进入当前主线。
- AI 不应该遮挡 IDE 主任务；它应作为右侧/底部/命令/inline 的协作层。

### 4.4 Future Writing / Preview / Rendering Extensions（当前非主线）

写作、渲染和预览增强都是未来可选能力，不是当前主线任务，也不是 Phase 0/1/2 的验收目标。

暂不推进：

- 不建设独立写作产品线。
- 不做新的渲染引擎、预览增强、预览主题或富媒体阅读体验。
- 不把 Markdown 长文编辑作为当前主任务。
- 不把 AI 改写/扩写/校对作为 Phase 0/1/2 验收。
- 仅保留现有基础文件查看/编辑能力；除非修复阻塞 IDE 基线的缺陷，否则不碰渲染/预览代码。

### 4.5 Evidence and Review

证据层用于 AI 协作、代码审查和任务闭环。

必须支持：

- 文件上下文证据。
- Git diff 证据。
- 终端命令与输出证据。
- 测试结果证据。
- 用户选择证据。
- AI 修改前后的审查记录。
- 可复制、可导出、可交接的 evidence bundle。

---

## 5. 路线选择与长期架构判断

### 5.1 三条路线

当前有三条可选路线：

#### 路线 A：保留并重构当前自研 Workbench

适合：

- 需要快速恢复控制权。
- 当前已有 Monaco、Dockview、xterm、Explorer、Git/Search 雏形。
- 不想立即引入大型 IDE 平台。

风险：

- 自研成本高。
- 容易继续补丁式堆叠。
- LSP、扩展协议、调试器、插件生态需要长期补齐。

定位：

> 作为短期过渡与对照基线，而不是盲目继续扩大。

#### 路线 B：基于 Eclipse Theia

适合：

- 想做自己的 VS Code 类产品。
- 需要 Web/Desktop IDE 平台、插件、命令、widget、workspace、LSP、扩展机制。
- 想深度定制 AI、证据、移动壳。

优势：

- 比 code-server 更适合白标和产品化。
- IDE 平台能力成熟。
- 更容易把 Tracevane 的 AI/证据做成一等扩展。

风险：

- 学习和迁移成本高。
- 需要评估移动端可塑性。
- 需要把现有 Tracevane 后端能力适配到 Theia extension/backend 模型。

定位：

> 长期顶级产品的优先候选路线。

#### 路线 C：集成 code-server / OpenVSCode Server

适合：

- 最快得到完整 VS Code Web 能力。
- 用户需要立即可用的成熟 IDE。
- Tracevane 主要负责账号、项目、AI 编排、反代和工作区管理。

优势：

- 上线速度快。
- VS Code 心智成熟。
- 扩展生态强。

风险：

- Tracevane 容易变成 VS Code wrapper。
- 深度定制、证据层、AI 工作流和移动体验受限。
- 很难塑造独特顶级产品体验。

定位：

> 快速 fallback / 兼容模式 / 专业桌面 IDE 模式，而不是唯一长期产品壳。

### 5.2 本 Goal 当前推荐

本 Goal 不立即押注唯一实现，而采用“清理 + 架构 Spike + 决策门”的方式：

1. Phase 0：清理错误方向和旧文档。
2. Phase 1：审计当前 Workbench 能力和缺口。
3. Phase 2：做 Theia Spike，验证深度定制、移动壳、AI/证据扩展可能性。
4. Phase 3：做 code-server/OpenVSCode Spike，验证最快完整 IDE 集成、反代、身份、项目管理。
5. Phase 4：形成 ADR，决定主线：Theia 主线 / code-server fallback / 当前 Workbench 继续演进 / 混合策略。
6. Phase 5：按决策开始真实重建，不再做说明页式 UI。

---

## 6. 手机和平板原则

### 6.1 手机端不是缩小版桌面 IDE

手机端的目标是：

> AI-assisted command and review IDE，即 AI 辅助的命令、审查、轻编辑、运行控制工作区。

手机端必须优先支持：

- 快速打开项目与文件。
- 阅读代码和文档。
- 搜索与跳转。
- 查看 diff。
- 审批 AI 修改。
- 运行/停止常用命令。
- 查看终端输出。
- 复制错误、让 AI 解释、生成修复建议。
- 小范围编辑与保存。
- 轻量文本修改；不推进独立写作产品线。

手机端不应强求：

- 多栏同时展示。
- 大规模拖拽布局。
- 全功能复杂调试 UI。
- 与桌面完全一致的快捷键体验。

### 6.2 平板端原则

平板是介于桌面和手机之间的工作台：

- 横屏：双栏或三栏轻量工作台。
- 竖屏：主编辑区 + bottom/side sheet。
- 支持外接键盘时接近桌面。
- 不支持外接键盘时接近手机任务流。

### 6.3 响应式布局断点

建议长期采用：

```text
Desktop >= 1200px
  Activity Rail + Side Bar + Editor Grid + Right Inspector + Bottom Panel

Tablet 768px - 1199px
  Activity Rail/Top Context + Main Editor + Slide Panels + Bottom Terminal

Mobile < 768px
  One main surface + Bottom Mode Nav + Command Sheet + Context Sheets
```

---

## 7. 必须做

### 7.1 立即必须做

1. 创建并维护本 Goal 蓝图。
2. 清理旧文档入口，避免冲突。
3. 删除已确认过期、误导、clean 的旧 Workspace 原型/总纲文档。
4. 更新 README，使其指向本蓝图。
5. 更新或增加测试，保证：
   - Goal 蓝图存在。
   - Workspace 方向是 IDE-first。
   - 旧 Season One / 第一季 / 说明页式 UI 不再作为目标。
6. 扫描残留关键词。
7. 提交本阶段改动。

### 7.2 下一阶段必须做

1. 当前 Workbench 能力审计。
2. 前端代码分层图：IDE Core、Terminal/Workspace Backend Boundary、Extension Layer、AI/Evidence Layer。
3. 后端能力分层图：Workspace fs、terminal、git、search、agent/evidence；preview/rendering 暂不推进。
4. Theia Spike 文档与最小验证。
5. code-server/OpenVSCode Spike 文档与最小验证。
6. 终端与 Workspace 后端契约审计。
7. 移动端交互原型规范。
7. ADR：长期路线决策。

### 7.3 长期必须做

1. 重建稳定 IDE shell。
2. 建立 extension registry。
3. 建立 command/context/evidence model。
4. 建立 responsive workbench primitives。
5. 建立 AI 修改审查闭环。
6. 建立真实项目运行与终端闭环。
7. 建立高质量 IDE UI/UX 系统，但不得牺牲 IDE 密度和效率。

---

## 8. 禁止做

本 Goal 禁止以下行为：

1. 禁止再做“看起来很酷但不能工作”的说明页式 Workspace。
2. 禁止把 Workspace 首屏做成营销页、卡片墙、任务海报或概念图。
3. 禁止让 AI 面板遮蔽编辑器、文件、终端这些 IDE 核心对象。
4. 禁止继续堆叠互相冲突的总纲/原型/目标文档。
5. 禁止在没有审计的情况下删除当前可运行 IDE 基线。
6. 禁止提交其他人的 dirty 改动。
7. 禁止新增依赖，除非完成研究与明确授权。
8. 禁止把手机端简单当作 CSS 压缩。
9. 禁止把 code-server/OpenVSCode 当成唯一答案而不分析产品主权问题。
10. 禁止把 Theia 当成银弹而不验证定制成本和迁移成本。
11. 禁止在测试失败时声称完成。
12. 禁止留下 P1/P2 占位卡片污染用户首屏。

---

## 9. 执行方法

### 9.1 工作流

每一阶段遵循：

```text
Inspect -> Plan -> Scope -> Edit -> Verify -> Commit -> Report
```

其中：

- Inspect：确认当前代码、文档、dirty 文件、引用关系。
- Plan：写出本阶段清理/实现计划。
- Scope：只处理可确认属于本阶段的文件。
- Edit：小步修改，优先删除而非增加。
- Verify：运行针对性测试、grep、typecheck 或 smoke。
- Commit：只 stage 本代理修改的文件，Lore Commit Protocol。
- Report：说明改了什么、验证什么、剩余风险。

### 9.2 清理工作流

清理按 `ai-slop-cleaner` 原则执行：

1. 锁定行为或目标。
2. 写清理计划。
3. 盘点 fallback-like、重复、死代码、边界混乱、UI/design slop。
4. 一次处理一类问题。
5. 验证。
6. 提交。

### 9.3 子代理使用规则

必要时可以启动 subagent，但必须满足：

- 子任务独立、边界清晰、可并行。
- 子代理只做分析或限定文件范围内工作。
- 主代理负责整合、验证和提交。
- 不把 dirty 文件所有权交给子代理随意修改。
- 不为 trivial grep 或单文件编辑启动子代理。

适合子代理的任务：

- Theia 路线深度调研。
- code-server/OpenVSCode 路线深度调研。
- 当前 Workbench 架构审计。
- 移动端 IDE 产品研究。
- 后端 Workspace/terminal/git 能力边界审计。

当前环境开发者指令要求：除非用户明确要求 subagent/协作，否则不启动子代理。本蓝图允许未来在用户明确允许或任务确实需要时使用。

---

## 10. 代码边界

### 10.1 前端边界

前端必须分层：

```text
Workspace Shell
  - layout
  - activity/navigation
  - command palette
  - responsive mode

IDE Core Features
  - explorer
  - code editor
  - terminal
  - search
  - git
  - command/status/layout

Current Extension Features
  - ai context
  - evidence
  - agent handoff
  - review

Future Extension Placeholders (not Phase 0/1/2 scope)
  - preview/rendering
  - writing
```

当前前端重设计的硬范围：

- Workspace Shell：全局顶栏/项目栏、Activity Rail、Primary Side Panel、Editor Stage、Bottom Terminal Panel、Status Bar。
- Terminal UX：session roster、active cwd、stream/input/resize 状态、移动端 keyboard inset、copy/clear/insert-command、fullscreen/dock/sheet。
- Git UX：branch、changes、diff review、stage/unstage/commit-confirm、mobile review flow。
- Search UX：file/content search、result grouping、open-to-editor、reviewable replace plan、mobile jump flow。
- Files/Editor UX：tree、tabs、dirty/save、diff/review mode、open/reveal/rename/delete/upload confirmation。
- Command/Status：统一 command registry、context-aware commands、status bar reflects real work state.

禁止：

- 在 `WorkspaceWorkbench` 中无限堆业务逻辑。
- 在 editor 组件中处理 Agent 生命周期。
- 在 terminal 组件中处理 CLI Agent readiness。
- 在 AI context 中直接拥有文件系统生命周期。
- 把视觉文案作为状态机。

### 10.2 后端边界

后端必须分层：

```text
Workspace FS Service
Terminal Service
Git Service
Optional Preview/Runtime Service (future extension boundary only)
Agent Runtime Service
Evidence Service
```

禁止：

- Terminal service 管理 Agent Run 生命周期。
- CLI Agents service 管理普通 PTY tabs。
- File service 混入 UI 状态。
- Evidence service 静默吞掉命令失败。
- Provider/Gateway secret 流入 Workspace 前端状态。

---

## 11. 文档边界

### 11.1 权威文档层级

后续文档优先级：

1. `docs/Workspace全球顶级AI编程IDE工作区Goal蓝图.md`（本文件）
2. `docs/README.md`
3. `docs/整体目标.md`
4. `docs/产品需求.md`
5. `docs/Workspace设计文档.md`
6. `docs/Workspace架构.md`
7. `docs/Workspace前端架构.md`
8. `docs/Workspace后端设计.md`
9. `docs/研究先行开发清单.md`

重复、旧方向、阶段性原型文档应删除或降级，不再并列为必读入口。

### 11.2 文档写法

文档必须：

- 写可执行边界，而不是泛泛愿景。
- 写 Owner 和 Must not own。
- 写测试/验收。
- 写删除条件。
- 写研究来源和日期。
- 写明确不要做什么。

文档不得：

- 用大量营销话术代替架构。
- 创建多个同名总纲。
- 用“P1 规划中”塞满未实现 UI。
- 与代码现状严重不符却不标风险。

---

## 12. 研究先行要求

任何新架构、依赖或外部平台集成都必须先研究。

本 Goal 已明确需要研究的外部方向：

- Eclipse Theia：IDE platform、extensions、Theia AI。
- code-server：浏览器中的 VS Code、自托管、反代和认证。
- OpenVSCode Server：接近 upstream VS Code Web 的 server 形态。
- Monaco Editor：standalone editor 能力与限制。
- xterm.js / node-pty：终端前后端边界。
- WebContainers / Sandpack：浏览器内运行能力；预览增强暂不进入当前阶段。
- Bolt.new：AI full-stack web coding 产品结构。
- OpenHands / Cline / Roo Code / Aider：AI coding agent 工作流。
- VS Code Web / Codespaces / Gitpod / Coder：生产级云 IDE 经验。

研究记录必须包含：

- 来源链接。
- 检查日期。
- 稳定 API/契约。
- 适合 Tracevane 的点。
- 不适合或风险。
- 是否进入 Spike。

---

## 13. 验收标准

### 13.1 Phase 0 验收

Phase 0 完成条件：

- 本蓝图存在并被 README 作为最高入口引用。
- 已删除或降级最明显过期的 Workspace 重设计/原型文档。
- 测试不再要求旧 Season One/说明页方向。
- 关键词扫描确认旧错误概念不再作为当前 Workspace 目标。
- 未修改或提交他人 dirty 文件。
- 有 commit。

### 13.2 Phase 1 验收

- 当前 Workbench 架构审计完成。
- IDE Core 与 Extension Layer 边界图完成。
- 当前代码中应保留/应删除/应迁移清单完成。
- 不做大规模代码改造，除非边界清楚。

### 13.3 Phase 2/3 验收

- Theia Spike 方案完成，含最小运行/适配成本/移动风险/扩展模型。
- code-server/OpenVSCode Spike 方案完成，含反代/认证/项目管理/移动风险/产品主权风险。
- 二者对比形成 ADR。

### 13.4 长期验收

- 桌面端像专业 IDE，而不是文档页。
- 平板端可真实编辑、运行终端、查看 Git/搜索/证据并完成审查。
- 手机端可真实阅读、轻编辑、运行命令、审批 AI diff。
- AI 修改可审查、可回滚、可证据化。
- 未来写作/预览/渲染扩展若启动，必须共享 Workspace 能力，不能另起一套工作区，也不能影响当前 IDE 主线。
- 新扩展不需要改动核心 Workbench 大文件。

---

## 14. Git 和并行开发约束

必须遵守用户明确要求：

> 每次阶段性修改代码后需要 git 提交代码，并且不要提交别人或别人修改的代码，只管理本代理修改的代码。

具体规则：

1. 修改前运行 `git status --short`。
2. 识别 dirty 文件是否为他人改动。
3. 只 edit 本阶段确认文件。
4. `git add` 必须显式列路径，不能 `git add .`。
5. 提交前运行 `git diff --cached --stat` 和 `git diff --cached --name-only`。
6. commit message 使用 Lore Commit Protocol。
7. 如果发现目标文件已有他人 dirty 改动，默认不碰，除非必须且可用 patch 精确处理。
8. 验证失败不能提交“完成”。

---

## 15. 当前立即行动清单

本蓝图创建后，立即执行：

1. 更新 `docs/README.md`：把本蓝图列为第一入口。
2. 删除 clean 的旧 Workspace 方向文档候选：
   - `docs/Workspace重设计总纲.md`
   - `docs/Tracevane前端重设计原型.md`
   - `docs/Workspace前端原型.md`
   - 其他经确认 clean 且被本蓝图替代的旧研究/原型文档。
3. 更新 `tests/system/workspace-top-tier-goal.test.mjs`，从旧 Goal 断言切换到本蓝图与 IDE-first 清理断言。
4. 运行：
   - `node --test tests/system/workspace-top-tier-goal.test.mjs`
   - `git diff --check`
   - 残留关键词 grep。
5. 只提交上述文件。

---

## 16. 停止条件

本阶段遇到以下情况必须停止并报告，而不是冒险删除：

- 文件有他人 dirty 修改，且需要大幅重写。
- 删除会影响运行路径但没有测试保护。
- 后端 API 是否仍被前端使用不确定。
- 清理需要新增依赖。
- 需要改变数据库或用户数据。
- 测试显示当前 Workspace 基线被破坏。

---

## 17. 当前阶段结论

现在不是继续做新 UI 的时刻。当前最重要的是：

1. **统一目标**：IDE-first AI-native Workbench。
2. **清理错误方向**：删除旧原型、旧说明页、旧第一季概念、冲突文档。
3. **保护可用基线**：当前 `/workspace` 仍应回到真实 Workbench，而不是概念展示页。
4. **研究并决策路线**：Theia、code-server/OpenVSCode、自研 Workbench 三者必须经过 Spike 与 ADR。
5. **再重建**：在明确架构选择后，再系统性重建 IDE 工作区主体、Terminal、Git、Search、Files、Editor、Command/Status、前后端契约和桌面/平板/手机 UI/UX，而不是修修补补。
