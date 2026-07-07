# M12-K Go / gopls Guarded Runtime Proof Summary

## 目标

M12-K 将 M12-J 的 Go / gopls runtime proof plan 落到最小可验证实现：只证明 Go diagnostics 可以在受控边界内通过既有 external LSP stdio gateway 运行。

本阶段不追求完整 Go IDE parity，也不把其它 heavy toolchain provider 一起拉入运行时。

## 完成内容

- 在 provider registry 中登记 `go` provider，并把 Go diagnostics 路由接入现有 `/api/lsp/diagnostics` contract。
- 新增 Go workspace marker 识别：
  - 优先使用向上查找到的 `go.work`。
  - 未找到 `go.work` 时使用 nearest `go.mod`。
  - 不做 GOPATH fallback，不扫描被排除目录。
- 新增 `go-gopls` guarded diagnostics adapter：
  - 先读取 M12-I 的 trusted OpenClaw config / allowlisted `workspace` profile。
  - 未配置、未信任、无 workspace marker、缺少 binary 或 version probe 失败时降级为空 diagnostics，不让 diagnostics route 崩溃。
  - 在 marker directory 下启动现有 `externalLanguageServerGateway`。
  - 通过 `textDocument/didOpen` + bounded diagnostics wait 获得 `gopls` diagnostics。
- Toolchain provider status 更新为：
  - `startsLanguageServers: true`，但 `runtimeProofProviderIds: ["go"]` 明确只有 Go 被允许进行 guarded runtime proof。
  - `probesRuntimePath: false` 仍表示 status surface 不做 PATH/system probe。
  - 前端 command/args/env/cwd override 继续拒绝。
- 增加 Go/gopls 系统测试：
  - workspace marker 优先级。
  - 未配置 / 无 marker 降级为空 diagnostics。
  - 配置可信但缺少真实 `gopls` binary 时不阻塞 route。
  - 使用 mock stdio LSP server 证明 guarded gateway 能返回 diagnostics。

## 边界

M12-K 不做：

- 安装 `gopls` 或自动发现系统二进制。
- 前端自定义 command/args/env/cwd。
- Go hover / completion / definition / references / rename / formatting / code action。
- Go workspace GOPATH fallback、全量模块索引、rich project analysis。
- Rust / Java / clangd runtime proof。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。

## 验证

本阶段的最小验证：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-go-gopls-provider
npm run smoke:ide:lsp-provider-status
node --input-type=module <temporary markdown-link-check>
git diff --check
```

## 下一步

建议 M12-L 做 Toolchain provider acceptance / next toolchain decision：先验收 Go/gopls proof 的 status、diagnostics、degraded behavior 和文档口径，再决定是否进入 Rust / rust-analyzer runtime proof plan。不要在未收口前同时推进 Java / clangd 或 Go rich interactions。
