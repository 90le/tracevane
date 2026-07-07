# M11-C-B Watcher-backed Symbol Index Guarded Implementation Summary

## 状态

已完成。M11-C-B 在不新增第二套 LSP/Files API、不启动独立 symbol daemon、不持久化完整源码的前提下，把 workspace symbols provider 升级为受控的 root/path/includeHidden scope in-memory symbol metadata index，并保留 direct scan fallback。

## 完成内容

- Contract：`types/lsp.ts` 为 `LspWorkspaceSymbolsResponse` 增加可选 `index` metadata：
  - `status`: `fresh` / `rebuilt` / `direct` / `disabled`
  - `scopeKey`
  - `indexedFiles`
  - `indexedSymbols`
  - `staleFiles`
  - `providerVersion`
  - `rebuiltAt`
- Backend：`apps/api/modules/lsp/service.ts` 在既有 `workspaceSymbols(...)` 内接入 `createWorkspaceSymbolIndex()`：
  - 仍复用 `resolveFilesServiceDirectoryPath(...)` root/path guard。
  - 仍复用 M10-C 的 TypeScript `LanguageService.getNavigateToItems` 和 `workspaceNavigateItemToSymbol(...)`。
  - 首次查询或 stale 后做受控 rebuild。
  - fresh 查询只扫描文件 metadata（mtime/size/version/path）确认 freshness，不读取源码。
  - stale 检测覆盖 changed、created、deleted；rename/move 首版按 path delete + create 处理。
  - rebuild 仅存最小 symbol metadata，不存完整源码。
  - build 异常时回退 direct scan，不改变 `/api/lsp/workspace-symbols` 与 `/ws/lsp` contract。
- Bounded cache：
  - 以 `rootId + relativePath + includeHidden` 作为 scope key。
  - 最多保留有限 scope，LRU 淘汰。
  - 继承 M10-C 文件数、单文件大小、隐藏文件、排除目录、symlink/root 外路径边界。
- Smoke：扩展 `tests/ide-workbench/ide-lsp-workspace-symbols.smoke.mjs`：
  - 首次 API 查询应 `index.status=rebuilt`。
  - 第二次同 scope 查询应 `index.status=fresh`。
  - 修改文件后查询新符号应 rebuild 并返回新符号。
  - 删除文件后旧符号路径不再返回。
  - WebSocket workspaceSymbols 与 IDE Search UI 打开路径继续可用。

## 边界

M11-C-B 没做：

- 第二套 `/api/lsp/symbol-index` 或 Files/Search API。
- 独立后台 symbol daemon。
- SQLite 持久化 symbol DB。
- 持久化完整源码或 snippets。
- 全语言 LSP provider。
- 完整 `tsserver` / `typescript-language-server` 长驻进程。
- AI semantic search。
- File Manager Online Editor 产品壳变更。
- Git force/merge/rebase、Debug parity、Terminal 新能力。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-workspace-symbols`
- `npm run smoke:ide:command-palette`
- `git diff --check`

## 下一步

建议进入 **M11-D multi-language LSP provider research plan**：逐语言研究 provider、依赖、root guard、预算、测试和 fallback，不承诺一次性“全语言支持”。M11-D 前必须保留 M11-C-B 的 workspace symbols contract、direct fallback 和 symbol metadata-only 约束。
