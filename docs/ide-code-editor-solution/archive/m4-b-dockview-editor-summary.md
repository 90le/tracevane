# M4-B IDE Workbench Editor Dock + Dockview 最小接入总结

Status: Completed
Completed: 2026-07-02
Scope: M4-B only

## 1. 完成内容

M4-B 在 M4-A Workbench 骨架上完成 Editor Area 的 Dockview 最小接入。

已完成：

- 新增 `apps/web/src/features/ide-workbench/editor/` 子目录。
- 新增 `EditorDock`，使用 `dockview-react` 承载 Workbench Editor Area。
- 新增 `EditorPlaceholderPanel`，作为文件 tab 和 split placeholder 的内容面板。
- 从 SideBar Explorer 打开文件后，文件会进入当前 editor group 的 Dockview panel。
- 支持基础 preview / pinned 状态：
  - 新打开文件默认为 preview。
  - 当前 group 内已有未 pinned、未 dirty 的 preview tab 时，新 preview 会替换它。
  - 双击 Dockview tab 可将 preview 标记为 pinned。
- 支持 Split Right / Split Down 的最小占位行为：
  - 通过 Dockview 在当前 active panel 右侧或下方创建 placeholder panel。
  - 只验证 editor group split 与布局持久化，不接真实 Monaco 内容。
- 支持 Dockview layout serialize / restore：
  - `DockviewApi.toJSON()` 写回 `layoutState.dockviewLayout`。
  - Workbench reload 时通过 `DockviewApi.fromJSON()` 恢复。
  - layout restore 失败时清空 Dockview layout，避免 Workbench 白屏。
  - `resetLayout` 继续走 M4-A 默认 state，因此会清空 `dockviewLayout`。
- Dockview 视觉通过 `EditorDock.css` 映射 Tracevane Aurora token，不把 VS Code 默认色作为产品主题。
- Panel Area 调整为 editor/work area 内部布局行：普通状态不跨越或遮挡左侧资源管理器，最大化状态填满当前工作区右侧内容区域，不再使用 fixed overlay。

## 2. 保存/恢复机制

Dockview 只负责 Editor Area 布局：group、panel、tab、split 和拖拽序列化。

状态边界：

- React `layoutState.editorGroups` 保存文件 tab 元数据：`id/ref/title/preview/pinned/dirty/deleted`。
- `layoutState.dockviewLayout` 保存 Dockview 的结构化布局 JSON。
- `EditorDock` 在 `onReady` 时恢复 `dockviewLayout`，随后把 React tab metadata 同步为 Dockview file panel。
- Dockview `onDidLayoutChange` 后调用 `api.toJSON()` 写回 `dockviewLayout`。
- preview tab 被替换时，EditorDock 会移除不再存在的 file panel；split placeholder panel 不会被误删。

重要边界：Dockview 不拥有 FileService、SaveService、Monaco model lifecycle、dirty/save/conflict 语义。它只保存布局结构。

## 3. Split / Tab 支持程度

M4-B 支持到：

- 从 Explorer 打开文件到当前 Dockview editor area。
- 同一路径重复打开时激活已有 tab metadata。
- preview tab 基础替换。
- 双击 tab pin。
- Split Right / Split Down 创建占位 editor group/panel。
- Dockview 自身拖拽/序列化能力由最小接入保留。
- Panel 最大化/恢复使用同一个上/下方向按钮，关闭面板使用独立关闭按钮；最大化时隐藏高度微调按钮。

M4-B 未支持：

- 真实 Monaco 编辑器。
- 真实文件读取/保存/dirty 内容同步。
- 文件关闭确认。
- 跨 editor group 的完整 tab metadata 归属同步。
- 目录 rename/move/delete 对 IDE tabs 的同步。
- reveal active file。

这些进入 M4-C 或后续 editor-core/Monaco 接入阶段。

## 4. 明确没做的未来阶段能力

M4-B 不做：

- 真实 Terminal / xterm / PTY。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher。
- 插件市场。
- 完整 VS Code 行为。
- Panel right placement。
- Terminal split/group。
- 把 Online Editor Mini Explorer 复用为 IDE Explorer。
- 新文件 API。

## 5. 推荐 M4-C 下一步

建议 M4-C 做 **IDE Explorer 文件操作 + Editor tab 路径同步**：

1. 在 Workbench SideBar Explorer 中接入新建、重命名、删除、复制、移动、复制路径等操作。
2. 复用 `shared/explorer-core` / `shared/explorer-ui` / `fileOperations`。
3. rename/move/delete 时同步 `editorGroups` 中已打开 tab 的 `ref/title/id/deleted`。
4. 保持 Mini Explorer 目录稳定策略在 IDE 中按 Workbench Explorer 语义重新设计，不复用 Online Editor Mini Explorer 产品壳。
5. 仍不接真实 Terminal/LSP/Git/Debug。

## 6. 验证记录

已运行：

```bash
npm run typecheck:web
git diff --check
```

未新增 smoke：当前项目已有 smoke 主要覆盖 File Manager / Online Editor。M4-B 是 IDE Workbench 新路由的 Dockview layout foundation，最小 smoke 需要先定义 `/ide` 的稳定测试契约、fixture root 和 Dockview DOM 断言，建议在 M4-C 或 M4 验收收口时统一补 `smoke:ide:workbench-layout`。
