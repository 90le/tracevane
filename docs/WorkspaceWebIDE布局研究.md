# Workspace Web IDE 布局研究

> 状态：Active research/design note
> 更新：2026-06-25

## 1. 当前外部参考

- VS Code / VS Code Web（2026-06-25 复核官方 User Interface / Custom Layout 文档）：Activity Bar 用于切换 Explorer/Search/Source Control 等视图，Primary Side Bar 显示当前活动视图；编辑器是中心主对象，终端属于 panel/workbench surface。
- Zed：Project panel、Search、Git、Terminal、Editor panes 均由命令和 pane 系统组织；Command Palette 是低频动作入口。
- Eclipse Theia：证明 Web IDE 应有 main/side/bottom shell、widget/dock layout 和布局恢复能力，但完整 Theia 作为嵌入依赖过重。
- Dockview（2026-06-25 复核官方 Introduction / Core Concepts / Saving State 文档）：React 绑定支持 IDE-like dock layout、tabs/groups/drag-drop/floating/popout/serialization，适合作为 Tracevane 自有 Workbench 的布局内核。
- Monaco Editor：VS Code 编辑器核心，适合替换临时 CodeMirror 编辑器，承载 Markdown/code 编辑体验。

## 2. 选型结论

不嵌入完整 Theia / OpenVSCode / code-server；采用：

```text
Dockview React + Monaco Editor + xterm.js + Tracevane Files/Search/Git/API panels
```

原因：完整 IDE 会反客为主，迫使 Tracevane 的 Gateway、IM、CLI Agents、OpenClaw 进入别人的 extension/runtime 模型。Dockview + Monaco 只接管通用 IDE 基础设施，业务层仍由 Tracevane owner 控制。

## 3. 新 Workbench 结构

```text
WorkspaceWorkbench
├─ TopBar
├─ ActivityBar
├─ SidePanel（ActivityBar 控制：Explorer/Search/Git）
├─ DockviewReact
│  ├─ MonacoEditorPanel
│  ├─ MarkdownPreviewPanel
│  └─ TerminalPanel
└─ StatusBar
```

## 4. 已推翻/删除

- 旧 `/ide` 与旧 `/files` feature 目录。
- 临时 `WorkspaceShell`。
- 临时 `commands/` command palette/keybinding 层。
- 临时 `layout/` 自研 DockTree/PaneGroup/dock reducer。
- 独立 `WorkspaceFileManager` surface。
- speculative `agent/evidence/stores` 前端目录。
- CodeMirror 编辑器栈与依赖。
- 历史 HTML 原型与旧 Vue 审计文档。

## 5. 当前落地

- `/workspace` 渲染 `WorkspaceWorkbench`。
- `ActivityBar` 管理左侧 `Explorer/Search/Git` 的展开、收起和切换；这些侧栏功能不进入 Dockview 标签组，避免“活动栏 + Dock tab + 面板标题”三重重复。
- `DockviewReact` 只管理可自由拆分/拖拽/组合的工作区面板：Editor、Preview、Terminal。
- Dockview layout 序列化到 `tracevane.workspace.dockview.v2`，主动丢弃 v1 中把 Explorer/Search/Git 持久化为 Dock tab 的旧布局。
- `CodeEditor` 已替换为 Monaco React wrapper。
- xterm.js 终端保留。
- Files/Search/Git 面板复用当前 Tracevane API 业务层。

## 6. 下一步

1. 视觉原型细化：接近专业 IDE 的 dark workbench，而不是后台卡片。
2. Markdown panel 完成 `Edit / Preview / Markdown` 三态；Preview 时允许旁路编辑。
3. Dockview context menu 与 ActivityBar active state 接入真实 group/panel 状态。
4. 增加 Workspace browser smoke：打开文件、切换 preview、拖动 panel、重置布局。
5. 再评估是否需要 LSP、diagnostics、problems、ports 等高级 IDE 子系统。

## 7. 主题约束补充

第三方 IDE 截图只作为交互结构参考：ActivityBar、Explorer/Search/Git、Editor/Preview、Terminal、dock/split。Tracevane 不复刻其菜单栏、硬编码暗色、窗口按钮或品牌视觉。

实现约束：

- Workbench 必须使用 `apps/web/src/design/theme.css` token：`bg-canvas`、`bg-panel`、`text-ink`、`primary` 等。
- 必须兼容浅色和深色模式；Dockview 样式通过 CSS custom properties 接入 Tracevane token。
- 顶部栏只保留 Tracevane Workspace 上下文和必要布局动作，不复制桌面 IDE 全菜单。
- 后续视觉原型先在 Tracevane 主题内做，不能把第三方截图当成像素稿。
