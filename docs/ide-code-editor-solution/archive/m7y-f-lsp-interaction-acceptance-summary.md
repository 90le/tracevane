# M7.y-F LSP Interaction Acceptance Closeout Summary

## 状态

已完成：M7.y-F 是 LSP interaction acceptance closeout，不包含新的运行时代码能力。

下一阶段入口：M7.z-A LSP / Git / Debug post-M7 enhancement plan。

## 完成口径

M7.y 已把 Tracevane IDE 的 LSP interaction 从 JSON-only foundation 扩展为 JSON + TypeScript / JavaScript 的有界基础能力：

- M7.y-A：LSP / Git / Debug integration hardening plan。
- M7.y-B：TypeScript / JavaScript diagnostics foundation。
- M7.y-C：TypeScript / JavaScript interaction expansion plan。
- M7.y-D：TypeScript / JavaScript hover and definition foundation。
- M7.y-E：TypeScript / JavaScript completion foundation。
- M7.y-F：本验收收口。

## 当前 LSP 能力

### JSON

- `/api/lsp/diagnostics` 与 `/ws/lsp` diagnostics。
- `/api/lsp/hover` 与 `/ws/lsp` hover。
- `/api/lsp/completion` 与 `/ws/lsp` completion。
- `/api/lsp/definition` 与 `/ws/lsp` definition。
- Monaco 注册 JSON hover / completion / definition provider。
- Problems / Output / editor reveal 链路保持可用。

### TypeScript / JavaScript

支持 language id：

- `typescript`
- `typescriptreact`
- `javascript`
- `javascriptreact`

已完成能力：

- Diagnostics：复用既有 Problems / Output 链路。
- Hover：bounded TypeScript `LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService`。
- Definition：只返回 workspace root 内安全路径。
- Completion：基础 item label/detail/insertText/kind/sortText，最多 200 条，关闭 auto-import 与 package/workspace 扫描扩展。

## 架构边界

- 继续复用 `apps/api/modules/lsp`，不新增第二套 LSP API。
- 继续复用 Files root/path guard，不接受任意 host absolute path。
- 当前 editor model content 作为 opened document snapshot；不把完整内容写入 React store 或 localStorage。
- TypeScript library 读取只允许项目安装的 `typescript/lib/lib.*.d.ts`。
- TypeScript / JavaScript interaction 是 bounded foundation，不是完整 VS Code tsserver parity。
- Monaco 只注册 provider 并发请求；不在浏览器运行 TypeScript compiler service。

## 验收脚本

M7.y 相关 smoke：

- `npm run smoke:ide:lsp-interaction`
  - JSON hover / completion / definition direct HTTP、WebSocket 和 IDE provider registration。
- `TRACEVANE_API_PORT=3896 npm run smoke:ide:lsp-typescript-diagnostics`
  - TS diagnostics -> Problems / Output。
- `npm run smoke:ide:lsp-typescript-interaction`
  - TS hover + definition direct HTTP、WebSocket 和 IDE provider registration。
- `npm run smoke:ide:lsp-typescript-completion`
  - TS completion direct HTTP、WebSocket 和 IDE provider registration。

类型验证：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`

## 本阶段明确不做

- 不做 auto-import。
- 不做 completion details / resolveCompletionItem。
- 不做 signature help。
- 不做 find references。
- 不做 rename symbol。
- 不做 formatting。
- 不做 code actions。
- 不做 semantic tokens。
- 不引入完整 tsserver / typescript-language-server 进程生命周期。
- 不做 project-wide strict type checking。
- 不做 Git remote / checkout / merge / rebase / stash UI。
- 不做 Git graph。
- 不扩展 DAP attach / launch.json parity。
- 不追完整 VS Code LSP/Git/Debug parity。

## 下一步建议

M7.z-A 应先做 post-M7 enhancement plan，再决定后续切片顺序。建议候选增强按风险拆分：

1. LSP：references / rename / formatting / code actions / semantic tokens 的研究与最小计划。
2. Git：remote fetch/pull/push、checkout/merge/rebase/stash、Git graph 的研究与安全边界。
3. Debug：launch.json parity、attach、更多 adapter、断点条件/logpoint 的研究与最小计划。

继续遵守“先计划与边界，再最小实现，再验收收口”的阶段节奏。

## 验证

M7.y-F 是 docs-only：

- Touched-docs Markdown relative link check。
- `git diff --check`。
