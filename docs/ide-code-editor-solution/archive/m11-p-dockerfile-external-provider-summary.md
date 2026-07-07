# M11-P Dockerfile External Provider Guarded Proof Summary

## 状态

M11-P 已完成。Dockerfile 现在作为第四个受控 external LSP provider 接入 Tracevane：它是 bundled npm exact-pin provider，只证明 Dockerfile diagnostics 与 provider status，不扩大到 hover/completion/formatting，也不要求 Docker daemon 或容器运行时。

## 完成内容

- 新增 exact pinned `dockerfile-language-server-nodejs@0.15.0` 依赖。
- 在 external provider metadata 中记录 Dockerfile provider 的 package/source/install status/pinned version/license/audit note/policy note。
- 在 server-side external provider profile 中使用 `process.execPath` + `require.resolve("dockerfile-language-server-nodejs/bin/docker-langserver")` + `--stdio` 启动 language server，不允许前端传 command/args/env。
- 在 LSP provider registry 中新增 `dockerfile` provider，语言范围限制为 `dockerfile` / `docker`。
- 在 `/api/lsp/diagnostics` Dockerfile 路由中复用 `diagnoseWithExternalLanguageServer`，返回 provider/source 为 Dockerfile language server 的 diagnostics。
- 扩展 IDE External Provider Status smoke，使状态弹窗展示 Dockerfile installed/version/pin/source。
- 新增 `test:system:lsp-dockerfile-provider`，覆盖 Dockerfile gateway profile/lifecycle 与 Dockerfile diagnostics proof。

## 边界保持

M11-P 没有做：

- Dockerfile hover / completion / definition / references / formatting / code action。
- Docker daemon / container runtime discovery。
- auto install、`npx`、system binary discovery、用户自定义 provider command/args/env。
- YAML upgrade 或 TS/JS external migration。
- Python advanced features / interpreter discovery / Pylance parity。
- 第二套 LSP / Files / Search API。
- Git force/push/merge/rebase、Debug parity、Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-dockerfile-provider`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-external-gateway`
- `TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status`
- temporary markdown relative link check for touched docs
- `git diff --check`

## 下一步

M11-Q：Markdown / vscode-langservers-extracted provider plan。

建议下一步先规划而不是直接接入 `vscode-langservers-extracted`：该 package 同时包含 JSON/HTML/CSS/Markdown/ESLint bins，其中 JSON/HTML/CSS 与 Tracevane 现有 in-process official language services 重叠。M11-Q 应明确是否只取 Markdown，如何避免替换已有 providers，以及如何继续满足 exact pin、server allowlist、status UI 和 provider-specific smoke gate。
