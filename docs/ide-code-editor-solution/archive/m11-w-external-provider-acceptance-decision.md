# M11-W External Provider Acceptance / Next Provider Decision

## 状态

M11-W 已完成。此阶段是 external LSP provider 批次验收与下一步决策阶段，不新增 runtime provider、不新增依赖、不改变 gateway 行为。

## 当前已接受 Provider 矩阵

### In-process provider

| Provider | Source | Languages | Accepted capability |
| --- | --- | --- | --- |
| JSON | `vscode-json-languageservice` | `json` | diagnostics / hover / completion / definition / references / formatting / codeAction |
| HTML | `vscode-html-languageservice` | `html` | hover / completion / formatting / codeAction |
| CSS | `vscode-css-languageservice` | `css` / `scss` / `less` | diagnostics / hover / completion / definition / references / formatting / codeAction |
| TypeScript / JavaScript | in-process TypeScript service | `typescript` / `typescriptreact` / `javascript` / `javascriptreact` | diagnostics / hover / completion / definition / references / semanticTokens / workspaceSymbols / rename / formatting / codeAction |

### External diagnostics provider

| Provider | Package | Pinned version | Languages | Accepted capability |
| --- | --- | --- | --- | --- |
| YAML | `yaml-language-server` | `1.23.0` | `yaml` / `yml` | diagnostics |
| Bash | `bash-language-server` | `5.6.0` | `shell` / `shellscript` / `bash` / `sh` | diagnostics |
| Pyright | `pyright` | `1.1.411` | `python` / `py` / `python3` / `pyi` | diagnostics |
| Dockerfile | `dockerfile-language-server-nodejs` | `0.15.0` | `dockerfile` / `docker` | diagnostics |
| Markdown | `vscode-langservers-extracted` | `4.10.0` | `markdown` / `md` / `mdx` | diagnostics |
| ESLint | `vscode-langservers-extracted` | `4.10.0` | `javascript` / `javascriptreact` / `typescript` / `typescriptreact` | diagnostics |

## 验收边界

M11-W 接受当前 external provider 批次，但不把它表述为“一次性全语言支持”。当前外部 provider 统一是 diagnostics-first：

- external gateway 只接受 server-side allowlist profile。
- 前端不能传入 provider command / args / env / cwd / runtime / options / workingDirectories。
- provider 版本必须是 package.json exact pin，并由 status metadata 暴露安装/版本/策略状态。
- 启动 cwd 与 ESLint workingDirectory 由后端 root guard / nearest marker 派生。
- 不做 system binary discovery、auto install、npx、用户自定义 provider command。
- 不启用 external provider fix / formatting / codeAction / fix-on-save，除非后续单独阶段完成安全门与 WorkspaceEdit preview/apply 验证。
- 不新增第二套 LSP / Files / Search API。

## 验证矩阵

M11-W 的验收证据应覆盖 provider gateway、安全 hygiene、每个 external provider 的最小 diagnostics proof，以及 IDE provider status UI：

```bash
npm run typecheck:api -- --pretty false
npm run test:system:lsp-external-gateway
npm run test:system:lsp-provider-hygiene
npm run test:system:lsp-yaml-provider
npm run test:system:lsp-bash-provider
npm run test:system:lsp-pyright-provider
npm run test:system:lsp-dockerfile-provider
npm run test:system:lsp-markdown-provider
npm run test:system:lsp-eslint-provider
npm run smoke:ide:lsp-provider-status
git diff --check
```

Docs-only link consistency is verified with a touched-docs relative-link check.

## 下一步决策：M12-A Framework / Heavy Language Provider Research Plan

M11-W 决定先冻结当前 external provider 批次，不继续在同一阶段盲目新增 Vue、Svelte、Go、Rust、Java、C/C++ 等重型 provider。

下一步进入 M12-A：Framework / Heavy Language Provider Research Plan。M12-A 应先研究并排序以下候选，而不是直接实现：

1. Framework-oriented provider：Vue / Svelte / MDX advanced semantics。
2. Toolchain-backed provider：Go / Rust / Java / C / C++。
3. External provider capability expansion：是否允许 hover / completion / definition / formatting / codeAction。
4. Provider runtime policy：是否仍只允许 bundled npm exact-pin，还是引入 toolchain presence detection，但不允许 system binary auto-discovery 默认启用。
5. Verification shape：每个 provider 必须有 install/status metadata、server-side allowlist profile、system test 和 IDE status smoke。

M12-A 仍应保持 research-first：官方/上游文档优先，验证当前 package/license/maintenance/size/security posture，再进入实现阶段。

## 明确未做

M11-W 不做：

- 新 provider runtime。
- 新依赖。
- Vue / Svelte / Go / Rust / Java / C/C++ 接入。
- external hover / completion / definition / references / formatting / codeAction。
- ESLint fix / fix on save。
- provider auto install / npx / system binary discovery。
- 用户自定义 provider command/env/runtime/cwd/options。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。
