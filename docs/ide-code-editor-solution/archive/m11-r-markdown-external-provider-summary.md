# M11-R Markdown External Provider Guarded Implementation Summary

M11-R 已完成。Tracevane 现在通过 `vscode-langservers-extracted@4.10.0` 只接入 `vscode-markdown-language-server`，作为 Markdown external provider 的 diagnostics/status proof。该 package 里的 JSON / HTML / CSS / ESLint bins 仍按 M11-Q 决策保持禁用，不替换现有 in-process providers。

## Completed scope

- 新增 exact pinned `vscode-langservers-extracted@4.10.0` 依赖。
- 为 `vscode-markdown-languageservice` 增加 scoped npm override：`vscode-uri@2.1.2`。
  - 原因：当前 Node 22 下，Markdown language service 对 `vscode-uri@3.x` default import 会导致 server crash。
  - 覆盖范围只限 `vscode-markdown-languageservice`，不改变现有 root-level `vscode-uri@3.1.0` 或 JSON / HTML / CSS provider。
- external provider profile 新增 `markdown`：
  - command: `process.execPath`
  - args: `require.resolve("vscode-langservers-extracted/bin/vscode-markdown-language-server")`, `--stdio`
  - languages: `markdown` / `md` / `mdx`
- provider metadata 新增 `markdown` install/version/license/audit/policy notes，明确 multi-bin package 仅用于 Markdown proof。
- provider registry 新增 `markdown` descriptor，capability 只声明 diagnostics。
- `/api/lsp/diagnostics` 新增 Markdown 路由，复用 existing external language server gateway。
- language normalization 支持 `.md` / `.markdown` / `.mdx` 与 raw `markdown` / `md` / `mdx`。
- provider status smoke 扩展 Markdown provider row/version/policy 可见性。
- 新增 `test:system:lsp-markdown-provider`。

## Runtime behavior

Markdown language server 对普通 Markdown 文档通常不主动返回 diagnostics。M11-R 因此采用 M11-Q 规定的 bounded-empty diagnostics contract：

- profile lifecycle 必须可 start/stop；
- `/api/lsp/status` 必须展示 installed/version/pin/source/policy；
- `/api/lsp/diagnostics` 必须返回 provider `markdown`、language `markdown`/`mdx` 与 bounded diagnostics array；
- request timeout 对 Markdown route 被视为 benign empty diagnostics，不让 IDE Problems 面板误报 provider crash。

## Explicit non-goals

M11-R 没有做：

- 启用 `vscode-json-language-server`、`vscode-html-language-server`、`vscode-css-language-server` 或 `vscode-eslint-language-server` bins。
- 替换现有 in-process JSON / HTML / CSS providers。
- Markdown hover / completion / definition / references / formatting / code action。
- Markdown preview/render pipeline、MDX JSX/TSX semantics、link validation、workspace doc graph。
- ESLint runtime provider、project config discovery、npm script discovery。
- auto install、system binary discovery、前端 provider command/env。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## Verification

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-markdown-provider`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-external-gateway`
- `TRACEVANE_WEB_PORT=5226 TRACEVANE_API_PORT=3917 npm run smoke:ide:lsp-provider-status`
- Temporary markdown relative link check for touched docs
- `git diff --check`

## Next recommended stage

M11-S：ESLint external provider project-config/runtime safety plan。

ESLint should not be enabled just because `vscode-langservers-extracted` is now installed. It needs a separate plan for workspace config discovery, dependency/project root trust, runtime execution budget, output mapping, and whether diagnostics should come from ESLint LSP or future task/output integration.
