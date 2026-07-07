# M7.z-G LSP rename / formatting / code actions UI foundation 验收总结

## 状态

已完成。

M7.z-G 承接 M7.z-C 的 rename / formatting / code actions 计划和 M7.z-F 的 WorkspaceEdit preview/apply safety layer，把 TypeScript / JavaScript 的基础符号操作接入到现有 Tracevane LSP service、Monaco provider 与 IDE Editor 操作菜单。

## 完成内容

- 后端 LSP service 增加基础交互能力：
  - `POST /api/lsp/rename`
  - `POST /api/lsp/formatting`
  - `POST /api/lsp/code-actions`
  - `/ws/lsp` 支持 `rename` / `formatting` / `codeAction` 消息。
- TypeScript / JavaScript provider 复用现有 bounded TypeScript `LanguageServiceHost`：
  - rename 使用 `getRenameInfo` / `findRenameLocations` 生成受 root guard 约束的 WorkspaceEdit。
  - formatting 使用 `getFormattingEditsForDocument`。
  - code action 先暴露可验证的 format document action；完整 quick-fix 生态后置。
- JSON provider 保持有界：
  - formatting 使用安全 `JSON.parse` / `JSON.stringify` 生成全文 text edit。
  - rename/code action 的完整语义后置，不伪装成完整语言服务器。
- Monaco provider 增加：
  - `registerRenameProvider`
  - `registerDocumentFormattingEditProvider`
  - `registerCodeActionProvider`
- IDE Editor 操作菜单增加：
  - 重命名符号（F2）
  - 格式化文档（Shift Alt F）
  - 代码操作（Ctrl .）
- 前端 editor runtime 增加 action bridge，允许 IDE shell 触发 Monaco action，而不让 Dockview 拥有文件 IO 或 Monaco model lifecycle。
- 新增 smoke：`npm run smoke:ide:lsp-rename-format-code-actions`。

## 明确未做

- 不做完整 VS Code quick-fix / source action 生态。
- 不做资源操作类 WorkspaceEdit apply，例如 rename file、create/delete file。
- 不做跨语言完整 rename / formatting provider 覆盖。
- 不做 LSP server protocol 进程化或 monaco-languageclient 全量接入。
- 不做 Git branch/stash UI、force push、merge、rebase。
- 不做 Debug/DAP 新能力。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-workspace-edit-foundation`
- `npm run smoke:ide:lsp-rename-format-code-actions`

## 下一步

M7.z-H：Git branch / stash UI foundation。

建议继续复用现有 Git service / Source Control View，不新增第二套 Git API；先做 branch/stash 的只读状态、受控命令入口与 smoke，再考虑 checkout / merge / rebase 等高风险操作。
