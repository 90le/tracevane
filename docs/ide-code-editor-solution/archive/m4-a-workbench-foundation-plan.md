# M4-A IDE Workbench Layout Foundation 探查与最小骨架准备

Status: Completed
Completed: 2026-07-02
Scope: M4-A only

## 1. 探查结论

本次先探查当前前端路由、布局、依赖和 M3 共享层状态，再落地低风险骨架。

已确认现状：

- 路由：`apps/web/src/app/router.tsx` 使用 `HashRouter`，普通业务页面挂在 `AppShell` 下。
- 顶层导航：`apps/web/src/app/navigation.ts` 管理侧边导航和页面元信息。
- 依赖：`apps/web/package.json` 已安装 `dockview` / `dockview-react`，因此 M4-B 可以在 Editor Area 接入 Dockview，无需 M4-A 新增依赖。
- 文件 API：Files data layer 已存在于 `apps/web/src/lib/query/files.ts` / `apps/web/src/lib/api/files.ts`，M4-A 继续复用，不新增第二套文件 API。
- 共享编辑内核：`apps/web/src/shared/editor-core` 已提供 file identity、title、language、dirty/files/types 等基础能力。
- 共享 Explorer 内核：`apps/web/src/shared/explorer-core` 已提供 directory query、path、sort、tree state、commands 等 primitives。
- 共享 Explorer UI：`apps/web/src/shared/explorer-ui` 已提供基础树、节点、toolbar、空/加载/错误态等 primitives。
- Online Editor Mini Explorer：位于 `apps/web/src/features/file-manager/online-editor/mini-explorer`，只作为在线编辑器产品壳层；M4 不复用该产品壳。

## 2. M4 Workbench 推荐目录与路由

M4 独立 Workbench 使用单独 feature 目录：

```txt
apps/web/src/features/ide-workbench/
├─ IdeWorkbenchPage.tsx     # 独立 IDE Workbench 壳层入口
├─ layoutState.ts           # layoutVersion + 持久化 + reset/fallback
├─ types.ts                 # Activity/Panel/View/EditorGroup/Layout 类型
└─ index.ts                 # feature exports
```

路由：

```txt
/ide
/ide/:workspaceId
```

M4-A 将 `/ide` 放在 `AppShell` 外，避免全局管理台侧边栏挤占 IDE 工作区。`AppProviders` 仍然包裹整棵应用，因此主题、QueryClient、toast 等基础能力继续可用。

## 3. 最小骨架边界

M4-A 已建立最小 Workbench 骨架：

```txt
IdeWorkbenchPage
├─ WorkbenchHeader
├─ ActivityBar
├─ Primary SideBar / ExplorerView
├─ EditorArea placeholder
├─ PanelArea placeholder tabs
└─ StatusBar
```

### ActivityBar

- M4-A 启用 Explorer。
- Search / Source Control / Run and Debug / Extensions 显示为禁用占位。
- 状态使用 `activeActivityId`，后续可扩展到 Workbench View model。

### SideBar Explorer

- 复用 `useExplorerDirectory`、`useExplorerTreeState`、`ExplorerTree`、`ExplorerToolbarBase`。
- 读取当前 root 的目录。
- 支持刷新、上级、目录进入和点击文件打开到 EditorArea 占位 tab。
- M4-A 不做新建/重命名/删除/复制/移动，也不做完整 IDE Explorer 右键菜单；这些进入 M4-B/M4-C。

### Editor Area

- 已建立 `EditorGroup` / `EditorTab` 状态骨架。
- 打开文件会生成 preview tab 占位，使用 `editor-core` 的 `editorDocumentId` / `editorTitleForPath`。
- M4-A 不挂真实 Monaco model，不接保存/dirty 冲突流程，不做 split right/down，不接 Dockview 行为。
- `dockviewLayout` 字段已预留，M4-B 可接入 `dockview-react`。

### Panel Area

- 固定 tabs：Terminal / Problems / Output / Debug Console。
- 支持 active tab、折叠/展开、调高/调低、最大化/恢复状态。
- 内容全部为明确占位，不暗示真实能力已接入。

### StatusBar

- 显示 root、path、sidebar/panel 状态和 M4-A 标识。
- 不显示 Git branch、LSP 状态、真实终端状态等未来阶段数据。

## 4. 布局状态模型

M4-A 新增 `IdeWorkbenchLayoutState`：

```txt
layoutVersion: 1
activeActivityId
sideBar: placement / visible / collapsed / width
secondarySideBar: placement / visible / collapsed / width
panel: placement / visible / collapsed / size / maximized / activePanelId
viewPlacements: WorkbenchViewPlacement[]
editorGroups: IdeWorkbenchEditorGroup[]
activeEditorGroupId
dockviewLayout
```

持久化策略：

- localStorage key：`tracevane.ide-workbench.layout.<workspaceKey>`。
- schema 必须匹配 `layoutVersion`。
- 解析失败、版本不匹配或必要字段缺失时 fallback 到默认布局，不让 Workbench 白屏。
- `resetLayout` 只重置布局状态，不负责清理未来 dirty 编辑内容。

## 5. M4-A 做了什么 / 没做什么

M4-A 已做：

- 独立 `/ide` / `/ide/:workspaceId` 路由。
- 独立 `features/ide-workbench` 目录。
- Workbench layout state 类型、默认值、持久化和 fallback。
- ActivityBar / SideBar Explorer / EditorArea / PanelArea / StatusBar 最小骨架。
- SideBar Explorer 复用 M3 shared explorer primitives。
- Editor tab placeholder 复用 `shared/editor-core` identity/title。
- Panel tabs 占位和 layout controls。
- Aurora token class 视觉骨架，不使用 VS Code 默认色。

M4-A 明确没做：

- 真实 Terminal / xterm / PTY / WebSocket。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher。
- 插件市场。
- 完整 VS Code 行为。
- Dockview 复杂行为或真实 editor group drag/split。
- 把 Online Editor Mini Explorer 改造成 IDE Explorer。
- 新的文件 API。

## 6. 推荐 M4-B 下一步

建议 M4-B 做 **Editor Dock + Dockview 最小接入**：

1. 在 `features/ide-workbench` 内增加 `editor/` 子目录。
2. 用 `dockview-react` 接入 Editor Area，只负责 editor group / tab / split placeholder。
3. 将当前 M4-A `editorGroups` 状态和 `dockviewLayout` 绑定到 Dockview serialization / restore。
4. 接入 shared `editor-core` + 现有 Monaco model lifecycle 的薄适配，但仍不做 Terminal/LSP/Git/Debug。
5. 保留 Panel Area 为固定 bottom 占位，Panel right placement 仍后置。

M4-C 可继续做 IDE Explorer file operations / open tab path sync / reveal active file，复用 M3 explorer-core/explorer-ui，但不复用 Online Editor Mini Explorer 产品壳。

## 7. 验证记录

已运行：

```bash
npm run typecheck:web
git diff --check
```

本地 markdown 相对链接检查已覆盖本文档和被触达主文档。当前 package.json 未提供专用 markdown/link checker 脚本，因此使用本地脚本检查相对链接。
