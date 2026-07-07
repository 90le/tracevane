# M11-E-D Multi-language Provider Acceptance Closeout

状态：已完成。

## 背景

M11-D 已完成 multi-language LSP provider research plan，随后 M11-E-A 抽出 provider registry，M11-E-B 把 JSON 迁移到官方 `vscode-json-languageservice`，M11-E-C 接入官方 HTML/CSS lightweight language services。M11-E-D 是验收收口阶段：确认当前 provider matrix、验证门槛、边界与下一步入口，而不是继续新增语言或启动外部 language server。

## 当前 Provider Matrix

| Provider | Mode | Source | Languages | 当前能力 |
| --- | --- | --- | --- | --- |
| `json` | in-process | `vscode-json-languageservice` | `json` | diagnostics、hover、completion、definition、references、formatting、codeAction |
| `typescript` | in-process | Tracevane bounded TypeScript provider | `typescript`、`typescriptreact`、`javascript`、`javascriptreact` | diagnostics、hover、completion、definition、references、semanticTokens、workspaceSymbols、rename、formatting、codeAction |
| `html` | in-process | `vscode-html-languageservice` | `html` | hover、completion、formatting、codeAction formatting wrapper |
| `css` | in-process | `vscode-css-languageservice` | `css`、`scss`、`less` | diagnostics、hover、completion、definition、references、formatting、codeAction formatting wrapper |

当前 matrix 由 `apps/api/modules/lsp/providers/registry.ts` 暴露，`/api/lsp/status` 继续返回 `supportedLanguages`、`features` 与 `providers` capability matrix。

## 验收口径

M11-E-A/B/C/D 合并后的完成状态：

- Provider dispatch 已集中到 `apps/api/modules/lsp/providers/registry.ts` 与 `apps/api/modules/lsp/service.ts`，没有为 JSON/HTML/CSS 新增第二套 LSP API。
- JSON、HTML、CSS provider 均通过现有 `/api/lsp/*` HTTP routes 与 `/ws/lsp` WebSocket handler 暴露。
- Files root/path guard、request validation、Problems/Output、Monaco provider bridge 和 WorkspaceEdit preview/apply contract 保持同一条链路。
- JSON / HTML / CSS 官方 language service 都是 focused in-process dependencies；外部 language server 进程、生命周期、资源限额与隔离继续后置。
- HTML diagnostics、HTML definition/references、CSS rename/provider-specific quick fixes 未伪造能力；当前只声明和验证 provider 实际可稳定承担的能力。

## 本阶段未做

M11-E-D 明确不做：

- 外部 language server gateway / process manager 实现。
- `pyright`、`yaml-language-server`、`gopls`、`rust-analyzer`、Java、Vue、Svelte 等 heavy providers。
- 一次性“全语言支持”。
- 多语言 workspace symbols。
- remote schema fetching / schema association UI。
- 第二套 LSP / Files / Search API。
- Git force / merge / rebase。
- Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

M11-E-D 依赖 M11-E-A/B/C 的 runtime smoke 与本阶段文档检查共同证明收口：

- `npm run smoke:ide:lsp-html-css-providers`
- `npm run smoke:ide:lsp-diagnostics`
- `npm run smoke:ide:lsp-interaction`
- `npm run smoke:ide:lsp-typescript-interaction`
- `npm run smoke:ide:lsp-rename-format-code-actions`
- `npm run smoke:ide:lsp-workspace-symbols`
- touched docs Markdown relative link check
- `git diff --check`

说明：M11-E-D 本身是文档与验收收口；未修改 runtime provider 代码，因此未新增新的 API smoke。

## 下一步

进入 **M11-F external language server gateway research plan**。

M11-F 应先研究并定义外部 language server gateway 的安全边界与最小实现计划，而不是直接接入 heavy providers。建议优先明确：

- server process lifecycle / resource limits / kill timeout。
- workspace root/cwd guard 与文件访问边界。
- provider install/discovery 策略。
- stdio/WebSocket/LSP message bridge。
- diagnostics/completion/hover/definition/formatting 的 capability negotiation。
- provider crash/degraded/unavailable 状态如何回传到 `/api/lsp/status`。
- 哪些语言适合第一批 proof（例如 YAML 或 Python），以及为什么不能一次性扩张到全语言。
