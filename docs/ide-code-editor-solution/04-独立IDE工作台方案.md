# 独立 IDE 工作台方案


## 当前实现状态（M4 已完成）

M4 Workbench Layout Foundation 已完成，验收记录见 [`archive/m4-execution-summary.md`](./archive/m4-execution-summary.md)。当前实现已经提供独立 `/ide` / `/ide/:workspaceId` 路由、`features/ide-workbench` 独立 Workbench shell、ActivityBar、SideBar Explorer、Editor Dock / Dockview placeholder tabs、Split Right / Split Down placeholder、底部 Panel placeholder tabs、StatusBar、sidebar/panel resize/collapse/maximize、layoutVersion + localStorage persistence + fallback/reset、IDE Explorer 文件操作，以及已打开 Dockview placeholder tab 在 rename/move/delete 时的 path/title/document id/deleted 同步。

M4 的完成状态只代表 **Workbench Layout Foundation** 完成：真实 Monaco 编辑内容与保存/dirty 冲突、Terminal/xterm/PTY、Terminal split/group、LSP、Git、Debug、Problems/Output 数据接入、watcher、Panel right placement、Secondary SideBar、完整 VS Code 行为和插件市场均后置。

## 1. 产品定位

独立 IDE 工作台是项目级开发入口。

它不是文件管理器弹窗的放大版，而是一个独立模块：

```txt
/ide/:workspaceId
```

目标是提供接近主流 IDE 的工作台骨架：

```txt
- 左侧 Activity Bar
- 左侧 Side Bar
- 中间 Editor Area
- 底部 Panel Area
- 可选右侧 Auxiliary Bar
- 底部 Status Bar
- 命令、快捷键、布局持久化
```

长期目标不是固定三栏，而是完整 IDE 级自由布局。默认形态可以是“左侧 Explorer + 中间 Editor + 底部 Panel/Terminal”，但最终产品必须支持主要区域移动、折叠、调整尺寸、拆分和恢复：

```txt
最终布局目标：
- Explorer / SideBar：默认左侧，可折叠、调宽、移动到右侧，恢复位置与宽度。
- Editor Area：多编辑组、左右/上下拆分、Tab 跨组拖拽、编辑组调尺寸、最大化/恢复。
- Terminal：默认底部 Panel，可折叠、调高、最大化/恢复、移动到底部或右侧，支持多终端 Tab 和终端 split/group。
- Problems / Output / Debug Console：可与 Terminal 在 Panel 内切换，长期支持 dock 到底部/右侧并恢复布局。
- Primary SideBar / Secondary SideBar：长期支持 View 在侧栏、副侧栏、Panel 之间移动。
```

阶段性推进不是降低最终目标。早期 M4 可以只做默认布局和必要折叠/尺寸调整，但布局模型不能把 Explorer、Panel 或 Terminal 写死为不可移动的固定 DOM 区域。

## 2. 为什么不能做固定布局

如果用固定结构：

```txt
左侧文件树固定宽度
中间编辑器 flex: 1
底部终端 fixed height
```

后期会遇到这些问题：

```txt
- 编辑器不能左右拆分。
- Tab 不能拖到第二个编辑组。
- Problems / Terminal / Output 不能自由切换位置。
- 布局不能持久化。
- 用户自定义布局很难恢复。
- 多面板焦点、尺寸、快捷键冲突越来越多。
```

因此独立 IDE 应该从第一版就引入 docking layout。

## 3. 推荐布局技术

推荐优先评估：

```bash
npm i dockview
```

理由：

```txt
- 更贴近 IDE-like docking layout。
- 支持 panel、group、tab、split、drag and drop。
- 支持布局序列化和恢复。
- 适合中大型工作台。
```

备选：

```txt
FlexLayout
- 适合 React docking layout。
- 成熟度可以。

react-mosaic
- 适合分屏布局。
- 更像 tiling window manager，IDE Tab 体系需要额外实现。

GoldenLayout
- 历史较久。
- 新项目需要评估 React 集成和维护情况。
```

不建议：

```txt
- 自己手写拖拽 docking。
- 只用普通 resizable panels 做完整 IDE。
- 先固定布局后面再改成 docking。
```

即使 M4 只把 Dockview 主要用于 Editor Area，也要在状态模型中预留 Workbench 区域 placement/visibility/size/collapsed/version，避免后续实现 Secondary SideBar、Terminal 右侧停靠、Panel docking 时大规模重构。

## 4. 工作台结构

```txt
IdeWorkbench
├─ MenuBar
├─ MainArea
│  ├─ ActivityBar
│  ├─ SideBar
│  │  ├─ ExplorerView
│  │  ├─ SearchView
│  │  ├─ SourceControlView
│  │  ├─ RunView
│  │  └─ ExtensionsView
│  ├─ EditorDock
│  │  ├─ EditorGroup
│  │  └─ EditorTab
│  └─ AuxiliaryBar
├─ PanelArea
│  ├─ TerminalView
│  ├─ ProblemsView
│  ├─ OutputView
│  └─ DebugConsoleView
└─ StatusBar
```

第一版可以只实现：

```txt
- ActivityBar: Explorer
- SideBar: ExplorerView
- EditorDock: 多 Tab + 可拆分编辑组
- PanelArea: Terminal / Problems / Output 框架
- StatusBar: 基础状态
```

## 5. Activity Bar

Activity Bar 是左侧功能入口。

建议预留：

```txt
- Explorer
- Search
- Source Control
- Run and Debug
- Extensions
- Settings
```

第一版只启用：

```txt
- Explorer
- Search 可后置
```

状态：

```ts
type ActivityId =
  | "explorer"
  | "search"
  | "git"
  | "run"
  | "extensions"
  | "settings";
```

ActivityBar 后续不应只是硬编码按钮列表，而应映射到 Workbench View。M4 可以只实现 `explorer`，但状态模型要能扩展到 Search、Source Control、Run、Extensions 等 View。

## 6. Side Bar

Side Bar 根据 active activity 展示不同内容。

第一版 ExplorerView：

```txt
- workspace root
- 文件树（复用 Explorer Core）
- 新建文件
- 新建目录
- 刷新
- 折叠全部
- 右键菜单
- 打开文件
- 重命名
- 删除
```

后续 SearchView：

```txt
- 全局搜索
- 文件过滤
- 正则
- 区分大小写
- 搜索结果跳转
```

后续 SourceControlView：

```txt
- Git status
- changed files
- stage/unstage
- commit
- branch
```


### 与 Mini Explorer 的共享关系

独立 IDE 的 Explorer 不是直接复用在线编辑器 Mini Explorer 容器组件，而是复用 `shared/explorer-core` 和可组合 `shared/explorer-ui` primitives：

```txt
复用：
- ExplorerNode / ExplorerLocation 类型
- 目录 query 与 refresh
- 展开/选中/reveal 状态模型
- 新建、重命名、删除、复制、移动命令
- 文件图标、排序、权限判断、路径工具
- 基础树节点、加载/空/错误状态、基础菜单项

不复用：
- 在线编辑器弹窗布局
- Mini Explorer 抽屉行为
- Mini Explorer 操作菜单排序
```

IDE Explorer 自己负责 ActivityBar、SideBar、Dockview、多编辑组和 Workbench 命令集成。这样在线编辑器先做轻量导航时，不会阻碍后续完整 IDE，也不会形成一个靠大量 `mode` 参数支撑所有场景的大 Explorer 组件。

### Workbench View 容器模型

Explorer、Search、Source Control、Run、Extensions、Outline、Terminal、Problems、Output、Debug Console 都应视为 Workbench View，而不是写死在某个 DOM 区域里的特殊组件。

```ts
type WorkbenchViewId =
  | "explorer"
  | "search"
  | "source-control"
  | "run"
  | "extensions"
  | "outline"
  | "terminal"
  | "problems"
  | "output"
  | "debug-console";

type WorkbenchViewContainerId =
  | "primary-sidebar"
  | "secondary-sidebar"
  | "panel";

type WorkbenchViewPlacement = {
  viewId: WorkbenchViewId;
  containerId: WorkbenchViewContainerId;
  order: number;
  visible: boolean;
  collapsed?: boolean;
};
```

M4 只实现：

```txt
- PrimarySideBar + ExplorerView。
- activeActivity = "explorer"。
- Panel 中固定 Terminal / Problems / Output / Debug Console tab。
- viewPlacements 状态可以存在，但只包含 explorer 和固定 panel tabs。
```

M4 不做：

```txt
- View 拖拽到 SecondarySideBar。
- View 从 SideBar 移到 Panel。
- Search/Git/Run/Extensions/Outline 真实实现。
- ActivityBar 动态注册 View。
- 自定义 View 排序 UI。
```

后续 M6/M7+ 基于同一 `viewPlacements` 模型实现 SecondarySideBar、View 移动、排序、显示/隐藏和 Reset View Locations。

## 7. Editor Area

Editor Area 是独立 IDE 的核心。

能力要求：

```txt
- 多 Tab
- 多编辑组
- Tab 拖动排序
- Tab 拖到其他组
- 左右拆分
- 上下拆分
- 关闭当前
- 关闭其他
- 关闭右侧
- 关闭已保存
- 保存全部
- 预览 Tab
- 固定 Tab
```

### 编辑组模型

```ts
type IdeEditorGroup = {
  id: string;
  activeTabId?: string;
  tabIds: string[];
};
```

### Tab 模型

```ts
type IdeEditorTab = {
  id: string;
  groupId: string;
  rootId: string;
  path: string;
  title: string;
  kind: "text" | "image" | "video" | "audio" | "pdf" | "binary" | "unsupported";
  dirty: boolean;
  pinned: boolean;
  preview: boolean;
  deleted?: boolean;
  readonly: boolean;
  viewState?: unknown;
};
```

同一个 EditorGroup 内，同一 `rootId + path` 不应重复打开；重复打开只激活已有 Tab。不同 EditorGroup 可以打开同一文件，但必须共享底层 Monaco model / FileService / dirty-save 状态。

### 打开目标

```ts
type IdeOpenTarget =
  | "current-group"
  | "side-group"
  | "below-group"
  | "preview-current-group";
```

行为规则：

```txt
- Explorer 单击文件：open target = preview-current-group，复用当前 group 的 preview tab。
- Explorer 双击文件：open target = current-group，打开为 pinned tab；已打开则激活。
- Open to Side：open target = side-group，没有右侧 group 就创建。
- Split Down：open target = below-group，没有下方 group 就创建。
- 编辑 preview tab、手动保存、拖动 tab、右键 pin 后，preview tab 变 pinned。
- dirty tab 必须自动 pinned，关闭 dirty tab 必须确认。
```

### 预览 Tab

建议支持 VS Code 类似逻辑：

```txt
- 单击文件打开 preview tab。
- 再单击另一个文件，复用 preview tab。
- 双击文件、编辑内容、手动保存、拖动 tab 或右键 pin 后，preview tab 变为 pinned。
- pinned tab 不会被后续单击替换。
- dirty tab 必须自动 pinned。
```

这个能力能避免用户单击浏览文件时打开大量 Tab。

### 与 File Surface 的关系

IDE EditorArea 和文件管理器在线编辑器 File Surface 共享底层能力，但不共享窗口和 Tab 生命周期：

```txt
共享：
- FileService / 文件 API hooks
- Monaco model / language resolver / file type resolver
- Dirty/save/conflict 逻辑
- 媒体预览 panel 的底层组件

不共享：
- FileOnlineEditorDialog 窗口壳
- 在线编辑器 TabBar 状态
- Mini Explorer 抽屉状态
- IDE EditorGroup / Dockview layout 状态
```

即：`File Surface tab lifecycle != IDE EditorGroup tab lifecycle`，但底层文件、model、保存服务必须一致。

文件操作同步同样走共享 EditorService：

```txt
- IDE Explorer rename / move 已打开文件：所有命中的 EditorGroup Tab 更新 path/title，dirty 内容保留。
- IDE Explorer delete 已打开 clean 文件：可以关闭 Tab 或标记 deleted。
- IDE Explorer delete 已打开 dirty 文件：必须保留内容并标记 deleted，提示另存为/重新创建/放弃修改。
- 同一 rootId + path 在多个 EditorGroup 打开时，所有 Tab 同步同一次 path 迁移或 deleted 状态。
```

## 8. Panel Area

PanelArea 是 IDE Workbench 的底部面板框架。M4 只做布局容器和固定 Tab，占位必须清楚表达“尚未接入真实能力”，避免把空壳误认为已完成终端、诊断或日志系统。

M4 固定 Panel Tab：

```txt
- Terminal
- Problems
- Output
- Debug Console
```

M4 Panel 能力：

```txt
- 默认固定在底部
- 显示/隐藏
- 折叠/展开
- 拖拽调整高度
- 切换 active panel tab
- 最大化/恢复
- 关闭 panel 等价于隐藏或折叠，不销毁未来真实会话
- 布局持久化
```

M4 Panel 内容边界：

```txt
- Terminal 只做占位或空状态，不接真实 PTY
- Problems 只做占位或空状态，不接 LSP diagnostics
- Output 只做占位或空状态，不接日志 channel
- Debug Console 只做占位或空状态，不接调试运行时
```

M4 不做：

```txt
- Panel 移到右侧
- Terminal / Problems / Output / Debug Console 拖到 SideBar
- Terminal split / terminal group
- Terminal 真实 xterm + WebSocket + node-pty
- Problems / Output / Debug Console 真实数据接入
```

长期目标：

```txt
- Panel 可在 bottom / right placement 间切换
- Terminal / Problems / Output / Debug Console 作为 Workbench View 参与 View Movement
- Terminal 在 M5 接真实 xterm + PTY
- Terminal split / group 在 M5.x 做
- Problems 后续接 LSP diagnostics
- Output 后续接任务日志、语言服务日志、Git/Agent 运行日志
- Debug Console 后续接调试协议
```

## 9. Terminal View

终端前端：

```txt
- xterm.js 渲染
- 多终端 Tab
- 新建终端
- 关闭终端
- 清屏
- 复制
- 粘贴
- 搜索输出
- resize
```

终端后端：

```txt
- WebSocket
- node-pty
- workspace cwd
- sessionId
- shell 类型
- kill
- heartbeat
```

终端不要在第一版伪造太多执行能力。如果没有后端 PTY，只能作为占位或输出面板。

## 10. Status Bar

建议状态项：

```txt
- workspace 名称
- Git 分支
- 当前文件语言
- 当前行列
- 编码
- 换行符
- 缩进
- 保存状态
- 终端连接状态
- LSP 状态
- Problems 数量
```

第一版可以实现：

```txt
- workspace
- path
- language
- line/column
- encoding
- eol
- dirty/saved
```

## 11. Command Palette

建议从架构上预留命令面板。

命令示例：

```txt
File: Save
File: Save All
File: Close Editor
File: Close Others
View: Toggle Sidebar
View: Toggle Terminal
Editor: Split Right
Editor: Split Down
Terminal: New Terminal
Terminal: Kill Terminal
Workbench: Reset Layout
```

第一版可以不做完整 UI，但命令注册机制要有。

### 11.1 CommandService / 菜单 / 快捷键

独立 IDE 的 Explorer、EditorArea、PanelArea、TerminalView 不应彼此直接调用。所有用户入口统一转换成 CommandService 命令：

```txt
- ActivityBar / SideBar 按钮
- Explorer 右键菜单
- Editor Tab 菜单
- Toolbar 按钮
- 快捷键
- 后续 Command Palette
```

M4 命令范围：

```txt
- file.open / file.save / file.saveAll / file.close
- explorer.rename / explorer.delete / explorer.copy / explorer.move / explorer.refresh
- editor.splitRight / editor.splitDown
- workbench.toggleSidebar / workbench.togglePanel / workbench.resetLayout
```

M5 起再启用真实终端命令：

```txt
- terminal.new
- terminal.kill
- terminal.splitRight / terminal.splitDown（M5.x）
```

命令 handler 负责权限、dirty 确认、保存冲突、路径同步和布局状态更新；组件只负责展示和收集必要参数。

## 12. 布局持久化

布局状态必须带 `layoutVersion`。任何 schema 变化都要提供 migration；版本不兼容、布局恢复失败或保存数据损坏时，必须 fallback 到默认布局，不能让 IDE 白屏，并提供 `workbench.resetLayout`。

M4 必须保存：

```txt
- layoutVersion
- SideBar placement：left | right（M4 只实际使用 left）
- SideBar visible / collapsed / width
- SecondarySideBar visible / collapsed / width（预留）
- Panel placement：bottom | right（M4 只实际使用 bottom）
- Panel visible / collapsed / size / maximized / activePanelId
- viewPlacements：WorkbenchViewPlacement[] 默认状态
- active activity
- dockview layout
- 打开的 Tab
- active group
- active tab
- Explorer 展开节点和选中节点
```

M4 不保存：

```txt
- 真实 terminal session
- terminal scrollback
- LSP / Git / Debug runtime 状态
- hover、临时 selection、拖拽中的中间态
```

保存级别：

```txt
用户级：
- 字体大小
- 主题
- 快捷键
- 通用布局偏好

workspace 级：
- 打开的文件
- 编辑组拆分
- 当前 active tab / active group
- Explorer 展开节点和选中节点
- SideBar / Panel / viewPlacements

session 级：
- 当前 focus
- hover
- 临时 selection
- 拖拽中的中间态
```

恢复流程：

```txt
load layout state
→ 检查 layoutVersion
→ 逐版本 migrate 到当前 schema
→ 校验必要字段和 Dockview layout
→ 成功则恢复
→ 失败则 fallback 默认布局，并保留损坏数据用于调试日志
```

Reset Layout：

```txt
workbench.resetLayout
→ 清除 workspace 布局状态
→ 恢复默认：左 Explorer + 中 Editor + 底 Panel
→ 不删除用户级主题/字体/快捷键
→ 不删除 dirty 编辑内容
```

## 13. 独立 IDE 第一版范围（M4 已完成）

M4 是 **IDE Workbench Layout Foundation**，不是完整自由布局终局，也不是 M5 真实终端或 M7 LSP/Git/Debug。当前 M4 已交付一个可用、可恢复、可继续扩展的默认 Workbench。

默认布局：

```txt
┌────────────────────────────────────────────┐
│ ActivityBar │ Explorer │ EditorArea        │
│             │          │                   │
├─────────────┴──────────┴───────────────────┤
│ PanelArea: Terminal / Problems / Output    │
├────────────────────────────────────────────┤
│ StatusBar                                  │
└────────────────────────────────────────────┘
```

M4 已完成：

```txt
- /ide/:workspaceId 独立入口
- ActivityBar 在最左侧
- PrimarySideBar / Explorer 在左侧
- Explorer 可显示/隐藏、折叠/展开、调整宽度
- ExplorerView 加载文件树并打开文件到当前编辑组
- ExplorerView 基于 shared/explorer-core + shared/explorer-ui primitives
- Editor Dock / Dockview placeholder tabs
- Dockview 编辑区布局
- 多 EditorGroup
- Split Right
- Split Down
- Split Right / Split Down placeholder
- Dockview layout serialize / restore
- active group / active tab 状态
- 底部 Panel 框架
- Panel 可显示/隐藏、折叠/展开、调整高度、最大化/恢复
- Terminal / Problems / Output / Debug Console tab 切换
- Terminal / Problems / Output / Debug Console 只做固定底部 placeholder tabs
- Status Bar
- 布局保存/恢复
- 布局状态预留 SideBar/Panel placement、visible、collapsed、size、version
```

M4 只预留、不做，后置到 M5+：

```txt
- 真实 Monaco 编辑内容与保存/dirty 冲突
- Explorer 移到右侧
- SecondarySideBar
- View 在 SideBar / Panel 间拖动
- Panel 移到右侧
- Panel / View 任意 docking
- Terminal / xterm / PTY
- Terminal split/group
- Problems / Output 数据接入
- watcher 外部变更监听
- Panel right placement
- Git
- LSP
- Debug
- 插件市场
- 完整 VS Code 兼容扩展
- 复杂多窗口 popout
- 多窗口跨浏览器窗口拖拽
```

## 14. M4 验收标准

M4 验收名称已收敛为 **IDE Workbench Layout Foundation 验收**，不是“完整 IDE 验收”。验收重点是默认工作台、编辑组 placeholder、面板框架、布局恢复和文件状态安全。

已通过 / 已覆盖：

```txt
- `/ide` / `/ide/:workspaceId` 独立入口能加载默认布局，不依赖文件管理器弹窗。
- 默认布局是左 ActivityBar + 左 Explorer + 中 EditorDock + 底 PanelArea + StatusBar。
- Explorer 可以折叠/展开、调整宽度，并打开文件到 Dockview placeholder tab。
- Explorer 支持新建文件/目录、重命名、删除、复制、移动、复制路径。
- EditorDock 支持 placeholder tab、preview/pinned 基础状态和 Split Right / Split Down placeholder。
- Panel 能切换 Terminal / Problems / Output / Debug Console 固定 placeholder Tab。
- Panel 能显示/隐藏、折叠/展开、调整高度、最大化/恢复。
- 布局刷新后可恢复：SideBar、Panel、Editor dockview layout、active group/tab、viewPlacements。
- 布局损坏或版本不兼容时 fallback 默认布局，不能白屏。
- workbench.resetLayout 可恢复默认布局。
- Explorer rename / move 已打开文件或目录时，同步 Dockview placeholder tab 的 path/title/document id 和 layout metadata。
- Explorer delete 已打开文件或目录时保留 tab 并标记 deleted，不静默关闭。
- `smoke:ide:workbench-layout` 覆盖 `/ide` 基础布局、Explorer 打开文件、Split Right / Split Down 和 reset layout 不白屏。
```

M4 验收不要求：

```txt
- 真实 Monaco 编辑内容与保存/dirty 冲突。
- 真实 xterm + PTY 终端。
- Terminal split / terminal group。
- Problems 真实 diagnostics。
- Output 真实日志 channel。
- Debug Console 真实调试运行时。
- watcher 外部变更监听。
- LSP。
- Git。
- Debug。
- 右侧 Panel。
- Explorer 移到右侧。
- SecondarySideBar。
- 全 View docking / View Movement。
- 插件市场或 VS Code 扩展兼容。
- 多浏览器窗口 popout。
```
