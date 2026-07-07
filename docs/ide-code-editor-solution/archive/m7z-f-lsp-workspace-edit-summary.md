# M7.z-F LSP WorkspaceEdit preview/apply foundation 总结

## 完成状态

M7.z-F 已完成。此阶段承接 M7.z-C 的 rename / formatting / code actions 计划，先建立 LSP `WorkspaceEdit` 的安全 preview/apply 基础层，不直接做完整 UI。

## 已完成内容

- 新增共享 LSP WorkspaceEdit 类型契约：
  - `LspWorkspaceEdit`
  - `LspWorkspaceTextEdit`
  - `LspWorkspaceEditPreviewRequest/Response`
  - `LspWorkspaceEditApplyRequest/Response`
- 后端新增 WorkspaceEdit 处理基础：
  - `POST /api/lsp/workspace-edit/preview`
  - `POST /api/lsp/workspace-edit/apply`
  - 支持 `changes` 与 `documentChanges` 中的 `TextDocumentEdit`。
  - 支持 formatting 类 `TextEdit[] + textDocumentUri` 便利输入。
  - 只接受 `file://` URI。
  - 通过 Files root guard 将 URI 约束在当前 root/workspace 内。
  - 将 open document 标记为 `open-clean` / `open-dirty` / `closed`。
  - resource operations（create/rename/delete）在本阶段明确 rejected，后置到更完整 WorkspaceEdit 事务阶段。
- apply 基础：
  - 仅对安全、完整、可读取的文本文件应用 TextEdit。
  - 默认跳过 dirty open document，避免绕过 Monaco dirty/conflict 流程。
  - 默认跳过 open-clean document，等待后续前端 Monaco model 协调后再启用。
  - 通过现有 FilesService `readFile` / `writeFile` 写回，不新增第二套 Files API。
  - 写回时携带 `expectedModifiedAt` / `expectedSize`，复用 M6-D 保存冲突保护。
  - 检测 range 越界和重叠 TextEdit。
- 前端新增 LSP client helper：
  - `previewLspWorkspaceEdit`
  - `applyLspWorkspaceEdit`
- 新增 smoke：
  - `smoke:ide:lsp-workspace-edit-foundation`
  - 覆盖 preview、dirty open skip、closed file apply、unsupported URI rejected、resource operation rejected。

## 边界

M7.z-F 不做：

- 完整 rename input UI。
- format document / format selection 命令 UI。
- code action quick fix UI。
- resource operation create/rename/delete apply。
- dirty Monaco model 自动变更。
- 多文件 WorkspaceEdit 交互式 review UI。
- LSP server 协议完整泛化。
- Git / Debug / Terminal 扩张。

这些能力后置到 M7.z-G+。

## 关键文件

- `types/lsp.ts`
- `apps/api/modules/lsp/workspaceEdit.ts`
- `apps/api/modules/lsp/routes.ts`
- `apps/web/src/features/ide-workbench/lsp/lspInteractionClient.ts`
- `tests/ide-workbench/ide-lsp-workspace-edit-foundation.smoke.mjs`
- `package.json`

## 验证

已运行：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:lsp-workspace-edit-foundation
```

后续最终提交前还应运行：

```bash
git diff --check
```

## 下一步

M7.z-G 建议进入 LSP rename / formatting / code actions UI foundation：

- rename：输入新名称，调用 LSP rename provider，获得 WorkspaceEdit preview，再通过 M7.z-F apply 基础安全应用。
- formatting：调用 formatting provider 或已有 TextEdit[] provider，复用 WorkspaceEdit preview/apply。
- code actions：先只做 action 列表与 command/edit preview，不直接扩大资源操作 apply。
