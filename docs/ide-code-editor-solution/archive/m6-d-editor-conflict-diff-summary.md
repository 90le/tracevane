# M6-D IDE Diff / Conflict Flow Summary

M6-D 已完成 IDE Editor 的最小安全保存冲突闭环。它基于 M6-B watcher external changed/deleted 与 Files API 现有 `file_write_conflict` 语义，在 IDE Workbench 中接入 Monaco DiffEditor，用显式 compare / reload / overwrite / cancel 防止 dirty 内容静默覆盖磁盘外部修改。

## 完成内容

- `shared/editor-core` 的保存请求增加 `expectedModifiedAt`、`expectedSize`、`force`，继续复用现有 `/api/files/content`，不新增第二套文件 API。
- 新增 `shared/diff/MonacoDiffPanel`，用 Monaco DiffEditor 展示“磁盘当前版本”与“当前编辑器内容”。
- 新增 `EditorConflictDialog`，提供：
  - 取消：保留当前 dirty model，不写磁盘。
  - 重新读取磁盘：用磁盘版本替换当前 Monaco model，并清理 dirty 状态。
  - 覆盖保存当前内容：必须显式点击，调用 `force: true`。
- IDE Editor 保存时携带读取时 metadata token；后端返回 `file_write_conflict` 时读取磁盘当前内容并进入同一 Diff 对比流程。
- watcher 标记 `changed + dirty` 时，保存不会直接覆盖，而是进入同一对比流程。
- watcher 标记 `deleted + dirty` 时继续保护 Monaco 内容，不执行 overwrite；恢复/另存留到后续阶段。
- 新增 `smoke:ide:editor-conflict-diff`，覆盖外部修改导致保存冲突、Diff 打开、阻止静默覆盖、显式 overwrite 后保存成功。

## 变更文件

- `apps/web/src/shared/editor-core/types.ts`
- `apps/web/src/shared/editor-core/files.ts`
- `apps/web/src/shared/diff/MonacoDiffPanel.tsx`
- `apps/web/src/shared/diff/index.ts`
- `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
- `apps/web/src/features/ide-workbench/editor/EditorConflictDialog.tsx`
- `apps/web/src/features/ide-workbench/editor/IdeEditorFilePanel.tsx`
- `tests/ide-workbench/ide-editor-conflict-diff.smoke.mjs`
- `package.json`

## 保留边界

M6-D 不做：

- 完整三方 merge / 自动冲突解决。
- binary / Hex Editor 写回与冲突处理。
- Search Replace / Replace All。
- Problems / Output 数据基础。
- LSP / Git / Debug。
- 完整 VS Code Source Control diff 行为。

## 验证

- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:editor-conflict-diff`
