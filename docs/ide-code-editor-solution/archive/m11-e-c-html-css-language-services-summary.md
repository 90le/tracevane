# M11-E-C HTML/CSS Lightweight Language Services Summary

状态：已完成。

## 背景

M11-E-A 已抽出 Tracevane LSP provider registry，M11-E-B 已把 JSON provider 迁移到官方 `vscode-json-languageservice`。M11-E-C 继续按 M11-D 的 Tier 1 in-process lightweight provider 路线，把 HTML 与 CSS/SCSS/LESS 接入同一 LSP contract，但不启动外部 language server 进程，也不承诺一次性“全语言支持”。

## 完成本阶段

- 新增官方 focused dependencies：
  - `vscode-html-languageservice@5.6.2`，MIT，Microsoft 官方仓库。
  - `vscode-css-languageservice@6.3.10`，MIT，Microsoft 官方仓库。
- 扩展 provider registry：
  - 新增 `html` provider，source 为 `vscode-html-languageservice`。
  - 新增 `css` provider，覆盖 `css` / `scss` / `less`，source 为 `vscode-css-languageservice`。
  - `/api/lsp/status` 的 supported languages / feature matrix 暴露 `html`、`css`、`scss`、`less`。
- 新增 `apps/api/modules/lsp/providers/htmlCssLanguageService.ts`：
  - HTML：completion、hover、formatting。
  - CSS/SCSS/LESS：diagnostics、completion、hover、definition、references、formatting。
  - 把官方 range / diagnostic / completion / edit 输出映射到 Tracevane 既有 response shape。
  - 使用 CJS-safe default import 模式，避免 UMD package 在 runtime 下出现 named ESM import 问题。
- 更新 `apps/api/modules/lsp/service.ts`：
  - 复用既有 Files root/path guard 与 request validation。
  - HTML/CSS provider 通过既有 `/api/lsp/*` 与 `/ws/lsp` 分发。
  - `normalizeLanguage` 增加 `html` / `css` / `scss` / `less` 的 languageId、扩展名与轻量 HTML 内容识别。
  - HTML definition/references 在当前官方能力边界内返回空 locations，不抛出异常打断编辑器。
- 更新 `types/lsp.ts`：
  - 抽出 `LspProviderId = "json" | "typescript" | "html" | "css"`，避免后续 provider response union 重复扩散。
  - semantic tokens / workspace symbols 仍保持 TypeScript provider 专属。
- 新增 `tests/ide-workbench/ide-lsp-html-css-providers.smoke.mjs` 与 npm script `smoke:ide:lsp-html-css-providers`：
  - 覆盖 provider status matrix。
  - 覆盖 HTML completion / formatting。
  - 覆盖 CSS diagnostics / completion / hover。
  - 覆盖 SCSS formatting。
  - 覆盖 CSS completion WebSocket gateway。

## 兼容性与边界

M11-E-C 保持：

- 单一 Tracevane LSP HTTP / WebSocket contract。
- Files root/path guard 在 service 层继续生效。
- Problems / Output / Monaco provider bridge 不新增第二套协议。
- WorkspaceEdit preview/apply 安全边界不变。
- TS/JS semantic tokens、workspace symbols、rename、formatting、code actions 继续由既有 TypeScript provider 承担。

M11-E-C 不做：

- 外部 language server gateway / process manager。
- `typescript-language-server` / `pyright` / `gopls` / `rust-analyzer` 等 heavy provider。
- YAML / Python / Go / Rust / Java / Vue / Svelte provider。
- HTML diagnostics validation（当前 `vscode-html-languageservice` API 不提供 `doValidation`）。
- HTML definition / references / rename。
- CSS rename / provider-specific quick fixes。
- 多语言 workspace symbols。
- 第二套 LSP / Files / Search API。
- Git force / merge / rebase、Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

已运行：

- `npm view vscode-html-languageservice version license repository.url dependencies --json`
- `npm view vscode-css-languageservice version license repository.url dependencies --json`
- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run build:api`
- `npm run smoke:ide:lsp-html-css-providers`
- `npm run smoke:ide:lsp-diagnostics`
- `npm run smoke:ide:lsp-interaction`
- `npm run smoke:ide:lsp-typescript-interaction`
- `npm run smoke:ide:lsp-rename-format-code-actions`

说明：安装 HTML/CSS 官方包后，npm audit 仍报告项目现有 10 vulnerabilities（1 low, 3 moderate, 6 high）。本阶段未运行 `npm audit fix`，避免引入无关 breaking dependency churn。

## 下一步

进入 **M11-E-D multi-language provider acceptance closeout**：汇总 provider registry、JSON official LS、HTML/CSS lightweight providers 的验收口径、smoke matrix 与后置边界，再决定是否进入外部 language server gateway / Python(YAML 等) 的独立研究阶段。
