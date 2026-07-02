# IDE 参考行为与术语对照

Purpose: 给 AI 编程代理和开发者建立同一个 IDE / VS Code 类 Workbench 认知基线，避免把在线编辑器、文件管理器、IDE 工作台、终端和面板概念混在一起。

本文件不是要求完整复刻 VS Code，也不是插件兼容规范。Tracevane 只参考主流代码 IDE 的交互语义，并按 M3/M4/M5/M6/M7 分阶段实现。

视觉提醒：本文建立的是 IDE 交互和术语共识，不是要求复刻 VS Code 主题。Tracevane 的 File Surface、IDE Workbench、Monaco、xterm、Dockview、Diff、Problems、Output 必须映射 `apps/web/src/design/theme.css` 中的 Aurora token，并遵守 `docs/界面设计守则.md`、`DESIGN.md` 和 `14-视觉主题与设计系统适配.md`。

AI/开发者不要把“像 VS Code 一样可拆分、可移动、可持久化”误解为“使用 VS Code Dark+ 配色、默认蓝色 drop target 或纯黑终端”。

## 1. 参考对象

本文中“IDE / VS Code 类工作台”指的是类似 Visual Studio Code、Cursor、JetBrains IDE 等产品的项目级开发界面，典型结构包括：

```txt
┌────────────────────────────────────────────────────┐
│ Activity Bar │ Primary SideBar │ Editor Area        │
│              │                 │                    │
│              │                 │ Editor Group Tabs  │
│              │                 │ Monaco Editor      │
├──────────────┴─────────────────┴────────────────────┤
│ Panel Area: Terminal / Problems / Output / Debug    │
├──────────────────────────────────────────────────────┤
│ Status Bar                                           │
└──────────────────────────────────────────────────────┘
```

长期可扩展到：

```txt
- Secondary SideBar
- Panel bottom/right placement
- Editor Group left/right/up/down split
- Terminal split/group
- Workbench View Movement
- Layout persistence and reset
```

## 2. 核心术语表

| 术语 | 含义 | Tracevane 阶段 |
|---|---|---|
| File Manager | 完整文件管理页面，负责目录浏览、上传、复制、移动、删除等文件管理任务 | 已有 |
| File Surface | 文件管理器内统一打开/编辑/预览窗口，文本走 Monaco，媒体/二进制走预览 | M2 已完成 |
| Online Editor | 文件管理器里的轻量在线编辑器，不是完整 IDE | M1/M2 已完成 |
| Mini Explorer | Online Editor 内可选轻量文件导航，只做当前/邻近目录浏览和文件操作入口 | M3 |
| IDE Workbench | 独立项目级开发工作台，包含 ActivityBar、SideBar、EditorArea、Panel、StatusBar | M4 起 |
| Activity Bar | 左侧竖向图标栏，用于切换 Explorer/Search/Git/Run/Extensions 等 View | M4 基础 |
| Primary SideBar | ActivityBar 当前 View 的主侧栏容器，M4 默认放 Explorer | M4 基础 |
| Secondary SideBar | 右侧副侧栏，长期用于 View Movement，不是 M4 必做 | M6/M7+ |
| Explorer View | IDE 里的完整资源管理器 View，复用 Explorer Core，但不是 Mini Explorer 容器 | M4 起 |
| Editor Area | IDE 中间编辑区域，包含一个或多个 EditorGroup | M4 起 |
| EditorGroup | 一个编辑组，拥有自己的 Tab 列表和当前激活 Tab，可左右/上下拆分 | M4 |
| Editor Tab | IDE 编辑区里的文件/预览 Tab，支持 preview/pinned/dirty/deleted 状态 | M4 |
| Panel Area | 底部或右侧面板容器，承载 Terminal/Problems/Output/Debug Console | M4 框架 |
| Terminal View | Panel 中的终端 View，M4 占位，M5 接真实 xterm/PTY | M5 |
| Terminal Tab | 一个终端 session 的标签页；M5 支持多 Tab | M5 |
| TerminalGroup / TerminalPane | 终端 split/group 布局模型；不同于 EditorGroup | M5.x |
| Problems View | 问题面板，M6 可展示结构化问题，M7 接 LSP diagnostics | M6/M7 |
| Output View | 输出面板，展示 channel/log 基础内容 | M6 |
| Debug Console | 调试控制台，M4 只占位，真实 Debug 后置 | M7.x |
| Workbench View | 可放入 SideBar/Panel 的 View，如 Explorer、Search、Terminal、Problems | M4 建模，后续移动 |
| View Movement | View 在 PrimarySideBar、SecondarySideBar、Panel 等容器之间移动 | M6/M7+ |

## 3. Online Editor / Mini Explorer / IDE Explorer 的区别

### Online Editor

```txt
用途：快速编辑/预览文件。
位置：文件管理器内弹窗或窗口。
核心：File Surface + Monaco + Tab + 保存安全。
不做：ActivityBar、Dockview、多编辑组、终端、Git、LSP、Debug。
```

### Mini Explorer

```txt
用途：在线编辑器里的轻量文件导航。
位置：File Surface 左侧可选侧栏或小屏抽屉。
核心：当前目录/邻近目录树、打开文件、基础文件操作。
复用：shared/explorer-core + explorer-ui primitives。
不做：完整 IDE SideBar、View Movement、Dockview、终端、Git、LSP。
```

### IDE Explorer View

```txt
用途：独立 IDE Workbench 的完整资源管理器 View。
位置：Primary SideBar，长期可参与 View Movement。
核心：项目级文件树、reveal active file、上下文菜单、Workbench 命令集成。
复用：shared/explorer-core + explorer-ui primitives。
不复用：Mini Explorer 产品壳、抽屉行为、在线编辑器布局状态。
```

关键原则：

```txt
不要做一个巨大的 <Explorer mode="mini|ide|file-manager" enableX=... /> 组件。
应该共享 core 和 primitives，产品 shell 分开。
```

## 4. Editor split 和 Terminal split 不是一回事

### Editor split

Editor split 是 Editor Area 内的编辑组拆分：

```txt
Editor Area
├─ EditorGroup A
│  ├─ file-a.ts tab
│  └─ file-b.ts tab
└─ EditorGroup B
   └─ file-c.ts tab
```

M4 目标：

```txt
- Split Right
- Split Down
- Tab 跨组拖拽
- EditorGroup 尺寸调整
- 每个 group 有自己的 active tab
```

### Terminal split

Terminal split 是 Terminal View 内的 terminal pane/group 拆分：

```txt
Terminal View
└─ TerminalGroup
   ├─ TerminalPane: session A
   └─ TerminalPane: session B
```

M5.x 目标：

```txt
- split terminal right/down
- pane resize/focus/close
- terminal group/pane layout persistence
```

不要把 Editor split 当成 Terminal split，也不要为了 M4 EditorGroup 提前实现 M5.x TerminalGroup。

## 5. Panel / View / Tab / Group 的区别

| 概念 | 是什么 | 常见错误 |
|---|---|---|
| Panel Area | Workbench 底部/右侧容器 | 当成普通不可移动 div |
| Workbench View | 放在 SideBar/Panel 里的功能视图 | 写死在某个 DOM 区域 |
| Editor Tab | EditorGroup 内的文件 Tab | 和 File Surface Tab 混用生命周期 |
| Terminal Tab | 一个终端 session 标签 | 和 Editor Tab 混用模型 |
| EditorGroup | 编辑区拆分单元 | 用 terminal group 代替 |
| TerminalGroup | 终端 split 单元 | 用 editor group 代替 |

## 6. VS Code 类交互参考

### Explorer 打开文件

```txt
单击文件：打开 preview tab。
继续单击另一个文件：复用当前 group 的 preview tab。
双击文件：打开 pinned tab。
编辑 preview tab：自动变 pinned。
已打开同一 rootId + path：同一 group 内只激活，不重复创建。
```

### Editor Tab

```txt
- 支持 dirty 标记。
- dirty tab 自动 pinned。
- 关闭 dirty tab 必须确认。
- rename/move 后同步 path/title/model key。
- delete dirty 文件后保留内容并标记 deleted。
```

### Panel

```txt
M4：底部 Panel 框架 + 固定 Tab，占位即可。
M5：Terminal Tab 接真实 xterm/PTY。
M5.x：Terminal split/group + Panel bottom/right placement。
M6+：Terminal/Problems/Output 等 View 进一步参与 dockable view 管理。
```

### Layout

```txt
- 用户可以调整 SideBar 宽度。
- 用户可以调整 Panel 高度。
- 用户可以 split editor group。
- 用户可以 reset layout。
- layout state 必须有 version/migration/fallback。
```

## 7. 阶段边界速查

| 阶段 | 做什么 | 明确不做 |
|---|---|---|
| M3 | Online Editor Mini Explorer + Shared Explorer Core | 不做 IDE Workbench、Dockview、终端、Git、LSP |
| M4 | IDE Workbench Layout Foundation | 不做真实终端、LSP、Git、Debug、全 View docking |
| M5 | Real Terminal Foundation | 不做 terminal split/group、Panel right placement、LSP/Git/Debug |
| M5.x | Terminal Split / Group / Panel Placement | 不做 LSP/Git/Debug，不做 Terminal editor-like tab |
| M6 | Watcher / Search / Problems / Output | 不做 LSP Gateway、Git、Debug |
| M7 | LSP / Git / Debug | 不一次性追完整 VS Code，先单语言 LSP、基础 Git、Debug 后置 |

## 8. AI 实现时的硬性提醒

交给 AI 编程代理时，必须遵守：

```txt
1. 不要凭“我知道 IDE”自由发挥；先读 00、01、04、08、09。
2. 不要把 M3/M4/M5/M6/M7 的范围混做。
3. 不要把 Mini Explorer 当成 IDE Explorer。
4. 不要把 Panel 当成普通底部 div 写死。
5. 不要把 Terminal split 提前塞进 M5。
6. 不要绕过 CommandService 直接让组件互相调用。
7. 不要用一个巨大 mode 参数组件承载所有 Explorer 场景。
8. 不要丢 dirty 内容；rename/move/delete/save/conflict 都必须优先保护用户内容。
9. 不要没有 layoutVersion/migration/fallback 就保存布局。
```

## 9. 非目标

```txt
- 不要求 1:1 复刻 VS Code UI。
- 不要求兼容 VS Code 插件市场。
- 不要求 M4 完成完整 IDE。
- 不要求 M5 完成所有终端布局能力。
- 不要求 M6 接入 LSP/Git/Debug。
```

最终目标是 IDE 级自由布局和项目级开发体验；阶段性交付只是降低当期范围，不降低最终能力边界。
