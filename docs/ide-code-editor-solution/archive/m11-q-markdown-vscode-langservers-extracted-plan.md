# M11-Q Markdown / vscode-langservers-extracted Provider Plan

M11-Q 已完成。结论：`vscode-langservers-extracted` 可以作为 Markdown external provider 的候选包，但不能在同一阶段直接替换现有 JSON / HTML / CSS provider，也不能把 ESLint 或 provider pack 全量展开。本阶段只固化 Markdown-first 的受控实现计划，下一步 M11-R 才进入 Markdown external provider guarded implementation。

## Current external evidence

- `npm view vscode-langservers-extracted@latest` 显示 latest 为 `4.10.0`，license 为 MIT。
- package bins 包含：
  - `vscode-css-language-server`
  - `vscode-eslint-language-server`
  - `vscode-html-language-server`
  - `vscode-json-language-server`
  - `vscode-markdown-language-server`
- package dependency graph 内含 `vscode-css-languageservice`、`vscode-html-languageservice`、`vscode-json-languageservice`、`vscode-markdown-languageservice`、`vscode-languageserver`、`request-light` 等。
- package unpacked size 约 847 KB；不是大型 toolchain，但它是 multi-bin provider pack，存在与 Tracevane 当前 in-process JSON / HTML / CSS provider 重叠的治理风险。

## Local architecture evidence

当前 Tracevane 已有：

- in-process `json` provider：`vscode-json-languageservice`，已覆盖 diagnostics / hover / completion / definition / references / formatting / codeAction。
- in-process `html` provider：`vscode-html-languageservice`，已覆盖 hover / completion / formatting / codeAction。
- in-process `css` provider：`vscode-css-languageservice`，已覆盖 diagnostics / hover / completion / definition / references / formatting / codeAction。
- external providers：YAML、Bash、Pyright、Dockerfile，均走 server-side allowlisted profile、metadata/status UI、diagnostics-only proof 与 provider-specific system test。

因此 `vscode-langservers-extracted` 的 JSON/HTML/CSS bins 在 M11-Q/M11-R 不应启用，避免重复 provider、行为漂移和一阶段替换过多能力。

## Decision

M11-Q 决定：

1. M11-R 只接入 `vscode-markdown-language-server` bin，provider id 使用 `markdown`。
2. 依赖必须 exact pin 到 `vscode-langservers-extracted@4.10.0`，并在 metadata 中明确：multi-bin package installed for Markdown only。
3. external profile 必须继续使用 `process.execPath` + `require.resolve("vscode-langservers-extracted/bin/vscode-markdown-language-server")` + `--stdio`。
4. provider registry 只增加 markdown language scope：`markdown` / `md` / `mdx`（MDX 先仅作为 Markdown text diagnostics/status 试探，不承诺 JSX/TSX semantics）。
5. `/api/lsp/diagnostics` 只新增 Markdown diagnostics/status route；hover/completion/definition/references/formatting/code actions 继续后置。
6. provider status dialog 必须展示 package、installed version、pin、source、audit/policy notes。
7. system test 必须证明 profile lifecycle 与 Markdown diagnostics/status 至少不崩；如果 Markdown server 对简单文本不返回 diagnostics，则测试以 lifecycle + status + benign empty diagnostics contract 为准，并记录“diagnostics-capable route returns bounded empty set”。
8. smoke 需扩展 provider status UI，确保 Markdown provider 出现在 status button 与 command palette flows。

## M11-R recommended implementation slice

建议 M11-R 文件范围：

- `package.json` / `package-lock.json`：新增 exact pinned `vscode-langservers-extracted@4.10.0` 与 `test:system:lsp-markdown-provider`。
- `types/lsp.ts`：新增 `markdown` provider id。
- `apps/api/modules/lsp/providers/registry.ts`：新增 markdown provider descriptor 与 language set。
- `apps/api/modules/lsp/external/externalProviderProfiles.ts`：新增 Markdown profile。
- `apps/api/modules/lsp/external/externalProviderMetadata.ts`：新增 metadata seed，明确 JSON/HTML/CSS/ESLint bins disabled by Tracevane policy。
- `apps/api/modules/lsp/service.ts`：新增 Markdown language normalization 与 diagnostics route。
- `tests/system/lsp-markdown-provider.test.mjs`：profile/lifecycle/status/diagnostics route proof。
- `tests/ide-workbench/ide-lsp-provider-status.smoke.mjs`：Markdown provider status UI proof。

## Explicit non-goals

M11-Q / M11-R 不做：

- 启用 `vscode-json-language-server`、`vscode-html-language-server`、`vscode-css-language-server` 或 `vscode-eslint-language-server` bins。
- 替换现有 in-process JSON / HTML / CSS provider。
- Markdown hover/completion/definition/references/formatting/code action。
- Markdown preview/render pipeline、MDX JSX semantics、link validation、workspace doc graph。
- ESLint runtime provider、npm script discovery、project config discovery。
- auto install、system binary discovery、前端 provider command/env。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## Verification for this docs-only stage

- Temporary markdown relative link check for touched docs.
- `git diff --check`.
