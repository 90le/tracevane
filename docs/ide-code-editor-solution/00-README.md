# React 项目代码编辑器与 IDE 能力建设方案

## 文档目的

本文档包用于评估并拆解在现有 React 项目中增加代码编辑与 IDE 能力的完整方案。

重点不是重新发明 UI 配色或规定某个固定页面长什么样；视觉必须服从 `theme.css`、`docs/界面设计守则.md`、`DESIGN.md` 和本文档包的主题约束。本文主要定义：

- 文件管理器里的在线代码编辑器应该做什么。
- 独立 IDE 工作台应该做什么。
- 两者哪些能力复用，哪些能力必须隔离。
- 前端需要哪些模块、状态、组件和依赖。
- 后端需要哪些文件、终端、任务、权限和安全能力。
- 如何避免做成一个固定死板、后期无法扩展的三栏 IDE 页面。

## 核心结论

不要把需求做成一个单一的固定 IDE 页面。

推荐拆成两种产品形态，并共享底层能力：

```txt
形态一：文件管理器在线编辑器
- 类似宝塔面板双击文件后的在线文本编辑器。
- 用于快速打开、编辑、保存一个或多个文件。
- 重点是轻量、稳定、快速，不承载完整 IDE 的复杂布局。

形态二：独立 IDE 工作台
- 类似 VS Code / Cursor / Visual Studio Code 类产品的工作台。
- 用于项目级开发，支持资源管理器、多编辑组、终端、问题面板、输出面板、布局拖拽与持久化。
- 必须使用成熟 docking layout 体系，不能手写固定三栏布局。

共享底层内核：
- FileService
- EditorService
- Monaco model 管理
- Tab 状态
- dirty 状态
- 保存与冲突处理
- 文件权限与路径安全
- 后续可扩展 LSP、Git、任务运行、终端
```

## 文档结构

### 当前主线方案

| 文档 | 说明 |
|---|---|
| [01-产品边界与形态拆分.md](./01-产品边界与形态拆分.md) | 定义“文件管理器在线编辑器”“可选 Mini Explorer”“独立 IDE 工作台”的边界 |
| [02-共享内核与总体架构.md](./02-共享内核与总体架构.md) | 定义共享 File / Editor / Explorer / Monaco / Dirty / Save 内核，避免在线编辑器和独立 IDE 重复开发 |
| [03-文件管理器在线编辑器方案.md](./03-文件管理器在线编辑器方案.md) | 当前已落地的文件管理器在线编辑器/File Surface 与 Mini Explorer 边界 |
| [04-独立IDE工作台方案.md](./04-独立IDE工作台方案.md) | M4 IDE Workbench Layout Foundation，以及最终 IDE 自由布局目标 |
| [05-前端实现方案.md](./05-前端实现方案.md) | React 前端模块、共享层目录、Monaco 接入、Explorer 复用、CommandService 和布局接入建议 |
| [06-后端服务与接口方案.md](./06-后端服务与接口方案.md) | 文件 API、目录树、读写、权限、安全、watcher、终端接口 |
| [07-终端运行语言服务Git方案.md](./07-终端运行语言服务Git方案.md) | M5/M5.x 终端、M6 Output/Problems、M7 LSP/Git/Debug 的后续路线 |
| [08-实施阶段验收与风险.md](./08-实施阶段验收与风险.md) | 阶段命名、验收标准、不做事项、风险清单与防偏移原则 |
| [09-IDE参考行为与术语对照.md](./09-IDE参考行为与术语对照.md) | 给 AI/开发者建立 VS Code 类 IDE Workbench、布局、View、Panel、Editor/Terminal split 的共同认知基线 |
| [14-视觉主题与设计系统适配.md](./14-视觉主题与设计系统适配.md) | 约束 File Surface / Mini Explorer / IDE Workbench / Monaco / xterm / Dockview 如何映射 Tracevane Aurora token，保证深浅主题一致 |

### 当前能力支撑与下一阶段专题

| 文档 | 说明 |
|---|---|
| [10-monaco-first-online-editor-strategy.md](./10-monaco-first-online-editor-strategy.md) | Monaco-first 当前口径：Monaco 负责编辑器原生能力，Tracevane 负责文件生命周期和壳层 |
| [11-monaco-full-capability-plan.md](./11-monaco-full-capability-plan.md) | Monaco 全能力启用、全语言懒加载、版本与验证策略 |
| [12-file-surface-unification-and-monaco-gap-plan.md](./12-file-surface-unification-and-monaco-gap-plan.md) | 已完成的统一 File Surface、Monaco 本地化/快捷键/媒体预览和旧预览删除记录 |
| [13-mini-explorer-shared-explorer-plan.md](./13-mini-explorer-shared-explorer-plan.md) | M3：Online Editor Mini Explorer + Shared Explorer Core 的已完成设计、实现边界和验收记录 |

### 历史执行记录归档

已完成阶段的执行计划、进度日志和验证证据已移动到 [`archive/`](./archive/)。这些文件用于追溯历史，不作为当前方案主线入口。

| 文档 | 说明 |
|---|---|
| [archive/m1-execution-plan.md](./archive/m1-execution-plan.md) | M1 文件管理器在线编辑器执行记录 |
| [archive/m1-progress.md](./archive/m1-progress.md) | M1/M1.x 实施与验证证据 |
| [archive/m1x-execution-plan.md](./archive/m1x-execution-plan.md) | M1.x 编辑器窗口、Tab、安全保存、状态栏、入口增强记录 |
| [archive/m2-execution-plan.md](./archive/m2-execution-plan.md) | M2 统一 File Surface 与 Monaco 能力补齐执行计划 |
| [archive/m2-progress.md](./archive/m2-progress.md) | M2/M2.x 进度、验证证据、风险和决策日志 |
| [archive/m3-execution-summary.md](./archive/m3-execution-summary.md) | M3 Mini Explorer / Shared Explorer Core 完成总结、边界和验证记录 |
| [archive/m4-a-workbench-foundation-plan.md](./archive/m4-a-workbench-foundation-plan.md) | M4-A IDE Workbench Layout Foundation 探查、最小骨架与下一步建议 |
| [archive/m4-b-dockview-editor-summary.md](./archive/m4-b-dockview-editor-summary.md) | M4-B Editor Dock + Dockview 最小接入、layout 保存恢复和边界记录 |
| [archive/m4-c-ide-explorer-operations-sync-summary.md](./archive/m4-c-ide-explorer-operations-sync-summary.md) | M4-C IDE Workbench 最小 smoke、Explorer 文件操作和已打开 tab 路径同步记录 |
| [archive/m4-execution-summary.md](./archive/m4-execution-summary.md) | M4 IDE Workbench Layout Foundation 总体验收、完成边界和 M5 入口 |
| [archive/m5-a-terminal-foundation-plan.md](./archive/m5-a-terminal-foundation-plan.md) | M5-A Real Terminal Foundation 本地探查、边界和 M5-B 最小实现计划 |
| [archive/m5-b-terminal-foundation-summary.md](./archive/m5-b-terminal-foundation-summary.md) | M5-B Workbench Terminal Panel 最小真实终端实现、后端 root/cwd guard 与 xterm 接入总结 |
| [archive/m5-execution-summary.md](./archive/m5-execution-summary.md) | M5 Real Terminal Foundation 总体验收、完成边界和 M5.x 入口 |
| [archive/m5x-execution-summary.md](./archive/m5x-execution-summary.md) | M5.x Terminal Split / Group / Panel Placement 总体验收、完成边界和 M5.y 入口 |
| [archive/m5y-a-ide-editor-foundation-plan.md](./archive/m5y-a-ide-editor-foundation-plan.md) | M5.y-A IDE Editor Foundation 技术探查、复用边界和后续切片计划 |
| [archive/m5y-execution-summary.md](./archive/m5y-execution-summary.md) | M5.y / M5.5 IDE Editor Foundation 总体验收、完成边界和 M6 入口 |
| [archive/m5y-f-shared-file-surface-summary.md](./archive/m5y-f-shared-file-surface-summary.md) | M5.y-F Shared File Surface + IDE Editor Preferences，共享预览层和 IDE 小地图偏好收口 |
| [archive/m5y-g-editor-preview-statusbar-hex-summary.md](./archive/m5y-g-editor-preview-statusbar-hex-summary.md) | M5.y-G IDE Preview StatusBar + Hex Editor Foundation，IDE embedded 预览、全局 StatusBar 文件信息和二进制 Hex 只读基础 |
| [archive/m5y-h-layout-reset-empty-action-summary.md](./archive/m5y-h-layout-reset-empty-action-summary.md) | M5.y-H IDE Layout Reset / Empty State / Header Actions，Reset layout 只重置布局不清空工作区，EditorDock 空状态和操作菜单稳定化 |
| [archive/m6-a-watcher-search-problems-output-plan.md](./archive/m6-a-watcher-search-problems-output-plan.md) | M6-A Watcher / Search / Problems / Output 研究与最小实现计划，明确 watcher/search/conflict/problems/output 切片、数据模型和验收路线 |
| [archive/m6-b-watcher-foundation-summary.md](./archive/m6-b-watcher-foundation-summary.md) | M6-B Watcher Foundation 执行总结，记录 Files watch snapshot、Workbench file event bus 与 opened tab 外部变更保护 |
| [archive/m6-c-search-foundation-summary.md](./archive/m6-c-search-foundation-summary.md) | M6-C IDE Search Foundation 执行总结，记录 Search Activity/View、Files search 复用和结果打开 IDE Editor |
| [archive/m6-d-editor-conflict-diff-summary.md](./archive/m6-d-editor-conflict-diff-summary.md) | M6-D IDE Diff / Conflict Flow 执行总结，记录 Monaco Diff、保存冲突和显式 reload/overwrite/cancel 流程 |
| [archive/m6-e-problems-output-foundation-summary.md](./archive/m6-e-problems-output-foundation-summary.md) | M6-E Problems / Output Foundation 执行总结，记录结构化 Problems 面板和 Output channel/log 基础 |
| [archive/m6-execution-summary.md](./archive/m6-execution-summary.md) | M6 Watcher / Search / Diff / Problems / Output 总体验收、完成边界和 M7 入口 |
| [archive/m7-a-lsp-git-debug-plan.md](./archive/m7-a-lsp-git-debug-plan.md) | M7-A LSP / Git / Debug 研究、边界与最小实现计划，明确 M7-B+ 分阶段路线 |
| [archive/m7-b-lsp-diagnostics-summary.md](./archive/m7-b-lsp-diagnostics-summary.md) | M7-B 单语言 JSON diagnostics -> Problems/Output 验收总结 |
| [archive/m7-c-lsp-interaction-summary.md](./archive/m7-c-lsp-interaction-summary.md) | M7-C LSP hover / completion / definition foundation 验收总结 |
| [archive/m7-d-git-status-source-control-summary.md](./archive/m7-d-git-status-source-control-summary.md) | M7-D Git status + Explorer decoration + Source Control View 验收总结 |
| [archive/m7-e-a-git-diff-foundation-summary.md](./archive/m7-e-a-git-diff-foundation-summary.md) | M7-E-A Git Diff Foundation 验收总结 |
| [archive/m7-e-b-git-stage-unstage-summary.md](./archive/m7-e-b-git-stage-unstage-summary.md) | M7-E-B Git Stage / Unstage Foundation 验收总结 |
| [archive/m7-e-c-git-commit-foundation-summary.md](./archive/m7-e-c-git-commit-foundation-summary.md) | M7-E-C Git Commit Foundation 验收总结 |
| [archive/m7-e-d-git-branch-upstream-summary.md](./archive/m7-e-d-git-branch-upstream-summary.md) | M7-E-D Git Branch / Upstream Status Foundation 验收总结 |
| [archive/m7-git-execution-summary.md](./archive/m7-git-execution-summary.md) | M7 Git Source Control 总体验收、完成边界和 M7-F Debug 入口 |
| [archive/m7-f-a-debug-adapter-plan.md](./archive/m7-f-a-debug-adapter-plan.md) | M7-F-A Debug Adapter Protocol 研究、边界与最小实现计划 |
| [archive/m7-f-b-debug-foundation-summary.md](./archive/m7-f-b-debug-foundation-summary.md) | M7-F-B Debug Gateway skeleton + Debug View shell 验收总结 |
| [archive/m7-f-c-debug-breakpoints-summary.md](./archive/m7-f-c-debug-breakpoints-summary.md) | M7-F-C Breakpoints + editor reveal foundation 验收总结 |
| [archive/m7-f-d-debug-adapter-proof-summary.md](./archive/m7-f-d-debug-adapter-proof-summary.md) | M7-F-D 最小真实 adapter proof 验收总结 |
| [archive/m7-f-debug-execution-summary.md](./archive/m7-f-debug-execution-summary.md) | M7-F Debug foundation 总体验收、完成边界和 M7.x 入口 |
| [archive/m7x-a-debug-hardening-plan.md](./archive/m7x-a-debug-hardening-plan.md) | M7.x-A Debug hardening 计划、lifecycle/profile/adapter 后续切片和 M7.x-B 入口 |
| [archive/m7x-b-debug-lifecycle-summary.md](./archive/m7x-b-debug-lifecycle-summary.md) | M7.x-B Debug lifecycle foundation 验收总结和 M7.x-C 入口 |
| [archive/m7x-c-debug-launch-profile-summary.md](./archive/m7x-c-debug-launch-profile-summary.md) | M7.x-C Debug launch profile / config foundation 验收总结和 M7.x-D 入口 |
| [archive/m7x-d-debug-node-inspector-summary.md](./archive/m7x-d-debug-node-inspector-summary.md) | M7.x-D Real Node inspector adapter minimal 验收总结和 M7.x-E 入口 |
| [archive/m7x-e-debug-controls-scopes-summary.md](./archive/m7x-e-debug-controls-scopes-summary.md) | M7.x-E Debug controls / scopes foundation 验收总结和 M7.x-F 入口 |
| [archive/m7x-f-debug-watch-evaluate-summary.md](./archive/m7x-f-debug-watch-evaluate-summary.md) | M7.x-F Debug Console watch / evaluate foundation 验收总结和 M7.x-G 入口 |
| [archive/m7x-debug-hardening-execution-summary.md](./archive/m7x-debug-hardening-execution-summary.md) | M7.x Debug hardening 总体验收、完成边界和 M7.y-A 入口 |
| [archive/m7y-a-lsp-git-debug-integration-plan.md](./archive/m7y-a-lsp-git-debug-integration-plan.md) | M7.y-A LSP / Git / Debug integration hardening plan，明确下一步 M7.y-B TypeScript / JavaScript LSP diagnostics foundation |
| [archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md](./archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md) | M7.y-B TypeScript / JavaScript LSP diagnostics foundation 验收总结和 M7.y-C 入口 |
| [archive/m7y-c-typescript-javascript-lsp-interaction-plan.md](./archive/m7y-c-typescript-javascript-lsp-interaction-plan.md) | M7.y-C TypeScript / JavaScript LSP interaction expansion plan，明确下一步 M7.y-D hover + definition foundation |
| [archive/m7y-d-typescript-javascript-hover-definition-summary.md](./archive/m7y-d-typescript-javascript-hover-definition-summary.md) | M7.y-D TypeScript / JavaScript hover + definition foundation 验收总结和 M7.y-E completion 入口 |
| [archive/m7y-e-typescript-javascript-completion-summary.md](./archive/m7y-e-typescript-javascript-completion-summary.md) | M7.y-E TypeScript / JavaScript completion foundation 验收总结和 M7.y-F LSP interaction acceptance closeout 入口 |
| [archive/m7y-f-lsp-interaction-acceptance-summary.md](./archive/m7y-f-lsp-interaction-acceptance-summary.md) | M7.y-F LSP interaction acceptance closeout，总结 JSON + TS/JS diagnostics / hover / definition / completion 完成边界和 M7.z-A 入口 |
| [archive/m7z-a-lsp-git-debug-enhancement-plan.md](./archive/m7z-a-lsp-git-debug-enhancement-plan.md) | M7.z-A LSP / Git / Debug post-M7 enhancement plan，明确 advanced LSP、Git remote 与 Debug parity 后续切片 |
| [archive/m7z-b-lsp-references-summary.md](./archive/m7z-b-lsp-references-summary.md) | M7.z-B Advanced LSP references foundation 验收总结和 M7.z-C rename / formatting / code actions plan 入口 |
| [archive/m7z-c-lsp-rename-format-code-actions-plan.md](./archive/m7z-c-lsp-rename-format-code-actions-plan.md) | M7.z-C LSP rename / formatting / code actions plan，明确 WorkspaceEdit preview/apply、dirty/conflict 和 root guard 边界 |
| [archive/m7z-d-git-remote-operations-plan.md](./archive/m7z-d-git-remote-operations-plan.md) | M7.z-D Git remote operations foundation plan，审计现有 pull/push/sync/publish 表面并规划 fetch、dry-run、credentials 与 Source Control 门禁 |
| [archive/m7z-e-git-remote-foundation-summary.md](./archive/m7z-e-git-remote-foundation-summary.md) | M7.z-E Git remote operations foundation hardening，补齐 fetch API/client、Source Control 远端操作入口和 smoke 验证 |
| [archive/m7z-f-lsp-workspace-edit-summary.md](./archive/m7z-f-lsp-workspace-edit-summary.md) | M7.z-F LSP WorkspaceEdit preview/apply foundation，建立 preview/apply、安全 root guard、dirty skip 与 FilesService 写回基础 |
| [archive/m7z-g-lsp-rename-format-code-actions-summary.md](./archive/m7z-g-lsp-rename-format-code-actions-summary.md) | M7.z-G LSP rename / formatting / code actions UI foundation，接入 Monaco rename/format/code action provider、IDE 操作菜单入口与 smoke 验证 |
| [archive/m7z-h-git-branch-stash-ui-summary.md](./archive/m7z-h-git-branch-stash-ui-summary.md) | M7.z-H Git branch / stash UI foundation，复用现有 Git service/client 在 Source Control 中接入分支列表/创建和 stash 保存/列表/受控操作入口 |
| [archive/m7z-i-git-branch-stash-hardening-summary.md](./archive/m7z-i-git-branch-stash-hardening-summary.md) | M7.z-I Git branch / stash hardening and acceptance closeout，补齐分支输入门禁、stash 危险操作确认和 hardening smoke 验收 |

## 推荐技术选型

基础编辑能力：

```bash
npm i monaco-editor @monaco-editor/react
```

独立 IDE 布局能力：

```bash
npm i dockview
```

终端 UI：

```bash
npm i @xterm/xterm @xterm/addon-fit
```

后端真实终端：

```bash
npm i ws node-pty
```

后续语言服务：

```bash
npm i monaco-languageclient vscode-ws-jsonrpc
```

## 最小推荐路线

```txt
已完成 M1：文件管理器在线编辑器基础版
- 双击/入口打开文件、Monaco 多 Tab、保存/全部保存、dirty、关闭保护、状态栏。

已完成 M1.x + Monaco-first：编辑器壳层增强与 Monaco 原生能力释放
- 最大化/最小化/关闭、Tab 操作、viewState、冲突检测、reload、状态栏元数据。
- 搜索/替换/快捷键/折叠/多光标/右键等交给 Monaco，Tracevane 不重复造轮子。

已完成 M2 + M2.x：统一 File Surface 与媒体预览
- 所有打开/编辑/检查入口进入同一个在线编辑器窗口。
- 文本/代码走 Monaco；图片/视频/音频/PDF/二进制走同一 File Surface 预览。
- Monaco 语言覆盖采用“官方元数据 + 懒加载 + 有界内容样本识别”，可处理无扩展名/备份后缀 JSON 与常见代码文件，未知内容安全回退 plaintext。
- 旧 FilePreviewPanel 预览/编辑壳已删除。

已完成 M3：Online Editor Mini Explorer + Shared Explorer Core
- 在线编辑器已具备可选、可折叠、响应式的小型文件导航，桌面侧栏与小屏抽屉分离。
- 已支持当前目录/邻近目录浏览、上级、刷新、树展开/折叠、打开到当前 File Surface，以及新建/重命名/删除/复制/移动/复制路径等轻量文件操作。
- 已抽出 `shared/explorer-core` 与 `shared/explorer-ui` primitives，未来独立 IDE SideBar Explorer 复用数据模型、文件操作、树状态和基础树 UI，但不复用在线编辑器容器 shell。
- 已打开 tab 在 rename/move/delete 时同步 path/title/document id/draft/viewState/read metadata；dirty 内容不会因文件操作静默丢失。Mini Explorer 目录不会随 tab 切换或打开文件自动跳转。

已完成 M4：IDE Workbench Layout Foundation
- 已新增独立 `/ide` / `/ide/:workspaceId` 路由和 `features/ide-workbench` 独立 Workbench shell，不依赖文件管理器弹窗。
- 已完成 ActivityBar、SideBar Explorer、Editor Dock / Dockview placeholder tabs、Panel Area 固定底部 placeholder tabs、StatusBar。
- 已支持从 IDE Explorer 打开文件到 Dockview placeholder tab，支持 preview/pinned 基础状态、Split Right / Split Down placeholder、多编辑组布局占位。
- 已支持 sidebar/panel resize、collapse、panel maximize/restore、`layoutVersion`、localStorage persistence、fallback/reset。
- 已接入 IDE Explorer 新建/重命名/删除/复制/移动/复制路径；rename/move/delete 会同步已打开 Dockview placeholder tab 的 path/title/document id/deleted 状态和 Dockview layout metadata。
- 已补 `smoke:ide:workbench-layout`，覆盖 `/ide` 路由不白屏、ActivityBar/SideBar/EditorDock/Panel/StatusBar、Explorer 打开文件、Split Right / Split Down、Reset layout。
- M4 验收口径是工作台布局基础，不是完整 IDE：真实 Monaco 编辑内容与保存/dirty 冲突、Terminal/xterm/PTY、Terminal split/group、LSP、Git、Debug、Problems/Output 数据、watcher、Panel right placement、Secondary SideBar、插件市场均后置。
- 默认布局是左 Explorer、中 Editor、底 Panel，但最终目标仍是完整 IDE 级自由布局；M4 只预留 placement/viewPlacements，不把未来右侧 Panel、Secondary SideBar 或 View Movement 写死。

已完成 M5：Real Terminal Foundation
- M5-A 已完成本地探查、边界收口和最小实现计划，记录见 `archive/m5-a-terminal-foundation-plan.md`。
- M5-B 已在现有 `apps/api/modules/terminal` 基础上接入 IDE Workbench Terminal Panel：真实 xterm/WebSocket/node-pty、session lifecycle、cwd/root guard、shell allowlist 和状态 UI，记录见 `archive/m5-b-terminal-foundation-summary.md`。
- M5 已完成 bottom Panel Terminal tab、单终端 session 基础、resize、close/kill、cwd/root guard、shell/profile allowlist 和 `smoke:ide:terminal-foundation`。
- M5 不做 terminal split/group、Panel right placement、Terminal View 全局 docking、Terminal 作为 editor-like tab、Problems/Output 数据、watcher、LSP、Git、Debug、插件市场或完整 VS Code terminal behavior。

已完成 M5.x：Terminal Split / Group / Panel Placement
- 已完成 terminal tabs/groups/panes、split right/down、pane focus/close/kill、bottom/right panel placement、layout/session metadata persistence、profile/shell selection、tmux optional durable backend、剪贴板文件/图片上传为路径、终端 tab 拖拽与右键菜单等终端布局基础能力。
- M5.x 不做 Terminal 作为 editor-like tab、完整 View Movement、Secondary SideBar、Problems/Output 数据、watcher、LSP、Git、Debug 或完整 VS Code terminal behavior。

已完成 M5.y / M5.5：IDE Editor Foundation
- IDE 中间 EditorDock 已从 Dockview placeholder 升级为真实 Monaco 文件编辑器基础。
- 已完成 IDE 独立 Workbench editor shell：复用 shared/editor-core、Files API、Monaco model/语言/dirty/save/conflict 规则；不复用 File Manager Online Editor 产品壳，不创建第二套文件 API，不让 Dockview 拥有文件 IO。
- 已完成真实 Monaco panel、read/loading/error/unsupported/deleted 状态、dirty/save、Ctrl/Cmd+S、关闭确认、preview/pinned、多标签、tab 右键菜单和操作菜单。
- 已完成向右/向下拆分真实 file panel：同一 document 可在多个 Dockview panel 实例显示；Explorer rename/move/delete 会同步 primary/split panel 的 path/title/tab params。
- 验收见 `archive/m5y-execution-summary.md`。

已完成 M5.y-F：Shared File Surface + IDE Editor Preferences
- 已抽出 `shared/file-surface`，File Manager Online Editor 与 IDE Editor 共享 image/video/audio/pdf/binary 预览 renderer。
- IDE Editor 打开非文本/code 文件时复用 File Surface 只读预览，不再只显示“后续 IDE Preview”占位；文本截断/不完整读取仍保持 unsupported 安全边界。
- IDE Monaco 支持从编辑器操作菜单开启/关闭小地图，并通过 Workbench editor preferences 持久化。
- 验收见 `archive/m5y-f-shared-file-surface-summary.md`。

已完成 M5.y-G：IDE Preview StatusBar + Hex Editor Foundation
- IDE 非文本预览使用 File Surface embedded chrome，减少额外标题栏/状态栏占用，图片/视频/PDF/Hex 等在 EditorDock 内尽量铺满可用空间。
- Monaco 文件信息从单个 editor panel 底部迁移到 Workbench 全局 StatusBar；旧 `M4 Workbench foundation` 文案已移除。
- Panel 完全收起时不再保留底部占位行，恢复入口移动到顶部右侧 header。
- 二进制文件进入共享 Hex Editor 只读基础：Range 读取、offset/hex/ascii、搜索、复制 Hex、下载；安全写回 API 后置。
- 验收见 `archive/m5y-g-editor-preview-statusbar-hex-summary.md`。

已完成 M5.y-H：IDE Layout Reset / Empty State / Header Actions
- Reset layout 现在只重置布局几何、panel/sidebar 状态和 Dockview split metadata，不再清空已打开 editor tabs、Explorer 上下文或终端会话。
- EditorDock 空状态改为用户可理解的“未打开文件”，不再展示实现阶段说明。
- Panel 收起后的恢复入口为顶部右侧图标按钮；Dockview header 的“操作”菜单通过稳定 adapter 注入，避免闪烁和不可点击。
- 验收见 `archive/m5y-h-layout-reset-empty-action-summary.md`。

已完成 M6-A：Watcher / Search / Problems / Output 研究与最小实现计划
- 已探查现有 Files search/content-index、Workbench panel placeholder、Editor dirty/save/path sync 和缺失 watcher/event bus。
- 已明确 M6-B watcher、M6-C search、M6-D diff/conflict、M6-E problems/output、M6-F 验收文档的推荐切片。
- 验收见 `archive/m6-a-watcher-search-problems-output-plan.md`。

已完成 M6-B：Watcher Foundation
- 新增 Files watch snapshot contract 与 Workbench file event bus；当前使用 bounded polling fallback，不新增第二套 Files API。
- opened editor tab 可标记外部 changed/deleted；dirty deleted 不静默关闭或覆盖 Monaco 内容。
- 验收见 `archive/m6-b-watcher-foundation-summary.md`。

已完成 M6-C：Search Foundation
- Search Activity 已启用，SideBar 支持 Search View、搜索选项、结果列表和点击打开 IDE Editor tab。
- 复用现有 `/api/files/search`；精确 range/reveal、Problems/Output 写入和替换后置。
- 验收见 `archive/m6-c-search-foundation-summary.md`。

已完成 M6-D：Diff / Conflict Flow
- IDE 保存时携带 `expectedModifiedAt` / `expectedSize`，Files API 返回 `file_write_conflict` 时进入 Monaco Diff 对比。
- watcher changed + dirty 复用同一 compare / reload / overwrite / cancel 流程；deleted + dirty 继续保护内容，不自动覆盖或关闭。
- 验收见 `archive/m6-d-editor-conflict-diff-summary.md`。

已完成 M6-E：Problems / Output Foundation
- Problems Panel 支持结构化 severity/source/path/range 列表，点击可打开文件并 reveal 行列。
- Output Panel 支持 channel/log、追加、清空、自动滚动/锁定；不持久化完整大日志。
- 验收见 `archive/m6-e-problems-output-foundation-summary.md`。

已完成 M6-F：M6 验收与文档收口
- 已汇总 watcher/search/diff/problems/output 完成口径，明确 M6 不接 LSP/Git/Debug/真实 task runner。
- 已把下一阶段入口更新为 M7-A LSP / Git / Debug 研究与最小实现计划。
- 验收见 `archive/m6-execution-summary.md`。

已完成 M7-A：LSP / Git / Debug 研究与最小实现计划
- 已探查 apps/api 与 IDE Workbench 现状：后端已有 Git service/API，暂无 LSP/DAP service；前端已有 Problems/Output/editor reveal 和 Git API hooks。
- 已查证 LSP、DAP、Git porcelain 与 monaco-languageclient 方向，明确 M7 不一次性追完整 VS Code。
- M7-B 单语言 JSON diagnostics 已接入 Problems/Output。
- M7-C 已接入 JSON hover / completion / definition foundation。
- M7-D 已接入 Git status + Explorer decoration + Source Control View。
- M7-E-D 已完成 Git branch / upstream status foundation；M7 Git Source Control 总体验收已完成；M7-F-A Debug Adapter Protocol 研究与最小实现计划已完成；M7-F-B Debug Gateway skeleton + Debug View shell、M7-F-C Breakpoints + editor reveal foundation、M7-F-D 最小真实 adapter proof、M7-F-E Debug acceptance closeout、M7.x-A Debug hardening plan、M7.x-B Debug lifecycle foundation、M7.x-C Launch profile / config foundation、M7.x-D Real Node inspector adapter minimal、M7.x-E Debug controls / scopes foundation、M7.x-F Debug Console watch / evaluate foundation、M7.x-G Debug hardening acceptance closeout、M7.y-A LSP / Git / Debug integration hardening plan、M7.y-B TypeScript / JavaScript LSP diagnostics foundation、M7.y-C TypeScript / JavaScript LSP interaction expansion plan、M7.y-D TypeScript / JavaScript hover and definition foundation、M7.y-E TypeScript / JavaScript completion foundation、M7.y-F LSP interaction acceptance closeout、M7.z-A LSP / Git / Debug post-M7 enhancement plan、M7.z-B Advanced LSP references foundation、M7.z-C LSP rename / formatting / code actions plan 与 M7.z-D Git remote operations foundation plan 与 M7.z-E Git remote operations foundation hardening 与 M7.z-F LSP WorkspaceEdit preview/apply foundation 与 M7.z-G LSP rename / formatting / code actions UI foundation 与 M7.z-H Git branch / stash UI foundation 与 M7.z-I Git branch / stash hardening and acceptance closeout 已完成，下一步进入 M7.z-J LSP / Git / Debug enhancement acceptance closeout。
- 验收见 `archive/m7-a-lsp-git-debug-plan.md`、`archive/m7-b-lsp-diagnostics-summary.md`、`archive/m7-c-lsp-interaction-summary.md`、`archive/m7-d-git-status-source-control-summary.md`、`archive/m7-e-a-git-diff-foundation-summary.md`、`archive/m7-e-b-git-stage-unstage-summary.md`、`archive/m7-e-c-git-commit-foundation-summary.md`、`archive/m7-e-d-git-branch-upstream-summary.md`、`archive/m7-git-execution-summary.md`、`archive/m7-f-a-debug-adapter-plan.md`、`archive/m7-f-b-debug-foundation-summary.md`、`archive/m7-f-c-debug-breakpoints-summary.md`、`archive/m7-f-d-debug-adapter-proof-summary.md` 与 `archive/m7-f-debug-execution-summary.md`、`archive/m7x-a-debug-hardening-plan.md`、`archive/m7x-b-debug-lifecycle-summary.md`、`archive/m7x-c-debug-launch-profile-summary.md`、`archive/m7x-d-debug-node-inspector-summary.md`、`archive/m7x-e-debug-controls-scopes-summary.md`、`archive/m7x-f-debug-watch-evaluate-summary.md`、`archive/m7x-debug-hardening-execution-summary.md`、`archive/m7y-a-lsp-git-debug-integration-plan.md`、`archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md`、`archive/m7y-c-typescript-javascript-lsp-interaction-plan.md`、`archive/m7y-d-typescript-javascript-hover-definition-summary.md`、`archive/m7y-e-typescript-javascript-completion-summary.md`、`archive/m7y-f-lsp-interaction-acceptance-summary.md`、`archive/m7z-a-lsp-git-debug-enhancement-plan.md`、`archive/m7z-b-lsp-references-summary.md`、`archive/m7z-c-lsp-rename-format-code-actions-plan.md`、`archive/m7z-d-git-remote-operations-plan.md`、`archive/m7z-e-git-remote-foundation-summary.md`、`archive/m7z-f-lsp-workspace-edit-summary.md`、`archive/m7z-g-lsp-rename-format-code-actions-summary.md`、`archive/m7z-h-git-branch-stash-ui-summary.md` 与 `archive/m7z-i-git-branch-stash-hardening-summary.md`。
```

## 重要原则

1. 文件管理器编辑器和独立 IDE 不要合并成一个页面。
2. 文件管理器负责完整文件管理，在线编辑器 Mini Explorer 只负责轻量导航，Workbench 负责完整 IDE 布局和命令。
3. Monaco 负责代码编辑器原生能力；Tracevane 不重复实现搜索/替换、多光标、折叠、minimap、context menu 等 Monaco 已有能力。
4. xterm.js 只解决终端 UI，不执行命令。
5. 独立 IDE 的最终布局必须区域级可移动、可折叠、可拆分、可持久化；阶段性实现可以简化，但不能写死未来能力。
6. 文件内容不要长期放 React state，应由 Monaco model 承载。
7. 后端必须做 workspace 路径安全限制。
8. 终端执行能力要优先考虑容器或受限环境，不建议直接暴露宿主机 shell。
9. Explorer 相关能力应先抽共享层：目录数据、树状态、文件操作、图标、排序、权限判断可复用；ActivityBar/Dockview/多编辑组只属于独立 IDE。
10. 每个阶段都要写清楚“不做什么”，避免 M3/M4/M5/M6/M7 互相抢范围；阶段性交付不能写死最终 IDE 自由布局能力。
11. 视觉实现必须统一走 Tracevane Aurora token：Monaco、xterm、Dockview、Diff、Problems、Output 都通过集中适配层映射 `theme.css`，不得散落 VS Code/Terminal 默认配色或组件内 hardcode；深色、浅色和 auto 主题都要验证。
