# M7.y-E TypeScript / JavaScript Completion Foundation Summary

## 状态

已完成：M7.y-E 在既有 LSP gateway 内扩展 TypeScript / JavaScript completion foundation。

下一阶段入口：M7.y-F LSP interaction acceptance closeout。

## 完成内容

- 后端继续复用 `apps/api/modules/lsp`，未新增第二套 LSP API。
- `/api/lsp/completion` 与 `/ws/lsp` `completion` 支持：
  - `typescript`
  - `typescriptreact`
  - `javascript`
  - `javascriptreact`
- TypeScript / JavaScript completion 复用 M7.y-D 的 bounded `TypeScript LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService`。
- 当前 editor model content 仍优先作为 opened document snapshot；不把完整内容写入 React store 或 localStorage。
- completion 关闭 module export / import-statement / package.json auto-import 扩展，避免在 foundation 阶段引入 workspace-wide auto-import 和 node_modules 扫描风险。
- completion 返回基础 item label/detail/insertText/kind/sortText，最多返回 200 条，先覆盖局部 symbol、关键字和当前文件基础建议。
- 前端继续复用 `monacoLspProviders.ts` 与 `lspInteractionClient.ts`：
  - JSON hover/completion/definition 保持原能力。
  - TS/JS 注册 hover + definition + completion provider。
  - Completion kind 映射到 Monaco `CompletionItemKind` 的基础集合。
  - Output LSP channel 记录统一 provider 注册文案。

## 验收覆盖

新增：

- `smoke:ide:lsp-typescript-completion`

覆盖：

- 直接 HTTP `/api/lsp/completion` 返回 TypeScript provider，并包含当前文件函数 `tracevaneAnswer` completion item。
- WebSocket `/ws/lsp` completion 返回同等 TypeScript completion item。
- IDE 打开 TS 文件后，Output LSP channel 出现 TS/JS hover/definition/completion provider 注册文案。

回归：

- `smoke:ide:lsp-interaction` 继续覆盖 JSON hover/completion/definition。
- `smoke:ide:lsp-typescript-interaction` 继续覆盖 TS/JS hover + definition。
- `smoke:ide:lsp-typescript-diagnostics` 继续覆盖 TS diagnostics -> Problems/Output。

## 本阶段明确不做

- 不做 auto-import。
- 不做 completion details / resolveCompletionItem。
- 不做 signature help。
- 不做 references、rename symbol、formatting、code actions、semantic tokens。
- 不引入完整 tsserver / typescript-language-server 进程生命周期。
- 不做 project-wide strict type checking。
- 不做 Git remote / checkout / merge / rebase / stash UI。
- 不做 DAP attach / launch.json parity 扩展。
- 不追完整 VS Code LSP parity。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-interaction`
- `TRACEVANE_API_PORT=3896 npm run smoke:ide:lsp-typescript-diagnostics`
- `npm run smoke:ide:lsp-typescript-interaction`
- `npm run smoke:ide:lsp-typescript-completion`
- Touched-docs Markdown relative link check
- `git diff --check`
