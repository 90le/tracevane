# M10-B LSP semantic tokens guarded implementation summary

## 状态

已完成：M10-B 在现有 LSP service / Monaco provider 链路上接入 TypeScript / JavaScript semantic tokens guarded implementation。

下一阶段入口：**M10-C LSP workspace symbols foundation**。M10-C 应单独处理 workspace symbol query、bounded workspace scanning/indexing、排序和 editor reveal，不与 semantic tokens runtime 混在同一切片继续扩张。

## 完成内容

### Contract / types

- `types/lsp.ts` 新增：
  - `LspSemanticTokensRequest`
  - `LspSemanticTokenType`
  - `LspSemanticTokenModifier`
  - `LspSemanticTokenLegend`
  - `LspSemanticTokensResponse`
- `LspGatewayServerEvent` 纳入 `semanticTokens` response。
- 返回数据采用 Monaco/LSP full document semantic token encoding：`deltaLine, deltaStart, length, tokenType, tokenModifiers`。

### Backend LSP service

- `apps/api/modules/lsp/routes.ts` 新增 `POST /api/lsp/semantic-tokens`。
- `apps/api/modules/lsp/service.ts` 新增 `semanticTokens(...)` service method 和 `/ws/lsp` `semanticTokens` message。
- `getStatus().features` 增加 `semanticTokens`。
- 继续复用现有 `validateInteractionRequest(...)`、Files root/path guard、bounded TypeScript `LanguageServiceHost`。
- 首版支持：
  - `typescript`
  - `typescriptreact`
  - `javascript`
  - `javascriptreact`
- 使用 TypeScript LanguageService `getEncodedSemanticClassifications(..., SemanticClassificationFormat.TwentyTwenty)`，并解码 TypeScript 2020 classifier 的 `(tokenType + 1) << 8 | modifierSet` 编码。
- 通过 `MAX_SEMANTIC_TOKEN_FILE_LENGTH` 与 `MAX_SEMANTIC_TOKEN_COUNT` 限制大文件和 token 数量。
- unsupported language 返回明确 400；大文件返回 bounded empty/truncated response。

### Frontend Monaco provider

- `apps/web/src/features/ide-workbench/lsp/lspInteractionClient.ts` 新增 `requestLspSemanticTokens(...)`。
- `apps/web/src/features/ide-workbench/lsp/monacoLspProviders.ts` 为 TS/JS language ids 注册 `registerDocumentSemanticTokensProvider(...)`。
- Monaco provider 只负责传递当前 model content/root/path/language/version 并返回 `Uint32Array` token data。
- semantic tokens 失败时不替代 Monaco 基础 syntax highlighting；React shell 不持有完整文件内容。

### Verification / smoke

- `tests/ide-workbench/ide-lsp-semantic-tokens.smoke.mjs` 新增 smoke：
  - 检查 `/api/lsp/status` features 包含 `semanticTokens`。
  - 创建临时 TypeScript 文件。
  - 直接调用 `/api/lsp/semantic-tokens` 并验证 legend/data/tokenCount。
  - 通过 `/ws/lsp` 请求 `semanticTokens` 并验证 response。
  - 验证 unsupported `json` language bounded 400。
  - 进入 `/ide` 打开文件，确认 Monaco provider 注册后 Workbench 不白屏，Output LSP channel 记录 semantic tokens provider 注册。
- `package.json` 新增 `smoke:ide:lsp-semantic-tokens`。

## 保留边界

M10-B 明确没有做：

- workspace symbols。
- semantic tokens delta / range tokens。
- 完整多语言 semantic tokens。
- `tsserver` / `typescript-language-server` 独立进程生命周期。
- watcher-driven semantic index。
- AI semantic search。
- Debug、Git、Terminal 新能力。
- File Manager Online Editor 产品壳变更。
- 第二套 LSP / Files API。

## 风险与后续

- TypeScript 2020 classifier token type 与 Monaco token legend 已做稳定映射，但后续如果扩展更多 token types/modifiers，需要同步更新后端 legend 与前端 `TRACEVANE_SEMANTIC_TOKENS_LEGEND`。
- 当前是 full document semantic tokens；如果大文件高亮性能成为问题，再进入单独阶段评估 range/delta semantic tokens。
- M10-C workspace symbols 必须继续 bounded：排除 `.git`、`node_modules`、`dist`、大文件、二进制和生成目录，不做后台 daemon。

## 验证

已运行：

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run build:api
npm run smoke:ide:lsp-semantic-tokens
git diff --check
临时 Markdown 相对链接检查（touched docs）
```
