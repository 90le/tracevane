# M11-E-A Provider Registry Extraction Summary

## 状态

已完成。M11-E-A 是无新增依赖的 guarded implementation：在现有 Tracevane LSP service 内抽出薄 provider registry / capability matrix，保持 JSON 与 TypeScript/JavaScript provider 行为不变，为后续 JSON/HTML/CSS lightweight language services 接入提供稳定 dispatch 边界。

## 完成内容

- 新增 `apps/api/modules/lsp/providers/registry.ts`：
  - 定义 `TracevaneLspProviderDescriptor`、provider mode/status/capability types。
  - 注册当前 `json` 与 `typescript` provider descriptor。
  - 暴露 `providerForLanguage(...)`、`providerSupports(...)`、`supportedLanguagesFromRegistry()`、`supportedFeaturesFromRegistry()`、`providerCapabilityMatrix()`。
- 更新 `apps/api/modules/lsp/service.ts`：
  - `/api/lsp/status` 继续返回 `supportedLanguages` / `features`，并新增 `providers` capability matrix。
  - diagnostics、hover、completion、definition、references、semantic tokens、rename、formatting、code actions 的 language dispatch 改为通过 provider registry。
  - JSON 与 TS/JS 现有实现函数保持在同一 service 内，避免一次性大拆分造成行为风险。
  - Unsupported semantic token language 仍保持原有 bounded 400 文案，兼容既有 smoke。
- 保持既有 API：
  - 不新增 `/api/lsp/<language>/*`。
  - 不新增 provider-specific WebSocket message。
  - 不改变 WorkspaceEdit preview/apply、Files root guard、Monaco provider bridge 或 Command Palette 调用面。

## 边界

M11-E-A 没做：

- 新增依赖。
- `vscode-json-languageservice` migration。
- HTML/CSS/SCSS/LESS runtime provider。
- 外部 language server gateway / process manager。
- `typescript-language-server` / `pyright` / `gopls` / `rust-analyzer` 启动。
- 多语言 workspace symbols。
- 第二套 LSP / Files / Search API。
- File Manager Online Editor 产品壳变更。
- Git force/merge/rebase、Debug parity、Terminal 新能力。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run build:api`
- `npm run smoke:ide:lsp-interaction`
- `npm run smoke:ide:lsp-typescript-interaction`
- `npm run smoke:ide:lsp-semantic-tokens`
- `npm run smoke:ide:lsp-workspace-symbols`
- `npm run smoke:ide:command-palette`
- touched docs Markdown relative link check
- `git diff --check`

## 下一步

进入 **M11-E-B JSON official language service migration**：在保持同一 Tracevane LSP contract 与 provider registry dispatch 的前提下，评估并接入 `vscode-json-languageservice`，先增强 JSON diagnostics/completion/hover/formatting；默认禁止远程 schema 拉取，schema/catalog 扩展后置。
