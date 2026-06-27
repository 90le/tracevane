# Tracevane Workspace 超前 Web IDE 目标与设计总纲

更新日期：2026-06-27

## 1. 目标声明

Workspace 不是复刻 VS Code、历史 Vue 版本或任意截图，也不把旧 Vue 版本当成最终设计模板。旧版只作为“历史能力证据”和“可借鉴的交互样本”；新 Workspace 必须以 Tracevane 当前主题、现代 Web IDE/AI IDE 最佳实践、响应式体验和长期可扩展架构为准，重新设计成 Tracevane 自己的 **AI-native Web Workspace**：文件、编辑器、预览、终端、Git、任务与模型网关在同一个工作台中形成闭环。目标是做到：

- 桌面端具备专业 IDE 的可拆分、可拖拽、可恢复布局能力。
- 移动端借鉴历史 Vue 版本“底部导航 + 浮层工具面板”的方向，但不照搬旧版布局；最终以更清爽、更少重复、更符合 Tracevane 的移动工作台为准。
- 文件/终端/Git/AI 上下文互相可投递：文件拖到终端变路径，选中文件/终端输出/Git diff 可进入 AI 上下文。
- 编辑、预览、边写边预览、视觉编辑都属于同一个文件标签页，而不是额外开两个无关窗口。
- Markdown/HTML/媒体预览要形成 Tracevane 自己的阅读与写作质感，不只做“能显示”。
- 复用成熟库：Monaco、Dockview、xterm、文件图标库、Markdown 插件生态等；只有产品差异化和安全边界才自研。

## 2. 结束边界（防止目标无限扩展）

本 goal 在完成以下内容后结束，不把所有未来高级 IDE 能力无限做完：

1. 完成研究记录：历史 Vue 版本、当前 React Workspace、外部 Web IDE/AI IDE/依赖方案。
2. 完成 P0/P1 基础代码：响应式工作台壳、移动端底部导航/浮层侧栏、Workspace 主目录语义、终端默认 cwd、文件拖入终端、上传完成自动收尾、终端重复输入风险修复。
3. 完成基础验收：`tests/system/web-ide-shell.test.mjs`、Web typecheck、Web build、`git diff --check` 通过。
4. 将 P2+ 能力以 backlog 写清楚，包括 Git 高级操作、AI 网关上下文、视觉编辑、Markdown 主题、移动端 Monaco 风险替代方案等。

完成上述内容后，本 goal 可以关闭；P2+ 进入后续独立 goal。

## 3. 历史 Vue 最后版本分析

本次从 Git 历史中提取了删除前的 Vue/旧前端工作台：

- `apps/web-vue/src/app/WorkspaceIdePage.tsx`
- `apps/web-vue/src/app/AuroraShell.tsx`
- `apps/web-vue/src/styles/app.css`

### 值得继承的产品体验

1. **工作台完整感强**：旧版把文件、Git、终端、证据、AI 作为同一 IDE 的不同 pane，而不是分散页面；新版只继承这个“能力聚合”思路，不继承旧版具体排版。
2. **移动端表达更明确**：小屏下旧版从左 rail 转为横向/底部导航，文件、Git、终端以可滚动 panel 展示，避免顶部按钮堆叠。
3. **Markdown 视觉更有产品感**：旧版预览不是纯白文档，而是有阅读卡片、引用块、代码区域、终端区的混合视觉。
4. **Git 面板信息密度合理**：分支、变更、历史集中在一个 pane，适合后续做轻量 Git Modal / Sheet。
5. **AI 编辑曾有明确方向**：旧版已表达“AI 编辑待确认流”：模型建议 -> 用户确认 apply -> 备份/rollback。

### 不应直接复制的部分

1. 旧版代码架构较集中，长期扩展会变成大组件。
2. 旧版很多能力偏“展示型”，真实终端、文件上传、索引、Monaco 编辑和后端协作需要现在的 React 架构承接。
3. 旧版并不具备当前目标中的 Dockview 分屏、真实上传断点续传、内容索引、文件预览注册表等能力。

结论：旧版不是设计答案，只是提醒我们“移动端工作台、Markdown 阅读质感、Git/终端/AI 聚合”曾经做得更像产品。新版应重新设计信息架构、布局密度、控件归纳、响应式行为和 AI 工作流；只继承有效原则，不继承旧版布局。

## 4. 外部方案研究（Research-first）

### VS Code Web / Custom Editor

参考：

- https://code.visualstudio.com/docs/remote/vscode-web
- https://code.visualstudio.com/api/extension-guides/custom-editors

- VS Code for the Web 是零安装浏览器编辑体验，支持浏览/轻量编辑、搜索、语法高亮、扩展与远程仓库工作流。
- VS Code Custom Editor API 明确把 Markdown/WYSIWYG、CSV/JSON 可视化、资产预览、二进制/文本自定义编辑纳入“同一资源的自定义编辑器”思路。

对 Tracevane 的启发：文件标签页内部应有源码、预览、视觉编辑等 mode，而不是把预览做成另一个无关 pane。

### Monaco Editor

参考：

- https://microsoft.github.io/monaco-editor/

- Monaco 是 VS Code 的浏览器编辑器核心，适合桌面 Web IDE 的源码编辑、语法高亮、查找替换等。
- 官方说明 Monaco 不支持移动浏览器/移动 Web app 框架；因此移动端必须设计可降级策略，不能假设 Monaco 在手机上永远稳定。

对 Tracevane 的启发：桌面继续用 Monaco；移动端 P2+ 需要轻量查看/编辑降级层，或用 CodeMirror/textarea fallback 承担基本编辑。

### Dockview

参考：

- https://dockview.dev/docs/overview/introduction/
- https://dockview.dev/docs/core/overview/

- Dockview 提供 tabs、groups、drag & drop、floating panels、popout windows 等 docking layout 能力，且已有 React 集成。

对 Tracevane 的启发：桌面工作区继续以 Dockview 做 split/dock 核心；移动端不要硬塞 Dockview 操作，而是把 dock panel 投影成 bottom nav + sheet。

### Eclipse Theia / OpenVSCode 类平台

参考：

- https://projects.eclipse.org/projects/ecd.theia
- https://theia-ide.org/theia-platform/

- Theia 定位为可定制、多语言、云端/桌面 IDE 框架，证明“Web IDE = workbench + service boundary + extensibility”的产品结构。

对 Tracevane 的启发：Tracevane 不应直接集成整个 Theia，避免臃肿；但应借鉴其“工作台服务化边界”：文件、终端、Git、AI、预览、任务各自有清晰 adapter。

### StackBlitz WebContainers

参考：

- https://webcontainers.io/guides/introduction
- https://developer.stackblitz.com/platform/api/webcontainer-api

- WebContainers 是浏览器内执行 Node.js 应用和操作系统命令的 runtime，适合交互式编码、教程、下一代文档和 IDE。
- WebContainers 依赖 Service Worker、WASM、域名/存储等浏览器能力，存在浏览器配置和商用/集成边界。

对 Tracevane 的启发：当前 Tracevane 已有本地后端终端和文件服务，短期不引入 WebContainers；长期可以作为“隔离沙箱预览/教程/临时代码运行”的可选 runtime，而不是替换现有后端。

### Continue / AI IDE 模式

参考：

- https://docs.continue.dev/ide-extensions/agent/how-it-works
- https://docs.continue.dev/customize/deep-dives/mcp

- Continue 的 Agent mode 把 Chat/Plan/Agent 放在同一输入界面，支持 `@` context、工具调用、MCP server，并把工具结果回填为上下文。

对 Tracevane 的启发：AI 面板不要只做聊天框，要能接收文件、选区、终端输出、Git diff、运行结果与模型网关能力；工具调用必须有权限、预览 diff、确认 apply、rollback。

## 5. 产品设计理念

### 5.1 “打开一个文件夹”优先

Workspace 的默认目录不是四个固定 root 的切换器，而是类似 IDE 打开文件夹：

- 用户可在文件树右键“设为工作区主目录”。
- 终端默认 cwd 跟随该工作区主目录。
- 文件树、搜索、Git、AI context 默认围绕该主目录工作。
- 仍保留系统 root 能力，但 UI 不把 root selector 作为主要心智。

### 5.2 单文件多模式

一个文件标签页内部提供：

- 源码 / 编辑：Monaco。
- 预览：Markdown、HTML、JSON、CSV、图片、视频、PDF、压缩包、二进制信息等。
- 边写边预览：同一标签页分屏。
- 预览时编辑/视觉编辑：Markdown/HTML 的块级可编辑体验，未来逐步增强。

### 5.3 面向移动端的真实工作台（不照搬旧版）

移动端不是缩小版桌面：

- 底部导航承载 文件 / 搜索 / Git / 编辑 / 终端，但按钮数量、命名、默认显隐必须以后续真实任务频率和屏幕宽度校正，不能机械复制旧版。
- 文件、搜索、Git 以全屏/半屏 sheet 打开。
- 顶部只保留当前工作区、文件名、少量全局操作。
- 工具功能进入上下文菜单或 `...`，避免无限按钮。
- 所有容器必须 `min-h-0`、可滚动，不允许出现无法滚动、10px 高编辑器、横向溢出。

### 5.4 AI-native Context Loop

AI 能力不是单独页面，而是工作台能力：

- 文件：选中文件/目录/搜索结果发送给 AI。
- 编辑器：选区解释、重构、生成 patch。
- 终端：输出错误进入 AI 诊断。
- Git：diff、变更文件、commit history 进入 AI 总结。
- 模型网关：复用 Tracevane Gateway 的 provider/model/profile/tool policy。
- 安全：AI 改文件必须走 preview/apply/backup/rollback，不直接无确认写入。

## 6. 阶段路线

### P0：当前可用性止血

- 修复终端输入/拖放重复发送风险。
- 修复 Workspace 主目录语义：右键设置后文件树 root 和终端 cwd 真实跟随。
- 修复侧栏滚动与根目录切换状态问题。
- 保持上传完成后任务条自动收尾。

### P1：响应式工作台壳

- 桌面：ActivityBar + SidePanel + Dockview + StatusBar。
- 移动：TopBar + Dockview 主画布 + Bottom Nav + Side Sheet。
- 文件/搜索/Git 不再在移动端堆到顶部。
- 记录布局与 session 持久化。

### P2：Markdown/预览/媒体体验

- Markdown 主题借鉴旧 Vue 的文档卡片气质，补齐 Mermaid、表格、代码块、图片、视频、附件链接。
- 图片预览支持滚轮缩放、拖拽平移、居中重置。
- HTML 支持源码、预览、安全沙箱、后续视觉编辑。

### P3：Git 与终端工作流

- Git pane 支持分支、变更、历史、diff、commit 草稿。
- 终端支持多 session、cwd badge、拖入路径/图片、命令片段插入、错误上下文发送 AI。

### P4：AI 网关集成

- AI 面板接入 Gateway profiles、models、tool policy。
- 支持 @file、@terminal、@git、@search、@docs context。
- 支持 patch preview、apply、rollback、evidence log。

### P5：扩展与高级布局

- Dockview layout presets、命令面板、键盘快捷键映射。
- 插件式 document viewers/editors。
- 内容索引管理器独立域与 Workspace 搜索联动。

## 7. 验收矩阵

| 类别       | P0/P1 验收                                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| 桌面布局   | ActivityBar/SidePanel/Dockview/StatusBar 正常；Dockview 可恢复；Editor 外层不重复标题。 |
| 移动布局   | 768px 以下出现底部导航；SidePanel 变浮层；不出现顶部按钮堆积。                          |
| 文件主目录 | 右键设置主目录后，树从该目录作为 root 展示；状态 chip 显示；终端新 session cwd 跟随。   |
| 终端拖放   | 文件树 row 可拖动，终端 drop 后插入 shell-quoted 绝对路径，不重复发送。                 |
| 上传       | 上传成功后刷新文件列表并自动清理任务 strip；失败保留任务以便恢复。                      |
| 测试       | system test、typecheck、build、diff check 通过。                                        |

## 8. 设计校准原则

1. 不以“像旧版”为验收标准；验收标准是：更少重复、更少堆叠、更强响应式、更清晰任务路径、更稳定工程边界。
2. 旧版功能若与现代 Tracevane 架构冲突，优先选择当前架构的正确解法。
3. 视觉上延续 Tracevane 的浅/深色主题、文件/终端/AI 工作台气质，不复刻旧版色彩和卡片比例。
4. 布局上优先保证：主编辑区最大化、工具按需浮层化、菜单上下文归纳、移动端无横向溢出。
5. 每个阶段都要能删除不必要的 UI，而不是为了“功能丰富”继续堆按钮。

## 9. 明确不做/暂缓

- 不直接接入完整 VS Code/Theia，以免项目重量和服务边界失控。
- 不在本 goal 内实现完整 AI Agent 写代码闭环；只做接口边界与 P0/P1 基础承载。
- 不在本 goal 内完成所有 Markdown WYSIWYG 能力；P2 独立推进。
- 不把移动端 Monaco 视为稳定基础；后续必须评估 fallback。

## 10. P0 止血落地补充（2026-06-27）

### 10.1 默认工作区目录语义

默认工作区目录不是不可离开的根目录，而是 Workspace 打开后的初始焦点和新终端默认 cwd：

- 启动或切换 root 时，只应用一次默认目录。
- 用户通过地址栏、文件树、面包屑或右键临时切换目录后，不再被副作用自动拉回默认目录。
- “设为工作区主目录”是显式动作；触发后才更新默认目录并跳转。
- FileTree 的 `basePath` 保持 root 级，避免把偏好误建模为硬隔离边界。

### 10.2 最小可管理上下文菜单

P0 先让核心对象可被管理，后续再统一进入命令面板/快捷键体系：

- 文件标签：关闭、关闭其它、关闭右侧、复制路径。
- 终端会话：新建终端、结束会话、删除记录、复制 cwd。
- Git 变更：打开 diff、暂存/取消暂存、复制路径、AI 解释 Diff 预留入口。

### 10.3 P0 与终极形态的边界

P0 的目标是消除当前阻塞体验，不代表 Workspace Ultimate 目标完成：

- 不在 P0 做完整自由浮窗/多组编辑器。
- 不在 P0 做完整 Git history/branch/commit assistant。
- 不在 P0 引入 ProseMirror/Tiptap；富文本与知识写作进入 P3/P5 评估。
- AI 入口只绑定明确上下文，不产生未经确认的写操作。

### 10.4 移动端非弹窗化投影

移动端 Workspace 不再把资源管理器、搜索、Git 做成覆盖整个编辑器的 fixed 弹窗。第一版 P0 壳层约束如下：

- 底部导航只负责切换功能域：文件、搜索、Git、编辑、终端。
- 文件/搜索/Git 打开时，进入主画布下方的内联 bottom drawer，占用受控高度，而不是浮在页面上的 modal。
- 关闭 drawer 后，Dockview 主编辑区域恢复完整高度。
- 桌面端继续使用左侧 ActivityBar + SidePanel，移动端只是同一功能的响应式投影，不复制另一套业务实现。
- 后续 P2 再把 drawer 高度、半屏/全屏展开、拖拽调整高度和持久化做成正式布局能力。

### 10.5 命令面板与快捷键底座

P2 起步阶段新增 Workspace 命令面板，设计约束：

- 入口：顶部“命令”按钮与 Ctrl/⌘+Shift+P。
- 首批命令：打开资源管理器、搜索、Git、编辑器、终端、收起侧边面板、重置布局、准备 AI 上下文入口。
- 快捷键：Alt+1/2/3 打开文件/搜索/Git；Alt+E 聚焦编辑器；Alt+T 聚焦终端。
- 命令面板只承载安全导航/布局动作；删除、写文件、提交、应用 AI patch 等危险动作后续必须有预览/确认/回滚。
- 技术选择：复用现有 `cmdk` 与 `design/ui/command.tsx`，不新增依赖。

### 10.6 Command Registry 事实源

命令面板不应长期持有命令定义。Workspace 命令底座拆为：

- `workspaceCommands.tsx`：命令 id、分组、文案、快捷键、图标和执行函数的事实源。
- `WorkspaceCommandPalette.tsx`：只负责搜索、分组展示和触发命令。
- 后续右键菜单、快捷键配置、AI action palette 都应逐步复用同一 command registry 或同构 action contract。
- 危险命令必须显式标记并接入 preview/apply/rollback，不能因进入 registry 就绕过确认。

### 10.7 Editor Tab Action Registry

编辑器标签页菜单进入 action registry 形态：

- `editorTabActions.tsx` 定义标签动作事实源。
- `EditorTabs.tsx` 只渲染 action，不再硬编码关闭其它/关闭右侧/复制路径按钮。
- 当前 action：`editor.tab.close`、`editor.tab.closeOthers`、`editor.tab.closeRight`、`editor.tab.copyPath`。
- 后续动作扩展：移动到左/右编辑组、拆分到新组、固定标签、复制相对路径、发送文件到 AI context。
- Dirty guard 仍由 `WorkspaceEditorStage` 持有，action 不绕过未保存确认。

### 10.8 Terminal Session Action Registry

终端 session 菜单进入 action registry 形态：

- `terminalSessionActions.tsx` 定义 session 操作事实源。
- `WorkspaceTerminal.tsx` 持有状态和 mutation，菜单只消费 actions。
- 当前 action：`terminal.session.new`、`terminal.session.end`、`terminal.session.delete`、`terminal.session.copyCwd`。
- 后续扩展：重命名 session、清屏、复制输出、拆分终端、插入路径、发送错误输出到 AI 诊断。
- 不可恢复 session 仍不可 attach，action 不绕过后端终端契约。

### 10.9 Git Change Action Registry

Git 变更菜单进入 action registry 形态：

- `gitChangeActions.tsx` 定义变更级操作事实源。
- `WorkspaceGitPanel.tsx` 仍持有 Git query/mutation、toast、AI 入口与剪贴板执行边界，菜单只消费 actions。
- 当前 action：`git.change.openDiff`、`git.change.stage`、`git.change.unstage`、`git.change.copyPath`、`git.change.explain`。
- 后续扩展：打开 side-by-side diff、丢弃变更、查看文件历史、生成提交信息、AI 解释/总结/生成 patch、批量 stage/unstage。
- Git action 不得绕过后端 Git contract；危险动作必须有确认、预览或回滚能力。

### 10.10 Git Panel Commands 接入命令面板

Git 面板开始作为 Workspace command extension provider：

- `gitPanelCommands.tsx` 定义面板级 Git 命令事实源。
- `WorkspaceGitPanel` 负责把当前分支、暂存/未暂存变更、mutation 和 AI 预留入口注入 commands。
- `WorkspaceWorkbench` 收集 Git commands，并通过 `WorkspaceCommandPalette` 的 `extensionCommands` 合并进全局命令面板。
- 当前命令：`git.panel.refresh`、`git.panel.stageAll`、`git.panel.unstageAll`、`git.panel.copyBranch`、`git.panel.explainStatus`。
- 后续可把终端 session actions、编辑 tab actions、文件 actions 以同样方式接入 command registry，再统一快捷键、审计、AI context 和权限确认。

### 10.11 Terminal Panel Commands 接入命令面板

终端面板开始作为 Workspace command extension provider：

- `terminalPanelCommands.tsx` 定义终端面板级命令事实源。
- `WorkspaceTerminal` 持有 session roster、active session、cwd、mutation 和 AI 诊断预留入口，并注册 commands。
- `WorkspaceWorkbench` 同时收集 Git commands 与 Terminal commands，统一传给 `WorkspaceCommandPalette`。
- 当前命令：`terminal.panel.new`、`terminal.panel.endActive`、`terminal.panel.deleteActive`、`terminal.panel.copyCwd`、`terminal.panel.ai.diagnose`。
- 后续扩展：重命名 session、拆分终端、清屏、复制输出、插入文件路径、把错误输出发送到 AI 诊断、命令执行审计。

### 10.12 Editor Tab Commands 接入命令面板

编辑器标签开始作为 Workspace command extension provider：

- `editorTabCommands.tsx` 定义编辑器标签级命令事实源。
- `WorkspaceEditorStage` 持有 open tabs、active tab、dirty/saving 状态、保存 mutation 和 dirty close guard，并注册 commands。
- `WorkspaceWorkbench` 同时收集 Git、Terminal、Editor commands，统一传给 `WorkspaceCommandPalette`。
- 当前命令：`editor.tab.saveActive`、`editor.tab.closeActive`、`editor.tab.closeOthers`、`editor.tab.closeRight`、`editor.tab.copyPath`。
- 后续扩展：移动到左/右编辑组、拆分到新组、固定标签、复制相对路径、发送当前文件/选区到 AI context。

### 10.13 Command Shortcut 统一执行层

Workspace 快捷键开始从命令事实源派生：

- `workspaceCommandShortcuts.ts` 负责解析 `WorkspaceCommand.shortcut` 并执行匹配命令。
- `WorkspaceWorkbench` 仍保留 `Ctrl/⌘+Shift+P` 打开命令面板，但 Alt 1/2/3/E/T 等导航快捷键改为通过 command registry 执行。
- `WorkspaceCommandPalette` 只展示传入的 `commands`，不再自行创建 registry；命令面板和快捷键共享同一 action list。
- 禁用命令不会被快捷键执行。
- 后续可把用户自定义 keymap、冲突检测、平台化显示（⌘/Ctrl）和审计记录接到同一层。

### 10.14 Keymap 覆盖与冲突检测

Workspace 快捷键进入可配置 keymap 底座阶段：

- `workspaceKeymap.ts` 提供 `WorkspaceCommand.id -> shortcut` 覆盖模型、localStorage 持久化、规范化和冲突检测。
- `WorkspaceWorkbench` 先创建默认 commands，再应用 keymap overrides，最终把有效 commands 同时交给快捷键执行层和命令面板。
- `WorkspaceCommandPalette` 显示快捷键冲突提示，避免用户在后续可视化配置快捷键后出现“按键触发不确定”的高级 IDE 常见问题。
- 新增 `workspace.keymap.reset` 命令，为后续快捷键设置页、命令面板重置和安全恢复提供入口。
- 当前不做完整 `when` clause/chord 编辑器；后续应在 command registry 增加 context predicate，避免 Monaco/xterm/输入框焦点时误抢快捷键。
