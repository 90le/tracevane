# Workspace 全球顶级 AI 编程与写作工作区 Goal

> 状态：Active goal task contract  
> 创建：2026-06-29  
> Owner：Tracevane Workspace  
> 范围：产品定位、信息架构、交互、UI/UX、响应式/窗口布局、代码与写作编辑、AI 协作、证据/审批闭环、性能、可访问性。

## 1. Goal 定义

把 Tracevane Workspace 打造成全球一流的 AI 编程与写作工作区：它不是传统 IDE 的复制品，也不是聊天、文件、终端的拼盘，而是一个以本地项目和知识材料为中心，能让用户在同一工作面完成“理解 → 编写 → 运行 → 审查 → 发布”的顶级 AI 工作空间。

核心体验口号：

```text
One workspace for code, prose, agents, evidence, and shipping.
```

## 2. 研究记录（2026-06-29）

遵循项目 Research-First Implementation Gate，本 goal 的第一轮设计依据来自以下稳定外部契约与产品方向：

- VS Code 官方 User Interface：确认现代 IDE 的主心智模型仍是 Activity Bar、Side Bar、Editor Groups、Panel、Status Bar 和 Command Palette；Tracevane 应保留这些可理解结构，但不能恢复“多个窗口重复同一文件”的旧设计。
- VS Code 官方 Accessibility：键盘优先、可发现命令、屏幕阅读器与高对比度是专业工具的硬门槛；Tracevane 的移动端和桌面端都必须让核心动作可键盘/触屏到达。
- Monaco Editor 官方 API：Monaco 是源码编辑底座，适合承担代码高亮、选择、查找替换、decorations；写作和预览能力应作为文档工作台层增强，而不是替换 Monaco 或把预览拆成第二个文件对象。
- Cursor 官方 Agent/Composer 产品方向：顶级 AI 编程体验强调上下文选择、Agent 修改、diff 审查、命令运行和结果回看；Tracevane 应把 AI 上下文与审查证据做成 Workspace 内一等对象。
- OpenAI ChatGPT Canvas/写作与代码协作方向：AI 写作工作区必须支持同文档编辑、局部选择、修改意图、版本审查和最终文本控制权；Tracevane 的 `DocumentWorkbench` 应同时服务 Markdown/HTML/代码/长文写作。
- Apple/Material 响应式与触屏设计准则：手机和平板不是桌面缩小版；需要底部模式导航、sheet、触控目标、safe-area、可恢复布局和无横向溢出。

本轮拒绝的方向：

- 拒绝复制完整 VS Code 视觉与插件生态：成本过高，且会削弱 Tracevane 的 AI/证据/写作差异化。
- 拒绝把 Workspace 做成聊天页面：聊天是协作入口，不是文件/终端/Git/证据事实源。
- 拒绝为“高级感”引入大型新依赖或视觉噱头：当前阶段必须复用 Aurora token、Dockview、Monaco 和现有组件。
- 拒绝把手机端做成能力缩水版：手机端换交互模型，不能删除文件、编辑、终端、审查核心链路。

## 3. 顶级产品原则

1. **文件即主对象**：文件 tab 是代码和写作的最小单位；源码、预览、可视编辑、diff、AI 上下文都是同一文件的模式。
2. **AI 是协作者，不是遮罩层**：AI 动作必须绑定可审查上下文、选区、文件、终端输出或 Git diff。
3. **证据优先**：每个重要动作都能留下文件、diff、命令、日志、截图或验证证据。
4. **响应式一等公民**：桌面是多栏工作台，平板是 drawer + stage，手机是 mode nav + sheet + 全屏审查。
5. **命令优先但可视可达**：高级动作进入 command palette，关键动作在当前上下文有轻量入口。
6. **写作与编程同级**：Markdown/HTML/长文、代码、配置、日志都应有适配的编辑/预览/审查体验。
7. **渐进实现、持续验证**：每阶段必须有文档、代码、测试或 smoke 证据，且提交只包含本阶段实际改动。

## 4. 分阶段任务

### Phase A：北极星与质量门禁（当前阶段）

必须完成：

- 建立本 goal 文档，记录研究、原则、分阶段任务和验收门槛。
- 在 Workspace 空状态中明确顶级工作区定位：代码、写作、AI 上下文、终端/Git/审查闭环。
- 为“复制 AI 上下文 / 选区上下文 / 查找替换 / 文档模式”等当前已有能力提供更可发现的起点。
- 增加结构化测试，防止空状态退回普通“未打开文件”。

验收：

```bash
node --test tests/system/workspace-top-tier-goal.test.mjs
npm run typecheck:web -- --pretty false
```

### Phase B：桌面顶级工作台

必须完成：

- 强化 Activity Rail、Side Panel、Editor Stage、Bottom Panel 的视觉层级与布局密度。
- Editor Stage 增加“AI context rail / writing mode / review mode”的清晰入口。
- Command Palette 可发现所有 Workspace 布局、AI、写作、审查动作。
- Dock 与文件 tab 状态可恢复，避免 terminal/Git/preview 干扰写作和代码焦点。

### Phase C：手机和平板工作区

必须完成：

- 手机底部 mode nav 覆盖 Files/Edit/Search/Git/Terminal/AI Review。
- 侧边域改为 bottom sheet / full-screen sheet，支持半屏、全屏、关闭。
- 文档模式、查找替换、AI 上下文复制在触屏上可达。
- 所有弹窗和菜单满足 safe-area、滚动、触控目标和无横向溢出。

### Phase D：AI 协作与证据闭环

必须完成：

- Workspace context basket：文件、选区、搜索结果、Git diff、终端输出可加入 AI 上下文。
- Agent handoff：从 Workspace 发起任务，返回 plan/diff/commands/verification。
- Evidence basket：保存 diff、命令、日志、截图、验证结果。
- 高风险写入必须走 diff/approval，不允许静默应用。

### Phase E：写作工作区顶级化

必须完成：

- Markdown/HTML/长文的写作模式：专注排版、结构导航、字数/阅读时间、选区 AI 改写上下文。
- 源码、预览、编辑+预览、可视编辑保持同文件 tab 模型。
- 支持大文档切片阅读、当前文档查找替换、跨文件替换审查。

### Phase F：性能、可访问性与发布级验证

必须完成：

- 大目录、大文件、大日志不会造成 DOM/Monaco 卡死。
- 键盘、屏幕阅读器标签、focus ring、reduced motion、主题对比度达标。
- 关键 smoke：desktop/mobile workspace、document modes、terminal reconnect、git diff、file operations、AI context。
- 完成最终 completion audit 后才能关闭 goal。

## 5. 当前非完成项

本 goal 不能在仅完成 Phase A 后关闭。以下能力仍是后续必需：

- 完整 AI context basket。
- Workspace 内一等 Evidence basket。
- Agent handoff 审批闭环。
- 真正多 editor group 拆分，而非“入口预留”。
- 顶级移动端 AI/审查 sheet。
- 写作模式完整信息架构。

## 6. 提交纪律

多人协作约束：每个阶段性代码修改后必须 git commit；提交前只 stage 本阶段实际修改文件，禁止提交已有他人改动、未确认删除、或与本阶段无关文件。提交信息遵守 Lore Commit Protocol。

## 7. 阶段进展记录

### 2026-06-29 / Phase B 小步：文档级 AI 上下文入口

研究补充：VS Code 官方 UI 文档强调文件、Explorer、Editor、Panel、Command Palette 和状态恢复是现代 IDE 的基础结构；VS Code Accessibility 文档强调键盘和读屏辅助；Monaco API 是当前源码选择与编辑底座；OpenAI Canvas 官方说明将写作和代码项目定位为需要编辑与修订的协作空间。基于这些证据，本阶段不新增聊天式大面板，而是在当前文件 tab 的 `DocumentWorkbench` 内增加轻量可执行入口：文档统计、`@document` 上下文复制、`@selection`/`@file` 指引、保存/Git/终端验证证据提示。

完成范围：

- `DocumentWorkbench` 的 AI 工作上下文提示条从说明升级为可复制 `@document` 上下文。
- 显示当前文档行数、词/中文字单位、估算阅读时间，服务写作与代码审查。
- 继续保持单文件 tab 模型：AI 上下文依附当前文件，不创建第二个文档对象或泛聊天面板。

验证：

```bash
node --test tests/system/workspace-document-workbench.test.mjs
npm run typecheck:web -- --pretty false
```
