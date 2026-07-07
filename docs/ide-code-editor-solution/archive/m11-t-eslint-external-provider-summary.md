# M11-T ESLint External Provider Guarded Diagnostics Summary

## 状态

已完成。M11-T 把 M11-S 的 ESLint safety plan 落地为受控 diagnostics/status proof：`vscode-eslint-language-server` 只通过 server-side allowlist 启动，只在 JS/TS 文件所在路径向上找到 ESLint activation marker 时启用，并继续复用现有 `/api/lsp`、external LSP gateway、Problems pipeline 与 provider status UI。

## 完成内容

- 新增 `eslint` external provider profile：
  - command 固定为 `process.execPath`。
  - args 固定为 `vscode-langservers-extracted/bin/vscode-eslint-language-server --stdio`。
  - language allowlist 为 `javascript` / `javascriptreact` / `typescript` / `typescriptreact`。
  - settings 由后端受控提供；frontend 不能传 command/env/cwd/runtime/options。
- 新增 ESLint provider registry / metadata：
  - provider source 仍为 `vscode-langservers-extracted@4.10.0`。
  - status UI 能显示 installed/version/source/policy/audit metadata。
  - metadata 明确 ESLint config/plugin runtime 是 accepted known risk。
- Diagnostics route：
  - 没有 ESLint activation marker 时，JS/TS diagnostics 继续走既有 TypeScript provider。
  - 找到 ESLint marker 时，用 marker directory 作为 external gateway root/cwd，避免用文件系统根目录启动 ESLint。
  - ESLint 使用 LSP pull diagnostics (`textDocument/diagnostic`)；YAML/Bash/Pyright/Dockerfile/Markdown 仍保持 publish diagnostics path。
- Activation markers：
  - `eslint.config.{js,mjs,cjs,ts}`。
  - `.eslintrc*`。
  - `package.json` 的 `eslintConfig`、ESLint dependency 或 lint/eslint script。

## 明确未做

- 不做 ESLint auto-fix / format / code action / fix on save。
- 不做 monorepo `workingDirectories` UI 或 glob 配置。
- 不允许 frontend/user 提供 `eslint.runtime`、`eslint.nodePath`、`execArgv`、command、args、env、cwd。
- 不启用 `vscode-langservers-extracted` 的 JSON/HTML/CSS bins。
- 不替换既有 TS/JS hover/completion/definition/references/semantic/workspace-symbol provider。
- 不新增第二套 LSP/Files/Search API。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-eslint-provider`
- `npm run smoke:ide:lsp-provider-status`（本阶段新增 ESLint status 行覆盖）
- `git diff --check`

## 下一步建议

M11-U：ESLint monorepo / workingDirectories hardening plan。先做 plan/safety review，再决定是否允许显式 working directory 配置、workspace trust 提示和更细的 degraded status，不直接启用 fix/format/code actions。
