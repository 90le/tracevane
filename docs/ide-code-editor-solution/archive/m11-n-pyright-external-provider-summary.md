# M11-N Pyright External Provider Guarded Implementation Summary

## 状态

M11-N 已完成。Pyright 现在作为第三个受控 external LSP provider 接入 Tracevane：它是 bundled npm exact-pin provider，只通过既有 external language server gateway 证明 Python diagnostics 与 provider status，不扩大到完整 Python IDE / Pylance parity。

## 完成内容

- 新增 exact pinned `pyright@1.1.411` 依赖。
- 在 external provider metadata 中记录 Pyright 的 package/source/install status/pinned version/license/audit note/policy note。
- 在 server-side external provider profile 中使用 `process.execPath` + `require.resolve("pyright/langserver.index.js")` + `--stdio` 启动 Pyright，不允许前端传 command/args/env。
- 在 LSP provider registry 中新增 `pyright` provider，语言范围限制为 `python` / `py` / `python3` / `pyi`。
- 在 `/api/lsp/diagnostics` Python 路由中复用 `diagnoseWithExternalLanguageServer`，返回 provider/source 为 Pyright 的 diagnostics。
- 扩展 IDE External Provider Status smoke，使状态弹窗展示 Pyright installed/version/pin/source。
- 修复 external provider 状态弹窗在 provider 数量增长后内容过高的问题：dialog body 可滚动，footer close 始终可达。
- 新增 `test:system:lsp-pyright-provider`，覆盖 Pyright gateway profile/lifecycle 与 Python diagnostics proof。

## 边界保持

M11-N 没有做：

- Python hover / completion / definition / references / rename / formatting / code action。
- virtualenv / interpreter discovery。
- Pylance 私有能力或 VS Code Python extension parity。
- auto install、`npx`、system binary discovery、用户自定义 provider command/args/env。
- 第二套 LSP / Files / Search API。
- Git force/push/merge/rebase、Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-pyright-provider`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-external-gateway`
- `TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status`
- temporary markdown relative link check for touched docs
- `git diff --check`

## 下一步

M11-O：External provider acceptance / heavy provider expansion decision。

建议先收口 Pyright/YAML/Bash 三个 external provider 的验收口径、依赖治理、UI 可观测性和 provider expansion decision，再决定是否继续接入 TypeScript Language Server、gopls、rust-analyzer、Vue/Svelte/Java/C/C++ 等更重 provider。下一阶段仍应遵守 exact pin、server allowlist、provider-specific smoke 与 no frontend command override。
