# M4-C IDE Workbench smoke + Explorer operations / tab path sync 总结

Status: Completed
Completed: 2026-07-02
Scope: M4-C only

## 1. 完成内容

M4-C 在 M4-A/M4-B Workbench 骨架上补齐最小验证闭环，并为 IDE Explorer 接入文件操作与已打开 Dockview placeholder tab 的路径同步。

已完成：

- 新增 `tests/ide-workbench/ide-workbench-layout.smoke.mjs`。
- 新增根脚本 `npm run smoke:ide:workbench-layout`。
- `/ide/:workspaceId` smoke 覆盖：
  - Workbench 路由可进入且不白屏。
  - ActivityBar / SideBar Explorer / EditorDock / Panel / StatusBar 存在。
  - SideBar Explorer 可打开文件到 Dockview placeholder tab。
  - Split Right / Split Down 可创建 placeholder panel。
  - Reset layout 后 Dockview 清空并回到 watermark，不白屏。
- 新增 `apps/web/src/features/ide-workbench/explorer/` Workbench 专用 ExplorerView。
- IDE Explorer 复用 `shared/explorer-core` / `shared/explorer-ui` / `fileOperations`，不复用 Online Editor Mini Explorer 产品壳。
- IDE Explorer 支持：
  - 新建文件。
  - 新建目录。
  - 重命名。
  - 删除。
  - 复制。
  - 移动。
  - 复制相对路径 / 绝对路径。
  - 操作成功后刷新当前 Explorer 目录。
- 已打开 Dockview placeholder tab 路径同步：
  - rename/move 文件：更新 `id/ref/title/deleted`。
  - rename/move 目录：更新目录下已打开文件的 `id/ref/title/deleted`。
  - delete 文件/目录：保留已打开 tab，标记 `deleted: true`，不静默关闭。
  - 同步 Dockview serialized layout 中的 panel id/title/params，避免只改 React metadata。
- 修复 reset layout 时已挂载 Dockview 没有清空 split placeholder 的问题。

## 2. 同步规则

Workbench tab metadata 仍由 `layoutState.editorGroups` 持有，Dockview 只保存布局结构和 placeholder panel metadata。

规则：

- `rootId + path` 是文件 identity 来源，继续使用 `shared/editor-core` 的 `editorDocumentId` / `editorTitleForPath`。
- rename/move 后：
  - 文件命中：`oldPath -> newPath`。
  - 目录命中：目录下 tab 按后缀 rebase 到新目录。
  - activeTabId 随新 document id 更新。
  - `dockviewLayout.panels` 和 serialized grid/view id 递归替换旧 panel id。
- delete 后：
  - 不关闭 tab。
  - 不清空 placeholder 内容。
  - 只标记 `deleted`，让后续真实 Monaco/dirty 阶段决定保存、另存或恢复流程。

重要边界：Dockview 仍不拥有 FileService、SaveService、Monaco model lifecycle、dirty/save/conflict 语义。

## 3. 明确没做的未来阶段能力

M4-C 不做：

- 真实 Monaco 编辑器内容。
- 真实保存、dirty 内容、关闭确认和冲突处理。
- 真实 Terminal / xterm / PTY。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher 外部变更监听。
- 完整 VS Code 行为。
- Panel right placement。
- Terminal split/group。
- 复用 Online Editor Mini Explorer 产品壳。
- 新的文件 API。

## 4. 验证记录

已运行：

```bash
npm run typecheck:web
npm run smoke:ide:workbench-layout
git diff --check
```
