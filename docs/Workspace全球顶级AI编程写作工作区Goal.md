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

## 1.1 超大目标方向（North Star，2026-06-29 补充）

Tracevane Workspace 的最终形态必须是一个**真实可工作的顶级 IDE + AI 写作工作区**，而不是“看起来高级”的说明页、概念页、海报页或演示页。默认 `/workspace` 打开后，用户应该立刻进入可操作的生产环境：文件树、编辑器、预览、AI 协作、终端、Git、证据、审查与应用都围绕当前任务组织。

最终 North Star：

```text
A real local-first AI IDE for code + writing, with evidence-gated agent changes.
```

必须像顶级产品一样成立的事实：

1. **它首先是 IDE/工作区，不是文档展示页**：默认视图必须有真实文件导航、真实编辑/阅读区域、运行面板、AI/证据审查区和状态栏；大标题、使命宣言、设计说明只能出现在 onboarding/空状态/帮助层，不能占据主工作台。
2. **它必须能工作**：用户能打开文件、编辑文本/代码、预览 Markdown/HTML/媒体、运行终端命令、查看 Git diff、把上下文交给 AI、审查 AI proposal、通过证据门禁应用或拒绝变更。
3. **AI 是内嵌生产流，不是聊天装饰**：AI 面板必须绑定当前文件、选区、终端输出、Git diff 和 evidence；所有 AI 写入都先形成 proposal/diff，不允许静默覆盖文件。
4. **写作与编程同级**：同一工作台要支持代码、Markdown、HTML、长文、配置、日志和研究材料；写作体验不能退化为普通代码框，代码体验也不能被文章预览挤掉。
5. **桌面/平板/手机都是真工作区**：桌面是多栏 IDE；平板是 split + drawer；手机是 focus stack + bottom mode nav + full-screen sheet。三端都必须保留核心链路，而不是把手机降级成只读预览。
6. **证据/审批是产品骨架**：每个高风险动作都能看到输入上下文、拟修改 diff、运行命令、验证结果、回滚说明和人工审批状态。
7. **设计必须服务密集生产**：允许高级视觉，但不允许为视觉牺牲可读性、信息密度、键盘效率、无障碍和长期工作舒适度。

明确禁止的错误方向：

- 禁止把默认 Workspace 做成“重构说明页”“设计愿景页”“巨大标语页”“卡片墙”或“静态产品宣传页”。
- 禁止用漂亮 mock 替代真实文件、编辑器、终端、Git、AI 和 evidence 交互。
- 禁止为了规避旧框架复杂度而交付一个不能编辑、不能运行、不能审查、不能应用变更的壳。
- 禁止把用户正在工作的 IDE 入口变成需要滚动阅读的文档页面。

默认入口验收红线：

- `/workspace` 首屏必须看起来像可工作的 IDE/AI 写作工作区。
- 首屏中“真实工作对象”面积必须大于“说明/宣言/营销文案”面积。
- 至少应同时可见：文件/资源导航、当前文件编辑或阅读区域、AI/证据区、运行/终端区、状态信息。
- 如果需要解释架构方向，可放在小型 onboarding banner、帮助入口或空状态，不得主导主工作台。

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

### Phase A：北极星与质量门禁（已完成，保留回归）

已完成：

- 建立本 goal 文档，记录研究、原则、分阶段任务和验收门槛。
- Workspace 空状态已经明确顶级工作区定位：代码、写作、AI 上下文、终端/Git/审查闭环。
- 为复制 AI 上下文、选区上下文、查找替换、文档模式提供可发现起点。
- 已用结构化测试防止空状态退回普通“未打开文件”。

保留回归：

```bash
node --test tests/system/workspace-top-tier-goal.test.mjs
npm run typecheck:web -- --pretty false
```

### Phase B：桌面顶级工作台（进行中）

已完成并移出待办：

- Dockview/Monaco 工作台底座已建立，文件、编辑器、终端、搜索、Git 进入同一 Workspace 框架。
- 侧边面板和移动面板尺寸进入 `tracevane.workspace.panel-sizes.v1` 持久化。
- PC 侧边面板拖拽已改为无最大宽度、rAF 合并更新、`pointercancel` 清理，避免拖拽卡顿和人为宽度上限。
- 项目导航菜单已移动化为底部 sheet，移动端底部导航按钮具备稳定语义和 open/close title。

当前仍需完成：

- PC 顶栏、Activity Rail、Side Panel、Editor Stage、Bottom Panel 的整体视觉密度和层级继续统一，减少重复标题/重复工具条。
- Editor/Terminal tab 右键与长按菜单补齐：关闭、关闭其他、复制路径、拆分、移动、重命名/终止终端。
- Dock 与文件 tab 状态恢复继续补强，避免切换工作区目录后已打开文件丢失可访问根路径。
- 终端、编辑器、文件/搜索/Git 的自由组合布局继续升级：左右/上下拆分、局部全屏、浏览器真实全屏都要能互相切换。

### Phase C：手机和平板工作区（进行中）

已完成并移出待办：

- 手机底部 mode nav 已覆盖 Files/Search/Git/Edit/Terminal 的核心入口。
- 侧边域已具备 bottom sheet/full-screen sheet、半屏/全屏/关闭和拖拽高度模型。
- 终端和编辑器已有折叠式悬浮控件，避免一直遮挡内容。
- 移动端在终端全屏时可把 Files/Search/Git 面板显示在终端前面，而不是被终端覆盖。

当前仍需完成：

- 手机端终端软键盘避让仍需继续修正：输入法弹出时必须能看到当前输入行，且不能在编辑区顶部制造多余空白。
- 文件/搜索/Git/终端 100% 高度时底部导航仍要稳定可达；全屏面板需要清晰“临时沉浸/返回导航”的交互。
- 触屏长按菜单需要自适应高度、可滚动、贴边避让，避免菜单底部溢出屏幕。
- 手机端资源管理器路径栏、标题、操作入口继续降噪，避免按钮和路径挤压。

### Phase D：AI 协作与证据闭环（进行中）

已完成并移出待办：

- `WorkspaceAiContextBasket` 共享契约已经建立：本地存储、事件、添加/删除/清空/替换、bundle 导出、上限控制。
- `WorkspaceEvidenceBasket` 前端证据契约已经建立：证据来源、类型、refs、订阅、导出和上限控制。
- `WorkspaceContextEvidenceBridge` 已把 AI Context 转为 Evidence，保持稳定去重 id 和 refs 证据链。
- `WorkspaceEvidenceHandoff` 已提供只读 handoff packet，限制记录数量并内置 review guardrail。

当前仍需完成：

- Workspace 级 Context/Evidence 可视面板还没有形成最终交互，需要支持移动端 sheet、PC 侧栏/底栏、选择记录、导出给 AI。
- Agent handoff 仍需从“共享契约”进入 UI 闭环：选择证据 → 生成计划/diff/commands → 用户审查 → 执行/回滚。
- 高风险写入的 diff/approval 仍需和实际 Git/文件修改链路连通，不能只停留在文档或本地存储。

### Phase E：写作工作区顶级化（进行中）

已完成并移出待办：

- 源码、预览、编辑+预览、预览时编辑已归入同一文件 tab 模型，不再把同一文件拆成两个窗口对象。
- Markdown/HTML/长文已经有文档级统计和 `@document` 上下文入口。
- 编辑器悬浮菜单已开始替代独占一行的模式切换工具条。

当前仍需完成：

- Markdown/HTML 的所见即所得编辑质量仍需提升到接近思源/现代写作软件：渲染状态直接编辑文字、块级源码编辑、Mermaid/表格/媒体块稳定呈现。
- 图片/视频/HTML/Markdown/代码等预览仍需做成统一、可缩放、可拖拽、可查看信息、无溢出的文件查看器体验。
- 大文档切片阅读、结构导航、当前文档/跨文件查找替换审查还需补强。

### Phase F：性能、可访问性与发布级验证（进行中）

已完成并移出待办：

- 侧边面板拖拽、移动面板拖拽、部分文件列表性能路径已有测试锁定。
- web typecheck、Workspace 系统测试、web build、diff check 已作为每轮交付验证门槛。

当前仍需完成：

- 大目录、大文件、大日志的端到端压力验证还不完整。
- 键盘、屏幕阅读器标签、focus ring、reduced motion、主题对比度需要做系统性审计。
- 关键 smoke 需要覆盖 desktop/mobile workspace、document modes、terminal reconnect、git diff、file operations、AI context/evidence/handoff。
- 完成最终 completion audit 后才能关闭 goal。

## 5. 当前剩余 Goal 待办（已移除已完成项）

本 Goal 当前不再把“创建 goal 文档、空状态北极星、AI Context Basket 基础契约、Evidence Basket 基础契约、Context→Evidence 桥接、Evidence Handoff Packet、侧边面板无上限高性能拖拽、移动面板置于终端前面”等已完成事项列为待办。当前剩余只跟踪以下可验证缺口：

0. **纠正默认入口方向**：`/workspace` 必须从概念说明页回到真实 IDE/AI 写作工作区形态；当前先退回既有 Workbench，后续只能在经过技术路线评审后重建，不再沿用概念说明页式重构。

1. **Workspace 框架美学与布局**：PC/手机/平板统一视觉语言，减少重复标题、重复工具条和堆叠按钮；窗口模块可上下/左右组合、局部全屏、浏览器真实全屏。
2. **编辑器与终端标签管理**：补齐右键/长按菜单、关闭/关闭其他/拆分/移动/复制路径/终止终端/重命名等操作；终端结束会话可彻底关闭删除。
3. **移动端触屏与软键盘**：终端和编辑器输入时必须避让软键盘；触摸滚动、长按菜单、底部导航、100% 高度面板必须稳定。
4. **工作区目录与已打开文件稳定性**：切换默认目录不能破坏已打开文件的 root/path 访问，资源管理器可自由切换目录并保持默认工作区语义清晰。
5. **Git 管理工具**：从基础状态展示升级为可用的变更、历史、分支、提交、推送/同步、diff 审查工具，并适配手机端。
6. **Context/Evidence/Agent UI 闭环**：把已完成的共享契约做成 Workspace 内可见、可选择、可审查、可交给 AI 的产品功能。
7. **写作与预览质量**：Markdown/HTML/媒体/代码预览编辑达到现代写作软件和 IDE 体验，包含块编辑、图表、媒体缩放拖动、查找替换和无溢出响应式。
8. **发布级验证**：补齐性能、可访问性、回归 smoke 和端到端验证后，才允许关闭本 Goal。

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

### 2026-06-29 / Phase D 草案小步：本地 AI Context Basket 基础层

研究补充：VS Code 的 Explorer/Editor/Panel/Timeline 模型说明专业工作区需要可恢复的工作对象，而不是一次性剪贴板动作；VS Code Accessibility 要求关键动作可键盘和读屏到达；Monaco 继续作为源码选择与编辑底座；OpenAI Canvas 的写作/代码协作方向要求用户保留文档控制权。基于这些约束，本阶段先在 `DocumentWorkbench` 内把 `@document` 推进为本地 context basket 项：写入 localStorage、广播更新事件、去重并限制最近 24 项，为后续 Workspace 级 Context Basket UI、Agent handoff 和 Evidence basket 预留明确契约。

完成范围：

- 增加“加入上下文篮”动作，保存当前文档的 `@document` 上下文、模式、可编辑性和统计信息。
- 使用 `tracevane.workspace.ai-context-basket.v1` 作为本地草案存储 key，后续可迁移到后端事实源。
- 广播 `tracevane:workspace-ai-context-basket-updated`，避免当前阶段改动已有多人协作中的 `WorkspaceWorkbench.tsx`。

验证：

```bash
node --test tests/system/workspace-document-workbench.test.mjs tests/system/workspace-ai-context-basket.test.mjs
npm run typecheck:web -- --pretty false
```

### 2026-06-29 / Phase D 小步：AI Context Basket 共享契约

研究补充：顶级工作区需要把“上下文”从单个按钮提升为可复用对象契约，类似 VS Code 将文件、编辑器、面板、Timeline 等作为稳定工作对象，而 Monaco 继续只负责编辑/选择底座。OpenAI Canvas 的协作模型也要求上下文可被后续编辑和审查复用，而不是一次性复制后丢失。因此本阶段将 context basket 存储、事件、`@document` 格式化和 bundle 导出从 `DocumentWorkbench` 抽到共享模块，避免未来 Workspace 级 UI、Agent handoff、Evidence basket 各自复制一套规则。

完成范围：

- 新增 `workspace/shared/WorkspaceAiContextBasket.ts`，导出 storage key、事件名、limit、item 类型、读写、添加文档、导出 bundle、类型守卫。
- `DocumentWorkbench` 只负责 UI 调用共享契约，不再持有本地 basket 存储细节。
- 保持本阶段不改当前有他人改动的 `WorkspaceWorkbench.tsx`，避免多人协作冲突。

验证：

```bash
node --test tests/system/workspace-ai-context-basket.test.mjs tests/system/workspace-document-workbench.test.mjs
npm run typecheck:web -- --pretty false
```

### 2026-06-29 / Phase D 小步：AI Context Basket 管理 API

本阶段继续沿用已验证的外部设计依据：顶级工作区需要可恢复、可订阅、可管理的工作对象，而不是单点 UI 状态。Context Basket 共享契约新增订阅、删除单项、清空、整体替换与 bundle 导出能力，使后续 Workspace 级上下文面板、移动端上下文 sheet、Agent handoff 和 Evidence 审查可以复用同一套前端契约。

完成范围：

- `WorkspaceAiContextBasket.ts` 新增 `WorkspaceAiContextBasketAction`、subscriber 类型和统一 update detail。
- 新增 `subscribeWorkspaceAiContextBasket`、`removeWorkspaceAiContextBasketItem`、`clearWorkspaceAiContextBasket`、`replaceWorkspaceAiContextBasket`。
- `writeWorkspaceAiContextBasket` 返回裁剪后的 items，保证所有写入遵守 24 项上限。
- 结构测试覆盖新增管理 API 与事件 action。

验证：

```bash
node --test tests/system/workspace-ai-context-basket.test.mjs
npm run typecheck:web -- --pretty false
```

### 2026-06-29 / Phase D 小步：Evidence Basket 前端契约

为推进“证据/审批闭环”，本阶段新增 `WorkspaceEvidenceBasket.ts` 共享契约。它不替代后端事实源，而是先定义前端可复用的证据对象：来源、类型、标题、摘要、引用、时间戳，以及 append/remove/clear/replace/subscribe/export 基础能力。这样后续 Git Diff、终端命令、验证结果、AI 上下文、Agent 输出都可以先落到同一证据篮模型，再迁移为 workspace-facing 后端 evidence 服务。

完成范围：

- 新增 Evidence source/kind/action 类型和 `WorkspaceEvidenceRecord`。
- 新增本地草案 storage key `tracevane.workspace.evidence-basket.v1` 与更新事件 `tracevane:workspace-evidence-basket-updated`。
- 提供 append/remove/clear/replace/read/write/subscribe/export/type guard。
- 结构测试覆盖证据源、动作、事件、导出和 80 项上限。

验证：

```bash
node --test tests/system/workspace-evidence-basket.test.mjs
```

### 2026-06-29 / Phase D 小步：AI Context 转 Evidence 桥接契约

研究补充：VS Code UX Guidelines 将 Activity Bar、Sidebar、Editor、Panel、Status Bar 解释为可组合容器与工作对象，说明顶级工作区的 AI 上下文不应停留在单按钮状态；Accessibility 文档强调键盘导航、读屏和状态可达，要求证据对象后续能被统一面板/快捷操作访问；OpenAI Canvas 强调写作与代码项目中的上下文理解、用户控制、inline feedback 和可追踪代码变更。因此本阶段把 `AI Context Basket` 与 `Evidence Basket` 通过共享桥接模块连起来：上下文可以被提升为可审查 evidence，但仍不自动执行代码或覆盖用户文档。

来源：

- https://code.visualstudio.com/api/ux-guidelines/overview
- https://code.visualstudio.com/docs/configure/accessibility/accessibility
- https://openai.com/index/introducing-canvas/

完成范围：

- 新增 `WorkspaceContextEvidenceBridge.ts`，把 `WorkspaceAiContextBasketItem` 转换为 `WorkspaceEvidenceInput`。
- 使用稳定去重 id `ai-context:${contextId}`，确保同一上下文反复加入 evidence 时更新而不是无限复制。
- refs 保留 path、mode、editable、textLike、stats、context 和 addedAt，为后续审查面板、Agent handoff、导出 bundle 提供证据链。
- 提供单项与批量 append API，暂不修改多人协作中的 Workbench UI 文件。

类型边界补正：`WorkspaceAiContextEvidenceRef` 明确继承 `Record<string, unknown>`，保证桥接 refs 与 `WorkspaceEvidenceInput` 的共享证据契约兼容，避免后续 UI/Agent 调用点通过类型断言绕过 evidence 边界。

验证：

```bash
node --test tests/system/workspace-context-evidence-bridge.test.mjs tests/system/workspace-ai-context-basket.test.mjs tests/system/workspace-evidence-basket.test.mjs
npx tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --allowSyntheticDefaultImports apps/web/src/features/workspace/shared/WorkspaceContextEvidenceBridge.ts
```

### 2026-06-29 / Phase D 小步：Evidence Handoff Packet 契约

研究补充：VS Code UX Guidelines 的工作区容器模型强调信息需要在明确区域和工作对象之间流转，而不是散落在即时 UI 状态中；Accessibility 文档要求关键内容可被键盘和读屏访问；OpenAI Canvas 的写作/代码协作模式强调用户可控、可审查的上下文。因此 Evidence Basket 需要一个面向 AI/审查的 read-only handoff packet：限制记录数量、保留 schemaVersion、objective、guardrail 和可读 bundle，使后续 Agent、写作助手或审查面板都能引用同一证据包。

完成范围：

- 新增 `WorkspaceEvidenceHandoff.ts`，定义 handoff schema version 与默认 12 条 evidence 上限。
- `buildWorkspaceEvidenceHandoffPacket` 将 evidence records 转为只读 packet，并内置“引用证据 id、风险编辑前请求 review”的 guardrail。
- `formatWorkspaceEvidenceHandoffForAi` 输出可直接给 AI/审查面板使用的 markdown handoff。
- 本阶段不改 Workbench UI，仅沉淀共享契约，降低多人协作冲突。

验证：

```bash
node --test tests/system/workspace-evidence-handoff.test.mjs tests/system/workspace-evidence-basket.test.mjs
npx tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --allowSyntheticDefaultImports apps/web/src/features/workspace/shared/WorkspaceEvidenceHandoff.ts
```

### 2026-06-29 / Phase E 小步：Evidence Review Panel 组件雏形

研究补充：VS Code UX Guidelines 将 Panel、Sidebar、Status Bar 等定义为明确的工作区信息容器，避免把关键状态散落在不可恢复的按钮回调里；Sidebars 指南要求 related views grouped together 且命名清楚；Accessibility 文档强调键盘导航、读屏、可见状态和高对比支持；OpenAI Canvas 的协作模型强调用户控制、上下文理解、inline critique 与可回退版本。因此本阶段把 Evidence/Handoff 契约落成一个可复用的前端审查面板组件，先提供低冲突的 shared UI 基础，而不是直接修改多人协作中的 Workbench shell。

来源：

- https://code.visualstudio.com/api/ux-guidelines/overview
- https://code.visualstudio.com/api/ux-guidelines/sidebars
- https://code.visualstudio.com/docs/configure/accessibility/accessibility
- https://openai.com/index/introducing-canvas/

完成范围：

- 新增 `WorkspaceEvidenceReviewPanel.tsx`，将 evidence records 渲染为可扫描、可复制 handoff 的 AI review cockpit。
- 面板内置 responsive layout：桌面双栏 cockpit，窄屏单栏；records 区域在 `sm` 以上切双列。
- 提供可访问 section label、按钮 aria-label、空态和 guardrail 区块，为读屏与键盘操作保留明确语义。
- 更新 workspace shared barrel export，后续 Workbench 右栏、移动 sheet、Agent review drawer 可直接复用。

验证：

```bash
node --test tests/system/workspace-evidence-review-panel.test.mjs tests/system/workspace-evidence-handoff.test.mjs tests/system/workspace-evidence-basket.test.mjs
(cd apps/web && npx tsc --noEmit --pretty false -p tsconfig.workspace-evidence-review-panel.tmp.json)
```

### 2026-06-29 / Phase E 小步：Live Evidence Review Surface

研究补充：VS Code Sidebars/Views 指南要求相关视图聚合且命名明确，避免把任务上下文散落在多个不可发现入口；Accessibility 文档强调键盘、读屏、可见状态和可恢复操作；OpenAI Canvas 的产品方向强调协作界面需要保留用户控制、上下文理解与可审查输出。因此本阶段把静态 Evidence Review Panel 包成 live surface：它直接订阅本地 Evidence Basket，显示实时记录数，支持 refresh、clear 和 copy handoff 状态反馈，为后续接入 Workspace 右栏或移动 sheet 准备稳定入口。

完成范围：

- 新增 `WorkspaceEvidenceReviewSurface.tsx`，订阅 `subscribeWorkspaceEvidenceBasket` 并读取/刷新/清空本地 evidence records。
- `WorkspaceEvidenceReviewPanel` 增加可选 clear action，空 evidence 时自动 disabled，避免误清空。
- Surface 显示 live record count 与 copy 时间反馈，保留 `onRecordsChange`/`onCopyHandoff` 扩展点。
- 更新 shared barrel export，继续避免修改当前多人协作中的 AppShell、Workbench、chat、file-manager 文件。

验证：

```bash
node --test tests/system/workspace-evidence-review-surface.test.mjs tests/system/workspace-evidence-review-panel.test.mjs tests/system/workspace-evidence-handoff.test.mjs tests/system/workspace-evidence-basket.test.mjs
(cd apps/web && npx tsc --noEmit --pretty false -p tsconfig.workspace-evidence-review-surface.tmp.json)
```
