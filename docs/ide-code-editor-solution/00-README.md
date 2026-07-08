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

## 当前产品聚焦覆盖层

从 M13-I 起，Tracevane 后续默认执行口径调整为：**优先完成远程项目在线改代码主链路，而不是继续追求浏览器版 VS Code 全面平替**。详细规则见 [`15-远程代码工作台产品聚焦与长期执行机制.md`](./15-远程代码工作台产品聚焦与长期执行机制.md)。

默认优先级：

1. 文件打开、编辑、保存、冲突、dirty、只读、大文件保护。
2. 搜索、Quick Open、symbols、Problems、diagnostics、hover、definition。
3. 主流 Web 栈：TS / JS / JSON / HTML / CSS / ESLint。
4. Git 最小闭环：status / diff / stage / commit。
5. Provider status、trust、allowlist、root guard、degraded reason。

默认后置：

- Git force push / merge / rebase / 复杂冲突流。
- 重型 Debug parity。
- Terminal 高级布局和复杂 View Movement。
- Go / Rust / Java / clangd 更深 rich interaction 横向扩张。
- 只为了像 VS Code 而补的 IDE parity 项。

M13-I 的推荐方向是：验收 Go + Rust rich interaction proof 后，暂停继续扩 heavy toolchain provider，把下一阶段切回 **P0 Remote Code Editing Mainline Audit**。计划见 [`archive/m13-i-toolchain-rich-interaction-product-pivot-plan.md`](./archive/m13-i-toolchain-rich-interaction-product-pivot-plan.md)。

## 文档结构

### 当前主线方案

| 文档                                                               | 说明                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [01-产品边界与形态拆分.md](./01-产品边界与形态拆分.md)             | 定义“文件管理器在线编辑器”“可选 Mini Explorer”“独立 IDE 工作台”的边界                                                           |
| [02-共享内核与总体架构.md](./02-共享内核与总体架构.md)             | 定义共享 File / Editor / Explorer / Monaco / Dirty / Save 内核，避免在线编辑器和独立 IDE 重复开发                               |
| [03-文件管理器在线编辑器方案.md](./03-文件管理器在线编辑器方案.md) | 当前已落地的文件管理器在线编辑器/File Surface 与 Mini Explorer 边界                                                             |
| [04-独立IDE工作台方案.md](./04-独立IDE工作台方案.md)               | M4 IDE Workbench Layout Foundation，以及最终 IDE 自由布局目标                                                                   |
| [05-前端实现方案.md](./05-前端实现方案.md)                         | React 前端模块、共享层目录、Monaco 接入、Explorer 复用、CommandService 和布局接入建议                                           |
| [06-后端服务与接口方案.md](./06-后端服务与接口方案.md)             | 文件 API、目录树、读写、权限、安全、watcher、终端接口                                                                           |
| [07-终端运行语言服务Git方案.md](./07-终端运行语言服务Git方案.md)   | M5/M5.x 终端、M6 Output/Problems、M7 LSP/Git/Debug 的后续路线                                                                   |
| [08-实施阶段验收与风险.md](./08-实施阶段验收与风险.md)             | 阶段命名、验收标准、不做事项、风险清单与防偏移原则                                                                              |
| [09-IDE参考行为与术语对照.md](./09-IDE参考行为与术语对照.md)       | 给 AI/开发者建立 VS Code 类 IDE Workbench、布局、View、Panel、Editor/Terminal split 的共同认知基线                              |
| [14-视觉主题与设计系统适配.md](./14-视觉主题与设计系统适配.md)     | 约束 File Surface / Mini Explorer / IDE Workbench / Monaco / xterm / Dockview 如何映射 Tracevane Aurora token，保证深浅主题一致 |
| [15-远程代码工作台产品聚焦与长期执行机制.md](./15-远程代码工作台产品聚焦与长期执行机制.md) | 定义后续从“IDE parity / 横向堆功能”转向“远程项目在线改代码主链路”的产品取舍、长期 goal prompt、AI 决策规则、测试分层与 Code Review 提效机制 |

### 当前能力支撑与下一阶段专题

| 文档                                                                                                       | 说明                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [10-monaco-first-online-editor-strategy.md](./10-monaco-first-online-editor-strategy.md)                   | Monaco-first 当前口径：Monaco 负责编辑器原生能力，Tracevane 负责文件生命周期和壳层      |
| [11-monaco-full-capability-plan.md](./11-monaco-full-capability-plan.md)                                   | Monaco 全能力启用、全语言懒加载、版本与验证策略                                         |
| [12-file-surface-unification-and-monaco-gap-plan.md](./12-file-surface-unification-and-monaco-gap-plan.md) | 已完成的统一 File Surface、Monaco 本地化/快捷键/媒体预览和旧预览删除记录                |
| [13-mini-explorer-shared-explorer-plan.md](./13-mini-explorer-shared-explorer-plan.md)                     | M3：Online Editor Mini Explorer + Shared Explorer Core 的已完成设计、实现边界和验收记录 |

### 历史执行记录归档

已完成阶段的执行计划、进度日志和验证证据已移动到 [`archive/`](./archive/)。这些文件用于追溯历史，不作为当前方案主线入口。

| 文档                                                                                                                                           | 说明                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [archive/m1-execution-plan.md](./archive/m1-execution-plan.md)                                                                                 | M1 文件管理器在线编辑器执行记录                                                                                                                                                                                                                                                    |
| [archive/m1-progress.md](./archive/m1-progress.md)                                                                                             | M1/M1.x 实施与验证证据                                                                                                                                                                                                                                                             |
| [archive/m1x-execution-plan.md](./archive/m1x-execution-plan.md)                                                                               | M1.x 编辑器窗口、Tab、安全保存、状态栏、入口增强记录                                                                                                                                                                                                                               |
| [archive/m2-execution-plan.md](./archive/m2-execution-plan.md)                                                                                 | M2 统一 File Surface 与 Monaco 能力补齐执行计划                                                                                                                                                                                                                                    |
| [archive/m2-progress.md](./archive/m2-progress.md)                                                                                             | M2/M2.x 进度、验证证据、风险和决策日志                                                                                                                                                                                                                                             |
| [archive/m3-execution-summary.md](./archive/m3-execution-summary.md)                                                                           | M3 Mini Explorer / Shared Explorer Core 完成总结、边界和验证记录                                                                                                                                                                                                                   |
| [archive/m4-a-workbench-foundation-plan.md](./archive/m4-a-workbench-foundation-plan.md)                                                       | M4-A IDE Workbench Layout Foundation 探查、最小骨架与下一步建议                                                                                                                                                                                                                    |
| [archive/m4-b-dockview-editor-summary.md](./archive/m4-b-dockview-editor-summary.md)                                                           | M4-B Editor Dock + Dockview 最小接入、layout 保存恢复和边界记录                                                                                                                                                                                                                    |
| [archive/m4-c-ide-explorer-operations-sync-summary.md](./archive/m4-c-ide-explorer-operations-sync-summary.md)                                 | M4-C IDE Workbench 最小 smoke、Explorer 文件操作和已打开 tab 路径同步记录                                                                                                                                                                                                          |
| [archive/m4-execution-summary.md](./archive/m4-execution-summary.md)                                                                           | M4 IDE Workbench Layout Foundation 总体验收、完成边界和 M5 入口                                                                                                                                                                                                                    |
| [archive/m5-a-terminal-foundation-plan.md](./archive/m5-a-terminal-foundation-plan.md)                                                         | M5-A Real Terminal Foundation 本地探查、边界和 M5-B 最小实现计划                                                                                                                                                                                                                   |
| [archive/m5-b-terminal-foundation-summary.md](./archive/m5-b-terminal-foundation-summary.md)                                                   | M5-B Workbench Terminal Panel 最小真实终端实现、后端 root/cwd guard 与 xterm 接入总结                                                                                                                                                                                              |
| [archive/m5-execution-summary.md](./archive/m5-execution-summary.md)                                                                           | M5 Real Terminal Foundation 总体验收、完成边界和 M5.x 入口                                                                                                                                                                                                                         |
| [archive/m5x-execution-summary.md](./archive/m5x-execution-summary.md)                                                                         | M5.x Terminal Split / Group / Panel Placement 总体验收、完成边界和 M5.y 入口                                                                                                                                                                                                       |
| [archive/m5y-a-ide-editor-foundation-plan.md](./archive/m5y-a-ide-editor-foundation-plan.md)                                                   | M5.y-A IDE Editor Foundation 技术探查、复用边界和后续切片计划                                                                                                                                                                                                                      |
| [archive/m5y-execution-summary.md](./archive/m5y-execution-summary.md)                                                                         | M5.y / M5.5 IDE Editor Foundation 总体验收、完成边界和 M6 入口                                                                                                                                                                                                                     |
| [archive/m5y-f-shared-file-surface-summary.md](./archive/m5y-f-shared-file-surface-summary.md)                                                 | M5.y-F Shared File Surface + IDE Editor Preferences，共享预览层和 IDE 小地图偏好收口                                                                                                                                                                                               |
| [archive/m5y-g-editor-preview-statusbar-hex-summary.md](./archive/m5y-g-editor-preview-statusbar-hex-summary.md)                               | M5.y-G IDE Preview StatusBar + Hex Editor Foundation，IDE embedded 预览、全局 StatusBar 文件信息和二进制 Hex 只读基础                                                                                                                                                              |
| [archive/m5y-h-layout-reset-empty-action-summary.md](./archive/m5y-h-layout-reset-empty-action-summary.md)                                     | M5.y-H IDE Layout Reset / Empty State / Header Actions，Reset layout 只重置布局不清空工作区，EditorDock 空状态和操作菜单稳定化                                                                                                                                                     |
| [archive/m6-a-watcher-search-problems-output-plan.md](./archive/m6-a-watcher-search-problems-output-plan.md)                                   | M6-A Watcher / Search / Problems / Output 研究与最小实现计划，明确 watcher/search/conflict/problems/output 切片、数据模型和验收路线                                                                                                                                                |
| [archive/m6-b-watcher-foundation-summary.md](./archive/m6-b-watcher-foundation-summary.md)                                                     | M6-B Watcher Foundation 执行总结，记录 Files watch snapshot、Workbench file event bus 与 opened tab 外部变更保护                                                                                                                                                                   |
| [archive/m6-c-search-foundation-summary.md](./archive/m6-c-search-foundation-summary.md)                                                       | M6-C IDE Search Foundation 执行总结，记录 Search Activity/View、Files search 复用和结果打开 IDE Editor                                                                                                                                                                             |
| [archive/m6-d-editor-conflict-diff-summary.md](./archive/m6-d-editor-conflict-diff-summary.md)                                                 | M6-D IDE Diff / Conflict Flow 执行总结，记录 Monaco Diff、保存冲突和显式 reload/overwrite/cancel 流程                                                                                                                                                                              |
| [archive/m6-e-problems-output-foundation-summary.md](./archive/m6-e-problems-output-foundation-summary.md)                                     | M6-E Problems / Output Foundation 执行总结，记录结构化 Problems 面板和 Output channel/log 基础                                                                                                                                                                                     |
| [archive/m6-execution-summary.md](./archive/m6-execution-summary.md)                                                                           | M6 Watcher / Search / Diff / Problems / Output 总体验收、完成边界和 M7 入口                                                                                                                                                                                                        |
| [archive/m7-a-lsp-git-debug-plan.md](./archive/m7-a-lsp-git-debug-plan.md)                                                                     | M7-A LSP / Git / Debug 研究、边界与最小实现计划，明确 M7-B+ 分阶段路线                                                                                                                                                                                                             |
| [archive/m7-b-lsp-diagnostics-summary.md](./archive/m7-b-lsp-diagnostics-summary.md)                                                           | M7-B 单语言 JSON diagnostics -> Problems/Output 验收总结                                                                                                                                                                                                                           |
| [archive/m7-c-lsp-interaction-summary.md](./archive/m7-c-lsp-interaction-summary.md)                                                           | M7-C LSP hover / completion / definition foundation 验收总结                                                                                                                                                                                                                       |
| [archive/m7-d-git-status-source-control-summary.md](./archive/m7-d-git-status-source-control-summary.md)                                       | M7-D Git status + Explorer decoration + Source Control View 验收总结                                                                                                                                                                                                               |
| [archive/m7-e-a-git-diff-foundation-summary.md](./archive/m7-e-a-git-diff-foundation-summary.md)                                               | M7-E-A Git Diff Foundation 验收总结                                                                                                                                                                                                                                                |
| [archive/m7-e-b-git-stage-unstage-summary.md](./archive/m7-e-b-git-stage-unstage-summary.md)                                                   | M7-E-B Git Stage / Unstage Foundation 验收总结                                                                                                                                                                                                                                     |
| [archive/m7-e-c-git-commit-foundation-summary.md](./archive/m7-e-c-git-commit-foundation-summary.md)                                           | M7-E-C Git Commit Foundation 验收总结                                                                                                                                                                                                                                              |
| [archive/m7-e-d-git-branch-upstream-summary.md](./archive/m7-e-d-git-branch-upstream-summary.md)                                               | M7-E-D Git Branch / Upstream Status Foundation 验收总结                                                                                                                                                                                                                            |
| [archive/m7-git-execution-summary.md](./archive/m7-git-execution-summary.md)                                                                   | M7 Git Source Control 总体验收、完成边界和 M7-F Debug 入口                                                                                                                                                                                                                         |
| [archive/m7-f-a-debug-adapter-plan.md](./archive/m7-f-a-debug-adapter-plan.md)                                                                 | M7-F-A Debug Adapter Protocol 研究、边界与最小实现计划                                                                                                                                                                                                                             |
| [archive/m7-f-b-debug-foundation-summary.md](./archive/m7-f-b-debug-foundation-summary.md)                                                     | M7-F-B Debug Gateway skeleton + Debug View shell 验收总结                                                                                                                                                                                                                          |
| [archive/m7-f-c-debug-breakpoints-summary.md](./archive/m7-f-c-debug-breakpoints-summary.md)                                                   | M7-F-C Breakpoints + editor reveal foundation 验收总结                                                                                                                                                                                                                             |
| [archive/m7-f-d-debug-adapter-proof-summary.md](./archive/m7-f-d-debug-adapter-proof-summary.md)                                               | M7-F-D 最小真实 adapter proof 验收总结                                                                                                                                                                                                                                             |
| [archive/m7-f-debug-execution-summary.md](./archive/m7-f-debug-execution-summary.md)                                                           | M7-F Debug foundation 总体验收、完成边界和 M7.x 入口                                                                                                                                                                                                                               |
| [archive/m7x-a-debug-hardening-plan.md](./archive/m7x-a-debug-hardening-plan.md)                                                               | M7.x-A Debug hardening 计划、lifecycle/profile/adapter 后续切片和 M7.x-B 入口                                                                                                                                                                                                      |
| [archive/m7x-b-debug-lifecycle-summary.md](./archive/m7x-b-debug-lifecycle-summary.md)                                                         | M7.x-B Debug lifecycle foundation 验收总结和 M7.x-C 入口                                                                                                                                                                                                                           |
| [archive/m7x-c-debug-launch-profile-summary.md](./archive/m7x-c-debug-launch-profile-summary.md)                                               | M7.x-C Debug launch profile / config foundation 验收总结和 M7.x-D 入口                                                                                                                                                                                                             |
| [archive/m7x-d-debug-node-inspector-summary.md](./archive/m7x-d-debug-node-inspector-summary.md)                                               | M7.x-D Real Node inspector adapter minimal 验收总结和 M7.x-E 入口                                                                                                                                                                                                                  |
| [archive/m7x-e-debug-controls-scopes-summary.md](./archive/m7x-e-debug-controls-scopes-summary.md)                                             | M7.x-E Debug controls / scopes foundation 验收总结和 M7.x-F 入口                                                                                                                                                                                                                   |
| [archive/m7x-f-debug-watch-evaluate-summary.md](./archive/m7x-f-debug-watch-evaluate-summary.md)                                               | M7.x-F Debug Console watch / evaluate foundation 验收总结和 M7.x-G 入口                                                                                                                                                                                                            |
| [archive/m7x-debug-hardening-execution-summary.md](./archive/m7x-debug-hardening-execution-summary.md)                                         | M7.x Debug hardening 总体验收、完成边界和 M7.y-A 入口                                                                                                                                                                                                                              |
| [archive/m7y-a-lsp-git-debug-integration-plan.md](./archive/m7y-a-lsp-git-debug-integration-plan.md)                                           | M7.y-A LSP / Git / Debug integration hardening plan，明确下一步 M7.y-B TypeScript / JavaScript LSP diagnostics foundation                                                                                                                                                          |
| [archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md](./archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md)             | M7.y-B TypeScript / JavaScript LSP diagnostics foundation 验收总结和 M7.y-C 入口                                                                                                                                                                                                   |
| [archive/m7y-c-typescript-javascript-lsp-interaction-plan.md](./archive/m7y-c-typescript-javascript-lsp-interaction-plan.md)                   | M7.y-C TypeScript / JavaScript LSP interaction expansion plan，明确下一步 M7.y-D hover + definition foundation                                                                                                                                                                     |
| [archive/m7y-d-typescript-javascript-hover-definition-summary.md](./archive/m7y-d-typescript-javascript-hover-definition-summary.md)           | M7.y-D TypeScript / JavaScript hover + definition foundation 验收总结和 M7.y-E completion 入口                                                                                                                                                                                     |
| [archive/m7y-e-typescript-javascript-completion-summary.md](./archive/m7y-e-typescript-javascript-completion-summary.md)                       | M7.y-E TypeScript / JavaScript completion foundation 验收总结和 M7.y-F LSP interaction acceptance closeout 入口                                                                                                                                                                    |
| [archive/m7y-f-lsp-interaction-acceptance-summary.md](./archive/m7y-f-lsp-interaction-acceptance-summary.md)                                   | M7.y-F LSP interaction acceptance closeout，总结 JSON + TS/JS diagnostics / hover / definition / completion 完成边界和 M7.z-A 入口                                                                                                                                                 |
| [archive/m7z-a-lsp-git-debug-enhancement-plan.md](./archive/m7z-a-lsp-git-debug-enhancement-plan.md)                                           | M7.z-A LSP / Git / Debug post-M7 enhancement plan，明确 advanced LSP、Git remote 与 Debug parity 后续切片                                                                                                                                                                          |
| [archive/m7z-b-lsp-references-summary.md](./archive/m7z-b-lsp-references-summary.md)                                                           | M7.z-B Advanced LSP references foundation 验收总结和 M7.z-C rename / formatting / code actions plan 入口                                                                                                                                                                           |
| [archive/m7z-c-lsp-rename-format-code-actions-plan.md](./archive/m7z-c-lsp-rename-format-code-actions-plan.md)                                 | M7.z-C LSP rename / formatting / code actions plan，明确 WorkspaceEdit preview/apply、dirty/conflict 和 root guard 边界                                                                                                                                                            |
| [archive/m7z-d-git-remote-operations-plan.md](./archive/m7z-d-git-remote-operations-plan.md)                                                   | M7.z-D Git remote operations foundation plan，审计现有 pull/push/sync/publish 表面并规划 fetch、dry-run、credentials 与 Source Control 门禁                                                                                                                                        |
| [archive/m7z-e-git-remote-foundation-summary.md](./archive/m7z-e-git-remote-foundation-summary.md)                                             | M7.z-E Git remote operations foundation hardening，补齐 fetch API/client、Source Control 远端操作入口和 smoke 验证                                                                                                                                                                 |
| [archive/m7z-f-lsp-workspace-edit-summary.md](./archive/m7z-f-lsp-workspace-edit-summary.md)                                                   | M7.z-F LSP WorkspaceEdit preview/apply foundation，建立 preview/apply、安全 root guard、dirty skip 与 FilesService 写回基础                                                                                                                                                        |
| [archive/m7z-g-lsp-rename-format-code-actions-summary.md](./archive/m7z-g-lsp-rename-format-code-actions-summary.md)                           | M7.z-G LSP rename / formatting / code actions UI foundation，接入 Monaco rename/format/code action provider、IDE 操作菜单入口与 smoke 验证                                                                                                                                         |
| [archive/m7z-h-git-branch-stash-ui-summary.md](./archive/m7z-h-git-branch-stash-ui-summary.md)                                                 | M7.z-H Git branch / stash UI foundation，复用现有 Git service/client 在 Source Control 中接入分支列表/创建和 stash 保存/列表/受控操作入口                                                                                                                                          |
| [archive/m7z-i-git-branch-stash-hardening-summary.md](./archive/m7z-i-git-branch-stash-hardening-summary.md)                                   | M7.z-I Git branch / stash hardening and acceptance closeout，补齐分支输入门禁、stash 危险操作确认和 hardening smoke 验收                                                                                                                                                           |
| [archive/m7z-j-lsp-git-debug-enhancement-acceptance-summary.md](./archive/m7z-j-lsp-git-debug-enhancement-acceptance-summary.md)               | M7.z-J LSP / Git / Debug enhancement acceptance closeout，总结 M7.z-B 到 M7.z-I 的增强完成边界、验证矩阵和 M8 入口                                                                                                                                                                 |
| [archive/m8-a-ide-stabilization-rc-plan.md](./archive/m8-a-ide-stabilization-rc-plan.md)                                                       | M8-A IDE stabilization and release-candidate plan，定义 RC 范围、分层 smoke 矩阵、release blocker 分类和 M8-B 入口                                                                                                                                                                 |
| [archive/m8-b-rc-smoke-matrix-runner-summary.md](./archive/m8-b-rc-smoke-matrix-runner-summary.md)                                             | M8-B RC smoke matrix runner / documentation cleanup foundation，新增 `ide:rc:*` 本地矩阵 runner、npm 入口与文档状态收口                                                                                                                                                            |
| [archive/m8-c-rc-quick-gate-summary.md](./archive/m8-c-rc-quick-gate-summary.md)                                                               | M8-C RC quick gate execution and blocker triage，稳定 quick matrix 的端口、BASE_URL、Vite smoke cache/watch 与失败残留清理                                                                                                                                                         |
| [archive/m8-d-full-domain-rc-matrix-summary.md](./archive/m8-d-full-domain-rc-matrix-summary.md)                                               | M8-D full/domain RC matrix execution and blocker triage，稳定完整 domain matrix 的端口隔离、外部 API 日志背压、LSP/Git smoke 启动重试和终端/debug selector 漂移                                                                                                                    |
| [archive/m8-e-rc-acceptance-baseline-summary.md](./archive/m8-e-rc-acceptance-baseline-summary.md)                                             | M8-E RC acceptance baseline and CI gate decision，固化 quick gate/full-domain matrix 分层验收策略，明确 CI workflow 暂不新增且后置到稳定 runner contract                                                                                                                           |
| [archive/m8-f-rc-release-checklist-summary.md](./archive/m8-f-rc-release-checklist-summary.md)                                                 | M8-F RC release checklist and post-M8 roadmap freeze，固化 RC 发布清单、日志留存、失败分级、签核要求和 post-M8 后置能力冻结                                                                                                                                                        |
| [archive/m8-g-rc-signoff-handoff-summary.md](./archive/m8-g-rc-signoff-handoff-summary.md)                                                     | M8-G RC signoff and release-candidate handoff，汇总 M8-A 至 M8-F RC 证据、分支卫生、release blocker 结论和 post-M8/M9-A 交接                                                                                                                                                       |
| [archive/m9-a-post-m8-roadmap-branch-hygiene-plan.md](./archive/m9-a-post-m8-roadmap-branch-hygiene-plan.md)                                   | M9-A post-M8 roadmap prioritization and branch-hygiene / release packaging decision，排序 post-M8 Git/LSP/Debug/Terminal 路线并明确当前混合分支的发布卫生策略                                                                                                                      |
| [archive/m9-b-git-branch-management-safety-plan.md](./archive/m9-b-git-branch-management-safety-plan.md)                                       | M9-B Git branch management safety plan，审计现有 Git service/client/Source Control 并定义 branch delete/rename/upstream set 的 guard、UI 与 smoke 边界                                                                                                                             |
| [archive/m9-c-git-branch-management-guarded-implementation-summary.md](./archive/m9-c-git-branch-management-guarded-implementation-summary.md) | M9-C Git branch management guarded implementation，接入受控本地 branch delete/rename/upstream set/unset API、Source Control 分支菜单与 smoke 验证                                                                                                                                  |
| [archive/m9-d-git-graph-blame-readonly-summary.md](./archive/m9-d-git-graph-blame-readonly-summary.md)                                         | M9-D Git graph / blame read-only foundation，接入只读 graph/blame API、Source Control 历史/Blame 入口与 smoke 验证                                                                                                                                                                 |
| [archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md](./archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md)                   | M10-A LSP semantic tokens / workspace symbols foundation plan，审计现有 LSP service/Monaco provider 并定义 M10-B semantic tokens 与 M10-C workspace symbols 的安全切片                                                                                                             |
| [archive/m10-b-lsp-semantic-tokens-summary.md](./archive/m10-b-lsp-semantic-tokens-summary.md)                                                 | M10-B LSP semantic tokens guarded implementation，接入 TS/JS semantic tokens API、WebSocket 消息、Monaco provider 与 smoke 验证，M10-C workspace symbols 仍后置                                                                                                                    |
| [archive/m10-c-lsp-workspace-symbols-summary.md](./archive/m10-c-lsp-workspace-symbols-summary.md)                                             | M10-C LSP workspace symbols foundation，接入 bounded TS/JS workspace symbols API、Search 视图符号模式、editor reveal 与 smoke 验证                                                                                                                                                 |
| [archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md](./archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md)     | M10-D LSP semantic/workspace symbols acceptance closeout，汇总 M10-A/B/C 完成口径、验证证据、后置边界和 M11-A 下一步入口                                                                                                                                                           |
| [archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md](./archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md)                           | M11-A post-M10 IDE intelligence roadmap and release gate plan，排序 Command Palette、watcher-backed index、多语言 LSP、Git/Debug parity 与 release gate，确定 M11-B 入口                                                                                                           |
| [archive/m11-b-command-palette-go-to-symbol-summary.md](./archive/m11-b-command-palette-go-to-symbol-summary.md)                               | M11-B IDE Command Palette / Go to Symbol shell foundation，新增命令面板壳层、复用 workspace symbols 与 editor reveal，并补 command palette smoke                                                                                                                                   |
| [archive/m11-c-watcher-backed-symbol-index-plan.md](./archive/m11-c-watcher-backed-symbol-index-plan.md)                                       | M11-C watcher-backed symbol index research and minimal plan，定义复用 M6 watcher/search 与 M10 workspace symbols 的索引边界、失效规则、预算和下一步 guarded implementation                                                                                                         |
| [archive/m11-c-b-watcher-backed-symbol-index-summary.md](./archive/m11-c-b-watcher-backed-symbol-index-summary.md)                             | M11-C-B watcher-backed symbol index guarded implementation，在既有 workspaceSymbols provider 内接入 root/path scope metadata index、stale rebuild、direct fallback 与 smoke 验证                                                                                                   |
| [archive/m11-d-multi-language-lsp-provider-plan.md](./archive/m11-d-multi-language-lsp-provider-plan.md)                                       | M11-D multi-language LSP provider research plan，核验当前依赖生态并定义 provider registry、JSON/HTML/CSS lightweight service 与外部 language server 后置边界                                                                                                                       |
| [archive/m11-e-a-provider-registry-summary.md](./archive/m11-e-a-provider-registry-summary.md)                                                 | M11-E-A provider registry extraction，新增 LSP provider capability matrix 与 registry dispatch，保持 JSON/TS/JS 既有行为并为后续 lightweight services 铺路                                                                                                                         |
| [archive/m11-e-b-json-language-service-summary.md](./archive/m11-e-b-json-language-service-summary.md)                                         | M11-E-B JSON official language service migration，接入 vscode-json-languageservice 并保持 Tracevane LSP contract / root guard / WorkspaceEdit 边界                                                                                                                                 |
| [archive/m11-e-c-html-css-language-services-summary.md](./archive/m11-e-c-html-css-language-services-summary.md)                               | M11-E-C HTML/CSS lightweight language services guarded implementation，接入官方 HTML/CSS language service 并保持 provider registry / LSP contract / root guard 边界                                                                                                                |
| [archive/m11-e-d-multi-language-provider-acceptance-summary.md](./archive/m11-e-d-multi-language-provider-acceptance-summary.md)               | M11-E-D multi-language provider acceptance closeout，汇总 JSON/TS/JS/HTML/CSS provider matrix、smoke 验证、后置边界与 M11-F 下一步入口                                                                                                                                             |
| [archive/m11-f-a-external-language-server-gateway-plan.md](./archive/m11-f-a-external-language-server-gateway-plan.md)                         | M11-F-A external language server gateway research plan，定义 stdio LSP gateway、进程生命周期、root/cwd/env guard、状态降级与 M11-F-B skeleton 入口                                                                                                                                 |
| [archive/m11-f-b-external-lsp-gateway-skeleton-summary.md](./archive/m11-f-b-external-lsp-gateway-skeleton-summary.md)                         | M11-F-B external language server gateway skeleton guarded implementation，新增 internal stdio gateway、framing、profile/status、cwd guard 与 mock LSP system test                                                                                                                  |
| [archive/m11-f-c-yaml-external-provider-proof-summary.md](./archive/m11-f-c-yaml-external-provider-proof-summary.md)                           | M11-F-C first real external language server provider proof，接入 YAML language server server-side profile 与现有 diagnostics contract                                                                                                                                              |
| [archive/m11-f-d-external-provider-lifecycle-status-summary.md](./archive/m11-f-d-external-provider-lifecycle-status-summary.md)               | M11-F-D external provider lifecycle/status hardening and acceptance closeout，固化外部 LSP provider status、stderr tail、lastError、crash/timeout/stop 可观测性                                                                                                                    |
| [archive/m11-g-external-provider-expansion-status-ui-plan.md](./archive/m11-g-external-provider-expansion-status-ui-plan.md)                   | M11-G external provider expansion and IDE status UI plan，规划 provider 扩展顺序、IDE status UI、安装/版本与 smoke 策略                                                                                                                                                            |
| [archive/m11-h-ide-external-provider-status-ui-summary.md](./archive/m11-h-ide-external-provider-status-ui-summary.md)                         | M11-H IDE external provider status UI foundation，接入 IDE StatusBar / Command Palette 的只读 external provider 状态入口与 smoke 验证                                                                                                                                              |
| [archive/m11-i-bash-external-provider-proof-summary.md](./archive/m11-i-bash-external-provider-proof-summary.md)                               | M11-I Bash external provider proof，接入 bash-language-server allowlisted profile、shell diagnostics 路由与 system/status smoke 验证                                                                                                                                               |
| [archive/m11-j-external-provider-installer-version-policy-plan.md](./archive/m11-j-external-provider-installer-version-policy-plan.md)         | M11-J External provider installer/version policy plan，固化 external provider 安装、exact pin、optional provider、audit/security gate 与 M11-K metadata/status 实现入口                                                                                                            |
| [archive/m11-k-external-provider-optional-status-summary.md](./archive/m11-k-external-provider-optional-status-summary.md)                     | M11-K External provider optional installer/status implementation，给 /api/lsp/status 与 IDE status dialog 增加 provider install/version/audit/policy 只读 metadata                                                                                                                 |
| [archive/m11-l-external-provider-dependency-hygiene-summary.md](./archive/m11-l-external-provider-dependency-hygiene-summary.md)               | M11-L External provider dependency hygiene / exact pin readiness，收紧 YAML/Bash external provider exact pin 并增加依赖治理系统测试                                                                                                                                                |
| [archive/m11-m-pyright-external-provider-plan.md](./archive/m11-m-pyright-external-provider-plan.md)                                           | M11-M Pyright external provider guarded implementation plan，定义 Pyright bundled npm exact-pin、server allowlist、Python diagnostics proof 与 M11-N 实现边界                                                                                                                      |
| [archive/m11-n-pyright-external-provider-summary.md](./archive/m11-n-pyright-external-provider-summary.md)                                     | M11-N Pyright external provider guarded implementation，接入 Pyright bundled npm exact-pin、server allowlisted profile、Python diagnostics 路由与 provider status smoke                                                                                                            |
| [archive/m11-o-external-provider-acceptance-expansion-decision.md](./archive/m11-o-external-provider-acceptance-expansion-decision.md)         | M11-O External provider acceptance / heavy provider expansion decision，固化 YAML/Bash/Pyright provider gate 并选择 M11-P Dockerfile guarded proof 作为下一步                                                                                                                      |
| [archive/m11-p-dockerfile-external-provider-summary.md](./archive/m11-p-dockerfile-external-provider-summary.md)                               | M11-P Dockerfile external provider guarded proof，接入 dockerfile-language-server-nodejs exact-pin、server allowlist、Dockerfile diagnostics 路由与 provider status smoke                                                                                                          |
| [archive/m11-q-markdown-vscode-langservers-extracted-plan.md](./archive/m11-q-markdown-vscode-langservers-extracted-plan.md)                   | M11-Q Markdown / vscode-langservers-extracted provider plan，核验 multi-bin provider pack 并决定 M11-R 只接入 Markdown external diagnostics/status proof                                                                                                                           |
| [archive/m11-r-markdown-external-provider-summary.md](./archive/m11-r-markdown-external-provider-summary.md)                                   | M11-R Markdown external provider guarded implementation，接入 vscode-markdown-language-server diagnostics/status proof 并保持同包 JSON/HTML/CSS/ESLint bins 禁用                                                                                                                   |
| [archive/m11-s-eslint-external-provider-safety-plan.md](./archive/m11-s-eslint-external-provider-safety-plan.md)                               | M11-S ESLint external provider project-config/runtime safety plan，定义 ESLint LSP 的 config/cwd/trust/runtime guard 与 M11-T diagnostics proof 边界                                                                                                                               |
| [archive/m11-t-eslint-external-provider-summary.md](./archive/m11-t-eslint-external-provider-summary.md)                                       | M11-T ESLint external provider guarded diagnostics implementation，接入受控 ESLint diagnostics/status proof 并保持 fix/format/code actions 后置                                                                                                                                    |
| [archive/m11-u-eslint-workingdirectories-hardening-plan.md](./archive/m11-u-eslint-workingdirectories-hardening-plan.md)                       | M11-U ESLint monorepo / workingDirectories hardening plan，固化 server-side derived allowlist、root/cwd guard、degraded status 与 M11-V guarded implementation 边界                                                                                                                |
| [archive/m11-v-eslint-workingdirectories-summary.md](./archive/m11-v-eslint-workingdirectories-summary.md)                                     | M11-V ESLint guarded workingDirectories implementation，后端派生 nearest marker workingDirectory，增加 monorepo/sibling/ignored-dir 测试，继续禁用 fix/format/code actions                                                                                                         |
| [archive/m11-w-external-provider-acceptance-decision.md](./archive/m11-w-external-provider-acceptance-decision.md)                             | M11-W External provider acceptance / next provider decision，验收冻结当前 JSON/HTML/CSS/TS/JS 与 YAML/Bash/Pyright/Dockerfile/Markdown/ESLint provider 批次，并选择 M12-A framework / heavy provider research plan 作为下一步                                                      |
| [archive/m12-a-framework-heavy-provider-plan.md](./archive/m12-a-framework-heavy-provider-plan.md)                                             | M12-A Framework / heavy language provider research plan，核验 Vue/Svelte 与 Go/Rust/Java/C/C++ provider 生态，选择 M12-B Vue / Svelte guarded proof plan 作为下一步                                                                                                                |
| [archive/m12-b-vue-svelte-provider-proof-plan.md](./archive/m12-b-vue-svelte-provider-proof-plan.md)                                           | M12-B Vue / Svelte framework provider guarded proof plan，核验 Vue/Svelte npm metadata 与 TypeScript peer 风险，选择 M12-C Vue external provider guarded diagnostics proof 作为下一步                                                                                              |
| [archive/m12-c-vue-external-provider-summary.md](./archive/m12-c-vue-external-provider-summary.md)                                             | M12-C Vue external provider guarded diagnostics proof，接入 @vue/language-server exact-pin、server allowlist、Vue diagnostics route 与 provider status metadata，下一步进入 M12-D Svelte dependency compatibility / TypeScript peer policy plan                                    |
| [archive/m12-d-svelte-typescript-peer-policy-plan.md](./archive/m12-d-svelte-typescript-peer-policy-plan.md)                                   | M12-D Svelte dependency compatibility / TypeScript peer policy plan，核验 svelte-language-server peer 与当前 TypeScript lock 状态，选择 M12-E Svelte external provider guarded diagnostics proof 作为下一步                                                                        |
| [archive/m12-e-svelte-external-provider-summary.md](./archive/m12-e-svelte-external-provider-summary.md)                                       | M12-E Svelte external provider guarded diagnostics proof，接入 svelte-language-server exact-pin、server allowlist、Svelte diagnostics route 与 provider status metadata，下一步进入 M12-F framework provider acceptance / heavy toolchain policy decision                          |
| [archive/m12-f-framework-provider-acceptance-toolchain-policy.md](./archive/m12-f-framework-provider-acceptance-toolchain-policy.md)           | M12-F framework provider acceptance / heavy toolchain policy decision，验收 Vue/Svelte framework proof，冻结 npm-first provider gate，并定义 Go/Rust/Java/C/C++ toolchain-backed provider 下一步策略                                                                               |
| [archive/m12-g-toolchain-provider-status-configuration-plan.md](./archive/m12-g-toolchain-provider-status-configuration-plan.md)               | M12-G Toolchain provider status / configuration foundation plan，定义 Go/Rust/Java/C/C++ provider 状态模型、配置边界、UI 呈现和 M12-H skeleton 实现入口                                                                                                                            |
| [archive/m12-h-toolchain-provider-status-skeleton-summary.md](./archive/m12-h-toolchain-provider-status-skeleton-summary.md)                   | M12-H Toolchain provider status skeleton guarded implementation，新增 Go/Rust/Java/clangd 只读 status candidates、Provider Status UI 区块与 guarded policy 验证，下一步进入 M12-I configuration / trust UI foundation                                                              |
| [archive/m12-i-toolchain-provider-configuration-trust-summary.md](./archive/m12-i-toolchain-provider-configuration-trust-summary.md)           | M12-I Toolchain provider configuration / trust UI foundation，新增 OpenClaw config 读取、allowlisted profile/trust 状态、runtime override 拒绝和 Provider Status 配置展示，下一步进入 M12-J Go/gopls runtime proof plan                                                            |
| [archive/m12-j-go-gopls-runtime-proof-plan.md](./archive/m12-j-go-gopls-runtime-proof-plan.md)                                                 | M12-J Go / gopls toolchain provider runtime proof plan，基于 Go 官方 gopls contract 定义 Go provider 的 workspace marker、trust/root guard、binary/version probe、diagnostics proof 和 CI skip/manual 策略，下一步进入 M12-K guarded runtime proof                                 |
| [archive/m12-k-go-gopls-guarded-runtime-summary.md](./archive/m12-k-go-gopls-guarded-runtime-summary.md)                                       | M12-K Go / gopls guarded runtime proof，接入受控 Go diagnostics 路由、go.work/go.mod marker、bounded version probe、mock stdio proof 与 degraded skip 行为，下一步进入 M12-L toolchain provider acceptance / next toolchain decision                                               |
| [archive/m12-l-toolchain-provider-acceptance-decision.md](./archive/m12-l-toolchain-provider-acceptance-decision.md)                           | M12-L Toolchain provider acceptance / next toolchain decision，验收 M12-G~K toolchain gate 与 Go/gopls proof，选择 M12-M Rust / rust-analyzer runtime proof plan 作为下一步                                                                                                        |
| [archive/m12-m-rust-analyzer-runtime-proof-plan.md](./archive/m12-m-rust-analyzer-runtime-proof-plan.md)                                       | M12-M Rust / rust-analyzer runtime proof plan，核验 rust-analyzer 官方契约、安全边界、Cargo workspace marker、version probe、degraded skip 与 M12-N guarded diagnostics proof 策略                                                                                                 |
| [archive/m12-n-rust-analyzer-guarded-runtime-summary.md](./archive/m12-n-rust-analyzer-guarded-runtime-summary.md)                             | M12-N Rust / rust-analyzer guarded diagnostics proof，接入受控 Rust diagnostics route、Cargo.toml/rust-project.json marker、bounded version probe、mock stdio proof 与 degraded skip 行为，下一步进入 M12-O toolchain provider acceptance / next heavy provider decision           |
| [archive/m12-o-toolchain-provider-acceptance-decision.md](./archive/m12-o-toolchain-provider-acceptance-decision.md)                           | M12-O Toolchain provider acceptance / next heavy provider decision，验收 Go+Rust toolchain diagnostics gate 并选择 M12-P C/C++ / clangd runtime proof plan 作为下一步                                                                                                              |
| [archive/m12-p-clangd-runtime-proof-plan.md](./archive/m12-p-clangd-runtime-proof-plan.md)                                                     | M12-P C/C++ / clangd runtime proof plan，核验 clangd 官方 stdio LSP、compile commands、`.clangd` 配置、background index 风险，并定义 M12-Q guarded diagnostics proof 策略                                                                                                          |
| [archive/m12-q-clangd-guarded-runtime-summary.md](./archive/m12-q-clangd-guarded-runtime-summary.md)                                           | M12-Q C/C++ / clangd guarded diagnostics proof，接入受控 clangd diagnostics route、compile_commands/compile_flags/.clangd marker、bounded version probe、mock stdio proof 与 degraded skip 行为，下一步进入 M12-R toolchain provider acceptance / Java JDT LS decision             |
| [archive/m12-r-toolchain-provider-acceptance-java-decision.md](./archive/m12-r-toolchain-provider-acceptance-java-decision.md)                 | M12-R Toolchain provider acceptance / Java JDT LS decision，验收 Go/Rust/clangd toolchain diagnostics gate，并决定下一步进入 M12-S Java / Eclipse JDT LS runtime proof plan                                                                                                        |
| [archive/m12-s-java-jdtls-runtime-proof-plan.md](./archive/m12-s-java-jdtls-runtime-proof-plan.md)                                             | M12-S Java / Eclipse JDT LS runtime proof plan，核验 Java 21+、launcher jar、OS config、per-workspace `-data` 与 Maven/Gradle import 风险，并定义 M12-T guarded diagnostics proof 策略                                                                                             |
| [archive/m12-t-java-jdtls-guarded-runtime-summary.md](./archive/m12-t-java-jdtls-guarded-runtime-summary.md)                                   | M12-T Java / Eclipse JDT LS guarded diagnostics proof，接入受控 Java diagnostics route、Maven/Gradle/Eclipse marker、Java 21+ probe、JDT LS launcher/config/data guard、mock stdio proof 与 degraded skip 行为                                                                     |
| [archive/m12-u-toolchain-provider-acceptance-closeout.md](./archive/m12-u-toolchain-provider-acceptance-closeout.md)                           | M12-U Toolchain provider acceptance / heavy provider closeout，验收 Go/Rust/clangd/Java guarded diagnostics proof，冻结 heavy provider 统一 guard/degraded 口径，并建议 M13-A 进入 post-diagnostics roadmap plan                                                                   |
| [archive/m13-a-toolchain-post-diagnostics-roadmap-plan.md](./archive/m13-a-toolchain-post-diagnostics-roadmap-plan.md)                         | M13-A Toolchain Provider Post-Diagnostics Roadmap Plan，核对 gopls/rust-analyzer/clangd/JDT LS 上游契约，决定先做 Provider Status / setup guidance UX，再选择 rich interaction 或 installer policy                                                                                 |
| [archive/m13-b-toolchain-provider-status-guidance-summary.md](./archive/m13-b-toolchain-provider-status-guidance-summary.md)                   | M13-B Toolchain Provider Status / Setup Guidance UX Foundation，扩展现有 LSP status payload 和 IDE Provider Status UI，展示 required runtime、workspace markers、config hint、degraded reasons、docs link 与复制建议；下一步进入 M13-C 单 provider rich interaction proof decision |
| [archive/m13-c-single-provider-rich-interaction-decision.md](./archive/m13-c-single-provider-rich-interaction-decision.md)                     | M13-C Single Provider Rich Interaction Proof Decision，选择 Go / gopls hover + definition guarded proof 作为第一个 toolchain-backed rich interaction 候选，并将 Rust/clangd/Java rich interactions、installer/discovery 继续后置                                                   |
| [archive/m13-d-go-gopls-hover-definition-plan.md](./archive/m13-d-go-gopls-hover-definition-plan.md)                                           | M13-D Go / gopls Hover + Definition Guarded Proof Plan，规划复用现有 hover/definition API、M12-K Go diagnostics guard、external gateway 与 mock stdio proof，下一步进入 M13-E guarded implementation                                                                               |
| [archive/m13-e-go-gopls-hover-definition-summary.md](./archive/m13-e-go-gopls-hover-definition-summary.md)                                     | M13-E Go / gopls Hover + Definition Guarded Implementation，接入现有 hover/definition API、M12-K Go guard 与 external gateway，完成 Go hover/definition mock stdio proof；下一步进入 M13-F rich interaction acceptance / next provider decision |
| [archive/m13-f-toolchain-rich-interaction-acceptance-decision.md](./archive/m13-f-toolchain-rich-interaction-acceptance-decision.md)             | M13-F Toolchain Rich Interaction Acceptance / Next Provider Decision，验收 Go/gopls hover+definition guard 模板，并选择 M13-G Rust / rust-analyzer hover+definition proof plan 作为下一步 |
| [archive/m13-g-rust-analyzer-hover-definition-plan.md](./archive/m13-g-rust-analyzer-hover-definition-plan.md)                                   | M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan，核验 rust-analyzer hover/definition、安全配置与 M12-N guard，规划 M13-H guarded implementation |
| [archive/m13-h-rust-analyzer-hover-definition-summary.md](./archive/m13-h-rust-analyzer-hover-definition-summary.md)                             | M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation，复用 M12-N Rust guard 与 M13-E Go 模板，接入 `/api/lsp/hover` 和 `/api/lsp/definition` 的 guarded Rust runtime |
| [archive/m13-i-toolchain-rich-interaction-product-pivot-plan.md](./archive/m13-i-toolchain-rich-interaction-product-pivot-plan.md) | M13-I Toolchain Rich Interaction Acceptance / Product Pivot Plan，验收 Go/Rust rich interaction proof，并建议暂停 toolchain 横向扩张，下一阶段切回远程改代码主链路审计 |
| [archive/m13-i-toolchain-rich-interaction-product-pivot-summary.md](./archive/m13-i-toolchain-rich-interaction-product-pivot-summary.md) | M13-I Toolchain Rich Interaction Acceptance / Product Pivot Decision，验收 Go/Rust guarded hover+definition proof，冻结模板，暂停 toolchain 横向扩张并转入 P0 主链路审计 |
| [archive/p0-remote-code-editing-mainline-audit-plan.md](./archive/p0-remote-code-editing-mainline-audit-plan.md) | P0 Remote Code Editing Mainline Audit Plan，按真实远程改代码路径审计打开/浏览/编辑/保存/Search/Problems/LSP/Git/Terminal 主链路 |
| [archive/p0-a-mainline-validation-baseline-summary.md](./archive/p0-a-mainline-validation-baseline-summary.md) | P0-A Remote Code Editing Mainline Validation Baseline，运行现有 typecheck 与 workbench/editor/save/search/problems/git/terminal smokes，建立主链路自动化基线 |
| [archive/p0-b-mainline-gap-audit-summary.md](./archive/p0-b-mainline-gap-audit-summary.md) | P0-B Mainline Gap Audit Summary，基于现有 smoke 与源码审计分层主链路 P0/P1/Parking-lot 缺口，并建议 P1-A Mainline UX Hardening Plan |
| [archive/p1-a-mainline-ux-hardening-plan.md](./archive/p1-a-mainline-ux-hardening-plan.md) | P1-A Mainline UX Hardening Plan，把 P0-B 缺口转为旧阶段文案清理、Explorer/Editor/Responsive/Persistence/Terminal 剪贴板验证切片 |
| [archive/p1-a-1-stale-copy-cleanup-summary.md](./archive/p1-a-1-stale-copy-cleanup-summary.md) | P1-A-1 User-facing Stale Copy Cleanup，清理 IDE 用户界面中残留的工程阶段名、placeholder 和旧阶段提示 |

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
- M7-E-D 已完成 Git branch / upstream status foundation；M7 Git Source Control 总体验收已完成；M7-F-A Debug Adapter Protocol 研究与最小实现计划已完成；M7-F-B Debug Gateway skeleton + Debug View shell、M7-F-C Breakpoints + editor reveal foundation、M7-F-D 最小真实 adapter proof、M7-F-E Debug acceptance closeout、M7.x-A Debug hardening plan、M7.x-B Debug lifecycle foundation、M7.x-C Launch profile / config foundation、M7.x-D Real Node inspector adapter minimal、M7.x-E Debug controls / scopes foundation、M7.x-F Debug Console watch / evaluate foundation、M7.x-G Debug hardening acceptance closeout、M7.y-A LSP / Git / Debug integration hardening plan、M7.y-B TypeScript / JavaScript LSP diagnostics foundation、M7.y-C TypeScript / JavaScript LSP interaction expansion plan、M7.y-D TypeScript / JavaScript hover and definition foundation、M7.y-E TypeScript / JavaScript completion foundation、M7.y-F LSP interaction acceptance closeout、M7.z-A LSP / Git / Debug post-M7 enhancement plan、M7.z-B Advanced LSP references foundation、M7.z-C LSP rename / formatting / code actions plan 与 M7.z-D Git remote operations foundation plan 与 M7.z-E Git remote operations foundation hardening 与 M7.z-F LSP WorkspaceEdit preview/apply foundation 与 M7.z-G LSP rename / formatting / code actions UI foundation 与 M7.z-H Git branch / stash UI foundation、M7.z-I Git branch / stash hardening and acceptance closeout 与 M7.z-J LSP / Git / Debug enhancement acceptance closeout 与 M8-A IDE stabilization and release-candidate plan 与 M8-B RC smoke matrix runner / documentation cleanup foundation 与 M8-C RC quick gate execution and blocker triage 与 M8-D full/domain RC matrix execution and blocker triage 与 M8-E RC acceptance baseline and CI gate decision 与 M8-F RC release checklist and post-M8 roadmap freeze 与 M8-G RC signoff and release-candidate handoff 与 M9-A post-M8 roadmap prioritization and branch-hygiene / release packaging decision 与 M9-B Git branch management safety plan 与 M9-C Git branch management guarded implementation 与 M9-D Git graph / blame read-only foundation 与 M10-A LSP semantic tokens / workspace symbols foundation plan 与 M10-B LSP semantic tokens guarded implementation、M10-C LSP workspace symbols foundation、M10-D LSP semantic/workspace symbols acceptance closeout、M11-A post-M10 IDE intelligence roadmap and release gate plan、M11-B IDE Command Palette / Go to Symbol shell foundation、M11-C watcher-backed symbol index research and minimal plan、M11-C-B watcher-backed symbol index guarded implementation 与 M11-D multi-language LSP provider research plan、M11-E-A provider registry extraction、M11-E-B JSON official language service migration、M11-E-C HTML/CSS lightweight language services guarded implementation、M11-E-D multi-language provider acceptance closeout 与 M11-F-A external language server gateway research plan、M11-F-B external language server gateway skeleton guarded implementation、M11-F-C first real external language server provider proof、M11-F-D external provider lifecycle/status hardening and acceptance closeout 与 M11-G external provider expansion and IDE status UI plan 与 M11-H IDE external provider status UI foundation 与 M11-I Bash external provider proof 已完成，M11-J External provider installer/version policy plan 已完成，M11-K External provider optional installer/status implementation、M11-L External provider dependency hygiene / exact pin readiness 与 M11-M Pyright external provider guarded implementation plan、M11-N Pyright external provider guarded implementation、M11-O External provider acceptance / heavy provider expansion decision、M11-P Dockerfile external provider guarded proof、M11-Q Markdown / vscode-langservers-extracted provider plan、M11-R Markdown external provider guarded implementation、M11-S ESLint external provider project-config/runtime safety plan、M11-T ESLint external provider guarded diagnostics implementation、M11-U ESLint monorepo / workingDirectories hardening plan、M11-V ESLint guarded workingDirectories implementation、M11-W External provider acceptance / next provider decision、M12-A Framework / heavy language provider research plan、M12-B Vue / Svelte framework provider guarded proof plan、M12-C Vue external provider guarded diagnostics proof、M12-D Svelte dependency compatibility / TypeScript peer policy plan、M12-E Svelte external provider guarded diagnostics proof、M12-F framework provider acceptance / heavy toolchain policy decision 与 M12-G Toolchain provider status / configuration foundation plan 已完成，M12-H 已完成 Toolchain provider status skeleton guarded implementation，M12-I 已完成 Toolchain provider configuration / trust UI foundation，M12-J 已完成 Go / gopls toolchain provider runtime proof plan，M12-K 已完成 Go / gopls guarded runtime proof，M12-L 已完成 toolchain provider acceptance / next toolchain decision，M12-M 已完成 Rust / rust-analyzer runtime proof plan；M12-N 已完成 Rust / rust-analyzer guarded diagnostics proof；M12-O 已完成 Toolchain provider acceptance / next heavy provider decision；M12-P 已完成 C/C++ / clangd runtime proof plan；M12-Q 已完成 C/C++ / clangd guarded diagnostics proof；M12-R 已完成 Toolchain provider acceptance / Java JDT LS decision；M12-S 已完成 Java / Eclipse JDT LS runtime proof plan；M12-T 已完成 Java / Eclipse JDT LS guarded diagnostics proof；M12-U 已完成 Toolchain provider acceptance / heavy provider closeout；M13-A 已完成 Toolchain Provider Post-Diagnostics Roadmap Plan；M13-B 已完成 Toolchain Provider Status / Setup Guidance UX Foundation；M13-C 已完成 Single Provider Rich Interaction Proof Decision；M13-D 已完成 Go / gopls Hover + Definition Guarded Proof Plan；M13-E 已完成 Go / gopls Hover + Definition Guarded Implementation；M13-F 已完成 Toolchain Rich Interaction Acceptance / Next Provider Decision；后续已完成 M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan 与 M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation；M13-I 已完成 Toolchain Rich Interaction Acceptance / Product Pivot Decision；P0-A 自动化主链路 baseline、P0-B gap audit 与 P1-A-1 旧阶段文案清理已完成；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。
- 验收见 `archive/m7-a-lsp-git-debug-plan.md`、`archive/m7-b-lsp-diagnostics-summary.md`、`archive/m7-c-lsp-interaction-summary.md`、`archive/m7-d-git-status-source-control-summary.md`、`archive/m7-e-a-git-diff-foundation-summary.md`、`archive/m7-e-b-git-stage-unstage-summary.md`、`archive/m7-e-c-git-commit-foundation-summary.md`、`archive/m7-e-d-git-branch-upstream-summary.md`、`archive/m7-git-execution-summary.md`、`archive/m7-f-a-debug-adapter-plan.md`、`archive/m7-f-b-debug-foundation-summary.md`、`archive/m7-f-c-debug-breakpoints-summary.md`、`archive/m7-f-d-debug-adapter-proof-summary.md` 与 `archive/m7-f-debug-execution-summary.md`、`archive/m7x-a-debug-hardening-plan.md`、`archive/m7x-b-debug-lifecycle-summary.md`、`archive/m7x-c-debug-launch-profile-summary.md`、`archive/m7x-d-debug-node-inspector-summary.md`、`archive/m7x-e-debug-controls-scopes-summary.md`、`archive/m7x-f-debug-watch-evaluate-summary.md`、`archive/m7x-debug-hardening-execution-summary.md`、`archive/m7y-a-lsp-git-debug-integration-plan.md`、`archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md`、`archive/m7y-c-typescript-javascript-lsp-interaction-plan.md`、`archive/m7y-d-typescript-javascript-hover-definition-summary.md`、`archive/m7y-e-typescript-javascript-completion-summary.md`、`archive/m7y-f-lsp-interaction-acceptance-summary.md`、`archive/m7z-a-lsp-git-debug-enhancement-plan.md`、`archive/m7z-b-lsp-references-summary.md`、`archive/m7z-c-lsp-rename-format-code-actions-plan.md`、`archive/m7z-d-git-remote-operations-plan.md`、`archive/m7z-e-git-remote-foundation-summary.md`、`archive/m7z-f-lsp-workspace-edit-summary.md`、`archive/m7z-g-lsp-rename-format-code-actions-summary.md`、`archive/m7z-h-git-branch-stash-ui-summary.md`、`archive/m7z-i-git-branch-stash-hardening-summary.md`、`archive/m7z-j-lsp-git-debug-enhancement-acceptance-summary.md`、`archive/m8-a-ide-stabilization-rc-plan.md` 与 `archive/m8-b-rc-smoke-matrix-runner-summary.md` / `archive/m8-c-rc-quick-gate-summary.md` / `archive/m8-d-full-domain-rc-matrix-summary.md` / `archive/m8-e-rc-acceptance-baseline-summary.md` / `archive/m8-f-rc-release-checklist-summary.md`、`archive/m9-d-git-graph-blame-readonly-summary.md`、`archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md`、`archive/m11-w-external-provider-acceptance-decision.md`、`archive/m12-a-framework-heavy-provider-plan.md`、`archive/m12-b-vue-svelte-provider-proof-plan.md`、`archive/m12-c-vue-external-provider-summary.md` 与 `archive/m12-d-svelte-typescript-peer-policy-plan.md`。
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

### M13-B 已完成：Toolchain Provider Status / Setup Guidance UX Foundation

M13-B 已完成，记录见 [`archive/m13-b-toolchain-provider-status-guidance-summary.md`](./archive/m13-b-toolchain-provider-status-guidance-summary.md)。本阶段在现有 `/api/lsp/status` 与 IDE Provider Status dialog 上增强 Go / Rust / clangd / Java toolchain provider 的 setup guidance，不新增第二套 API，不做安装或自动探测。

验收口径：

```txt
- /api/lsp/status 的 toolchainProviders.candidates[] 暴露 setupGuidance。
- 每个 provider 展示 required runtime、workspace markers、configuration hint、degraded reasons、docs link 和 copyable hint。
- IDE Provider Status UI 可见 setup guidance、配置片段、degraded reason 和 docs link，并提供复制建议入口。
- status policy 继续保持 readOnly=true、probesRuntimePath=false、acceptsFrontendCommandOverrides=false。
```

M13-B 不做：toolchain install/download/discovery、PATH 自动探测、自动写 OpenClaw config、Go/Rust/clangd/Java rich LSP runtime、Maven/Gradle import UI、clangd compile DB generator、Cargo metadata/proc macro UX implementation、第二套 LSP/Files/Search API、Git/Debug/Terminal 新能力或 File Manager Online Editor 产品壳变更。M13-C 已完成 Single Provider Rich Interaction Proof Decision；M13-D 已完成 Go / gopls Hover + Definition Guarded Proof Plan；M13-E 已完成 Go / gopls Hover + Definition Guarded Implementation；下一步进入 M13-F Toolchain Rich Interaction Acceptance / Next Provider Decision。

### M13-C 已完成：Single Provider Rich Interaction Proof Decision

M13-C 已完成，记录见 [`archive/m13-c-single-provider-rich-interaction-decision.md`](./archive/m13-c-single-provider-rich-interaction-decision.md)。本阶段是 docs-only decision：选择 Go / gopls hover + definition guarded proof 作为第一个 toolchain-backed rich interaction 候选。

验收口径：

```txt
- 下一阶段优先 Go / gopls hover + definition，而不是 completion/references/rename/formatting/codeAction。
- 复用 M12-K Go diagnostics proof 的 workspace marker、toolchain status/config/trust gate、version probe 和 degraded skip 模式。
- Rust、clangd、Java rich interactions 因 proc macro/build script、compile database、JDT LS import/indexing 等风险继续后置。
- installer/download/PATH discovery/auto-write config 继续后置到独立 policy stage。
```

M13-C 不做：Go hover/definition runtime、启动新的 language server、修改 `/api/lsp/hover` 或 `/api/lsp/definition` 行为、新增 provider installer、新增 UI 控件或命令。M13-D 已完成 Go / gopls Hover + Definition Guarded Proof Plan；M13-E 已完成 Go / gopls Hover + Definition Guarded Implementation；下一步进入 M13-F Toolchain Rich Interaction Acceptance / Next Provider Decision。

### M13-D 已完成：Go / gopls Hover + Definition Guarded Proof Plan

M13-D 已完成，记录见 [`archive/m13-d-go-gopls-hover-definition-plan.md`](./archive/m13-d-go-gopls-hover-definition-plan.md)。本阶段是 docs-only implementation plan：把 M13-C 选择的 Go / gopls hover + definition proof 收敛为后续实现阶段的 guard、routing、runtime budget、degraded matrix 和测试计划。

验收口径：

```txt
- 后续实现复用现有 /api/lsp/hover、/api/lsp/definition、IDE Monaco LSP provider 和 external gateway。
- Provider gate 必须沿用 M12-K Go diagnostics proof：trusted config、profileId=workspace、go.work/go.mod marker、root/path guard、bounded version/binary probe。
- 缺配置、未信任、缺 marker、缺 binary、unsupported version、timeout 都 degraded，不拖垮 IDE。
- M13-E 应先做 mock stdio system proof，再做 IDE smoke；真实 gopls 为 optional manual evidence。
```

M13-D 不做：runtime implementation、启动 gopls、修改 hover/definition API 行为、新增 tests/smoke 脚本、installer/discovery、Rust/clangd/Java rich interactions。下一步进入 M13-F Toolchain Rich Interaction Acceptance / Next Provider Decision。

### M13-E 已完成：Go / gopls Hover + Definition Guarded Implementation

M13-E 已完成，记录见 [`archive/m13-e-go-gopls-hover-definition-summary.md`](./archive/m13-e-go-gopls-hover-definition-summary.md)。本阶段把 Go / gopls hover + definition 接入现有 LSP service 与 external gateway：通过 trusted config、go.work/go.mod marker、bounded version probe 和 Files root/path guard 后请求 `textDocument/hover` / `textDocument/definition`；degraded 状态返回 empty，不拖垮 IDE。

验收口径：

```txt
- Go provider registry 标记 hover / definition capability。
- /api/lsp/hover 与 /api/lsp/definition 增加 Go branch，复用现有 response shape。
- Go helper 复用 M12-K diagnostics guard，不新增第二套 gopls runtime。
- definition location 经 workspace root guard 过滤。
- mock stdio system proof 覆盖 diagnostics、hover、definition。
```

M13-E 不做：Go completion/references/rename/formatting/codeAction、Rust/clangd/Java rich interactions、gopls install/download/PATH discovery、GOPATH/module management UX、新 UI 或第二套 API。M13-F 已完成 Toolchain Rich Interaction Acceptance / Next Provider Decision，后续已完成 M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan 与 M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation；M13-I 已完成 Toolchain Rich Interaction Acceptance / Product Pivot Decision；P0-A 自动化主链路 baseline、P0-B gap audit 与 P1-A-1 旧阶段文案清理已完成；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。

### M13-F 已完成：Toolchain Rich Interaction Acceptance / Next Provider Decision

M13-F 已完成，记录见 [`archive/m13-f-toolchain-rich-interaction-acceptance-decision.md`](./archive/m13-f-toolchain-rich-interaction-acceptance-decision.md)。本阶段不改 runtime，而是验收 M13-C~M13-E 的第一个 toolchain-backed rich interaction proof，并冻结 Go / gopls hover + definition guard 模板。

验收口径：

```txt
- toolchain rich interactions 继续复用现有 LSP routes，不新增第二套 API。
- provider runtime 只能在 API service / external gateway 中执行，前端与 Dockview 不拥有 toolchain runtime。
- 每个 toolchain rich provider 必须经过 trusted config、workspace marker、bounded version probe、external gateway、Files root/path guard。
- 缺配置、缺 marker、缺 binary、unsupported version 或 request failure 必须 degraded/empty。
- CI proof 以 mock stdio LSP server 证明 routing/shape/lifecycle；真实 binary 是 optional manual evidence。
```

M13-F 决定后续已完成 M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan 与 M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation；M13-I 已完成 Toolchain Rich Interaction Acceptance / Product Pivot Decision；P0-A 自动化主链路 baseline、P0-B gap audit 与 P1-A-1 旧阶段文案清理已完成；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。Rust 已有 M12-N diagnostics guard，可验证 M13-E 模板是否能迁移到第二个 toolchain provider；但 rust-analyzer 的 Cargo metadata、build scripts、proc macros 风险更高，因此 M13-G 先做 docs-only plan，不直接实现 runtime。

### M13-G 已完成：Rust / rust-analyzer Hover + Definition Guarded Proof Plan

M13-G 已完成，记录见 [`archive/m13-g-rust-analyzer-hover-definition-plan.md`](./archive/m13-g-rust-analyzer-hover-definition-plan.md)。本阶段不改 runtime，而是核验 rust-analyzer 官方安全/配置契约与 LSP hover/definition routes，规划如何复用 M12-N Rust diagnostics guard 与 M13-E Go rich interaction 模板。

验收口径：

```txt
- Rust rich interactions 继续复用现有 /api/lsp/hover 与 /api/lsp/definition。
- M13-H 应抽取 shared Rust guarded session helper，复用 trusted config、Cargo.toml/rust-project.json marker、bounded version probe、external gateway 与 root guard。
- hover/definition request failure、缺配置、缺 marker、缺 binary、unsupported version 必须 degraded/empty。
- definition location 必须过滤 workspace 外 URI；sysroot/external crate preview 后置。
- proc macro/build script/cargo metadata 风险继续由 explicit trusted workspace boundary 约束。
```

M13-G 不做 Rust runtime implementation、completion/references/rename/formatting/codeAction/semantic tokens、toolchain install/discovery、linkedProjects/workspace.discoverConfig UI、第二套 API 或 File Manager Online Editor 产品壳变更。M13-H 已完成 Rust / rust-analyzer Hover + Definition Guarded Implementation，M13-I 已完成 Toolchain Rich Interaction Acceptance / Product Pivot Decision；P0-A 自动化主链路 baseline、P0-B gap audit 与 P1-A-1 旧阶段文案清理已完成；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。
### M13-H 已完成：Rust / rust-analyzer Hover + Definition Guarded Implementation

M13-H 已完成，记录见 [`archive/m13-h-rust-analyzer-hover-definition-summary.md`](./archive/m13-h-rust-analyzer-hover-definition-summary.md)。本阶段把 M13-G plan 落地为 runtime：Rust provider 复用 M12-N trusted config + Cargo marker + bounded version probe + external stdio gateway guard，并在现有 `/api/lsp/hover` 与 `/api/lsp/definition` route 上返回 hover contents 与 definition locations。

M13-H 完成内容：

- `rustAnalyzerProvider` 从 diagnostics-only flow 抽为 shared guarded session helper。
- 新增 `hoverWithRustAnalyzer` 与 `defineWithRustAnalyzer`。
- `/api/lsp/hover` / `/api/lsp/definition` 增加 Rust branch。
- Rust definition locations 继续在 service 层通过 workspace root guard 过滤 root 外路径。
- Rust provider registry capability 更新为 diagnostics + hover + definition。
- system test 使用 mock stdio server 验证 hover / definition proof。

M13-H 不做：Rust completion/references/rename/formatting/codeAction/semantic tokens、rust-analyzer installer/download/PATH discovery、rustup/rust-src 管理、Cargo metadata/proc macro/build script UX、linkedProjects/workspace.discoverConfig UI、clangd/Java rich interactions、第二套 LSP/Files/Search API 或 File Manager Online Editor 产品壳变更。M13-I 已完成 Toolchain Rich Interaction Acceptance / Product Pivot Decision；P0-A 自动化主链路 baseline、P0-B gap audit 与 P1-A-1 旧阶段文案清理已完成；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。

### M13-I 已完成：Toolchain Rich Interaction Acceptance / Product Pivot Decision

M13-I 已完成，记录见 [`archive/m13-i-toolchain-rich-interaction-product-pivot-summary.md`](./archive/m13-i-toolchain-rich-interaction-product-pivot-summary.md)。本阶段不改 runtime，而是验收 M13-E Go/gopls 与 M13-H Rust/rust-analyzer 的 guarded hover + definition proof，并完成产品路线切换。

决策口径：

```txt
- Go + Rust rich interaction proof 验收通过。
- Go/Rust guarded rich interaction 模板冻结为未来 toolchain provider 参考实现。
- 暂停 clangd / Java hover + definition 横向扩张。
- 暂停 Go / Rust completion / references / rename / formatting / codeAction 深化。
- heavy toolchain provider 深化进入 parking lot。
- 下一阶段进入 P0 Remote Code Editing Mainline Audit。
```

M13-I 不做：新 runtime provider、clangd/Java rich interactions、Go/Rust deeper interactions、installer/download/PATH discovery、Git dangerous operations、Debug parity、Terminal advanced layout、第二套 Files/LSP/Git/Terminal API。P0-A 自动化主链路 baseline 已完成，记录见 [`archive/p0-a-mainline-validation-baseline-summary.md`](./archive/p0-a-mainline-validation-baseline-summary.md)；后续已完成 P0-B Mainline Gap Audit，P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。

### P0-A 已完成：Remote Code Editing Mainline Validation Baseline

P0-A 已完成，记录见 [`archive/p0-a-mainline-validation-baseline-summary.md`](./archive/p0-a-mainline-validation-baseline-summary.md)。本阶段使用现有自动化验证入口建立远程代码工作台主链路 baseline：typecheck、Workbench shell、Editor foundation、dirty/save、Search、Problems/Output、Git status/diff/stage/commit 与 Terminal foundation 均通过。

P0-A 不证明真实长目录、media/binary/large/readonly/deleted、外部修改冲突、terminal copy/paste/path insertion、刷新恢复、手机/窄屏等产品体验；这些已由 P0-B Mainline Gap Audit 分层，下一步进入 P1-A hardening。

### P1-A 已完成：Mainline UX Hardening Plan

P1-A 已完成计划归档，记录见 [`archive/p1-a-mainline-ux-hardening-plan.md`](./archive/p1-a-mainline-ux-hardening-plan.md)。本阶段不实现新能力，而是把 P0-B 缺口拆成可执行 hardening 切片：旧阶段文案清理、Explorer 真实工作流、Editor edge files、IDE responsive、跨 surface persistence 与 Terminal clipboard 手测矩阵。

P1-A-1 用户可见旧阶段文案清理已完成，记录见 [`archive/p1-a-1-stale-copy-cleanup-summary.md`](./archive/p1-a-1-stale-copy-cleanup-summary.md)。P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。

### P1-A-1 已完成：User-facing Stale Copy Cleanup

P1-A-1 已完成，记录见 [`archive/p1-a-1-stale-copy-cleanup-summary.md`](./archive/p1-a-1-stale-copy-cleanup-summary.md)。本阶段只清理 IDE 用户可见 copy，不新增能力；P1-A-2 Explorer mainline workflow 已完成，详见 [`archive/p1-a-2-explorer-mainline-summary.md`](./archive/p1-a-2-explorer-mainline-summary.md)。P1-A-3 Editor edge-files workflow 已完成，详见 [`archive/p1-a-3-editor-edge-files-summary.md`](./archive/p1-a-3-editor-edge-files-summary.md)。下一步进入 P1-A-4 Responsive layout workflow。
