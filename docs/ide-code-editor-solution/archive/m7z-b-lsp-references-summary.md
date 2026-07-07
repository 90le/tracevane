# M7.z-B Advanced LSP References Foundation Summary

## 状态

已完成：M7.z-B 在现有 Tracevane LSP gateway 中新增只读 references foundation。

下一阶段入口：M7.z-C LSP rename / formatting / code actions plan。

## 完成内容

### 后端 LSP gateway

- 新增 `/api/lsp/references`。
- WebSocket `/ws/lsp` 支持 `type: "references"` 请求与 `references` 响应。
- `getStatus().features` 增加 `references`。
- JSON references 返回当前 symbol 的当前文件位置，用于保持 JSON provider 行为完整但不伪造跨文件能力。
- TypeScript / JavaScript references 复用当前 bounded TypeScript `LanguageServiceHost`，通过 `getReferencesAtPosition` 返回引用位置。
- 所有返回位置继续过滤到 workspace root 内，避免暴露 workspace 外路径。

### 前端 Monaco provider

- `lspInteractionClient` 新增 `requestLspReferences`。
- Monaco 注册 JSON 与 TypeScript / JavaScript `ReferenceProvider`。
- LSP Output channel 注册信息更新为 hover / definition / completion / references。

### 验证覆盖

新增 `smoke:ide:lsp-typescript-references`，覆盖：

- direct HTTP `/api/lsp/references` 返回 TypeScript references。
- WebSocket `/ws/lsp` 返回 `references` event。
- IDE 打开 TS 文件后 LSP Output 显示 references provider 已注册。

## 边界

本阶段只做只读 references foundation。

明确不做：

- 不做 rename。
- 不做 formatting。
- 不做 code actions。
- 不做 semantic tokens。
- 不引入完整 `typescript-language-server` / tsserver 进程生命周期。
- 不做 project-wide server lifecycle 或 workspace index。
- 不做 Git remote / pull / push / checkout / merge / rebase / stash。
- 不扩展 Debug launch.json / attach parity。
- 不新增第二套 Files / Git / Terminal / LSP / Debug API。

## 已知限制

- TypeScript / JavaScript references 仍基于当前文档和 TypeScript lib 的 bounded `LanguageServiceHost`；当前阶段不建立 workspace-wide TS project graph。
- JSON references 是单文件当前 symbol 位置，不宣称完整 JSON schema 或跨文件引用能力。

## 验证

已通过：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-typescript-interaction`
- `npm run smoke:ide:lsp-typescript-completion`
- `npm run smoke:ide:lsp-typescript-references`
- touched-docs Markdown relative link check。
- `git diff --check`。
