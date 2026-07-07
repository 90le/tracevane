# M7.y-D TypeScript / JavaScript Hover + Definition Foundation Summary

## 状态

已完成：M7.y-D 在既有 LSP gateway 内扩展 TypeScript / JavaScript hover 与 definition foundation。

下一阶段入口：M7.y-E TypeScript / JavaScript completion foundation。

## 完成内容

- 后端继续复用 `apps/api/modules/lsp`，未新增第二套 LSP API。
- `/api/lsp/hover` 与 `/ws/lsp` `hover` 支持：
  - `typescript`
  - `typescriptreact`
  - `javascript`
  - `javascriptreact`
- `/api/lsp/definition` 与 `/ws/lsp` `definition` 支持同一组 TS/JS language id。
- TypeScript / JavaScript interaction 使用 bounded `TypeScript LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService`。
- 当前 editor model content 优先作为 opened document snapshot，不把完整内容写入 React store 或 localStorage。
- root/path 继续先通过 Files service existing-file guard，definition 结果只返回 workspace root 内路径。
- TypeScript library 读取限制在项目安装的 TypeScript lib `.d.ts`，不扫描 `node_modules`/workspace 大目录。
- per-request language service 使用后 `dispose()`，避免长期进程内积累临时 registry 状态。
- 前端继续复用 `monacoLspProviders.ts` 与 `lspInteractionClient.ts`：
  - JSON hover/completion/definition 保持原能力。
  - TS/JS 注册 hover + definition provider。
  - Output LSP channel 记录统一 provider 注册文案。

## 验收覆盖

新增：

- `smoke:ide:lsp-typescript-interaction`

覆盖：

- 直接 HTTP `/api/lsp/hover` 返回 TypeScript provider 与 symbol hover 内容。
- 直接 HTTP `/api/lsp/definition` 返回 workspace 内 definition location。
- WebSocket `/ws/lsp` hover / definition 返回同等能力。
- IDE 打开 TS 文件后，Output LSP channel 出现 TS/JS hover/definition provider 注册文案。

回归：

- `smoke:ide:lsp-interaction` 继续覆盖 JSON hover/completion/definition。
- `smoke:ide:lsp-typescript-diagnostics` 继续覆盖 TS diagnostics -> Problems/Output。

## 本阶段明确不做

- 不做 TypeScript / JavaScript completion。
- 不做 auto-import、completion details、signature help。
- 不做 references、rename symbol、formatting、code actions、semantic tokens。
- 不引入完整 tsserver / typescript-language-server 进程生命周期。
- 不做 project-wide strict type checking。
- 不做 Git remote / checkout / merge / rebase / stash UI。
- 不做真实 DAP attach / launch.json parity。
- 不追完整 VS Code LSP parity。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-interaction`
- `TRACEVANE_API_PORT=3896 npm run smoke:ide:lsp-typescript-diagnostics`
- `npm run smoke:ide:lsp-typescript-interaction`
- Touched-docs Markdown relative link check
- `git diff --check`
