# Workspace Web IDE 布局研究（IDE-first 当前参考）

> 状态：IDE-first layout research reference
> 更新：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> UI/UX 验收合同：`WorkspaceIDE-UIUX重设计验收.md`

本文保留 Web IDE 布局研究结论，但当前执行必须服从 IDE-first 蓝图：先完成 Workspace IDE shell、文件/编辑器、终端、Git、搜索、命令、证据、Agent handoff 与桌面/平板/手机响应式布局。Preview、Markdown panel、WYSIWYG、视觉原型和渲染增强不属于当前 Phase 0/1/2。

## 1. 当前外部参考

- VS Code / VS Code Web：Activity Bar 用于切换 Explorer/Search/Source Control 等视图，Primary Side Bar 显示当前活动视图；编辑器是中心主对象，终端属于 panel/workbench surface。
- Zed：Project panel、Search、Git、Terminal、Editor panes 均由命令和 pane 系统组织；Command Palette 是低频动作入口。
- Eclipse Theia：证明 Web IDE 应有 main/side/bottom shell、widget/dock layout 和布局恢复能力，但完整 Theia 作为嵌入依赖过重。
- Dockview：React 绑定支持 IDE-like dock layout、tabs/groups/drag-drop/floating/popout/serialization，适合作为 Tracevane 自有 Workbench 的布局内核。
- Monaco Editor：VS Code 编辑器核心，适合作为代码编辑底座；文档/写作/预览能力是未来扩展，不是当前布局验收主线。

## 2. 当前选型结论

当前仍采用：

```text
Dockview React + Monaco Editor + xterm.js + Tracevane Files/Search/Git/API panels
```

原因：完整 IDE 会反客为主，迫使 Tracevane 的 Gateway、IM、CLI Agents、OpenClaw 进入别人的 extension/runtime 模型。Dockview + Monaco 只接管通用 IDE 基础设施，业务层仍由 Tracevane owner 控制。

## 3. 当前 Workbench 结构

```text
WorkspaceWorkbench
├─ TopBar / Workspace context
├─ ActivityBar
├─ SidePanel（ActivityBar 控制：Files/Search/Git）
├─ MainStage
│  ├─ MonacoEditorPanel
│  ├─ DiffReviewPanel
│  └─ EmptyState
├─ BottomPanel
│  ├─ TerminalPanel
│  ├─ Tasks / Logs
│  └─ Problems / Output
├─ Inspector（Evidence / Agent review / FileInfo / Diagnostics）
└─ StatusBar
```

布局原则：

- Files/Search/Git 是 SidePanel 的活动视图，不恢复成 Dock tab。
- MainStage 当前只承载 Editor/Diff/Review。
- Terminal 是 BottomPanel 的一等 IDE 面板。
- Inspector 服务 Evidence / Agent review / FileInfo / Diagnostics，不用固定 Preview 抢占空间。
- 移动端使用 Bottom Mode Nav + full-screen task surface，不压缩 PC 多栏。

## 4. 已推翻/删除或降级

- 旧 `/ide` 与旧 `/files` feature 目录。
- 临时 `WorkspaceShell`。
- 临时 `commands/` command palette/keybinding 层。
- 临时 `layout/` 自研 DockTree/PaneGroup/dock reducer。
- 独立 `WorkspaceFileManager` surface。
- speculative `agent/evidence/stores` 前端目录。
- CodeMirror 编辑器栈与依赖。
- 历史 HTML 原型与旧 Vue 审计文档。
- Preview dock panel / Markdown panel 作为当前落地目标。

## 5. 当前落地边界

- `/workspace` 渲染 `WorkspaceWorkbench`。
- `ActivityBar` 管理左侧 `Files/Search/Git` 的展开、收起和切换；这些侧栏功能不进入 Dockview 标签组，避免“活动栏 + Dock tab + 面板标题”三重重复。
- Workbench layout 只应持久化当前 IDE core 状态：activity、side panel、editor tabs、bottom terminal、inspector/evidence 状态。
- `CodeEditor` 使用 Monaco React wrapper。
- xterm.js 终端保留。
- Files/Search/Git 面板复用当前 Tracevane API 业务层。

## 6. 当前下一步

1. 修正命令面板、状态栏、侧栏、底部终端的真实 IDE 操作语义。
2. 建立桌面/平板/手机布局验收：无横向溢出，手机端模式切换完整。
3. Terminal context menu、session 状态、cwd、reconnect、clear/copy/evidence 进入一等体验。
4. Git/Search 使用审查与证据语言，替换必须先形成可审查计划。
5. 再评估 LSP、diagnostics、problems、ports 等高级 IDE 子系统。

## 7. 当前非主线

- Markdown panel 的 `Edit / Preview / Markdown` 三态。
- Preview 切换、Preview smoke、Preview dock panel。
- WYSIWYG、document engine、写作工作区。
- 新视觉原型、概念海报、第三方截图像素稿。
- 渲染增强、预览主题、富媒体阅读体验。

## 8. 主题约束补充

第三方 IDE 截图只作为交互结构参考：ActivityBar、Explorer/Search/Git、Editor、Terminal、dock/split。Tracevane 不复刻其菜单栏、硬编码暗色、窗口按钮或品牌视觉。

实现约束：

- Workbench 必须使用 `apps/web/src/design/theme.css` token：`bg-canvas`、`bg-panel`、`text-ink`、`primary` 等。
- 必须兼容浅色和深色模式；Dockview 样式通过 CSS custom properties 接入 Tracevane token。
- 顶部栏只保留 Tracevane Workspace 上下文和必要布局动作，不复制桌面 IDE 全菜单。
- 任何视觉探索必须先证明能服务真实 IDE 操作，不得新增说明页式 Workspace。
