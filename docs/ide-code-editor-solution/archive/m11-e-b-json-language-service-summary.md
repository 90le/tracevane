# M11-E-B JSON Official Language Service Migration Summary

状态：已完成。

## 背景

M11-E-A 已抽出薄 provider registry / capability matrix，但 JSON provider 仍由 Tracevane 手写 parse / hover / completion / formatting 逻辑承担。M11-E-B 的目标是把 JSON provider 迁移到官方 `vscode-json-languageservice`，同时保持 Tracevane 既有 LSP HTTP / WebSocket contract、Problems/Output、WorkspaceEdit preview/apply 和 Files root guard 不变。

## 完成本阶段

- 新增显式依赖：`vscode-json-languageservice@5.7.2`。
  - 来源：Microsoft `vscode-json-languageservice` 官方包。
  - License：MIT。
  - 作为 focused dependency 使用，不引入 external language server process。
- 新增 `apps/api/modules/lsp/providers/jsonLanguageService.ts`。
  - 通过官方 JSON language service 创建 in-process provider。
  - 使用官方 parser / validation / completion / formatting。
  - 禁用外部 schema request：schema 请求不会访问网络，避免 workspace 外部不受控 fetch。
  - 把官方 LSP range / diagnostic / completion / edit 转为 Tracevane 既有 response shape。
  - 保留 1-based UI 坐标与 `provider: "json"` 外部 contract。
- 更新 `apps/api/modules/lsp/service.ts` / `routes.ts`。
  - JSON diagnostics / hover / completion / definition / references / formatting / code actions 走 JSON provider adapter。
  - JSON 相关 routes 与 WebSocket message handler 支持 async provider。
  - TypeScript / JavaScript provider、semantic tokens、workspace symbols、WorkspaceEdit preview/apply 保持原边界。
- 更新 provider source：JSON provider source 改为 `vscode-json-languageservice`。

## 兼容性与边界

M11-E-B 保持：

- `/api/lsp/*` 与 `/ws/lsp` 单一 Tracevane LSP contract。
- Files root/path guard 仍在 service 层校验。
- Problems/Output 接入方式不变。
- WorkspaceEdit preview/apply 安全边界不变。
- JSON diagnostics 对外仍保留兼容 code `JSON_PARSE`，避免破坏既有 smoke / UI 过滤。

M11-E-B 不做：

- HTML / CSS / SCSS / LESS runtime provider。
- 外部 language server gateway / process manager。
- 第二套 LSP / Files / Search API。
- remote JSON schema fetching。
- schema catalog / schema association UI。
- multi-language workspace symbols。
- Git force / merge / rebase、Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

已运行：

- `npm run typecheck:api -- --pretty false`
- `npm run build:api`
- `npm run smoke:ide:lsp-diagnostics`
- `npm run smoke:ide:lsp-interaction`
- `npm run smoke:ide:lsp-rename-format-code-actions`
- `npm run smoke:ide:lsp-typescript-interaction`
- touched docs Markdown relative link check
- `git diff --check`

说明：`npm install --save vscode-json-languageservice@5.7.2` 报告项目现有 audit 风险：10 vulnerabilities（1 low, 3 moderate, 6 high）。本阶段未运行 `npm audit fix`，避免引入无关 breaking dependency churn。

## 下一步

M11-E-C 建议进入 HTML / CSS / SCSS / LESS lightweight provider research and guarded implementation：先核验官方 `vscode-html-languageservice` / `vscode-css-languageservice` 依赖、bundle/runtime 边界和 Tracevane provider registry 扩展方式；仍不引入外部 language server 进程，也不承诺一次性全语言支持。
