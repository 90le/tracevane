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

### 10.15 Terminal Session 管理动作补齐

终端从“能打开”继续升级为可管理工作流：

- `lib/api/terminal.ts` 与 `lib/query/terminal.ts` 绑定后端已有 rename route，终端标题可被前端管理。
- `terminalSessionActions.tsx` 新增 session 级动作：重命名、清屏、复制输出。
- `terminalPanelCommands.tsx` 新增 panel 级命令：重命名当前会话、清屏、复制当前输出。
- `WorkspaceTerminal.tsx` 暴露轻量 `TerminalController`，当前只提供 `clear()` 与 `getVisibleOutput()`；这避免把 xterm 实例泄露到 Workbench，又能服务右键菜单、命令面板和后续 AI 诊断。
- 当前复制输出使用 xterm buffer 文本；后续 AI-native 阶段应接入最近输出摘要、错误识别、命令历史、cwd、退出状态，并通过 preview/apply/rollback 守住写操作边界。

### 10.16 Terminal cwd 插入动作

终端路径工作流继续补齐：

- `TerminalController` 增加 `paste(value)`，但仍不向 Workbench 泄露完整 xterm 实例。
- session 右键菜单新增 `terminal.session.insertCwd`。
- 命令面板新增 `terminal.panel.insertCwd`。
- cwd 插入使用 `shellQuotePath()`，保证带空格或单引号的路径进入 shell 时仍可用。
- 目标 session 不是当前 xterm controller 时先切换终端，不直接粘贴，避免误插入错误会话。
- 后续应把文件树拖放路径、右键“插入路径到终端”、图片/文件发送到 AI 终端诊断统一到同一 TerminalController 能力层。

### 10.17 Shell 面板尺寸可调与持久化

Workspace shell 开始具备更接近桌面 IDE/高级 Web 工作台的尺寸控制：

- PC：ActivityBar 右侧的 Explorer/Search/Git 侧边面板宽度可拖拽调整。
- Mobile/Tablet narrow：底部工作面板高度可拖拽调整，避免资源管理器、搜索、Git 在固定高度下不可用。
- 面板尺寸独立保存到 `tracevane.workspace.panel-sizes.v1`，与 Dockview 主编辑区布局 JSON 分离。
- 重置布局同时清理 Dockview 布局与 shell 面板尺寸，恢复安全默认值。
- 尺寸具有上下限：PC 侧边栏避免过窄/过宽；移动端 bottom drawer 避免遮住全部编辑区或小到不可操作。
- 后续可扩展为每个侧边功能独立尺寸、平板双栏模式、拖拽吸附、以及用户可视化布局设置页。

## 11. 用户最新产品准则补充：世界级但符合国人使用习惯

本目标不替换前文 Ultimate Workspace 目标，而是在其上追加更明确的产品判断标准：

1. **世界级主流 IDE 体验，但不复刻任何竞品**
   - 借鉴 VS Code、JetBrains、GitHub Codespaces、Cursor、思源笔记、Obsidian、Linear 等产品的成熟交互模式。
   - 只吸收被验证有效的模式：活动栏、上下文菜单、可调整面板、命令面板、快捷键、Git SCM、终端多会话、文档所见即所得、可视化图谱。
   - 不照搬截图，不引入过密菜单、过重图标堆叠、桌面逻辑硬塞手机端等反向升级。

2. **符合国人用户习惯**
   - 中文文案自然、明确，不用机器翻译腔。
   - 默认布局要“看得懂、上手快”，高级能力通过右键、命令面板、更多菜单和设置渐进暴露。
   - 文件管理、上传、压缩、路径导航、Git 提交、终端操作等要接近国内开发者/运维/站长常用心智，同时保持现代 IDE 质感。

3. **PC / 平板 / 手机都必须是独立设计，不是等比缩放**
   - PC：侧边栏/底部终端/编辑区/预览区应可调整、可持久、可拆分。
   - 平板：优先双栏/抽屉混合，避免所有面板堆在一个弹窗。
   - 手机：底部工作面板高度可调；长菜单必须可滚动、吸附到可视区，不能溢出浏览器底部；文件/搜索/Git/终端必须能在窄屏完成核心任务。

4. **编辑器、预览、所见即所得是同一文件工作流**
   - 源码、预览、编辑+预览、所见即所得必须属于同一文件标签页，而不是多个割裂窗口。
   - Markdown/HTML/富文本体验要以思源笔记、Obsidian、Typora 类产品为参考：标题、表格、任务列表、图片、视频、Mermaid、代码块、数学公式等都应高质量渲染与编辑。
   - “预览时编辑”不是源码 textarea 伪装，而应逐步走向块级编辑、渲染态直接编辑、源码局部编辑和媒体资源选择。

5. **整体美学必须统一**
   - 顶部标题栏、活动栏、侧边栏、编辑区、终端、Git、文件管理器、弹窗/菜单必须共享同一视觉语言。
   - 当前顶部状态标题栏、部分菜单、移动端面板仍不达标，需要作为持续重构目标。
   - 目标是专业、克制、现代、清晰、有质感，而不是堆按钮或泛 SaaS 卡片风。

6. **性能与可维护性是产品能力的一部分**
   - 大目录、长 Git 历史、大 Markdown、图片/视频预览、索引库、全局搜索都必须考虑增量加载、虚拟列表、缓存和拆包。
   - 有稳定库可用时优先复用；但所有第三方依赖都要评估包体、维护活跃度、许可和与 Tracevane 设计系统的融合成本。

7. **当前新增发现进入待修列表**
   - 手机端资源管理器/文件菜单过长会溢出底部：需要做 viewport-aware + scrollable context menu。
   - 终端已结束会话不应继续占用主标签；应归档到历史/更多列表，主标签只显示可恢复/活跃会话，并提供彻底删除。
   - 终端默认名称过长：需要短名策略、响应式标签收缩、多标签仅图标/短号显示、hover/菜单查看全名。
   - 顶部标题栏与整体 Workspace 视觉不统一：需要重新设计顶栏信息密度、命令入口、状态展示和移动端适配。

### 10.18 Workspace Explorer P0 止血：地址栏合一与上传快照自愈

- Explorer 侧栏应轻量服务 IDE，不再重复显示“资源管理器标题 + 当前绝对路径 + 内部 root 面包屑 + 一排工具按钮”。
- 第一版采用“返回上级 + root 选择 + 文件路径地址栏 + 更多菜单”的结构：地址栏默认是可点击面包屑，点击空白或编辑按钮后切换为路径输入；中间路径过长时省略，保留层级跳转语义。
- 默认工作区目录只表示“打开文件夹/新终端默认 cwd”的语义，不得把用户临时浏览其它目录强行跳回；设置默认目录只保存配置和提示，不改变当前浏览自由度。
- 上传任务条只展示实时任务或短期可恢复任务；完成、跳过、取消、过期快照应自动消失，用户也可以清空任务条，避免多日后的 100% 待恢复假状态。
- 工具动作收敛到更多菜单：上传、新建、刷新、折叠、显示隐藏文件、设当前目录为默认工作区。PC/手机共享同一套轻量结构，后续再升级为 viewport-aware 菜单避让。

### 10.19 Workspace P0：编辑标签 root 上下文不能被浏览器 root 污染

- 文件标签打开时必须绑定当时的 rootId，形成 `tabRootIds[path]`。资源管理器后续切换到用户目录、项目根、OpenClaw 根或其它 root，只能影响新打开文件和终端默认目录，不能导致已打开标签读取错误 root。
- 编辑、预览、所见即所得、图片/视频/PDF 等 DocumentWorkbench viewer 都必须接收标签自身 root，而不是全局 Explorer 当前 root。
- 移动端没有右键，FileTree 行必须支持可取消长按菜单：长按打开上下文操作，移动/滚动/结束则取消，后续再升级为更适合触屏的大按钮 action sheet。

### 10.20 触屏优先：移动端不是缩小版 PC

- 手机端 Workspace 必须按触屏重新设计：不依赖右键、不依赖 hover、不堆小按钮。所有高频动作应提供底部操作面板、大按钮、大拖动热区和可取消长按。
- 面板拖动必须接近原生流畅：使用 `requestAnimationFrame` 节流、snap 高度点和 `touch-action`/大热区，避免每个 pointermove 触发昂贵重排。
- 终端在手机端默认小字号并可 +/- 调整；后续应支持双指缩放、横屏优化、软键盘安全区和命令快捷条。
- 最大化不是视觉假全屏：最大化编辑/终端时应隐藏活动栏、侧栏、移动底栏等 shell 干扰，让目标模块占满可用区域。

### 10.21 移动资源管理器 Action Sheet：触屏不是右键替代品

- Workspace 资源管理器在 `pointer: coarse` 或窄屏环境中进入触屏动作模式：长按文件、目录或点击“更多”时，不再弹出桌面坐标菜单，而是显示底部 Action Sheet。
- Action Sheet 必须具备：可关闭遮罩、顶部拖拽视觉提示、当前目标路径摘要、可滚动内容、大触控按钮、危险动作区分。
- 高频动作直接完成：进入目录、上传到当前、刷新、折叠、显示/隐藏隐藏文件、设置默认工作区、复制路径、预览、属性、下载。
- 需要输入或确认的复杂动作仍复用现有流程：新建、重命名、复制到、移动到、打包/解压、删除。这样既让手机入口可用，又不复制业务表单和服务端预检逻辑。
- PC 右键菜单继续保留；同一套业务动作通过“桌面浮层 + 移动 Action Sheet”两种外壳暴露，避免为了手机牺牲 PC 效率。

### 10.22 移动终端：字号、缩放与触屏会话管理

- 终端不是 PC 面板缩小版。手机端默认终端字号更小，并允许用户通过 +/-、重置按钮和双指缩放即时调整。
- 字号偏好本地持久化到 `tracevane.workspace.terminal.font-size.v1`；调整字号时只更新 xterm `options.fontSize` 并重新 fit，不能断开当前 PTY/SSE 会话。
- 终端 session 在手机端提供显式“更多”按钮，打开底部 Action Sheet；会话重命名、清屏、复制输出、插入 cwd、复制 cwd、结束和删除等动作都必须可触摸完成。
- PC 继续保留右键菜单和命令面板；手机使用底部面板和大按钮，二者共享同一 action registry，避免业务行为分叉。
- 后续继续补齐：真正沉浸全屏、横屏快捷键栏、软键盘安全区、终端 split 的触屏拖拽和 AI 诊断入口。

### 10.23 沉浸式最大化：不是遮罩式假全屏

- 编辑器/预览区和终端区的最大化必须成为 Workspace shell 的沉浸状态：隐藏顶部栏、状态栏、活动栏、侧栏、移动底栏，只保留当前工作模块和退出控件。
- 进入沉浸状态前保存 Dockview JSON；最大化时清空 Dockview 并只加载目标 panel，使 Monaco/xterm 获得真实布局尺寸，而不是被原 split 尺寸约束。
- 退出沉浸状态通过 Esc 或右上角退出按钮恢复原 Dockview layout，并重新持久化正常布局。
- 移动端沉浸区域必须使用 `env(safe-area-inset-*)` 预留安全区，避免终端输入区、编辑器内容和退出按钮被系统区域遮挡。
- 后续再评估是否叠加浏览器 Fullscreen API；第一版优先保证 Web App 内部稳定、可恢复、可测试。

### 10.24 Git 面板触屏化：SCM 不能只服务鼠标右键

- Git 变更行在触屏设备上必须有显式“更多”入口，不能依赖 hover 和右键。
- 手机/窄屏下打开变更操作时使用底部 Action Sheet，提供打开 Diff、暂存、取消暂存、复制路径、AI 解释 Diff 等大触控按钮。
- PC 继续保留右键菜单；手机 Action Sheet 与 PC 菜单共用 `createGitChangeActions`，保证 Git 行为一致、测试一致、后续 AI Diff 能力只接一处。
- 这是 Git 产品化的 P0 触屏入口；后续 P4 还需要补齐：branch graph、stash、push/pull/fetch、冲突解决、提交消息 AI 生成、diff review 与 rollback/preview。

### 10.25 Git 提交体验：从“能提交”升级为“能辅助表达意图”

- Git 面板提交区新增“生成草稿”和“AI 提交信息”两个轻量入口：前者立即可用，后者明确作为 Gateway AI 能力的产品占位，不伪造后端能力。
- 草稿生成以已暂存文件为唯一输入，避免未选择文件污染提交意图；多文件摘要限制显示数量，保持移动端和窄侧栏不溢出。
- 命令面板同步注册 Git 提交草稿能力，让桌面键盘用户和移动触屏用户都能以同一能力模型操作。
- 后续接入 AI 时，应读取 staged diff / status / branch / commit history，并提供 preview/apply，而不是直接覆盖用户提交信息。

### 10.26 移动端底部模块面板：从“能拖”升级为“顺手可控”

- 手机端资源管理器、搜索和 Git 面板不应只依赖一条难拖的细把手；应同时支持拖拽调整与一键高度档位。
- 拖拽中保持连续跟手，不在移动过程中频繁吸附；拖拽结束后才吸附到常用高度，减少卡顿和跳动。
- 高度档位按钮属于触屏友好快捷操作：小屏用户可以快速切换紧凑、半屏、编辑辅助、大面板视图。
- 后续终端/编辑器的全屏、半屏、贴边组合也应沿用同一套高度档位和沉浸式原则，而不是每个模块自造不同交互。

### 10.27 移动端全高与滚动原则：所有窗口可到顶，内容可自然滑动

- 手机端底部模块面板高度不再被中间上限卡住，必须支持拉到 100% 作为全屏语义；高度档位包含 100，拖拽也按同一上限处理。
- 终端是特殊画布：单指划动应滚动 xterm buffer，双指继续用于字体缩放；这比把终端外层改成普通滚动容器更符合终端行为。
- Git/搜索/文件这类普通列表必须有自己的移动端 scrollport，允许 `pan-y`，避免底部面板、页面外层和列表内部互相抢滚动。
- 真正全屏分两层：Dockview 沉浸模式负责模块布局，浏览器 Fullscreen API 负责系统级全屏；二者必须能同步进入/退出。

### 10.28 终端控制归位：全屏/沉浸应属于终端上下文

- 终端的字体缩放、沉浸显示、浏览器全屏属于同一类“当前终端视口控制”，应放在终端自身工具条，而不是完全依赖工作台全局悬浮控件。
- Workbench 继续持有 Dockview 与 Fullscreen API 状态，终端只接收状态和回调，保持模块边界清晰。
- 这是一轮过渡：全局悬浮控件暂保留，后续应逐步把编辑器、终端、预览等模块的控制收敛到模块内部，同时保留命令面板入口。

### 10.29 窗口自由度与移动软键盘：全高不是特例，是基础能力

- Workspace 的窗口尺寸策略改为“只设最小可用尺寸，不设人为最大尺寸”。PC 侧栏可以按用户需要继续拉宽；手机底部模块可拉到顶部并进入全屏语义。
- 移动端 100% 高度不应只是 `vh` 数值，而应切换为 `fixed inset-0 h-dvh` 的全屏窗口语义，避免顶部仍留下不可控空隙。
- 手机底部导航必须具备开关语义：点击“终端”打开终端，再次点击关闭终端；不要让用户只能打开不能关闭。
- 普通手机编辑/终端视图减少重复悬浮控件。全局 Dock 控件只在沉浸/浏览器全屏中保留作为逃生出口；常规操作应逐步收敛到模块自身工具条与底部导航。
- 终端必须适配软键盘：输入法弹起时根据 VisualViewport 自动增加底部避让并重新 fit xterm，保证用户看得到正在输入的位置。后续还要继续完善软键盘快捷条、横屏布局和输入焦点管理。

### 10.30 软键盘避让必须覆盖真实编辑器，而不是只覆盖普通输入框

- 手机端输入法适配不能只服务普通 `<input>`；代码编辑器、实时源码 textarea、xterm 终端都属于主要输入面。
- Monaco/xterm 需要用 VisualViewport 变化驱动内部容器高度和布局重算；避免只给外壳加 padding 导致“顶部空白、内容被二次压缩”。
- 软键盘 inset 只在键盘覆盖 visual viewport 时生效；若浏览器已经缩小 layout viewport，则不再叠加补偿，防止双重缩放。
- 终端全屏控制应去重：终端自身工具条已经拥有字体、沉浸、浏览器全屏等视口控制，全局 Dock 悬浮组在终端全屏时应隐藏。

### 10.31 边写边预览和视觉编辑也必须是移动端一等输入面

- Workspace 的移动端输入体验不能只修源码编辑器和终端；边写边预览、Markdown 块编辑、HTML 所见即所得 iframe 都必须共享同一套软键盘避让原则。
- 复杂编辑器的避让目标是“真实可滚动/可输入画布”，不是外层卡片。外层 padding 会让视觉上出现空白或把滚动交给错误容器。
- 这一能力为后续知识库、流程图、思维导图、富文本和图谱编辑提供统一基础：每个 editor/viewer 注册时都需要声明自己的移动输入面和 keyboard-safe scrollport。

### 10.32 移动端编辑器模式入口：显示当前状态，动作按需展开

- 源码、预览、边写边预览、预览时编辑属于同一文件标签页内的视图模式，不应在手机端长期占用一整排悬浮按钮。
- 手机端默认只展示当前模式胶囊，点击后由系统原生选择器展开；PC/平板继续保留横向按钮，保证效率和可发现性。
- 这是移动 Workspace 信息密度治理的一部分：低频动作按需展开，高频动作靠底部导航、上下文菜单和命令面板承载。

### 10.33 编辑器标签管理：PC 右键，手机显式更多

- 文件标签页必须可管理：关闭、关闭其它、关闭右侧、复制路径等能力不能只存在于桌面右键。
- 手机端每个标签显示轻量“更多”入口，打开底部 Action Sheet；动作复用 PC 标签菜单 registry，保证行为一致。
- 这是 Workspace 多端交互原则：同一能力模型，不同交互外壳；避免为了手机复制业务逻辑，也避免把 PC 右键强行搬到触屏。

### 10.34 触屏标签页：长按是快捷，更多是发现性

- 手机端文件标签页提供两种入口：长按快速打开上下文动作，更多按钮保证功能可发现。
- 触屏端不再同时显示小关闭按钮和小更多按钮；关闭、关闭其它、复制路径等都进入底部 Action Sheet，减少误触。
- 触屏 Action Sheet 菜单项必须采用更大的触控高度，不能照搬 PC 右键菜单的紧凑行高。

### 10.35 软键盘避让是“覆盖多少裁多少”，不是全局缩放

- 手机软键盘出现后，Workspace 不应把整个编辑器区域按全局键盘高度粗暴缩短；分屏、底部面板、沉浸窗口中只有真实被键盘覆盖的输入面需要裁剪。
- 每个复杂输入组件必须声明自己的 keyboard-safe surface：Monaco 容器、xterm 容器、textarea、Markdown scrollport、HTML iframe。避让计算以该 surface 的 `getBoundingClientRect()` 为准。
- 这样可以避免“编辑框顶部出现空白块，下面才是内容”的二次缩放问题，同时保留输入法不遮挡当前输入位置的目标。

### 10.36 终端标签管理：桌面右键，触屏长按与更多入口并存

- 终端会话标签页必须像文件标签一样可管理：新建、重命名、清屏、复制输出、结束、删除、复制/插入 cwd 等动作使用同一 action registry。
- PC 保留右键菜单；触屏端所有可恢复终端标签显示更多按钮，并支持长按打开底部 Action Sheet。
- 长按必须可取消：手指移动表示用户可能在横向滚动标签栏，不应误打开菜单。
- 该模式后续应推广到搜索结果、Git 行、文件树和 Dock panel 标签：同一能力模型，多端不同交互外壳。

### 10.37 Git 面板先给状态总览，再给操作明细

- Git 管理工具必须先回答“仓库现在安全吗”：是否干净、还有多少变更、是否有冲突、是否与 upstream 分叉。
- 状态摘要不替代变更列表，而是作为 SCM 面板的第一层信息架构，让桌面和手机用户都能快速判断下一步是暂存、提交、解决冲突还是同步。
- 前端只消费后端 typed GitStatusPayload，不在 UI 层重新解析 git porcelain；冲突等风险状态从已有 change kind 派生，保持边界清晰。

### 10.38 Git 历史不是静态列表，而是上下文入口

- 最近提交列表必须从“只读证据”升级为可操作上下文：复制 hash、复制提交信息、复制提交上下文、AI 解释提交。
- PC 使用右键菜单，触屏使用底部 Action Sheet；与 Git 变更行共享同一多端交互原则。
- 当前先基于 `GitStatusPayload.commits` 做轻量操作外壳，后续再扩展 commit detail、commit diff、比较、cherry-pick/revert 等更高风险能力。

### 10.39 移动软键盘避让必须“按焦点最小避让”，不能全局硬缩放

移动端编辑体验的目标不是简单让键盘不遮挡，而是在不牺牲上下文阅读的前提下让光标、终端输入行和当前编辑块稳定可见。因此 Workspace 的 keyboard-safe 设计进入第二层约束：

- **先测目标面，再测焦点面**：用 VisualViewport 得到当前可视区域底部，再用编辑 surface 的 `getBoundingClientRect()` 判断是否真的被覆盖；如果能定位当前 textarea、contenteditable 或 iframe 内焦点，则按焦点底部加安全间距计算最小避让。
- **避免双重补偿**：很多移动浏览器已经通过 visual viewport 移动/缩小页面；Tracevane 不再把全局键盘高度直接套给每个嵌套面，避免编辑器顶部出现空白带。
- **按组件能力选择策略**：Monaco 保持容器高度，用底部 padding + layout/reveal 保持光标可见；Markdown 预览时编辑使用 scroll padding；textarea 使用 bottom padding；xterm/iframe 这类内部画布仍可缩小内部高度，但必须受 surface 上限约束。
- **可持续目标**：后续所有新增编辑器、图谱、思维导图、富文本或 AI 对话输入，都必须注册自己的 keyboard-safe surface，而不是依赖页面级固定 inset。

### 10.40 默认工作区目录是“启动焦点”，不是“浏览锁”

Workspace Explorer 的目录模型正式拆成三层：

1. **Root**：Files API 可访问入口，例如项目根、用户目录或其它系统路径。
2. **Default workspace directory**：用户声明的打开文件夹/新终端 cwd/初始焦点，属于偏好配置。
3. **Current browsing directory**：用户此刻正在看的目录，必须完全由导航、地址栏、面包屑、返回上级、搜索结果或上下文动作决定。

因此默认目录保存后不能反向驱动当前浏览目录。只有首次进入某个 root 或切换到一个没有本轮浏览记忆的 root 时，才读取默认目录作为初始位置；用户之后跳转到任意目录都不能被 effect 拉回。这个规则是后续多 root、多窗口、多终端 cwd 和 AI `@workspace` 上下文稳定性的基础。

### 10.41 文件标签必须能反向定位文件上下文

顶级 IDE 的文件标签不是孤立的标题条，而是连接编辑器、资源管理器、Git、终端和 AI 上下文的对象入口。Tracevane 的编辑器标签页进入第二阶段管理能力：

- PC：右键标签打开上下文菜单；触屏：长按或更多按钮打开 ActionSheet。
- 标签动作包括关闭、关闭其它、关闭右侧、复制路径、在资源管理器中显示。
- “在资源管理器中显示”必须打开 Explorer、跳到文件父目录并选中该文件；它不能改变默认工作区目录，也不能把当前浏览能力锁死。
- 未来扩展：固定标签、拆分到新组、移动到侧组、加入 AI 对话、以不同编辑器重新打开，都应挂在同一标签 action registry 下，避免散落按钮堆积。

### 10.42 终端标签重命名必须产品化，而不是浏览器 prompt

终端是 Workspace 的一等模块，标签管理需要和编辑器、Git、文件上下文保持同一设计语言。终端重命名进入以下规则：

- PC 右键、移动端 ActionSheet、命令面板都调用同一个重命名入口。
- 不使用浏览器 `prompt`，因为它无法参与主题、软键盘避让、响应式布局、审计和未来 AI 上下文确认。
- 终端标题持久化到现有 terminal session descriptor；短标题只负责显示收缩，不替代真实 title。
- 重命名对话框必须适合手机输入：输入框自动聚焦、Enter 提交、pending 禁用、会话 ID 作为只读辅助证据。

### 10.43 软键盘避让不能改变编辑器滚动锚点

手机端输入法弹起时，Workspace 的目标是“当前输入点可见”，不是“把当前输入点强制居中”。后者会在 Monaco 这类虚拟滚动编辑器里制造顶部空白，让用户误以为内容被缩放过度。

- Monaco 保持编辑器容器高度，只增加底部 padding 和重新 layout。
- inset 变化后只做最小 reveal：光标被遮挡时滚到可见即可，不主动居中。
- 其它可滚动文档编辑面遵循同一原则：优先保持用户原来的阅读/编辑锚点，只有被软键盘真实遮挡时才滚动必要距离。

### 10.44 Git 分支切换必须先确认风险，再执行写操作

Git 是 Workspace 的高风险写操作域。分支切换看似是导航，实际会改变工作树和索引，因此 Tracevane 不应把它设计成无确认的普通下拉导航。

- 当前分支只作为状态展示，不能重复触发 checkout。
- 切换到其它分支前必须展示目标分支、当前分支、本地变更数量和冲突风险。
- 前端不主动丢弃、merge 或 stash 用户修改；这些都应成为后续独立的可预览/可回滚动作。
- 成功和失败都必须反馈，失败时保留 Git 后端错误信息，帮助用户决定是否先提交、暂存、stash 或解决冲突。

### 10.45 文件树操作入口：右键、长按、显式更多必须同源

资源管理器是 Workspace 的高频入口，不能只为 PC 鼠标设计。文件树行的操作能力采用“三入口一能力模型”：

- PC：右键和 hover 更多按钮打开同一上下文菜单。
- 手机/平板：长按是快捷入口，行尾更多按钮保证可发现性。
- 业务逻辑不进入 FileTree；FileTree 只负责选择、拖拽、长按和菜单定位，复制/移动/删除/上传/属性/预览仍由 WorkspaceExplorer 与 FileActionsMenu 统一承载。
- 长按必须可取消，手指移动代表用户可能在滚动树列表，不能误弹菜单。

### 10.46 Monaco 软键盘避让以“光标真实遮挡”为准

移动端代码编辑器不能把键盘高度简单换算成编辑器 padding。Tracevane 的 Monaco 策略进一步收紧：共享 hook 只提供目标 surface 的最大可能遮挡，CodeEditor 自己再用 Monaco 当前光标的可视坐标判断是否需要补偿。

- 如果光标没有被 visual viewport 底部遮挡，Monaco 不增加额外 bottom padding，避免顶部空白和滚动锚点漂移。
- 如果光标被遮挡，只补偿光标底部到可视视口底部的真实 overlap，并受 surface inset 上限约束。
- 仍然禁止 center reveal；只做最小 reveal，让用户保持原来的阅读上下文。

### 10.47 终端操作先统一语义，再接入真实 Dock 布局

终端要成为和文件标签一样的一等对象，但不能为了视觉上“像 IDE”而先做假的布局。当前阶段先统一动作语义：标签右键、触屏 ActionSheet 和命令面板都能表达新建、重命名、拆分、移动、清屏、复制、结束、删除等动作。

- “向右/向下拆分”当前先创建继承 cwd 的新终端会话，并记录 handoff 来源；后续接入 Dockview group 时直接把该语义映射到真实 split panel。
- “移动到编辑区域”当前派发稳定事件和用户反馈，作为 terminal-as-editor-tab 的前端合同预留。
- 所有终端动作必须走 registry，避免在工具栏、菜单、命令面板、移动端 Sheet 各写一套逻辑。

### 10.48 移动端输入适配不能重建编辑器实例

Workspace 的移动输入适配必须保护编辑器生命周期稳定。软键盘弹起会产生多次 VisualViewport resize/scroll，如果这些变化导致 Monaco/xterm/富文本编辑器实例重建，用户会感知为输入跳动、顶部空白、光标丢失或内容闪烁。

- Monaco 的创建 effect 只允许跟随文件身份变化重建；键盘 inset、滚动、光标移动只能触发布局测量。
- 键盘 inset 这类高频可视状态使用 ref 传入稳定测量回调，避免 React 回调身份变化级联到编辑器生命周期。
- 后续所有复杂编辑器接入 keyboard-safe surface 时，都必须检查“避让状态变化是否会重建编辑器实例”。

### 10.49 Git 提交草稿必须可解释

提交信息生成不是魔法按钮。用户需要知道草稿依据了哪些已暂存内容，才能信任并编辑它。

- 提交草稿只基于 staged changes，与 Git commit 的 index 语义一致。
- 提交区显示轻量“草稿依据”：类型统计 + 少量文件样本 + 溢出数量；不把全部路径堆进窄侧栏或手机面板。
- 后续 AI commit message 接入后，也必须展示输入上下文、预览结果和可编辑应用，不允许直接覆盖用户提交信息。

### 10.50 编辑器标签先建立布局语义，再迁移到真实 Dock group

文件标签要走向世界级 IDE，不能只会关闭和复制路径。Tracevane 的标签管理进入两阶段策略：

- 第一阶段：所有入口统一表达“向右拆分、向下拆分、移动到新编辑组”的产品语义，PC 右键、触屏 ActionSheet、命令面板共享 action registry。
- 第二阶段：迁移 `WorkspaceEditorStage` 的 tab ownership，使单个文件标签可以真正成为 Dockview group/panel 中的可移动对象，同时保持 dirty buffer、保存状态、查找请求、预览模式和 session persistence 不丢失。
- 在真正 Dock group 完成前，动作不得假装已经分屏；必须通过稳定事件和明确 toast 告知当前是布局入口预留，避免误导用户。
- “在资源管理器中显示”属于标签上下文能力，必须从 Workbench 真实传入 Stage，不能只在底层组件里有 prop。

### 10.51 软键盘避让要以“焦点位置”而不是“面板尺寸”作为唯一触发

移动端输入法弹起后，Tracevane 不再把面板底部被 visual viewport 覆盖的高度直接等同于编辑器应该缩小的高度。只有当前焦点、选区、textarea 光标或 iframe 内真实编辑点被遮挡时，组件才允许补偿。

- 共享 keyboard-safe hook 如果找不到焦点矩形，必须返回 0，而不是退回整个 surface overlap。
- textarea 以当前光标所在行近似矩形计算，避免整框很高时把空白 padding 加到顶部阅读区。
- contenteditable 和 iframe 优先使用 selection rect，让 HTML/Markdown 预览时编辑保持所见即所得的滚动锚点。
- Monaco、HTML iframe、xterm 这类复杂 surface 不再用 `height: calc(100% - inset)` 做硬缩放；优先保持容器高度，只对内部滚动/底部安全区做最小补偿。
- 目标是让输入点可见，同时不破坏用户正在看的上下文；出现顶部空白带时，默认判断为“补偿过度”而不是继续加大 inset。

### 10.52 终端全屏入口必须按设备和状态收敛，避免重复浮层

终端有两类放大能力：Workspace 内部沉浸，以及浏览器 Fullscreen API。两者都需要保留，但不能在手机或已全屏状态同时显示两套相似浮层按钮。

- PC 正常态可以提供“沉浸”和“浏览器全屏”两个明确按钮，因为鼠标精度高且用户能理解差异。
- 触屏、已沉浸或已浏览器全屏时，终端内部工具条只显示一个统一全屏按钮，语义为“进入最强可用全屏”或“退出当前全屏”。
- 全屏退出优先级：先退出浏览器全屏，再退出 Workspace 沉浸，避免用户被困在页面级全屏里。
- Workbench 级 DockQuickControls 继续负责编辑/预览/终端区域的全局布局；终端内部工具条只负责终端就近控制，不与全局浮层堆叠竞争。

### 10.53 移动端长菜单必须可滚动、分组、避让安全区

手机没有鼠标右键，也没有无限垂直空间。Workspace 的所有触屏 ActionSheet 都必须把“操作完整可达”作为基础质量门槛。

- Sheet 高度不能假设所有按钮一次能放下；内容区必须有明确 scrollport 和 `overscroll-contain`。
- 底部必须使用 `env(safe-area-inset-bottom)` 留安全区，避免最后一个操作被系统手势区或浏览器 UI 遮挡。
- 操作多时按 action registry 的分组语义渲染，而不是一股脑堆成按钮墙。
- 移动端不能靠删功能解决溢出；能力应同源复用，外壳按设备调整。
- 该规则后续适用于文件树、Git 变更、历史提交、搜索结果、编辑器标签和终端标签。

### 10.54 文件操作移动 Sheet 与终端菜单共享同一可达性规则

资源管理器是 Workspace 高频入口，文件操作比终端更多，因此移动端更不能让底部菜单变成不可滚动的按钮墙。

- 文件触屏 Sheet 必须有 scrollport、安全区 padding 和 overscroll containment。
- 动作应按对象上下文分组：目标文件/目录动作、当前工作区动作、管理/危险动作。
- 触屏只改变交互外壳，不改变文件操作能力源；PC 右键、移动 Sheet、后续命令面板应继续共享同一业务入口。
- 后续 Git 变更行、搜索结果和编辑标签也按同一规则收敛，避免每个面板重新发明移动菜单。

### 10.55 Git 触屏菜单必须和文件/终端一样可达

Git 面板的变更行和提交历史行同样是 Workspace 高频操作对象，不能因为手机屏幕小就牺牲复制上下文、AI 解释、暂存/取消暂存等能力。

- Git 移动 Sheet 与文件、终端共享同一可达性规则：scrollport、safe-area padding、overscroll containment。
- Git action registry 的 `separatorBefore` 是信息架构信号，移动端应按它分组，而不是平铺成按钮墙。
- Git 菜单未来增加 diff explain、commit explain、stash、revert、compare 等动作时，必须先保证触屏可达性，不允许靠隐藏功能解决溢出。

### 10.56 编辑器标签移动菜单要服务未来多组布局，而不是只解决关闭

编辑器标签会承载越来越多布局与 AI 上下文动作，因此手机端标签菜单必须从一开始就是可扩展的。

- 标签触屏 Sheet 与文件、终端、Git 一样使用 scrollport、safe-area padding 和 overscroll containment。
- 标签动作按关闭、布局、上下文三类自然分组，分组来源使用 action registry 的 `separatorBefore`，避免复制移动端专用逻辑。
- 后续新增“固定标签、以某种方式重新打开、加入 AI 对话、移动到指定组”时，只扩展 action registry，不重写移动菜单。

#### 10.57 软键盘避让以“可见光标”为准，不能让编辑器自我居中

移动端输入法弹起时，工作区编辑器的目标不是把整个编辑器缩小，也不是把光标强行居中，而是保证当前输入点刚好不被遮挡。Monaco 的移动端策略更新为：先由 VisualViewport 判断输入法造成的真实可视边界，再由 Monaco 当前光标的可见坐标计算最小 overlap；padding 变化后保持滚动锚点，只有光标被遮挡时才做最小 scroll delta。

这条规则用于避免“输入框顶部出现空白区域后才是内容”的体验问题：任何 `revealPosition*`、居中滚动、全量键盘高度 padding、容器硬缩高都可能造成二次补偿，后续改动不得恢复。

#### 10.58 移动面板拖拽必须像系统抽屉一样轻，不让内容树参与拖拽

Workspace 移动端的资源管理器、搜索、Git 面板不应是“弹窗”，而应像系统级底部抽屉一样可拖动、可收起、可拉到顶部全屏。拖拽体验的优先级高于拖拽过程中的内容交互：当用户抓住面板手柄时，内容区临时退出 pointer hit testing，避免文件树、列表、滚动容器和右键/长按逻辑抢占触摸事件。

高度更新采用 `requestAnimationFrame` 与最小变化阈值共同控制，拖拽结束再 snap 到常用档位。后续任何移动面板都应复用这套“手柄命中清晰、内容命中隔离、100vh 全屏可达、状态持久化”的交互契约。

#### 10.59 移动底部导航必须表达模块状态，不只是入口按钮

移动端 Workspace 的底部导航不是普通页面 Tab，而是模块控制器。对于终端这类可打开、可关闭、可沉浸、可全屏的模块，按钮必须反映当前模块存在状态：未打开时是“终端”，已打开时是“收起”，并显示 active 状态。再次点击应关闭对应 Dock，而不是重复打开或无反馈。

Dockview 是布局事实源，但移动导航需要 React state 驱动，因此 Workbench 用布局变化同步 `terminalDockOpen`。关闭终端时同时清理 terminal 的沉浸和浏览器全屏状态，避免终端已关闭但 UI 仍保留全屏/悬浮控制的错觉。

#### 10.60 移动底部导航高度由内容和安全区决定，不能写死

移动端底部导航属于系统级控制面，必须避让 Home Indicator 和系统手势区。Workspace shell 不再把底栏写死为 52px，而是使用 `auto` 行高，让导航自身的安全区 padding 参与布局。导航底部 padding 使用 `env(safe-area-inset-bottom)`，保证按钮视觉和触摸区域都不会贴到系统手势区。

后续所有移动底部控制条都应遵循同一规则：用 CSS 环境变量处理安全区，避免用固定高度或 JS 设备判断制造跨设备异常。

#### 10.61 移动导航状态要可读，但不能滥用 ARIA

移动底部导航需要让视觉用户和辅助技术都知道当前打开的模块。Tracevane 使用原生 button、`aria-current="page"` 和 data 状态表达 active，不把“终端/收起”这类会改变标签的控制器伪装成 `aria-pressed` toggle button。

后续新增真正的折叠控制时，应按 WAI-ARIA APG 使用 `aria-expanded` 和 `aria-controls` 绑定具体内容区；只有标签稳定的真实 toggle button 才允许使用 `aria-pressed`。

#### 10.62 移动模块导航要把按钮和抽屉连起来

移动端文件、搜索、Git 三个入口控制的是同一个底部工作抽屉的内容，不是独立页面跳转。Tracevane 为当前移动 side panel 生成稳定 id，并在对应导航按钮上设置 `aria-expanded` 与 `aria-controls`。这样触屏用户、键盘用户和辅助技术都能理解“这个按钮展开了哪个面板”。

终端按钮暂不复用这个语义，因为终端控制的是 Dockview terminal panel；后续应给 terminal dock 自身补稳定 id 后再建立 controls 关系，避免错误绑定到 side panel 抽屉。

#### 10.63 软键盘避让必须以“当前可见编辑区”为事实源

移动端输入法弹起后，编辑器不能用键盘高度、面板高度或全局窗口差值直接缩放自身。Monaco 这类嵌套编辑器必须先计算当前编辑器实际可见底边：`min(editor.bottom, visualViewport.bottom)`，再看当前光标是否真的越过这条线。只有越过时才做有限补偿，并且补偿要拆成“底部可滚动空间”和“剩余 overlap 的小幅滚动”，禁止 padding 与 scroll 双重全量叠加。目标是让光标可见，同时不让编辑框顶部出现空白带。

#### 10.64 工作区主目录与资源管理器浏览目录必须解耦

Workspace 的“默认工作区目录”语义是 IDE 打开的项目主上下文，主要影响新终端 cwd、AI 上下文默认根、命令面板和会话恢复；它不是资源管理器当前浏览位置。资源管理器可以临时跳到任意目录、查看文件、复制路径、预览或上传，而不会自动改变新终端默认 cwd。只有用户明确执行“设当前目录为默认工作区”时，工作区主目录才改变。这个规则避免移动端/桌面端出现设置默认目录后浏览其它目录又被 effect 拉回的体验。

#### 10.65 Monaco 软键盘避让要以“编辑器与 VisualViewport 的交集”为上限

移动端软键盘弹起后，浏览器可能已经移动或缩小 VisualViewport，Monaco 又有独立滚动模型；因此工作区不能再把通用 `keyboardInset` 原样传给 Monaco。源码编辑器现在只用当前编辑容器与 VisualViewport 的实际交集作为最大避让，再用光标真实 overlap 做二次约束。这样可以避免“顶部先空一块，再出现正文”的双重补偿，同时保留底部光标被输入法遮挡时的最小滚动修正。

#### 10.66 终端主标签只显示可恢复会话，历史记录独立管理

终端标签栏必须保持“当前可操作”的信息密度：可恢复/可连接会话进入主标签，已结束或不可恢复会话不继续占位。历史记录作为独立弹层管理，支持单条删除和批量清理，避免手机端标签越积越多、名称被挤没，也避免用户误以为已结束会话还能继续操作。

#### 10.67 终端全屏控制必须单一，不把模式差异暴露成重复按钮

终端在普通、沉浸、浏览器全屏和触屏模式下都只应出现一个主全屏/退出全屏按钮。Workspace 可以内部区分 dock immersive 与 browser fullscreen，但用户不应该在终端浮层里同时看到两套外观相似的全屏按钮；否则手机端会误触、PC 端会显得控件堆积。统一按钮按当前状态选择退出浏览器全屏、退出沉浸或进入最合适的全屏路径。

#### 10.68 移动终端触屏滚动必须由终端接管，而不是依赖浏览器默认滚动

xterm 本身不是普通文档滚动容器，移动端还要同时支持双指缩放字体、拖放路径和软键盘避让，因此终端区域不能依赖浏览器默认 touch scroll。单指滑动应由 Workspace 捕获 pointer 并按滑动距离转换为终端 buffer 行滚动；双指继续保留字体缩放。滚动步长必须有最小阈值和最大上限，避免轻触误滚，也避免大幅滑动造成跳屏。

#### 10.69 Git 移动面板滚动要从高度链解决，而不是只给列表加 overflow

Git 面板在手机底部抽屉里是“固定头部 + 状态摘要 + 可滚动变更/历史列表 + 固定提交框”的结构。只在中间列表写 `overflow-auto` 不够，外层 PanelShell 必须拥有 `h-full overflow-hidden` 的确定高度链，才能让列表区域作为真正 flex 剩余空间滚动。否则触屏用户会感觉 Git 页面无法上下滑动，或者整块抽屉被内容撑开。

### 10.70 P0：编辑器悬浮工具条、跨目录标签稳定性与终端软键盘避让

- 编辑器视图切换从占据一整行的模式栏收敛为文件画布右上角悬浮工具条，移动端和 PC 端只保留 4 个高频控件：视图下拉、查找开关、缩小、放大。旧的横向模式按钮和独立替换按钮不再占据主布局，替换能力仍由查找面板内部承担。
- 视图模式增加全局偏好持久化：用户最后选择“源码 / 预览 / 编辑+预览 / 预览时编辑”后，后续打开文件会优先采用该偏好；如果文件不支持该模式，则自动回退到该文件支持的第一个模式。
- 已打开文件标签必须绑定打开时的 rootId。切换资源管理器根目录或默认工作区目录时，已打开标签继续使用原 rootId 读取和保存，避免“目录一切换，所有预览/编辑都找不到文件”。
- 终端软键盘避让不再要求能测到具体 input/textarea，因为 xterm/Monaco 这类 canvas/hidden textarea 控件常常无法暴露有效焦点矩形。终端使用 VisualViewport 与终端容器交集计算底部避让，并在键盘出现时滚动到底部，优先保证输入行不被输入法遮挡。

停止条件：该小步仅解决悬浮工具条收敛、模式偏好、已打开标签 root 绑定、终端键盘遮挡四个 P0 缺陷；底部 5 大功能按钮语义重构、Git 管理增强、全屏时底部导航策略继续留在后续 P0/P1 任务。

### 10.71 P0：移动端底部导航语义与沉浸态切换

- 移动端“编辑”按钮不再只是无感聚焦 Dockview。点击后会收起资源管理器/搜索/Git 底部面板，并关闭已打开的终端面板，把主画布还给编辑器/预览区，形成清晰的“文件/搜索/Git/编辑/终端”五大模式语义。
- 终端按钮继续保持二态：未打开时打开终端，已打开时收起终端，避免用户在手机上必须寻找悬浮关闭按钮。
- 当编辑器或终端进入沉浸/浏览器全屏时，底部导航改为固定贴底 overlay，不参与主布局挤压；这样全屏态仍可快速切换文件、搜索、Git、编辑、终端，又不会占用 Dockview 正常布局高度。
- 本轮没有把移动端功能区重新设计成复杂弹窗，而是保持底部主导航作为触屏设备的一等入口；后续再继续优化图标密度、命令面板和触摸手势。

### 10.72 P0/P4：Git 面板高频操作条

- Git 面板在分支栏下增加一行紧凑快捷操作：暂存全部、取消暂存、复制当前分支、AI 总结。它们不是替代右键/长按菜单，而是把日常 Git 面板最高频的仓库级操作外露，降低手机端和新用户的发现成本。
- 暂存全部仅作用于未暂存和未跟踪文件；取消暂存仅作用于已暂存文件；提交仍要求用户明确输入或生成可编辑草稿后再提交。
- AI 总结继续作为 Tracevane Gateway `@git status / @git diff` 入口占位，不在本阶段伪造真实 AI 调用。
- 操作条使用横向 overflow，不让按钮堆满面板；PC 和移动端共用同一语义，后续可接入更完整的 pull/push/stash/conflict 入口。

### 10.73 P0：编辑器悬浮菜单收敛为 4 个核心控件

- 目标：编辑器画布只保留一个轻量悬浮菜单，固定为“视图模式下拉、查找开关、缩小、放大”四个核心控件；查找按钮再次点击必须关闭查找/替换面板；替换能力留在查找面板内部，不再单独占按钮。
- 设计原则：文件的源码、预览、边写边预览、预览时编辑属于同一文件标签页内的视图状态，而不是顶部重复标题栏或横向按钮组。手机端优先保留内容高度，PC 端也避免旧工具栏与悬浮菜单并存。
- 实现约束：Workspace 内嵌 DocumentWorkbench 通过 `showModeSwitcher={false}` 关闭旧工具栏；当旧工具栏没有必要元素时不再渲染空工具行，避免顶部留白。非 Workspace 复用场景仍可显式开启 DocumentWorkbench 自带模式切换。
- 交互闭环：悬浮查找按钮发送 toggle 事件，DocumentWorkbench 内部统一打开/关闭查找条；字号缩放走同一事件通道更新 Monaco/Split source 字号；视图模式偏好继续持久化。
- 后续：继续把悬浮菜单做成更高质量的响应式控件，例如窄屏自动压缩文字、长按提示、更多编辑器动作进入二级菜单，而不是把按钮继续堆到顶栏。

### 10.74 P4：终端标签栏增加低噪音快捷操作组

- 目标：终端标签栏不再只依赖右键/长按菜单暴露能力；在不堆按钮的前提下，给当前活动终端提供高频 4 类入口：复制输出、清屏、AI 诊断、历史/新建。
- 设计原则：复制输出、清屏、AI 诊断是面向当前终端的高频动作，应比深层菜单更容易发现；拆分、移动、重命名、删除等低频或高风险动作仍保留在右键/长按菜单和命令面板中，避免标签栏变成按钮墙。
- 交互约束：无可恢复活动会话时，当前会话相关快捷按钮禁用；历史记录只在存在不可恢复会话时显示数量入口；新建终端始终保留但视觉保持紧凑。
- 后续：继续把终端快捷操作与可拆分布局打通，让“向右/向下拆分终端”真正操作 Dockview 布局，而不是只创建继承 cwd 的会话。

### 10.75 P5 预备：Git AI 总结入口先输出可复制上下文

- 目标：Git 面板里的 “AI 总结” 不再只是 toast 占位，而是先生成稳定的 `@git status` 文本上下文并复制到剪贴板，为后续 Gateway/model profiles 接入打基础。
- 内容范围：上下文包含当前分支、upstream ahead/behind、clean/dirty 状态、暂存/未暂存/未跟踪/冲突数量，以及每组最多 12 个文件路径与状态；超出数量用 `more` 摘要，避免大仓库一次复制过量。
- 产品原则：在真正接入 AI 写操作前，只提供只读上下文，不自动生成 patch 或执行 Git 写操作；这符合 P5 的 preview/apply/rollback 安全路线，也让当前 P4 Git 面板立即更有用。
- 后续：接入 Gateway 后，`formatGitStatusContext` 可作为 @git status provider 的最小格式基础，再扩展 staged diff、selected diff、commit history context。

### 10.76 P5 预备：单文件 Git Diff AI 入口输出上下文

- 目标：Git 变更行的 “AI 解释 Diff” 不再只是占位，而是先复制一个稳定的 `@git diff` 单文件上下文，作为未来 Gateway `@git diff` provider 的最小输入格式。
- 内容范围：包含文件路径、重命名前路径、Git status/kind、staged/unstaged 状态，以及当前是普通文件 diff 元数据还是 untracked 文件元数据。当前不复制完整 diff，避免大文件/二进制/隐私内容被无提示复制。
- 产品原则：先给用户可用的只读上下文，再接入真正 AI 解释；写操作、patch 生成、回滚必须留到 Gateway 权限边界和 preview/apply/rollback 机制完善后。
- 后续：对接后端 diff payload 后，可把当前 `formatGitChangeContext` 扩展为 “metadata + bounded diff hunk + binary/truncated 标记”。

### 10.77 P5 预备：提交历史 AI 解释入口输出 Commit 上下文

- 目标：Git 最近提交列表的 “AI 解释提交” 不再只是占位，而是复制稳定的 `@git commit` 元数据上下文，为后续 Gateway `@git commit` provider 铺路。
- 内容范围：包含完整 commit hash、subject、author、date、refs；当前不读取提交详情正文和 patch，避免在前端绕过后端截断/权限策略。
- 产品原则：最近提交历史是只读证据面板，AI 解释入口应先给可粘贴、可审计的上下文；后续再扩展为“复制元数据 + bounded commit detail + bounded patch”。
- 后续：接入 commit detail API 后，可在操作菜单中区分“复制提交元数据”“复制提交详情”“AI 解释提交”，并纳入统一 @git context registry。

### 10.78 编辑器悬浮菜单四控件收敛

- 设计依据：VS Code 官方 User Interface 文档确认编辑区的核心对象是 editor tabs；Basic Editing 文档确认当前文件查找/替换是编辑器内轻量控制，而不是与文件标签同级的常驻导航。
- 本轮决策：Workspace 编辑器只保留 4 个悬浮入口：视图下拉、查找开关、字号缩小、字号放大。视图切换继续支持源码、预览、编辑+预览、预览时编辑，但以一个下拉入口承载；查找按钮再次点击即关闭查找条。
- 删除/收敛：不再在 Workspace 文件标签下方渲染旧的 DocumentWorkbench 模式按钮行，不再增加独立“替换”悬浮按钮，避免手机端和窄屏出现双层工具条、按钮堆积和误触。
- 状态同步：DocumentWorkbench 把当前文件查找条打开/关闭状态回传给 Workspace 悬浮按钮，按钮用 active/pressed 状态表达“再次点击关闭”。

### 10.79 贴边悬浮控件、双全屏语义与项目级导航

- 悬浮控件：编辑器与终端悬浮工具条默认仍可直接操作，但新增贴右边缘的收起/展开状态。用户阅读代码、预览或终端输出时可以把控件收成边缘胶囊，必要时再展开，避免遮挡内容。
- 全屏语义：终端不再把“界面全屏”和“浏览器真实全屏”合成一个模糊按钮。界面全屏只重排 Dockview 布局，保留 Workspace 内组合能力；真实全屏调用浏览器 Fullscreen API，但不强制清空 Dockview 布局，后续可继续在真实全屏状态下组合编辑器、终端、文件/搜索/Git 面板。
- 项目级导航：Workspace 顶栏增加 Tracevane 功能域导航入口，可跳出工作区进入文件管理器、Agent 会话、CLI 代理、模型网关、IM 渠道、平台等页面。它不是 Workspace 内部活动栏，而是整个大项目的导航出口。
- 设计边界：不把项目级导航塞进工作区底部五大按钮；移动端仍优先保留 Workspace 内“文件/搜索/Git/编辑/终端”的触摸效率，跨域跳转通过顶栏项目菜单完成。

### 10.80 持久折叠、可关闭项目导航与真实全屏组合入口

- 悬浮控件折叠状态持久化：编辑器与终端的贴边折叠状态进入 localStorage。用户为了阅读内容把菜单收起来后，刷新或切换文件不应立刻恢复遮挡。
- 项目级导航可关闭：Workspace 顶栏项目菜单支持点击外部区域或 Escape 关闭，避免移动端/窄屏菜单打开后只能通过再次点标题关闭。
- 真实全屏组合入口：浏览器真实全屏状态下，Dock 快捷控件额外显示侧边面板组合和终端组合入口，用户可以在真实全屏里继续打开/收起资源管理器、搜索/Git 侧边域或终端，而不是被锁死在单一窗口。
- 设计边界：当前仍是第一版入口语义，后续要继续把 Dockview 分组拆分、侧边面板浮动/停靠和移动端手势统一到同一布局模型。

### 10.81 工作台级悬浮控件贴边折叠

- 问题：编辑器与终端自身悬浮菜单已可折叠，但 Dock/Workbench 级全屏与组合控件仍常驻右上角，会在真实全屏、沉浸模式或手机横屏场景遮挡代码、预览和终端输出。
- 决策：Dock 快捷控件也采用贴右边缘折叠/展开，并持久化到 localStorage。展开态保留编辑器界面全屏、终端界面全屏、浏览器真实全屏、关闭/退出，以及真实全屏下的侧边面板/终端组合入口。
- 设计原则：控制层应该“必要时出现”，不是永久压在内容之上；但折叠后必须仍有清晰的边缘胶囊入口，避免用户找不到全屏退出或组合窗口的路径。
- 后续：P2 中需要把这些入口继续升级成统一 Window Layout Controller，真正支持任意模块 dock/split/tab/floating/persist，而不是只对 editor/terminal 两个 DockPanel 写死。

### 10.82 侧边功能域进入 Dockview 组合布局

- 目标：资源管理器、搜索、Git 不再只能停留在固定侧栏或移动底部抽屉，而是作为 Dockview 面板进入同一个工作台布局模型，能和编辑器、终端拆分、拖拽、组合、恢复和持久化。
- 实现：DockPanel 类型扩展为 editor、terminal、explorer、search、git；新增 WorkspaceSideDockPanel 复用现有 WorkbenchSidePanel，因此不是复制三套 UI，而是把同一套文件/搜索/Git 能力接入 Dockview。
- 交互：工作台悬浮控件新增“将当前侧边功能停靠到工作区”的入口，点击后会把当前资源管理器/搜索/Git 停靠进 Dockview，并收起固定侧栏，减少遮挡。
- 设计边界：活动栏默认仍用于快速打开固定侧栏；Dockview 停靠是更高级的组合模式。后续需要把活动栏、命令面板、右键/长按菜单都统一接入“停靠/浮动/拆分/关闭”的 Window Layout Controller。

### 10.83 侧边功能停靠进入统一命令与活动栏入口

- 问题：10.82 已让资源管理器、搜索、Git 可以进入 Dockview，但入口主要藏在工作台悬浮按钮里，不符合高级工作台“命令面板、活动栏、快捷操作同源”的产品方向。
- 本轮决策：命令面板新增“停靠资源管理器到工作区 / 停靠搜索到工作区 / 停靠 Git 到工作区”三条布局命令；桌面活动栏的资源管理器、搜索、Git 支持右键直接停靠到 Dockview。
- 设计原则：左键保持“打开固定侧栏”的低门槛行为，右键/命令面板提供“进入可组合工作区”的高级行为。这样不会让普通用户误入复杂布局，也给高级用户提供明确路径。
- 后续：移动端没有右键，下一步需要给底部导航或长按菜单增加同等停靠入口，并把 Dockview 面板的关闭、浮动、分组、重命名纳入统一 Window Layout Controller。

### 10.84 移动端长按底部导航停靠到工作区

- 问题：桌面活动栏可通过右键把资源管理器、搜索、Git 停靠到 Dockview，但手机和平板触屏没有稳定右键语义，如果只保留悬浮按钮或命令面板，入口仍然不够自然。
- 本轮决策：移动端底部“文件 / 搜索 / Git”短按继续打开底部工作面板，长按则直接把对应功能停靠到 Dockview 工作区。长按后抑制随后的 click，避免同一次手势又打开抽屉。
- 设计原则：触屏设备用长按承载上下文动作，保持底部导航的一等入口地位；普通短按不变，高级组合布局通过更明确的触摸手势进入。
- 后续：长按目前是轻量直接动作，下一步应演化为触屏上下文菜单，提供“停靠到工作区 / 全屏 / 关闭 / 复制路径”等更多动作，并解决菜单不溢出屏幕底部的问题。

### 10.85 移动端长按升级为触屏操作菜单

- 问题：10.84 的长按直接停靠虽然解决了无右键入口，但直接改变 Dockview 布局仍可能造成误触；触屏设备需要更明确、更可撤销的中间层。
- 本轮决策：长按底部“文件 / 搜索 / Git”不再直接执行停靠，而是打开底部上方的轻量操作菜单，提供“打开底部面板”和“停靠到工作区”两个动作。菜单支持关闭按钮、点击外部区域和 Escape 关闭。
- 设计原则：短按是低门槛主路径；长按是上下文动作入口；真正改变布局的动作必须二次确认式点击，而不是单次长按立即生效。
- 后续：该触屏菜单将继续扩展为统一 Mobile Context Menu，承载全屏、关闭、复制路径、重命名、拆分等动作，并解决菜单在小屏幕底部溢出的问题。

### 10.86 侧边 Dock 面板纳入命令级最大化/关闭

- 问题：资源管理器、搜索、Git 已经能进入 Dockview，但命令面板仍主要管理 editor/terminal；这会让高级用户停靠侧边功能后缺少一致的关闭、最大化入口。
- 本轮决策：命令面板新增资源管理器、搜索、Git 的最大化与关闭 Dock 面板命令，全部走现有 Dockview `toggleMaximizedDockPanel` / `closeDockPanel` 通道，不复制新的布局状态机。
- 设计原则：任意进入 Dockview 的模块都必须被同一套窗口管理能力覆盖；固定侧栏入口和 Dock 面板入口可以共存，但关闭 Dock 面板不能删除功能本身。
- 后续：继续把这些命令接入标签页右键/长按菜单、移动端触屏操作菜单和统一 Window Layout Controller，逐步补齐浮动、拆分、移动到新组、固定/保持打开等能力。

### 10.87 编辑器标签页关闭矩阵补齐与菜单防溢出

- 问题：编辑器标签页已有右键/长按菜单，但关闭矩阵还不完整，缺少“全部关闭”和“关闭左侧”；桌面右键菜单也没有根据视口边界钳制位置，长菜单靠近屏幕边缘时容易溢出。
- 本轮决策：编辑器标签页菜单与命令面板补齐关闭当前、全部、其它、左侧、右侧五类关闭动作；移动端 Action Sheet 沿用同一 action registry；桌面浮层菜单增加视口边界钳制和最大高度滚动。
- 设计原则：标签页管理必须像主流 IDE 一样完整，但入口应集中在上下文菜单/命令面板，不把关闭矩阵做成常驻按钮墙。触屏设备用长按/更多按钮进入同一能力，避免右键依赖。
- 后续：继续把“拆分/移动到组”从当前事件预留升级为真正 Dockview editor group 操作，并把固定/保持打开、关闭已保存、重新打开关闭标签纳入统一标签管理模型。

### 10.88 终端标签关闭其它与菜单防溢出

- 问题：终端会话标签已有重命名、拆分、清屏、复制输出、结束和删除记录，但缺少主流 IDE 常用的“关闭其它终端”动作；桌面右键菜单贴近边缘时也可能出现溢出。
- 本轮决策：终端标签上下文菜单、触屏 Action Sheet 与命令面板新增“关闭其它终端 / 终端：关闭其它会话”。动作只结束其它可恢复会话，保留当前会话；不可恢复历史仍通过历史管理入口删除。
- 设计原则：终端标签页管理要和编辑器标签页形成一致心智，但终端关闭是进程级操作，默认只结束其它可恢复会话，不自动删除历史记录，避免破坏证据链。
- 后续：继续把终端拆分从“创建同 cwd 会话”升级为真正 Dockview 分组拆分，并补“关闭右侧/关闭左侧终端组”“移动到新窗口/编辑区”等窗口级管理。

### 10.89 移动端全高面板保留底部导航与终端软键盘避让

- 问题：搜索、Git、终端等移动端工作面板拉到 100% 高度时，旧实现使用 `fixed inset-0 h-dvh` 覆盖整个视口，导致底部五大功能导航被面板遮住；终端软键盘避让测量的是 xterm 内层容器，遇到输入法时容易低估遮挡，输入行仍可能被键盘盖住。
- 本轮决策：移动端工作面板进入全高状态时不再占用底部导航区域，而是使用 `bottom: var(--workspace-mobile-nav-height)` 预留导航高度，并把底部导航提升为 overlay；终端键盘避让改为测量终端外层 surface，再通过 padding 与 scrollToBottom 协作让输入行保持可见。
- 设计原则：手机端全屏不是“吞掉导航”，而是“内容最大化 + 导航仍可达”。所有 Workspace 子面板必须允许用户随时切换文件、搜索、Git、编辑、终端，不让 100% 面板形成死胡同。
- 目标升级：后续 Workspace 目标进一步明确为 PC/平板/手机双端一流产品：PC 强调 Dockview 拖拽/拆分/多组/快捷键；手机强调底部导航、触屏菜单、软键盘避让、可达性和单手操作；同一模块能力通过统一 registry 复用，不做端侧能力分裂。
- 后续：继续把终端真正拆分、Git 面板可提交、搜索结果窗格化、文件树多选和移动端上下文菜单统一到 Window Layout Controller，使 Tracevane Workspace 朝“全球第一 Web IDE / Knowledge Studio”方向持续演进。

### 10.90 终端软键盘避让改为布局级 spacer

- 问题：上一轮已把终端软键盘避让改为外层 surface 测量，但仍通过外层 `paddingBottom` 留白。对 xterm 这类内部自行测量尺寸的画布式控件，padding 可能不稳定地改变测量区域，出现“输入法仍遮挡输入行”或“顶部/底部留白不均”的体验。
- 本轮决策：终端外层从单行 grid 改为 `minmax(0,1fr) + auto` 两行布局，键盘避让高度由专门的 `data-workspace-terminal-keyboard-spacer` 承担；xterm 容器始终在第一行 `height: 100%`，避让时 FitAddon 会重新 fit 并滚到底部。
- 设计原则：手机端编辑/终端输入必须把软键盘视为布局参与者，而不是覆盖层补丁。对画布式控件优先使用布局级 spacer，减少对内部 DOM/隐藏 textarea 的假设。
- 后续：继续把编辑器、终端、搜索、Git 的移动端输入面板统一接入同一个 VisualViewport 避让策略，并在真机/Playwright mobile viewport 下补交互 smoke。

### 10.91 移动端编辑入口升级为编辑/命令双态入口

- 问题：手机端编辑器主画布默认常驻，底部“编辑”按钮在已经处于编辑区时没有实际作用，用户会感到按钮占位但不提供能力；而命令面板是移动端进入工作台全局能力的轻量入口，不应只能依赖顶部按钮。
- 本轮决策：底部导航的第四个入口改为上下文双态：当文件/搜索/Git/终端占用焦点时显示“编辑”，点击返回编辑画布并关闭阻挡面板；当已经处于编辑画布时显示“命令”，点击打开 Workspace 命令面板。这样保留五大模块心智，同时让“编辑”位不再空转。
- 设计原则：移动端固定导航栏每个入口都必须有即时价值。编辑画布默认可见时，编辑入口应承担“返回焦点 + 打开全局命令”的组合语义，减少顶部栏依赖和无效点击。
- 后续：将命令面板继续移动端优化为 touch-first command sheet，并把 AI 动作、布局动作、文件动作按上下文排序。

### 10.92 命令面板移动端 Sheet 化

- 问题：手机端底部导航已把“编辑”双态升级为“命令”入口，但命令面板仍沿用桌面居中弹窗，触屏上像临时弹窗而不是工作区主控制面板，且高度/安全区/滚动不够明确。
- 本轮决策：保留 cmdk/Radix 现有依赖，不新增库；为通用 `CommandDialog` 增加 `contentClassName` 与 `commandClassName` 透传能力，Workspace 命令面板在移动端变为底部 sheet：贴底、圆角顶部、安全区 padding、76dvh 高度上限、独立滚动列表和顶部拖拽视觉把手。
- 设计原则：移动端命令面板应像“工作台控制台”而不是桌面弹窗缩小版。底部导航触发的全局能力优先从底部生长，减少拇指移动距离，并保留桌面端原有 command palette 宽度与形态。
- 后续：继续为命令项增加上下文排序、最近使用、AI 动作分区和面板级命令过滤。

### 10.93 Git 分支切换接入命令面板

- 问题：Git 面板已有分支下拉与切换确认，但命令面板里缺少分支切换入口；PC 用户无法用命令面板快速切换，手机端新的命令 Sheet 也无法承载 Git 分支操作。
- 本轮决策：Git 命令注册器接收当前 branches 与 `requestBranchSwitch`，把最多 8 个非当前分支注册为 `Git：切换到 ...` 命令；执行仍走现有 BranchSwitchConfirmDialog，因此有未提交更改/冲突时保留确认边界，不绕开安全流。
- 设计原则：Git 面板可见控件和命令面板应共享同一条产品动作链。命令面板是入口，不是旁路；所有可能改变工作区状态的动作仍必须复用现有确认与 mutation 边界。
- 后续：继续把 stage/unstage、提交草稿、AI diff 解释按上下文排序，并补 branch search/最近分支。

### 10.94 移动端全高模式不吞导航与终端键盘 overlay 兜底

- 问题：移动端 100% 高度或界面全屏时，如果继续套用桌面沉浸模式，会把底部“文件 / 搜索 / Git / 命令 / 终端”导航隐藏；这对手机触屏是不合格的，因为用户没有鼠标和稳定快捷键可恢复模块。终端软键盘问题也不能只靠 VisualViewport 与 focused rect，因为 xterm 的真实输入节点是隐藏 textarea，视觉输入行和 DOM focus rect 并不一致。
- 本轮决策：移动端界面全屏只最大化 Dockview 内容，不再启用隐藏整壳 top/nav 的 `workspace-shell-immersive`；只有浏览器真实全屏才隐藏外壳。底部导航 overlay 也不再因为普通 `maximizedDockPanel` 出现/消失，而是跟随浏览器真实全屏或移动端面板全高状态。终端键盘避让 hook 增加 `includeViewportOverlayInset`，对 xterm 合并 VisualViewport overlap 与 VirtualKeyboard boundingRect，并在避让后滚到底部、尝试唤起 xterm helper textarea 的 `scrollIntoView`。
- 设计原则：PC 的沉浸全屏和手机的“拉满高度”不是同一种交互。手机全高必须保留可达导航；真实全屏也要有模块切换路径。对编辑器/终端这类画布式输入控件，软键盘是布局参与者，不能只把它当成覆盖层或只相信隐藏输入框的位置。
- 后续：继续做真机/Playwright mobile smoke，统一搜索/Git/文件面板的滚动与键盘避让，并把手机端“全屏/组合/切换模块”的控制收敛成一套 Window Layout Controller。

### 10.95 移动端真实全屏仍保留底部模块导航

- 问题：上一轮修复了普通 100% 面板/界面全屏不吞底部导航，但浏览器真实全屏如果继续使用桌面 `workspace-shell-immersive`，仍会隐藏底部导航。手机端真实全屏不能只追求沉浸，因为触屏用户没有稳定快捷键和鼠标右键来恢复模块。
- 本轮决策：桌面端真实全屏/沉浸继续隐藏外壳；移动端真实全屏改用 `workspace-mobile-browser-fullscreen`：隐藏顶部栏和 footer，但保留底部五大导航为 grid，同时移动 nav overlay 继续跟随 `browserFullscreenPanel || mobilePanelFullscreen`。这样终端、Git、搜索等在真实全屏下仍可切换。
- 设计原则：移动端“全屏”应理解为内容空间最大化，而不是砍掉所有导航。全屏状态越强，越要保证退出、切换、关闭和模块导航路径可达。
- 后续：把真实全屏、界面全屏、面板全高、Dockview maximize 统一抽象为 Window Layout Controller 的四种模式，避免每个模块散落判断。

### 10.96 Workspace Layout Controller 雏形

- 问题：随着 Dockview、移动底部面板、界面全屏、浏览器真实全屏、终端全屏、移动导航 overlay 逐步增加，布局判断已经开始散落在 JSX className、条件渲染和 CSS 中。继续这样推进会让 P2 的模块化工作台底座难以维护，也容易出现“修了终端全屏却弄丢 Git/搜索导航”的回归。
- 本轮决策：新增 `deriveWorkspaceLayoutMode` 作为统一布局控制器雏形，把当前状态折叠成 `desktop`、`desktop-immersive`、`mobile`、`mobile-panel-fullscreen`、`mobile-browser-fullscreen` 五种 shell mode，并统一输出 shellImmersive、mobileBrowserFullscreen、mobileNavOverlay、reserveMobileNav、showDockQuickControls。DOM 暴露 `data-workspace-layout-controller="unified-v1"` 与 `data-workspace-layout-mode` 供测试和后续样式/调试使用。
- 设计原则：世界级 Web IDE 的布局系统不能靠零散 if 条件堆起来。布局控制器应成为“用户意图状态 → 可见导航/沉浸/组合控制/安全区”的唯一翻译层，后续 Dockview split/floating、移动 sheet、真实全屏和 AI sidecar 都应接入这个层。
- 后续：把 controller 从本文件继续拆成 `workbenchLayoutController.ts`，补纯函数单测；再把 editor/terminal/file/search/git 的全屏、关闭、组合、恢复动作都收敛到同一个 Window Layout Controller。

### 10.97 Layout Controller 从组件拆出

- 问题：10.96 已经把布局判断收敛为 `deriveWorkspaceLayoutMode`，但如果继续放在 `WorkspaceWorkbench.tsx` 内部，巨型组件仍会承担状态、渲染、布局策略三种职责，不利于后续把搜索/Git/终端 100% 高度、真实全屏、软键盘避让和模块组合统一治理。
- 本轮决策：新增 `workbenchLayoutController.ts`，导出 `WorkspaceShellMode`、`WorkspaceLayoutMode` 与纯函数 `deriveWorkspaceLayoutMode`。Workbench 只负责采集状态和渲染 DOM data marker，布局语义由 controller 统一翻译。
- 设计原则：顶级 Web IDE 的布局能力必须有可测试、可推理的“状态到界面模式”转换层。任何窗口全屏、组合、贴边、底部导航保留、沉浸控件显隐，都不应散落在 JSX 条件里。
- 后续：继续把用户反馈中明确的问题纳入 controller：搜索/Git/终端 100% 高度时底部功能导航不丢失；终端软键盘输入时不遮挡输入内容；手机端顶部栏/底部栏信息密度继续降低；编辑器、终端、文件、搜索、Git 都支持拆分、组合、真实全屏与界面全屏的可达闭环。

### 10.98 VS Code / Visual Studio 布局理念吸收与 IDE 工具双主线

- 新增目标校准：Workspace 的升级不只是“窗口可拖拽”，而是要同时升级布局模型与 IDE 工具模型。布局上吸收 VS Code 的 Activity Bar / Side Bar / Editor Groups / Panel / Command Palette / 可移动 View，以及 Visual Studio 的可保存窗口布局、tool window/document window 分组、水平/垂直 tab groups、布局恢复理念；工具上把资源管理、搜索替换、Git、终端、编辑器、预览、AI 上下文、知识写作都做成一等模块。
- 设计取舍：不复刻 VS Code 或 Visual Studio 的视觉，也不把桌面 IDE 交互直接搬到手机。PC 端强调多窗格、多组、多快捷键、多显示器心智；手机端强调底部导航、触屏 Action Sheet、软键盘避让、全屏仍可切换模块、长按/更多菜单替代右键；平板端介于两者之间，优先支持左右分屏和可拖动 sheet。
- 工具能力原则：任何进入布局系统的模块都必须具备命令面板入口、上下文菜单/长按菜单、关闭/最大化/拆分/移动/恢复、持久化、搜索或过滤、错误态和 AI 上下文导出能力。Git、终端、搜索不能只是展示面板，要逐步达到日常开发可用。
- 下一步优先级：1）继续修复搜索/Git/终端 100% 高度时底部导航丢失；2）继续解决终端软键盘输入遮挡；3）把文件/搜索/Git/终端/编辑器的 action registry 收敛到统一工具能力模型；4）补 Git stage/unstage/commit/diff 历史能力；5）补搜索替换结果窗格化与编辑器联动；6）把 VS Code/VS 的“保存布局/恢复布局/布局配置文件”理念落到 Tracevane 的 Workspace Layout Profiles。

### 10.99 移动 Dock 全屏也保留底部导航，终端按可视高度避让键盘

- 问题：上一轮已保留移动端真实全屏和底部抽屉全高的导航，但用户继续指出搜索、Git、终端等 100% 高度时底部功能导航仍可能丢失；终端软键盘输入时内容没有真正收缩到键盘上方，输入位置仍可能被遮挡。
- 本轮决策：`deriveWorkspaceLayoutMode` 将移动端 `dockImmersive` 也纳入 `mobileNavOverlay` 与 Dock quick controls 显示条件，让普通界面全屏和真实全屏一样保留模块切换入口。终端侧把 xterm 主区域行高改为 `--workspace-terminal-visual-height`，键盘弹起时使用 `calc(100% - keyboardInset)`，让 FitAddon 重新按可视区域排版；spacer 继续保留作为滚动/安全区兜底。
- 设计原则：手机端“全屏”不是把用户困在单一模块，而是最大化当前模块同时保留切换路径。终端/编辑器这类输入型模块必须优先保证输入行可见，而不是只追求面板视觉高度。
- 后续：继续把搜索、Git、文件面板的内部滚动容器也纳入同一可视高度策略，并用真实移动设备或 Playwright mobile 场景验证触摸滚动、软键盘、底部导航三者不会互相遮挡。

### 10.100 移动面板滚动安全区统一

- 问题：移动端底部导航 overlay 解决了“导航丢失”，但如果内容滚动区没有同步预留底部安全区，用户仍可能在文件、搜索、Git 或 Dockview 全屏中看到最后几行被导航遮挡。
- 本轮决策：`reserveMobileNav` 与 `mobileNavOverlay` 使用同一组移动端 overlay 条件；当 shell 标记 `data-workspace-mobile-panel-nav-reserved="true"` 时，Dockview、移动底部面板内容、资源管理器滚动区、搜索滚动区、Git 滚动区统一获得 `--workspace-mobile-nav-height` 底部 padding 与 scroll-padding。
- 设计原则：底部导航不是临时浮层，而是移动端 Workbench 的一等布局区域。任何 100% 高度或全屏模块都必须让内容可完整滚动到导航上方，不能让用户为了看最后一行而被迫关闭面板。
- 后续：继续做真机/Playwright 移动场景，验证 terminal/editor/search/git/file 五类输入或滚动场景在软键盘、全屏和底部导航同时存在时仍可操作。

### 10.101 Git 操作进入命令体系，不只停留在面板按钮

参考 VS Code/Visual Studio 的 Source Control 设计，Git 不是一个孤立页面，而是工作台命令体系、面板、右键/长按菜单、键盘快捷入口共同组成的日常工作流。Tracevane Workspace 的方向是：常用 Git 能力必须同时可从 Git 面板、命令面板、移动触摸入口和后续 AI 上下文入口触达。

本轮先把“提交已暂存更改”接入命令体系：提交仍复用 Git 面板既有输入框和 `commitFiles` API；命令只在存在已暂存文件且提交信息非空时启用；pending 状态覆盖 stage、unstage、checkout、commit，避免重复提交或竞态。后续 Git 工具继续按这个原则演进：先补齐高频闭环（diff、stage/unstage、commit、branch、history、stash、sync），再把 AI review、AI commit draft、变更解释、冲突辅助接入同一套命令和上下文模型。

### 10.102 终端生命周期管理必须进入统一命令体系

终端不是黑盒输出区，而是和编辑器、Git、搜索同级的一等工具窗口。参考 VS Code Integrated Terminal 和 Visual Studio 工具窗口理念，终端实例需要拥有完整生命周期：新建、拆分、重命名、复制输出、清屏、结束、删除记录、历史审计、移动到其它区域、后续 AI 诊断。任何一个能力都不应只藏在某个弹窗里，必须可通过命令面板、右键/长按菜单和触屏动作面板触达。

本轮把“清理已结束记录”接入 `terminal.panel.clearArchived` 命令：已结束/不可恢复记录不再只能从历史弹窗处理，命令会显示待清理数量并在无历史时禁用。这个方向是为后续终端标签响应式收缩、终端真实拆分、终端移动到编辑区域、AI 诊断和会话审计统一铺路。

### 10.103 终端标签栏采用分级收缩，而不是横向挤爆

成熟 IDE 的标签栏不是简单把所有标题横向堆满。Workspace 的终端 roster 必须在 PC、平板、手机和窄面板里保持“可切换、可管理、少遮挡”：少量终端显示常规短标题；中等数量显示更短的名称；大量终端进入图标态，通过 tooltip、右键/长按菜单和命令面板提供完整信息。

本轮实现终端标签分级收缩：`TERMINAL_COMPACT_ROSTER_THRESHOLD` 触发短标题，`TERMINAL_ICON_ONLY_ROSTER_THRESHOLD` 触发图标态；每个终端 tab 带有 `data-terminal-session-tab-*` marker 供后续视觉与自动化测试扩展。这个改动不改变终端 session 语义，只改变 roster 的空间策略，为后续“终端拆分网格、移动端底部终端栏、真实全屏中的终端切换”打底。

### 10.104 编辑器标签批量管理先保护未保存内容

Workspace 的编辑器标签管理要接近主流 IDE：用户可以快速关闭当前、关闭其它、关闭左右、复制路径、在资源管理器显示、拆分/移动到组，也要能安全清理已经不需要的已保存标签。批量动作必须优先保护未保存内容，不能为了清爽而丢失用户编辑状态。

本轮新增 `editor.tab.closeSaved`：标签右键菜单、触屏 action sheet 与命令面板都可以关闭没有 dirty 状态的标签；dirty 标签保持打开，继续由现有关闭确认流程保护。后续可在同一体系扩展“关闭已保存左侧/右侧”“固定标签”“保持打开”“移动到新窗口/组”等能力。

### 10.105 Git Diff 入口必须携带 staged/untracked 语义

Git 面板里的 Diff 不是普通“打开文件”。世界级 IDE 的 Source Control 会区分 staged、working tree、untracked、renamed/conflicted 等不同语义，并把这些语义带入编辑区差异视图、AI 解释、提交草稿和审计上下文。

本轮新增 `WorkspaceGitDiffTarget` 合同：Git 变更行和右键/长按菜单不再只传 path，而是传 `{ path, staged, untracked, kind }`。Workbench 记录该目标并激活编辑区，Editor 先显示 diff target marker。后续接入 Monaco DiffEditor / `useGitDiffQuery` 时可以直接消费该 target，避免再从路径反推来源。

### 10.106 从 VS Code / Visual Studio 吸收“布局 + 工具”双能力，而不是只做窗口外壳

新的目标校准：Workspace 要借鉴 VS Code 的 Activity Bar、Primary/Secondary Side Bar、Panel、Editor Groups、Grid Layout、Floating Windows、View/Panel 拖动与命令化移动；也借鉴 Visual Studio 的 document/tool window 停靠、标签组、保存/恢复布局和多套窗口布局。但 Tracevane 不应复刻它们的视觉，而要形成自己的 Web + AI + 文件管理器 + 知识写作 + Gateway 调试的一体化工作台。

布局升级必须和工具能力升级同步推进。资源管理器、搜索替换、Git、终端、编辑器/预览、AI 对话、知识图谱/写作/流程图都应是可组合模块：支持关闭、最大化、真实全屏、界面全屏、左右/上下拆分、移动到侧栏/底栏/编辑区、持久化恢复、命令面板入口、右键/长按菜单、触屏 action sheet、错误态、空态与 AI 上下文导出。PC 端重点是高密度、多窗格、多快捷键；手机端重点是底部导航、单手操作、软键盘避让、长按/更多菜单、全屏仍可切换模块；平板端重点是左右分屏与可拖动面板。

因此后续每个增量不能只问“布局能不能拖”，还要问“这个工具是否达到日常 IDE 使用闭环”：Git 是否能 stage/unstage/diff/commit/history/branch/stash/sync；终端是否能拆分、重命名、移动、关闭、清理历史、全屏、字体缩放和软键盘不遮挡；搜索是否能高性能递归、替换、结果分组并跳转编辑器；编辑器是否能源码/预览/实时编辑/查找替换/代码高亮/多标签管理；文件管理是否能高性能索引、批量操作、上传恢复、预览编辑与路径导航。

### 10.107 Git Diff 从“打开文件”升级为同标签页差异视图

Source Control 的 Diff 入口不能等同于普通文件打开。Git 变更项进入编辑区时，必须保留 staged、working tree、untracked 等来源语义，并在同一个文件标签页内展示差异，而不是创建第二个预览窗口或丢失上下文。

本轮新增 `WorkspaceGitDiffViewer`：通过 `useGitDiffQuery` 读取统一 diff 文本，使用只读 Monaco CodeEditor 渲染，并暴露 staged/untracked/binary/truncated marker。Diff 成为文件标签页内的一种 view mode；普通资源管理器打开文件会清空 Git diff target，避免用户切换回正常文件编辑时被旧 Diff 状态污染。后续可以在这个合同上继续升级为 Monaco DiffEditor 双栏视图、AI Diff 解释、逐块 stage/unstage、冲突辅助与提交草稿上下文。

### 10.108 Git Diff 视图开始具备工具化闭环

Diff 视图不能只是只读文本。面向日常开发和 AI 协作，用户至少要能复制 diff、复制结构化 AI 上下文、回到源码视图。后续再继续扩展成 AI 解释、逐块 stage/unstage、冲突辅助和双栏 DiffEditor。

本轮在 `WorkspaceGitDiffViewer` 顶部新增上下文工具栏：`复制 Diff` 直接复制 unified diff 文本；`AI 上下文` 输出 `@git diff`、file、scope、kind 和 diff；`查看源码` 在同一标签页切回 source 模式，不关闭标签、不创建额外窗口。这保持了“编辑/预览/Diff 都属于同一个文件标签页”的产品原则，也为 P5 的 Gateway AI 能力预留了稳定上下文格式。

### 10.109 Git Diff 工具动作进入 Workspace 命令体系

世界级 IDE 的工具动作不应该只靠某个局部按钮。随着 Workspace 支持 Dock、全屏、手机底部导航和未来浮动窗口，任何关键操作都需要命令面板作为稳定恢复路径。

本轮 `WorkspaceGitDiffViewer` 将当前 Diff 标签页的 `复制当前 Diff`、`复制当前 Git Diff AI 上下文`、`从 Diff 回到源码` 注册为 Workspace 命令，并在卸载时清理。这样即使 Git 面板关闭、Diff 工具栏被移动端布局压缩，用户仍可通过命令面板执行当前 Diff 的关键动作。这也是后续 AI 解释 diff、生成 review、逐块 stage/unstage 进入统一命令体系的前置结构。

### 10.110 Git 新建分支也必须命令化，但不能绕过输入确认

参考 VS Code Source Control 的 branch quick pick 思路，分支工作流不应该只藏在 Git 面板顶部控件里。Tracevane 的 PC 命令面板、手机命令 Sheet、后续 AI 工作流都需要能触达“新建并切换分支”。

本轮把 BranchHeader 的新建分支弹窗状态上提到 Git 面板，并注册 `git.panel.createBranch` 命令。命令本身只打开同一个新建分支对话框，不直接制造分支名或绕过用户输入；创建动作仍复用 `useCreateBranchMutation({ checkout: true })`。这样既把入口纳入统一命令体系，又保留分支名称输入、pending 禁用、成功清空草稿、失败 toast 的同一条产品链。

后续分支工作流继续补齐：最近分支、远端分支搜索、创建不切换、从指定 ref 创建、发布分支、删除/重命名分支、stash/worktree 联动，以及 AI 建议分支名。但每个动作都必须同时满足：命令入口、面板入口、触屏入口、安全确认和可测试 contract。

### 10.111 Git 历史开始进入 AI-native 命令链路

Git 历史不是装饰列表。世界级 IDE 中，近期提交、变更、分支、diff 和终端诊断都应该能成为 AI 上下文的一等输入。Tracevane 的方向是让用户可以从命令面板、Git 面板、右键/长按菜单和后续 AI 对话中稳定引用这些上下文。

本轮把 Git 面板已有的近期提交 `commits` 注册为命令：最多 5 条 `git.panel.commitContext.*`，分组为 `AI`，执行时复用当前 `formatGitCommitContext` 输出 `@git commit`、hash、subject、author、date、refs。它不做写操作，不新增后端 API，也不把历史详情散落成第二套弹窗，而是先把“提交历史 → AI 上下文”这条产品链路打通。

后续 Git history 应继续升级为：提交详情、提交 diff、按作者/路径过滤、复制 commit range、与文件标签页 diff 联动、AI 总结提交、生成 changelog，以及从历史中 cherry-pick/revert 的安全确认流。

### 10.112 Git 提交历史从列表升级为可打开的工具上下文

Git history 要成为 IDE 工具，而不是只在面板底部展示几行文本。用户需要能打开某个提交，复制其 AI 上下文，后续查看 diff、生成 changelog、解释变更、关联文件标签页和终端诊断。

本轮新增 `GitCommitDetailsPanel`：Git 面板持有 `selectedCommit`，提交行标题点击或双击整行可打开详情；右键/触屏 action sheet 新增“打开提交详情”；命令面板为近期 5 条提交同时注册“打开提交详情”和“复制提交上下文”。详情以内联面板呈现，不用 modal，保留当前 Git 面板上下文并减少移动端弹窗堆叠。

这是 Git history 工具化的中间层。下一步应在同一入口上继续补：提交 diff、文件列表、commit range、复制 changelog、AI explain commit、按路径过滤历史，以及 cherry-pick/revert 这类需要强确认的写操作。

### 10.113 近期 Git 历史成为 AI 上下文，而不是新增界面按钮

Git history 的下一步不是继续往面板上堆按钮，而是把它纳入命令面板和 AI-native 上下文系统。用户在写发布说明、总结最近变更、检查提交节奏时，需要的是结构化上下文，而不是一个额外常驻控件。

本轮新增 `formatGitRecentHistoryContext` 与 `git.panel.recentHistoryContext` 命令：输出 `@git history`、当前 branch、count，以及最多 10 条近期 commit 的 hash、short、subject、author、date、refs。命令属于 AI 场景，在没有 commits 时禁用，不做任何 Git 写操作。

这个设计延续 Tracevane 的“工具少堆叠、能力进命令体系”原则：高频操作留在面板，低频但强大的上下文动作进入命令面板/手机命令 Sheet。后续当 Gateway 接入后，这个上下文可以直接成为 AI changelog、commit review、release summary 的输入。

### 10.114 Git 提交详情接入已有后端合同，开始服务 release note 工作流

Git history 的价值不止“看到 subject”。Tracevane 后端已经有 `/api/git/commit-detail`，可以返回完整 message body 与 parents；前端应优先复用这个稳定合同，而不是自研拼接或新增重复接口。

本轮新增 `getGitCommitDetail` / `useGitCommitDetailQuery`，Git 提交详情面板在打开提交后读取 detail，展示 loading/error/body/parents，并提供 `@git release-note` 复制能力。提交上下文菜单和命令面板也新增“复制变更日志条目”，用于 release note、周报、AI changelog 等场景。

下一步应继续接入 commit diff / changed files：先研究后端输出合同、截断策略、二进制文件提示和性能预算，再把它放入同一个提交详情面板，而不是另起一套 Git 历史 UI。

### 10.115 Git 提交详情进入“审阅卡片”阶段：文件清单 + Diff 预览

本阶段继续把 Git 面板从“状态列表”推进到可审阅、可给 AI 消化的提交详情工作流。借鉴 VS Code Source Control 的核心思想：历史、变更、分支和命令行 Git 应互相补位；Tracevane 的实现不做低级堆按钮，而是把一次提交抽象成一张紧凑审阅卡片。

- 后端提交详情 payload 增加 `files`、`diff`、`binary`、`truncated`，由 Git 原生命令生成，初始提交也通过 `--root` 正确显示文件创建。
- 前端详情卡片显示提交正文、变更文件 chips、diff 行数、二进制/截断状态和可滚动 diff 预览；移动端保持小面积、可滚动，不把完整 diff editor 硬塞进侧栏。
- 变更日志复制入口加入文件摘要，后续对接 Gateway AI 时可直接生成发布说明、代码审查摘要、风险点和回滚建议。
- 设计边界：侧栏只承载“快速理解和复制上下文”，重型 diff、冲突解决、跨提交对比应进入可拆分编辑器窗格，保持 PC/手机双端都不拥挤。

### 10.116 Git 审阅卡片补齐 AI Diff Context

继续落实“IDE 工具功能也要更好”的目标：Git 历史中的一个提交不只是列表项，而应该是一张可审阅、可复制、可交给 AI 的上下文卡片。

- 提交详情新增 `@git commit-diff` 复制入口，包含提交元信息、文件清单、二进制标记、截断标记和 diff 文本。
- 命令面板同步注册近期提交的“复制提交 Diff 上下文”，让键盘流和触屏流都能访问，不把能力藏在鼠标右键里。
- UI 仍保持审阅卡片的克制：侧栏负责摘要和上下文复制，完整 diff/冲突解决后续进入可拆分编辑器组，符合 VS Code / Visual Studio 的窗口模块化理念。
- 这一步为 Gateway AI 能力预留了稳定输入格式：后续可以基于该 context 做代码审查、风险点、回滚建议、release note 和提交解释。

### 10.117 Terminal 标签管理补齐“关闭右侧”

为了让终端面板从“会话列表”迈向 VS Code / Visual Studio 风格的可管理工具窗口，本阶段补齐终端标签常见批处理动作：关闭右侧。

- 终端右键/长按菜单新增 `terminal.session.closeRight`，只结束当前标签右侧的可恢复会话。
- 命令面板新增 `terminal.panel.closeRight`，支持键盘流，不依赖鼠标右键。
- 继续复用现有 session action registry 与 command registry，保持动作定义集中，避免复制 PC/手机两套菜单逻辑。
- 后续方向：终端 tabs 应继续补“移动到组 / 真实 split pane / 关闭左侧 / pinned / AI 使用标记”，并进入可持久化 Dockview terminal group。

### 10.118 Editor 标签页补齐复制相对路径

编辑器标签管理继续向主流 IDE 靠齐：绝对路径适合定位文件，相对路径更适合命令行、文档引用、AI 上下文和跨机器协作。本阶段在不新增复杂 UI 的前提下补齐“复制相对路径”。

- 标签右键/长按菜单新增 `editor.tab.copyRelativePath`。
- 命令面板新增 `editor.tab.copyRelativePath`，键盘和触屏用户都可访问。
- 相对路径基于当前 Workspace 根目录计算，而不是靠字符串猜测；这与“默认工作区目录是打开文件夹语义，不阻止临时浏览其它目录”的原则一致。
- 后续：相对路径将作为 `@file`、`@selection`、`@terminal`、`@git` AI context 的默认轻量引用格式。

### 10.119 Search / Replace 也必须成为 AI-native 工具，而不是孤立列表

参考 VS Code / Visual Studio 的工作台理念：搜索、Git、终端、编辑器、资源管理器都应该是可组合工具窗口，同时关键能力必须能通过命令体系、触屏入口和 AI 上下文复用。Tracevane 的搜索面板已经具备跨文件搜索、索引状态、隐藏文件开关、预览替换和撤销包；下一步不是堆更多顶部按钮，而是把搜索结果变成可交给 AI 的结构化上下文。

本轮新增 `@search results` 复制能力：包含 rootId、query、大小写/正则/隐藏文件、索引是否命中、结果上限、截断状态，以及最多 20 条 top results 的路径与 snippet。它是轻量入口，不写文件、不新增依赖、不打开第二个弹窗，符合移动端“少堆叠、多命令、多上下文”的方向。

后续 Search 工具升级方向：

- 命令面板注册“复制当前搜索上下文 / 打开搜索 / 聚焦替换 / 清空结果”。
- 搜索结果右键/长按支持复制路径、复制相对路径、打开到侧边、添加到 AI 对话、在终端中 grep。
- 大仓库搜索继续走索引优先，结果分片/虚拟滚动，避免一次性渲染和复制过量上下文。
- 与 Gateway AI 打通后，`@search results` 可以生成修改计划、风险列表、批量替换预案和审查清单。

### 10.120 借鉴 VS Code / Visual Studio，但目标是 Tracevane 自己的模块化 AI Workspace

后续布局升级继续吸收 VS Code 与 Visual Studio 的优点，而不是机械复刻：

- VS Code 的优势：Activity Bar、Primary Side Bar、Panel、Editor Groups、Command Palette、tab/context menu、terminal groups、search/source-control 入口清晰。
- Visual Studio 的优势：窗口布局保存/恢复、工具窗口可停靠/浮动/自动隐藏、面向大型工程的 Solution/Properties/Output/Test 等专业工具链。
- Tracevane 的升级方向：把这些理念转成 Web-first、AI-first、PC/平板/手机都好用的模块系统。每个工具模块都应该能关闭、全屏、拆分、调整大小、持久化、进入命令面板、支持触屏长按菜单，并能提供结构化 AI 上下文。

停止标准不是“界面像某个 IDE”，而是：常用路径更短、移动端不被弹窗/悬浮控件阻塞、工具窗口可恢复、搜索/Git/终端/编辑器都有完整管理菜单和键盘/触屏双入口、AI 上下文可以从文件/选择区/搜索/Git/Diff/终端稳定生成。

### 10.121 Search 面板开始进入统一命令体系

为了让 Workspace 不再变成“每个面板一堆按钮”的低级界面，搜索/替换也必须像 Git、终端、编辑器一样注册到统一 Workspace 命令体系。这样 PC 用户可以用命令面板，手机用户可以用底部命令 Sheet，后续 AI Agent 也可以调用同一组产品动作。

本轮新增 `createSearchPanelCommands`，由搜索面板根据自身实时状态注册：聚焦搜索框、复制搜索 AI 上下文、预览跨文件替换、确认替换预览、撤销上次替换、清空搜索。搜索状态仍归搜索面板所有，Workbench 只负责合并命令，避免全局 registry 读取局部状态造成错乱。

这个方向后续要继续扩展到：搜索结果长按菜单、复制相对路径、添加到 AI 对话、在终端 grep、把搜索面板拆分到独立 Dockview 组、移动端一键进入沉浸搜索审阅，而不是继续堆固定工具栏按钮。

### 10.122 Search 结果必须可操作：右键/长按菜单先行

世界级 IDE 的搜索结果不是静态列表。用户搜索到文件后，下一步通常是复制路径、打开文件、在终端继续 grep、交给 AI 解释、批量替换或生成修改计划。本轮把搜索结果行升级为 PC 右键与触屏长按都可操作的对象。

新增 `SearchResultContextMenu`：支持打开并定位搜索、复制路径、复制相对路径、复制单条 `@search result` AI 上下文、复制终端 `rg --line-number --context 2` 命令。菜单使用视口 clamp，避免像之前移动端长菜单那样溢出屏幕底部；结果行保留单击打开文本文件，目录/非文本结果仍可通过菜单复制路径和上下文。

这一步继续贯彻“少堆按钮，多上下文菜单/命令体系”的产品原则。后续应把复制命令升级为“插入到当前终端/发送到 AI 对话/加入批量修改集”，但写操作必须保留 preview/apply/rollback。

### 10.123 Search → Terminal：从复制命令到跨模块输入桥

搜索结果与终端必须形成闭环。用户看到一个命中项后，常见下一步是在终端里继续 grep、运行脚本、查看上下文。本轮新增轻量跨模块输入桥：搜索结果菜单可以“插入 rg 到终端”，Workbench 负责打开/聚焦终端 Dock 面板，Terminal 消费一次性 input request 并写入 xterm。

关键边界：只插入命令，不自动执行。用户仍需在终端确认回车，这符合 Tracevane 所有写操作/副作用操作必须可预览、可确认的原则。事件桥使用 `tracevane:workspace-terminal-insert-input`，避免搜索模块直接依赖终端内部实现，也为后续文件树拖拽路径、Git diff grep、AI 生成命令插入终端提供统一通道。

后续升级方向：允许选择目标终端会话、插入但不换焦点、追加到 AI 对话、命令执行前预览风险、把命令结果回收为 `@terminal` 上下文。

### 10.124 Explorer → Terminal：文件树路径进入统一输入桥

VS Code 和 Visual Studio 的关键经验不是“按钮多”，而是工具窗口之间能自然传递上下文：资源管理器里的文件可以进入终端，搜索结果可以进入编辑器，Git diff 可以进入审阅窗口。Tracevane 本阶段把资源管理器也接入已建立的 Terminal 输入桥。

- 文件/目录右键菜单新增“插入路径到终端”，触屏底部操作面板新增“插入终端”。
- 复用 `tracevane:workspace-terminal-insert-input`，由 Workbench 打开/聚焦终端，由 Terminal 消费一次性 input request。
- 插入的是 shell-quoted 绝对路径和尾随空格，方便用户继续补命令；不会自动回车执行。
- 这为后续“拖文件到终端 / Git 文件变更插入路径 / AI 生成命令附带文件路径 / 多终端目标选择”提供同一条产品通道。

后续继续按模块化 IDE 方向推进：Explorer、Search、Git、Terminal、Editor 都要具备 PC 右键、手机长按/动作面板、命令面板、AI context、可组合布局和持久化状态，而不是把功能塞成一排不可维护的按钮。

### 10.125 Git 变更也进入 Terminal / AI-native 工作流

Workspace 的 Git 面板不应只是“状态列表”。在顶级 IDE 中，Source Control、编辑器、终端、搜索和 AI 审阅应该能互相传递上下文。本阶段给 Git 变更文件菜单补齐“插入路径到终端”：用户可以从某个 modified/untracked/staged 文件直接把路径送入终端，再决定运行 `git diff`、测试、脚本或其它命令。

设计边界保持克制：Git 面板不直接控制终端内部对象，只复用统一 `tracevane:workspace-terminal-insert-input` 事件桥；只插入 shell-quoted 路径，不自动执行任何 Git 命令。这样既延续 VS Code / Visual Studio 的工具协作理念，也符合 Tracevane 写操作必须由用户确认、后续可审计的原则。

后续 Git 工业化继续推进：变更文件菜单应补更多安全动作（打开 staged/working diff、复制相对路径、在资源管理器显示、丢弃预览、选择目标终端）；Git diff 详情应进入可拆分编辑器窗格；AI 能力应基于 `@git status`、`@git diff`、`@git commit-diff` 统一上下文生成解释、提交信息和风险审查。

### 10.126 Git 变更文件必须能回到 Explorer 定位

Source Control 的变更列表不是孤岛。用户从 Git 看到一个文件后，常见下一步是回到资源管理器查看相邻文件、复制路径、打开终端、上传/下载或继续管理目录。本阶段给 Git 变更菜单补齐“在资源管理器显示”，并复用 Workbench 已有的 Explorer reveal 通道。

这延续模块化工作台原则：Git 面板只表达“定位这个 path”的意图，Workbench 决定如何切换/聚焦资源管理器，Explorer 负责展开父目录与高亮目标。这样未来即便 Git、Explorer、Editor 被 dock/split/floating 到不同位置，模块之间仍通过稳定意图协议协作，而不是互相硬引用。

### 10.127 Git 变更文件支持普通打开，而不只 Diff

Git 变更列表的核心任务是帮助用户理解并处理文件变化。Diff 很重要，但不是唯一入口：用户常常需要打开文件本体继续编辑、查看上下文、搜索相邻代码或触发 Markdown/HTML 预览。本阶段给 Git 变更菜单补“打开文件”，复用 Workbench 的普通 `openFile` 通道；已删除文件禁用该动作，避免打开不存在的路径。

这一步继续完善 Source Control 与 Editor 的协作边界：Git 行默认仍可打开 Diff，菜单中可选择普通文件、在资源管理器显示、插入路径到终端、复制上下文。后续应进一步补 staged/working diff 分组、丢弃变更预览、复制相对路径和 AI patch preview/apply/rollback。

### 10.128 Git 路径语义拆分：绝对路径与相对路径都必须明确

顶级 IDE 的路径操作不能含糊。Git 变更列表里的路径天然是 repository-relative，适合提交信息、AI context、`git` 命令和文档引用；而终端拖放、外部工具、文件系统操作更常需要绝对路径。本阶段把 Git 变更菜单中的“复制路径”拆成“复制绝对路径”和“复制相对路径”。

绝对路径使用 Git status payload 的 `repositoryRoot` 拼接，而不是用 Workspace root 猜测；这样即便仓库位于打开目录的子目录、父目录或不同 root 下，路径语义也保持正确。后续 `@git diff`、`@file`、`@terminal` 上下文也应继续保留这类明确路径边界，避免 AI 或命令行收到模糊路径。

### 10.129 Git 菜单不允许溢出视口

高级 IDE 的上下文菜单必须可靠，尤其是 Git 变更列表这种高频工具。此前搜索结果菜单已经做了视口 clamp，Git 变更菜单也必须遵守同样标准：靠近右下角点击时不出屏，小窗口里不把操作项挤到看不见的位置。

本阶段为 Git change context menu 增加 `clampGitChangeMenuPosition`，并限制最大高度与内部滚动。这不是视觉装饰，而是 PC/平板/小窗口可用性的底线；后续所有浮层、长按菜单、终端/编辑器标签菜单都应进入统一浮层定位规则，避免每个模块重复踩“菜单溢出”问题。

### 10.131 VS Code / Visual Studio 借鉴后的 Workspace 窗口原则补充

研究 VS Code 与 Visual Studio 后，Tracevane Workspace 的长期方向继续保持“借鉴理念，不复刻界面”：

1. **区域职责清晰**：资源、搜索、Git、终端、编辑器、预览、AI 辅助都必须是可组合的工具/文档模块，而不是互相堆叠的临时功能块。
2. **工具窗口与文档窗口分层**：文件编辑/预览/知识文档属于 Document Well；资源管理、搜索、Git、终端、任务、AI 上下文属于 Tool Window，可停靠、浮动、折叠、全屏、恢复。
3. **菜单永不溢出视口**：PC 右键菜单必须自动 clamp 到视口内，内容过长时内部滚动；移动端使用底部 Action Sheet 或贴边抽屉，避免浏览器底部遮挡。
4. **布局可恢复**：窗口尺寸、位置、标签页、工具面板状态、终端字体/全屏模式、编辑器预览模式都应逐步纳入持久化。
5. **手机不是 PC 缩小版**：移动端优先底部导航、抽屉、可拉伸面板、长按菜单、键盘避让和触摸滚动；不能依赖 hover / 右键 / Ctrl 快捷键。
6. **终端与编辑器同等一等公民**：终端可拆分、重命名、关闭、插入路径、真实/界面全屏；编辑器标签页可右键/长按管理、拆分、复制路径、添加到对话。

本轮补齐 Git 提交历史右键菜单的视口约束，和 Git 变更菜单保持一致：右键触发位置靠近屏幕底部或右侧时不再被浏览器边界裁切。

### 10.132 编辑器标签必须成为工具链对象，而不只是文件标题

参考 VS Code / Visual Studio 的标签页与工具窗口理念后，Tracevane 的编辑器标签页应逐步成为 Workspace 的一等操作对象：

1. 标签页应支持关闭、关闭其它、关闭左/右、关闭已保存、复制路径、复制相对路径、资源管理器定位、拆分、移动到组。
2. 标签页应能把当前文件路径插入终端，形成“编辑器 → 终端”的低摩擦桥接，方便 `cat file`、`node file`、`grep file` 等命令场景。
3. 标签页应能复制 `@file` AI 上下文，后续接入 Gateway 后升级为结构化上下文，而不是让用户手动描述文件。
4. PC 端使用右键菜单；触屏端使用长按 Action Sheet；两端能力一致但交互不强行一致。
5. 这类动作必须进入命令面板，保证键盘用户、触屏用户、未来 AI Agent 都能调用同一套能力。

本轮已实现“插入路径到终端”和“复制 @file 上下文”，为 P5 AI-native Workspace 的 `@file/@terminal/@git/@search` 上下文模型打基础。

### 10.133 终端会话也必须成为 AI 上下文对象

终端不是附属黑框，而是 Workspace 的一等工具窗口。为了达到 AI IDE 的工作方式，终端会话需要具备如下产品语义：

1. 每个终端会话都有明确 session、title、cwd、status、可见输出上下文。
2. 终端菜单和命令面板都能复制 `@terminal` 上下文，后续可直接对接 Gateway 的结构化上下文协议。
3. 终端 AI 上下文与诊断上下文分离：`@terminal` 面向通用引用，diagnostic context 面向错误分析请求。
4. PC 右键菜单、移动端 Action Sheet、命令面板必须调用同一套 action/command 注册，避免分叉维护。
5. 后续 `@file + @terminal + @git + @search` 可以组合成一次 AI 任务输入，用于解释、修复、生成 patch、总结提交。

本轮已补齐终端会话菜单和命令面板的 `@terminal` 上下文复制能力。

### 10.134 `@selection` 是 AI IDE 的核心上下文单位

在 AI IDE 中，用户最常见的意图不是“解释整个项目”，而是围绕当前文件中的一段选区进行解释、重构、修复、改写或生成测试。因此 Workspace 必须把编辑器选区做成一等上下文对象：

1. Monaco 源码编辑器应持续上报当前非空选区。
2. 命令面板提供 `AI：复制当前选区上下文`，后续可升级为直接发送到 Gateway。
3. `@selection` 必须包含文件绝对路径、相对路径、起止行列和选中文本，避免 AI 上下文脱离位置。
4. 切换文件、关闭文件或无选区时必须清空上下文，避免引用旧选区。
5. 后续扩展：Markdown 预览、HTML 预览时编辑、富文本块编辑也应提供 DOM/块级选区上下文，但不能牺牲源码选区的稳定性。

本轮先完成源码 Monaco 选区链路，为 `@file + @selection + @terminal + @git + @search` 的组合上下文做基础。

### 10.135 已打开文档的 Root 归属必须稳定

Workspace 支持用户临时切换资源管理器根目录、默认工作区目录和 Git/Search 范围，但这些工具视图的切换不能破坏已经打开的文档标签。顶级 IDE 的基本语义是：文件一旦作为 editor tab 打开，它就拥有稳定的文档身份；Explorer 只是导航器，不是编辑器文件身份的唯一来源。

本轮修复把 `rootId` 从“当前资源管理器 root”拆成两层：

1. `rootId`：当前打开/激活文件所属 root，由 Workbench 在 openFile/openDiff 时传给编辑器。
2. `workspaceRootId`：当前 Explorer/Workspace root，仅作为 legacy tab 缺失 root metadata 时的 fallback。
3. `tabRootIds`：每个已打开 tab 自己的 root 归属，打开文件时写入，资源管理器之后切换目录不覆盖。

这个改动为后续“多根工作区 / Git 子仓库 / 文件管理器与 Workspace Explorer 复用但不复制 / AI context 精确路径”打基础。后续还应继续让 tab identity 从单纯 path 升级为 `{rootId, path}`，以彻底支持不同 root 下同名路径并存。

### 10.136 终端阅读密度必须可从命令体系访问

手机端终端体验不能依赖 PC 式 hover 或悬浮按钮。字体大小是终端可读性的核心设置，尤其在手机输入法、横竖屏切换、真实全屏和分屏布局中，用户需要快速调节阅读密度。本轮把终端字号缩小、放大、重置纳入 Workspace 命令体系：

1. 悬浮工具条和命令面板复用同一组字号回调，不产生两套状态。
2. 字号继续持久化，重新进入 Workspace 后保持用户上次设置。
3. 命令描述显示当前字号，用户在命令面板中也能理解当前阅读密度。
4. 后续手机端底部“终端”入口和全屏工具菜单都可以复用同一命令，而不是堆更多固定按钮。

这属于“少堆 UI，多统一命令/上下文菜单”的持续方向：功能必须完整，但入口要适合 PC 键盘、手机触屏和未来 AI Agent 调用。

### 10.137 终端全屏必须是命令，不只是按钮

用户反复反馈终端需要真正全屏、退出全屏和更顺畅的手机操作。顶级 Web IDE 不能把这类核心布局动作只藏在悬浮按钮中；它必须能从 PC 命令面板、手机底部命令入口、终端菜单和未来 AI Agent 调用。

本轮把终端全屏拆成两个明确命令：

1. `终端：界面全屏`：只在 Workspace 布局内最大化终端，保留应用导航与其它模块协作能力。
2. `终端：真实全屏`：调用浏览器 Fullscreen API，适合手机/平板沉浸式终端操作。

终端组件仍不直接拥有 Dockview 或 DOM fullscreen 权限，而是接收 Workbench 传入的回调。这保持了模块边界：Workbench 管布局，Terminal 管终端会话和输入输出。后续编辑器、文件、Git、搜索也应按同样模式把“全屏/恢复/拆分/移动”统一进命令体系。

### 10.138 编辑器视图切换必须可命令化

文件编辑、预览、分屏预览和预览时编辑属于同一个文件标签页，这是 Tracevane Workspace 已经确定的设计原则。但仅靠悬浮按钮仍不足够：手机端没有 Ctrl+F / Ctrl+Alt 这类稳定快捷键，顶部空间又非常有限，用户需要从底部命令入口或命令面板快速切换视图。

本轮把当前文件实际支持的视图模式动态注册为命令：`editor.viewMode.source`、`editor.viewMode.preview`、`editor.viewMode.split`、`editor.viewMode.visual`、`editor.viewMode.diff`。这些命令遵守三条边界：

1. 只注册当前文件可用的模式，图片、二进制、Diff 文件不会出现无意义选项。
2. 当前模式禁用，避免重复点击造成误解。
3. 切换仍写入单文件 `viewModes[path]` 和全局模式偏好，不改变“预览和编辑同属一个 tab”的架构。

后续应继续把编辑器查找/替换、字号、格式化、AI 解释选区、发送到对话等动作统一为命令 + 浮动菜单 + 长按菜单三入口，而不是继续堆顶部按钮。

### 10.139 编辑器工具动作要进入统一 Action/Command 模型

参考 VS Code 与 Visual Studio 的窗口理念后，Tracevane Workspace 的方向不是简单复制某个 IDE 的 UI，而是吸收它们的结构优势：文档区、工具区、命令入口、上下文菜单和布局控制彼此解耦。PC 可以用菜单、右键和快捷键；手机/平板则更多依赖底部入口、长按菜单、悬浮收纳按钮和命令面板。

因此编辑器里的核心工具动作必须满足：

1. 顶部不堆按钮，避免信息密度失控。
2. 悬浮工具条只保留最常用的少量动作，并可贴边折叠。
3. 命令面板必须能执行同一动作，尤其服务手机端无键盘快捷键场景。
4. 后续标签页右键/长按菜单复用同一 command registry，避免三套实现分裂。
5. AI Agent 后续也应调用同一命令语义，而不是模拟点击 UI。

本轮先把编辑器查找/替换开关、字号缩小、字号放大纳入命令体系，并让悬浮按钮复用相同事件入口。后续继续把格式化、跳转符号、查找引用、AI 解释选区、发送 `@file/@selection` 到对话、文件信息等动作接入同一 Action 模型。

### 10.140 终端会话管理必须跨 PC/触屏/全屏统一

终端是 AI IDE 的核心工作对象：它承载构建、测试、运行、Agent CLI、错误日志和上下文证据。顶级 Workspace 不能把终端管理能力绑定到单一交互方式。PC 用户可以右键终端标签；手机用户没有鼠标，真实全屏时底部导航也可能收起；AI Agent 后续还需要以命令语义调用终端操作。

因此终端会话管理必须遵循：

1. 所有操作来自同一 action registry：新建、关闭其它、关闭右侧、重命名、拆分、清屏、复制输出、复制 `@terminal`、结束、删除、复制/插入 cwd。
2. PC 右键菜单、触屏 action sheet、命令面板、悬浮工具条只是不同行为入口，不复制业务实现。
3. 全屏模式下仍可打开操作菜单，避免用户进入沉浸终端后无法管理会话。
4. 悬浮工具条保持可折叠，新增入口也必须服务“减少固定按钮堆叠”的方向。

本轮新增 `terminal.panel.openActions` 命令与终端悬浮菜单的“会话操作”按钮，让手机和全屏状态也能调出完整终端管理能力。后续应继续让编辑器标签、文件树、Git 变更项也采用同样的 action registry 模式。

### 10.141 Git 变更项必须成为一等可命令对象

Source Control 不只是一个列表，它是 AI IDE 里最关键的“变更上下文索引”。用户经常围绕某个文件做 Diff 审阅、暂存/取消暂存、复制路径、插入到终端、解释 Diff、生成提交信息或让 AI 风险分析。因此 Git 变更项必须和终端会话、编辑器标签一样，进入统一 action/command 模型。

本轮确立 Git 变更项交互原则：

1. 当前 active change 是明确状态，不依赖 hover 或鼠标存在。
2. PC 右键、行内更多、手机 action sheet、命令面板都打开同一 `createGitChangeActions`。
3. 命令面板提供 `Git：打开当前变更操作菜单`，让触屏和键盘用户不必精确点中小按钮。
4. active change 视觉上要可识别，后续可作为 `@git change` AI context 的默认对象。
5. 不把 stage/unstage/open/copy/explain 分散写在多个 UI 分支里，避免长期维护分裂。

后续应继续把 commit row、branch row、conflict row 也升级为一等 action object，并把 `@git status / @git diff / @git commit` 与 Tracevane Gateway 的 preview/apply/rollback 写操作链路连接。

### 10.142 Git 提交历史必须成为 AI-native 时间线对象

Git 历史不是附属信息，而是项目知识库的一部分。一个世界级 AI IDE 应该能围绕某个提交生成解释、变更日志、风险提示、回滚说明、关联文件摘要和知识库条目。因此 commit row 必须像文件、终端会话、Git 变更项一样成为一等 action object。

本轮确立提交历史交互原则：

1. 当前 active commit 是明确状态，用户通过点击详情、右键或更多菜单即可选中。
2. PC 右键、行内更多、手机 action sheet、命令面板都复用 `createGitCommitActions`。
3. 命令面板提供 `Git：打开当前提交操作菜单`，让键盘/触屏用户可以管理当前提交。
4. active commit 后续可作为 `@git commit`、`@git commit-diff`、`@git release-note` 的默认 AI context。
5. 历史列表保持可扫描，不在每一行堆满固定按钮。

后续应把分支、stash、冲突文件、远端同步状态也纳入同样的 action registry，并最终接入 Tracevane Gateway 的 preview/apply/rollback 写操作链路。

### 10.143 移动端底部导航要成为触屏布局控制器，而不是简单页面切换

参考 VS Code 的 Activity Bar / Side Bar / Panel / Editor Group，以及 Visual Studio 的工具窗口/文档窗口/布局保存能力，Tracevane 移动端不能把文件、搜索、Git 简化成“弹窗页面”。手机没有鼠标右键，所以底部导航必须承载 PC 上右键菜单和布局控制的一部分能力：

- 单击：打开/切换模块，或返回编辑器/终端。
- 长按：打开触屏动作菜单，提供打开底部面板、停靠到工作区、半屏查看、拉到顶部全屏、关闭当前面板。
- 全屏：文件/搜索/Git/终端/编辑器即便占用 100% 高度，也必须保留可触达的底部导航或等价 overlay，避免用户被锁死在单一窗口。
- 持久化：半屏/全屏高度变更沿用 Workspace panel-size storage，用户下次进入应恢复偏好。
- 美学：菜单必须少而准，避免把 PC 端所有按钮平铺到手机顶部，优先把低频动作收到长按菜单或命令面板。

本节不要求复刻 VS Code 或 Visual Studio，而是继承它们“视图是一等布局对象、布局可保存、动作可命令化”的优点，并补足触屏端的直接操作入口。

### 10.144 终端是移动端一等交互面板，软键盘必须驱动真实重排

Workspace 终端不能只在 PC 上可用。手机端用户打开输入法时，底部输入行必须保持可见，并且终端字体、滚动、会话操作、全屏/半屏状态都要可控。实现原则：

- 软键盘出现后，不只添加 spacer；必须基于 VisualViewport / VirtualKeyboard occlusion 收缩终端可视区域，并对 xterm FitAddon 重新 `fit()`。
- fit/reveal 需要在短时间内重复执行，兼容移动浏览器键盘动画和 viewport 事件延迟。
- 终端会话操作必须同时能从标签右键、触屏 action sheet、悬浮菜单和命令面板打开，避免某一种输入设备不可用时卡死。
- 手机端全屏终端仍应保留底部导航或等价入口；未来所有模块都应遵循同样的“全屏但不失联”设计。

### 10.145 Git 分支必须成为一等可操作对象

顶级 IDE 的源代码管理不是一个“分支 select + 提交按钮”。Tracevane Workspace 的 Git 面板需要把分支、变更、提交都建模为可命令、可触屏、可 AI 上下文化的一等对象：

- 当前分支拥有自己的操作菜单：切换、从此分支新建、复制分支名、复制分支上下文、AI 解释。
- PC 可通过按钮/命令面板操作；手机可通过 action sheet 操作，避免依赖鼠标右键。
- checkout 继续走确认对话框，dirty worktree 和冲突状态必须明确提示。
- `@git branch` 上下文是未来 Gateway AI 分支解释、发布节奏总结、变更风险判断的入口。

这让 Git 面板从“显示状态”向“可管理源控工作台”推进，并和变更文件、提交历史的 action-object 模型保持一致。

### 10.146 Git 从指定分支新建必须是语义真实操作

Git 面板里的“从此分支新建”不能只是把新分支名称预填成 `xxx-work`。在 Git 语义中，新分支的 start point 决定了它从哪个提交开始；如果用户在 `release` 分支上打开 `main` 的操作菜单并选择“从此分支新建”，Tracevane 必须把 `main` 作为真实 `from` 传给 API，而不是静默从当前 HEAD 创建。

本轮把分支创建对话框升级为带来源上下文的流程：

1. 普通“新建分支”清空来源，仍从当前 HEAD 创建。
2. 分支菜单“从此分支新建”记录 `branchCreateFrom`，提交时传递 `from`。
3. 对话框展示“将从 X 创建并切换到新分支”，避免误操作。
4. 关闭或成功后清理来源状态，避免下一次普通新建误用旧 start point。

这延续了 Workspace 的一等对象原则：文件、终端会话、编辑器标签、Git 变更、提交和分支都必须拥有可验证的 action 语义，而不是只做 UI 表象。

### 10.147 VS Code / Visual Studio 只提供布局原则，不成为复刻对象

Tracevane Workspace 后续布局升级要持续参考 VS Code 与 Visual Studio，但目标不是复制它们的外观，而是吸收成熟 IDE 的结构优势并服务 Tracevane 的 AI/知识/移动端场景：

1. **Activity / Side / Panel / Editor Group 分层**：文件、搜索、Git、终端、AI 对话、知识图谱都应是可移动的 view，而不是写死在某个弹窗里。
2. **Tool Window 与 Document Window 分离**：文件树、源控、搜索、终端是工具窗口；代码、Markdown、HTML、图片/视频/文档预览是文档窗口。二者都支持全屏、拆分、停靠和恢复。
3. **布局可保存和恢复**：PC、平板、手机各自记录布局偏好；用户离开再回来不应被重置。
4. **命令优先**：所有核心动作先定义为 command/action，再挂到右键菜单、长按菜单、命令面板、悬浮工具条或快捷键，避免 UI 实现分叉。
5. **移动端不是缩小版 PC**：底部导航、长按菜单、贴边折叠浮层、软键盘避让和触屏滚动是手机端的一等设计，不依赖 hover/右键。
6. **AI-native 扩展**：每个对象都应能形成 `@file`、`@selection`、`@terminal`、`@git diff`、`@git commit`、`@git branch` 等上下文，后续接入 Gateway 的 preview/apply/rollback。

因此后续实现顺序应继续围绕“模块化布局控制器 + action registry + 响应式触屏语义 + 持久化状态”推进，而不是在顶部继续堆按钮。

### 10.148 编辑器标签菜单要帮助用户形成 IDE 肌肉记忆

文档标签是 Workspace 里最常使用的对象之一。参考 VS Code 与 Visual Studio 后，Tracevane 不应只提供“能点”的菜单，还要让菜单成为用户学习命令体系的入口：关闭、关闭全部、关闭已保存、拆分编辑器、复制路径等动作应显示快捷键提示，并通过同一个 action registry 同步给 PC 右键菜单、手机长按 action sheet、命令面板和未来 AI Agent。

本轮补齐标签动作的快捷键元数据：

1. `EditorTabAction` 增加 `shortcut`，动作语义集中在 registry。
2. 菜单按钮显示 `<kbd>`，PC 用户可以逐步形成快捷操作记忆。
3. 同时写入 `aria-keyshortcuts`，避免只做视觉提示。
4. 手机端 action sheet 复用同一 metadata，但仍保持触屏大按钮和安全区滚动。

这不是简单复刻 VS Code 菜单，而是把“命令优先、菜单只是入口”的原则继续落到编辑器标签页。

### 10.149 终端会话菜单要和编辑器标签共享可学习命令语言

终端是 Workspace 的第二个核心文档区：它不仅显示输出，还承载构建、测试、运行、Agent CLI、诊断和上下文证据。参考 VS Code 的 Integrated Terminal 与 Visual Studio 的工具窗口理念，终端会话不应只是一个黑盒输出面板，而应像编辑器标签一样拥有可学习、可命令、可触屏的操作菜单。

本轮将终端会话动作补齐快捷键元数据：

1. `TerminalSessionAction` 增加 `shortcut` 字段，动作 registry 成为唯一来源。
2. PC 右键菜单和手机 action sheet 都显示 `<kbd>`，减少双端体验割裂。
3. 写入 `aria-keyshortcuts`，让可访问性语义与视觉提示一致。
4. 高频操作包括新建终端、重命名、拆分、清屏、复制输出、结束会话等。

后续终端真实快捷键绑定、命令面板、AI Agent 调用都应继续复用这一 action registry；不要把快捷键、菜单文案和实际操作拆成多套实现。

### 10.150 Git 菜单必须加入统一 Workspace 操作语言

Git 面板是 Workspace 进入日常开发闭环的关键工具，不能只是一组“能点击”的列表。为了达到世界级 IDE 的可学习性，Git 变更、提交和分支都应和编辑器标签、终端会话一样，使用统一 action registry 暴露动作、快捷键提示、可访问性语义和未来 AI 上下文入口。

本轮将 Git 三类对象补齐快捷键元数据：

1. **变更项**：打开 Diff、打开文件、暂存/取消暂存、复制路径、复制相对路径。
2. **提交项**：打开详情、复制提交 ID、复制提交信息、复制提交上下文。
3. **分支项**：切换到此分支、从此分支新建、复制分支名。
4. PC 右键菜单与手机 action sheet 都显示 `<kbd>`，并写入 `aria-keyshortcuts`。
5. 这些快捷键当前先作为可发现的 metadata；后续真实快捷键绑定、命令面板、AI Agent 调用应继续复用同一 registry。

这一步让 Workspace 的文件、编辑器、终端、Git 开始形成同一种产品语言：对象是一等对象，动作来自 registry，入口可按 PC/手机/AI 场景变化，但业务语义不分裂。


### 10.151 Git 远端同步入口必须先安全再完整

对齐 VS Code Source Control 的“同步变更”理念，但 Tracevane 当前阶段不能把复杂远端管理一次性堆到面板顶部。本轮策略是：

- `pull`、`push`、`sync` 是 Git 面板命令对象，也可以在 quick actions 中按 ahead/behind/upstream 条件出现。
- `pull` 只允许 fast-forward：在冲突视图、merge editor、stash/rollback 体验未完成前，不允许 UI 静默制造 merge commit。
- `sync` 明确定义为先 `pull --ff-only` 再 `push`，失败即停止并把错误交给 toast/后续诊断。
- 未设置 upstream 时禁用入口，后续再补“发布分支 / 设置上游 / 远端管理”工作流。
- 这类能力必须保持命令面板可达，避免 PC/手机 UI 顶部继续堆按钮。

验收标记：Git 面板存在 `data-workspace-git-pull`、`data-workspace-git-push`、`data-workspace-git-sync`；命令注册存在 `git.panel.pull`、`git.panel.push`、`git.panel.sync`；后端 pull 使用 `--ff-only`。


### 10.152 Git 发布分支补齐无 upstream 的工作流断点

Git 远端同步入口不能只在已有 upstream 的仓库里可用。新分支的常见路径是：创建分支 → 提交 → 发布分支并建立 upstream → 后续同步。Tracevane 本轮把“发布当前分支”纳入同一 Git 命令体系：

- 无 upstream 且当前 branch 有效时，quick actions 和命令面板提供“发布”。
- 发布默认 `origin/current-branch`，使用 `git push --set-upstream origin <branch>`。
- 已有 upstream 时禁用发布，避免用户重复建立 tracking。
- 未来远端管理器再支持 remote 选择、上游重设、远端分支删除、发布到 fork 等高级流程。

这让 Git 面板从“只能看状态/提交”继续向“日常分支协作可用”推进，同时不把复杂远端管理一次性堆到当前 UI。


### 10.153 Git Stash 作为任务切换安全阀

世界级 IDE 的 Git 面板不能只支持提交与同步；用户在 AI 辅助开发中经常需要临时切换任务、切换分支、保留半成品修改。Tracevane 的 stash 设计原则：

- 保存 stash 是一等 quick action，默认包含未跟踪文件，避免临时文件丢失。
- 最近 stash 直接在 Git 面板可见，提供应用、弹出、删除三个基础动作。
- `apply` 与 `pop` 明确区分：前者保留 stash，后者恢复后移除。
- `drop` 是破坏性动作，后续应加确认/撤销提示；当前最小闭环先保留清晰按钮和测试标记。
- 后续版本再做 stash diff、从 stash 建分支、AI 解释 stash、stash 命名编辑等高级能力。

验收标记：`data-workspace-git-stash-save`、`data-workspace-git-stash-panel`、`data-workspace-git-stash-apply/pop/drop` 存在；后端只接受 `stash@{n}` 引用。


### 10.154 Git 冲突必须成为可操作对象，而不是红色数字

冲突状态是 Git 工业化体验的重要分水岭。Tracevane 的第一阶段处理策略：

- 冲突文件在变更列表顶部单独成组，用户不需要在普通变更里查找。
- 每个冲突文件可直接打开 diff、插入路径到终端、打开更多操作菜单。
- 面板提供 `@git conflicts` AI 上下文复制入口，后续可直接接 Gateway 做冲突解释、解决步骤建议、风险提示。
- 当前阶段不内置完整 merge editor，但为后续 Monaco conflict/merge view 留出明确入口。

验收标记：`data-workspace-git-conflict-panel`、`data-workspace-git-conflict-row`、`data-workspace-git-conflict-copy-context`、`formatGitConflictContext`。

### 10.155 Git Stash 删除必须进入确认闭环

`git stash drop` 不是普通列表操作，而是会移除一个临时工作快照的破坏性 Git 动作。Tracevane 本轮把 Stash 删除从“一键直接执行”改为“请求删除 → 确认对话框 → 后端 drop”的闭环：

- Stash 卡片上的删除按钮只负责选择目标，不直接调用 mutation。
- 确认对话框显示 `stash@{n}` 和摘要，降低误删其它 stash 的概率。
- 对话框明确提示当前没有一键撤销，后续再扩展 stash diff、从 stash 新建分支、导出/恢复中心。
- 保持移动端可触达：确认弹窗复用现有 Dialog，避免在长右键菜单里隐藏破坏性动作。

验收标记：存在 `GitStashDropConfirmDialog`、`data-workspace-git-stash-drop-dialog`、`data-workspace-git-stash-drop-target`、`data-workspace-git-stash-drop-confirm`；`data-workspace-git-stash-drop` 不直接绑定后端删除，而是打开确认目标。


### 10.156 VS Code / Visual Studio 布局理念吸收，不做外观复刻

后续 Workspace 布局演进要继续吸收成熟 IDE 的共性，而不是复刻某一个截图：

- **区域模型**：借鉴 VS Code Primary Side Bar / Secondary Side Bar / Panel / Editor Grid，Tracevane 需要把文件、搜索、Git、终端、AI 对话、预览、知识图谱都抽象成可移动 View/Panel，而不是固定弹窗。
- **工具窗口与文档窗口分层**：借鉴 Visual Studio tool windows 与 document windows 的区分。文件、Git、搜索属于工具窗口；源码、Markdown、HTML、图片/视频预览、终端编辑器化实例属于文档/工作窗口。
- **可持久布局**：窗口位置、尺寸、折叠、全屏、分组、最近活动必须跨会话保留；支持恢复默认布局和命名布局预设。
- **多形态布局**：PC 侧重拖拽/分割/浮动/右键菜单；手机和平板侧重底部导航、抽屉/半屏/全屏可拉伸、长按菜单、软键盘避让、触摸滚动。
- **标签与窗口管理**：文件标签、终端标签、预览标签必须支持关闭其它、关闭右侧、固定、移动到分组、复制路径/相对路径、在资源管理器显示、添加到对话等高级菜单。
- **面板最大化与真实全屏**：任何模块都应支持区域最大化、真实全屏、退出全屏，并且全屏时仍可调出模块切换入口。

短期实现顺序仍保持小步可验证：先补齐 Git/终端/编辑器菜单与移动交互，再抽象 View Registry 和 Layout Store，最后支持拖拽分组、浮动窗口、命名布局。

### 10.157 终端标签关闭必须区分“结束进程”和“删除记录”

终端在世界级 IDE 里不是一个黑色输出框，而是一组可管理实例。Tracevane 后端已经区分“结束活跃 PTY”和“删除持久记录”，所以前端交互也必须把用户意图做完整：

- “结束会话”只停止活跃终端，保留历史证据。
- “关闭并删除终端”对活跃终端先执行 end，再删除持久记录，避免已结束标签或历史占位长期残留。
- “删除记录”用于不可恢复/已结束记录，直接清理持久层。
- 命令面板和终端标签菜单都要使用同一套语义，避免 PC 右键、手机长按、命令面板出现不一致。

验收标记：`handleDeleteSession` 中存在 `deletePersistedSession`；活跃 session 删除路径先调用 `endSession.mutate`，成功后调用 `deletePersistedSession()`；终端菜单显示 `关闭并删除终端`，命令面板显示 `终端：关闭并删除当前会话`。

### 10.158 编辑器标签菜单继续补齐高频文件定位动作

编辑器标签是 Workspace 的核心文档管理入口。当前标签菜单已经具备关闭、关闭其它、关闭左右、复制路径、复制相对路径、在资源管理器显示、插入终端、复制 AI 上下文、拆分/移动预留。本轮继续补一个小但高频的文件定位动作：复制文件名。

- `复制文件名` 适用于聊天、搜索、提交信息、任务记录等不需要完整路径的场景。
- 入口进入 PC 右键菜单、手机/平板长按 action sheet、命令面板三处，保证多端一致。
- 保持复用现有 clipboard/toast/菜单组件，不引入新依赖。
- 这类小能力必须继续遵循“标签管理集中治理”，不要散落在编辑器正文工具栏里堆按钮。

验收标记：`editor.tab.copyFileName`、`copyFileName`、`copyTabFileName`、`编辑器：复制当前文件名`、`复制文件名`。

### 10.159 文件树上下文菜单补齐复制文件名

Workspace Explorer 是代码、文档、终端和 AI 上下文之间的基础导航入口。文件树上下文菜单已经具备复制路径、复制相对路径、插入终端、属性、预览/编辑等能力，本轮补齐轻量但高频的“复制文件名”：

- 文件名复制用于提交信息、搜索、聊天、任务描述等不需要路径的场景。
- 入口放在文件/目录目标菜单里，与复制相对路径、复制绝对路径同组。
- 由 `WorkspaceExplorer` 执行 clipboard/toast，`FileActionsMenu` 仅保持展示与动作分发，避免菜单组件承载业务副作用。
- 后续同一动作可复用到独立文件管理器域，保持 Workspace Explorer 与系统级文件管理器能力共享但不复制代码。

验收标记：`onCopyNameRequest`、`copyName`、`复制文件名`、`已复制文件名`。

### 10.160 文件树成为 AI-native @file 上下文入口

Workspace Explorer 不只是文件列表，也应该是 AI 工作流的上下文来源。用户在文件树里看到任何文件或目录，都应该可以一键复制为稳定的 `@file` 上下文，再粘贴到 AI 对话、终端提示词、任务记录或提交说明中。

- 文件树菜单新增 `复制 @file 上下文`，与复制文件名、复制相对路径、复制绝对路径、插入终端保持同一组信息流动作。
- 生成上下文必须包含绝对路径与相对路径，避免 AI 侧只拿到裸文件名后失去定位能力。
- 菜单组件只分发动作，Explorer 负责生成业务上下文和 clipboard/toast 副作用。
- 后续接入 Gateway AI 时，这个格式可以升级为直接“添加到对话/上下文包”，但当前先保持可复制、可验证、低耦合。

验收标记：`onCopyAiFileContextRequest`、`formatExplorerFileAiContext`、`复制 @file 上下文`、`已复制 @file 上下文`。

### 10.161 手机端文件/搜索/Git 面板必须覆盖终端全屏

手机端的工作台不能因为终端 100% 高度、区域最大化或真实全屏而失去其它工具入口。终端是一个强能力面板，但不是阻断整个 Workspace 的唯一窗口。

- 当终端处于最大化或浏览器全屏时，底部导航打开的文件、搜索、Git 面板必须显示在终端前面。
- 面板拉到顶部时仍保留底部导航安全区，用户可以继续切换文件、搜索、Git、编辑、终端。
- 层级提升只在终端沉浸态触发，普通移动工作台不永久提高面板 z-index，避免浮层体系混乱。
- 这是长期“任何模块可全屏、可组合、可恢复”的最小可验证一步；后续继续抽象 View Registry、Layout Store、手机拖拽手势和命名布局。

验收标记：`mobileSidePanelOverTerminal`、`overTerminal`、`data-workspace-mobile-panel-over-terminal`、`z-[110]`、`z-[120]`。

### 10.162 Git 面板快捷区进入“主操作 + 更多菜单”模式

Git 面板的第一屏应该服务于“理解状态并执行下一步”，而不是把所有功能按钮堆成工具条。Tracevane 的 Git 面板后续遵循以下模式：

- 主行只保留摘要、暂存、发布/同步、AI 上下文和更多菜单；用户一眼看到当前变更数、stash 数、远端 ahead/behind。
- 更多菜单承载拉取、推送、取消暂存、stash、复制分支等低频但必要能力，PC 和手机都能触达。
- 新分支无 upstream 时主按钮是“发布”；已有 upstream 时主按钮是“同步”，让最常见 Git 下一步更明确。
- 变更列表、冲突、stash、历史仍是内容主体，快捷区不能挤压可滚动内容。

验收标记：`data-workspace-git-quick-actions-density="compact-menu-v1"`、`data-workspace-git-quick-primary`、`data-workspace-git-primary-remote-action`、`data-workspace-git-quick-menu`、`GitQuickMenuButton`。

### 10.163 Git 触屏操作面板必须统一且可滚动

手机端没有鼠标右键，Git 的分支、提交、变更操作必须以可靠的触屏 sheet 形式存在，并且不能因为操作项过多导致底部溢出不可点击。

- 分支、提交、变更 action sheet 使用统一的 `GitTouchActionSheetShell`，保证遮罩、关闭、标题、安全高度、滚动行为一致。
- 操作按钮使用统一的 `GitTouchSheetActionButton`，保留各类 action 的 data marker，便于测试、遥测和后续自动化。
- sheet 高度接近全屏但预留安全边距，内容区独立滚动并包含 safe-area bottom。
- Git 快捷更多菜单也必须有最大高度和滚动，避免手机端长菜单被浏览器底部截断。

验收标记：`GitTouchActionSheetShell`、`GitTouchSheetActionButton`、`data-workspace-git-touch-action-sheet-scrollport`、`data-workspace-git-sheet-scrollport`、`data-workspace-git-quick-menu-scrollport`。

### 10.164 Git 变更列表必须支持多选与批量操作

Git 面板要达到日常开发可用，不能只支持单文件 stage/unstage。用户经常需要从一批修改中挑选部分文件组成一个提交，因此变更列表必须具备批量选择能力。

- 变更行提供轻量选择控件，手机端和 PC 端都可直接操作。
- 支持 Ctrl/Meta 多选、Shift 范围选择、点击行单选，符合主流 IDE 和文件管理器心智。
- 选中后显示选择工具条，提供暂存选中、取消暂存选中、清除选择。
- 批量操作复用已有 Git 批量 mutation，不新增后端复杂度。

验收标记：`selectedChangePaths`、`toggleGitChangeSelected`、`GitChangeSelectionToolbar`、`data-workspace-git-selection-toolbar`、`data-workspace-git-stage-selected`、`data-workspace-git-unstage-selected`。

### 10.166 Git 分组批量选择与触屏友好提交拆分

为了让 Git 面板在 PC 与手机上都达到一流 IDE 的操作效率，变更列表不能只依赖逐行复选或右键菜单。分组标题需要成为轻量批处理控制点：用户可以一键选择“已暂存的更改 / 更改 / 未跟踪”当前分组，也可以只清除当前分组选择，而不会误清空其它分组的上下文选择。

设计原则：
- **低信息密度但高效率**：分组头只保留三态选择、标题、总数和已选计数，不堆积大按钮。
- **跨端一致**：PC 端继续支持 Ctrl/Shift 多选；手机端通过分组选择减少长列表点选成本。
- **不破坏批量工具栏**：分组选择只是选择入口，真正的暂存/取消暂存仍由统一选择工具栏承接，避免功能分叉。
- **可组合选择**：选择一个分组不会清空其它分组，适合提交拆分和跨组选择；清除只作用于当前分组。

验收标记：`selectGitChangeGroup`、`clearGitChangeGroupSelection`、`data-workspace-git-change-group-select`、`data-workspace-git-change-group-selected`、`data-workspace-git-change-group-selected-count`。

### 10.167 Goal 校正：已关闭文件管理器 A-F，当前只推进 Workspace Ultimate Web IDE

当前目标不再混合已经关闭的“文件管理器与 Workspace 文档工作台 A-F 收尾 Goal”。该旧 Goal 已在 2026-06-27 完成关闭记录，后续不得把其已完成清单重复放入当前待办。新的 Workspace Ultimate Web IDE 阶段目标只追踪以下仍需持续推进的方向：

已完成并从当前待办移出的阶段性事项：
- 独立文件管理器 A-F 收尾清单与关闭记录。
- Workspace 文件打开、Monaco 基线、同一文件上下文内源码/预览/分屏/预览时编辑的阶段性主链路。
- 上传系统、内容索引管理、文件预览编辑弹窗的阶段性交付边界。
- Git 面板已经完成的阶段项：紧凑主操作+更多菜单、触屏 action sheet 统一滚动、多选批量 stage/unstage、分组批量选择。
- 终端会话关闭/删除语义、编辑器/文件树复制文件名与 `@file` 上下文入口。

当前 Goal 仍追踪的未完成方向：
- PC/手机双端整体 UI/UX 继续打磨：顶部栏信息密度、底部导航语义、触屏手势、软键盘避让、滚动和安全区。
- 模块化窗格布局：文件、搜索、Git、终端、编辑器、预览可组合、可全屏、可退出、可恢复；后续抽象 View Registry / Layout Store。
- 终端、编辑器、Git、搜索标签/面板菜单继续完善：右键/长按、关闭其它、移动到分组、复制路径、添加到 AI 上下文。
- Git 管理继续增强：更完整的分支、stash、冲突、历史、图谱和 AI 辅助操作，但不把完整专业 Git 客户端作为本阶段完成前置条件。
- 智能 IDE 能力：逐步把文件树、Git diff、终端、搜索、编辑器上下文接入 Gateway/AI 工作流。

当前 Goal 的停止条件：上述阶段性工作完成并通过系统测试、typecheck、build、diff check；剩余事项只属于 Office/PSD/完整插件生态、完整思源级块编辑器、独立专业 Git 客户端、跨设备上传续传、全局后台任务中心或包体终极优化等后续增强时，才标记完成。

### 10.168 移动端终端沉浸态不能吞掉文件/搜索/Git 面板

终端最大化或真实全屏时，用户仍然需要通过底部导航打开文件、搜索、Git。移动端没有鼠标，也不能要求用户先退出终端全屏再切工具面板。当前布局的正确方向是：终端可以沉浸，但底部导航调出的工具面板必须覆盖在终端之上，并保留导航安全区。

实现约束：
- 保留 Dockview 最大化时隐藏非 Dockview 节点的通用规则。
- 对 `data-workspace-mobile-panel-over-terminal="true"` 的移动工具面板添加例外，避免被 `.workspace-dock-maximized > :not(.tracevane-dockview)` 隐藏。
- 只在终端最大化/浏览器全屏且用户打开移动侧面板时触发该层级，不让普通移动面板永久成为最高层。
- 面板拉到 100% 高度时仍不能吞掉底部导航，保持文件/搜索/Git/编辑/终端可切换。

验收标记：`workspace-mobile-panel-over-terminal`、`data-workspace-mobile-panel-over-terminal="true"`、`.workspace-dock-maximized > [data-workspace-mobile-panel-over-terminal="true"]`。

### 10.169 移动底部导航区分“主按钮切换”和“菜单显式打开”

手机端没有鼠标，底部导航必须让用户用最少动作完成打开、切换和关闭：

- 底部主按钮采用 toggle 语义：当前文件/搜索/Git 已打开时，再次点击对应按钮应收起；终端按钮已打开时显示“收起”。
- 长按/更多操作菜单采用显式语义：`打开底部面板`、`半屏查看`、`拉到顶部全屏` 必须始终打开目标面板并设置高度，不允许因为目标已经打开而反向关闭。
- 这一区分符合触屏心智：主按钮负责快速切换，菜单按钮负责精确动作。
- 后续扩展到更多模块时，禁止把菜单显式动作复用 toggle 函数，避免“点打开却关闭”的反直觉行为。

验收标记：`onShowSide={showSidePanel}`、`onShowSide(panel)`、`[closeActionMenu, onShowSide]`、`[closeActionMenu, onSetMobilePanelHeight, onShowSide]`。

### 10.170 项目级导航移动端使用底部 Sheet，PC 保持顶栏浮层

Workspace 需要能跳出到文件管理器、模型网关、平台、Agent 会话等 Tracevane 功能域，但它不能和工作区内部的“文件 / 搜索 / Git / 编辑 / 终端”底部导航混为一谈。

设计规则：
- PC：项目级导航保持顶栏下拉菜单，符合桌面 IDE 顶部产品/项目菜单心智。
- 手机：项目级导航从顶部小浮层升级为底部 sheet，固定在 Workspace 底部导航安全区上方，避免拇指操作困难和顶部挤压。
- 菜单内容必须独立滚动，支持外部点击、Escape 和显式关闭按钮。
- 不把全局产品域入口塞进底部五大按钮；底部五大按钮只服务 Workspace 内部工具切换。

验收标记：`data-workspace-project-navigation-mobile-sheet`、`data-workspace-project-navigation-close`、`data-workspace-project-navigation-scrollport`、`bottom-[calc(var(--workspace-mobile-nav-height,0px)+0.75rem)]`、`sm:absolute sm:bottom-auto sm:left-2 sm:top-9`。

### 10.171 移动底部导航按钮必须有稳定标记和明确开关语义

移动端的文件、搜索、Git、编辑/命令、终端是 Workspace 的核心触摸入口。它们不只是视觉按钮，也必须成为测试、遥测、自动化和后续插件化布局的稳定锚点。

设计规则：
- 每个底部按钮必须通过 `data-workspace-mobile-nav-button` 暴露稳定取值：`explorer`、`search`、`git`、`editor-command-or-focus`、`terminal`。
- 文件/搜索/Git 当前打开时，title 应明确提示“收起”，未打开时提示“打开”，并保留“长按打开操作菜单”。
- 终端按钮当前打开时显示/提示“收起终端”，未打开时提示“打开终端”。
- 不依赖中文 label 作为唯一行为识别，因为 label 可能为了美学或空间密度继续调整。

验收标记：`dataAttr="explorer"`、`dataAttr="search"`、`dataAttr="git"`、`dataAttr="terminal"`、`收起资源管理器，长按打开操作菜单`、`titleOverride={terminalOpen ? "收起终端" : "打开终端"}`。

### 10.173 PC 侧边面板宽度拖拽必须无上限且高性能

Workspace 的 PC 侧边面板是资源管理、搜索和 Git 的常驻工作区入口。它不能像普通后台表单那样只给一个固定宽度，也不能为了实现简单而设置人为最大宽度；超宽屏、多文件树、长路径、Git 多仓视图都需要用户自己决定宽度。

本轮将已完成事项从待办中移出，并把当前阶段收敛到一个可验证缺口：侧边面板宽度拖拽保留最小可用宽度，但不设置最大宽度；拖拽过程按 `requestAnimationFrame` 合并 pointermove，减少高频状态更新；结束时处理 `pointerup/pointercancel`，恢复 `cursor/userSelect/touchAction`，避免拖拽残留影响后续交互。

验收标记：`SIDE_PANEL_DRAG_UPDATE_THRESHOLD`、`data-workspace-side-panel-resize-mode="raf-no-max"`、`data-workspace-side-panel-width`、`pointercancel` 清理、`touchAction = "none"` 临时锁定，以及系统测试继续禁止出现 `MAX_SIDE_PANEL_WIDTH`。
