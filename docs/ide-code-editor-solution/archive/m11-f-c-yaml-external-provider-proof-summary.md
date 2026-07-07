# M11-F-C YAML External Provider Proof Summary

## 状态

已完成。M11-F-C 在 M11-F-B internal gateway skeleton 上接入第一个真实 external language server provider proof：YAML diagnostics 通过 `yaml-language-server` 的 server-side allowlisted profile 进入现有 Tracevane LSP diagnostics contract。

## 上游/依赖核验

- `yaml-language-server` 当前 npm 版本：`1.23.0`。
- License：MIT。
- Repository：`https://github.com/redhat-developer/yaml-language-server`。
- npm bin：`yaml-language-server`，包文档支持 `--stdio` 启动。
- 依赖体量：约 4.9 MB unpacked；本阶段只作为 backend external LSP provider proof 使用，不进入 web bundle。

## 本阶段完成

- 新增依赖 `yaml-language-server@^1.23.0` 并锁定 package-lock。
- 扩展 LSP provider registry / shared type：新增 `yaml` provider，mode 为 `external`，capability 仅开放 `diagnostics`。
- 扩展 `apps/api/modules/lsp/external/externalProviderProfiles.ts`：使用 server-side profile 启动 `node <yaml-language-server bin> --stdio`，不接受前端传入 command/args。
- 扩展 external gateway：
  - 支持等待 `textDocument/publishDiagnostics`。
  - 对 language server 发起的 `workspace/configuration` 等 server-to-client request 返回安全默认配置，禁用 schemaStore 网络取 schema。
- 扩展 LSP service diagnostics：YAML 文件通过 existing `diagnoseDocument` / `/api/lsp/diagnostics` contract 调用 external gateway，返回 Tracevane `LspDiagnostic[]`。
- 新增真实 provider proof：
  - `tests/system/lsp-external-gateway.test.mjs` 增加真实 YAML server 启动与 diagnostics 验证。
  - `tests/system/lsp-yaml-provider.test.mjs` 验证 service 层将 YAML diagnostics 路由到 external provider。
  - `package.json` 增加 `test:system:lsp-yaml-provider`。

## 安全边界

- 前端仍不能传 arbitrary external LSP command。
- YAML server command/args 由 server-side allowlist 决定。
- cwd/root guard 继续复用 M11-F-B gateway root boundary。
- `workspace/configuration` 默认禁用 schemaStore，避免本阶段引入远程 schema fetching。
- YAML 只开放 diagnostics；hover/completion/definition/references/rename/formatting/code actions 不在本阶段承诺。
- 现有 JSON/TS/JS/HTML/CSS provider 与 `/api/lsp/*`、`/ws/lsp` contract 保持不变。

## 明确未做

- 未接入 pyright、gopls、rust-analyzer、Java、Vue、Svelte 或其它 heavy provider。
- 未实现全语言支持、多语言 workspace symbols、remote schema fetching、schema association UI。
- 未实现 YAML hover/completion/formatting/code actions UI。
- 未改 Git force/merge/rebase、Debug parity、Terminal 或 File Manager Online Editor 产品壳。
- 未做 external provider 长驻 session pool/status UI；下一阶段处理 lifecycle/status hardening。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-external-gateway`
- `npm run test:system:lsp-yaml-provider`
- `git diff --check`

## 下一步

M11-F-D：external provider lifecycle/status hardening and acceptance closeout。建议先完善 external provider lifecycle/status 口径、provider availability/degraded 显示、diagnostics timeout/fallback 策略与文档验收，再考虑第二个 external provider。
