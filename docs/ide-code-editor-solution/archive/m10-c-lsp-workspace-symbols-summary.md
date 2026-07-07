# M10-C LSP Workspace Symbols Foundation Summary

## 状态

已完成。M10-C 在不新增第二套 LSP API、不引入后台 symbol index daemon、不改变 File Manager Online Editor 产品壳的前提下，为 Tracevane IDE 接入了受控 TypeScript / JavaScript workspace symbols foundation。

## 完成内容

- Contract：`types/lsp.ts` 新增 `LspWorkspaceSymbolsRequest`、`LspWorkspaceSymbolsResponse`、`LspWorkspaceSymbolItem` 与 symbol kind/location/scan metadata。
- Backend：`apps/api/modules/lsp` 复用现有 LSP service 与 Files root/directory guard，新增：
  - `POST /api/lsp/workspace-symbols`
  - `/ws/lsp` `workspaceSymbols` message
  - `getStatus().features` 暴露 `workspaceSymbols`
- Provider：首版只扫描 TypeScript / JavaScript / TSX / JSX 文件，使用 TypeScript `LanguageService.getNavigateToItems`，并保持以下边界：
  - query 长度上限
  - result 数量上限
  - scan 文件数量上限
  - 单文件字节数上限
  - 默认不扫描隐藏项
  - 跳过 `.git`、`node_modules`、`dist`、`build`、coverage、framework cache 等目录
  - 跳过 symlink 和 root 外路径
- Frontend：IDE Search View 新增“文件/内容 / 符号”模式切换；符号结果点击复用 IDE Editor open/reveal，打开文件并定位到符号行列。
- Verification：新增 `smoke:ide:lsp-workspace-symbols`，覆盖 direct API、WebSocket、bounded long-query failure 与 `/ide` Search 符号结果打开。

## 明确未做

- 不接完整 `tsserver` / `typescript-language-server` 长驻进程。
- 不做 watcher-driven symbol index 或后台全量索引 daemon。
- 不做全语言 workspace symbols。
- 不做 AI semantic search。
- 不做全局 Command Palette / Go to Symbol in Workspace 完整 VS Code parity。
- 不改变 File Manager Online Editor 产品壳。
- 不新增 Debug / Git / Terminal 能力。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-workspace-symbols`

## 下一步

M10-D：LSP semantic/workspace symbols acceptance closeout。建议收口 M10-A/B/C 文档、验收口径与后置边界，再决定是否进入更完整的 Go to Symbol / Command Palette / watcher-backed index 或多语言 LSP 路线。
