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

下一步 M6：Watcher / Search / Problems / Output
- 在真实 IDE Editor 基础可承载后，做文件 watcher、全局搜索、Problems 数据模型和 Output channel/log 基础；Problems 可先展示结构化问题数据，但真实 LSP diagnostics 到 M7。

后续 M7：LSP / Git / Debug
- 接 LSP、Git、Debug 方向能力；先单语言 LSP diagnostics + Problems，再 Git status/diff，stage/commit 与 Debug 分段后置。
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
