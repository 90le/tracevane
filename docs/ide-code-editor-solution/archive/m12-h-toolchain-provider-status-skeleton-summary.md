# M12-H Toolchain Provider Status Skeleton Guarded Implementation Summary

## 状态

已完成。

M12-H 将 Go / Rust / Java / C/C++ 这类 heavy toolchain-backed provider 接入现有 LSP status surface，但只作为只读候选状态展示，不启动真实 language server，不探测系统 PATH，也不接入 diagnostics routing。

## 完成内容

- 后端新增 `apps/api/modules/lsp/toolchain/toolchainProviderStatus.ts`：
  - 定义 `go` / `rust` / `java` / `clangd` 四类 toolchain provider candidate。
  - 默认状态均为 `notConfigured`，`configured=false`。
  - 暴露 required binary、future configuration key、languages、capabilities、nextAction 和 notes。
  - 暴露 read-only policy：不 runtime PATH probe、不启动 language server、不接受前端 command override。
- `/api/lsp/status` 继续复用现有 LSP service/status route，并新增 `toolchainProviders` 字段。
- IDE Provider Status dialog 新增 `Toolchain provider candidates` 区块：
  - 展示 Go / gopls、Rust / rust-analyzer、Java / Eclipse JDT LS、C/C++ / clangd。
  - 标注 status skeleton 与 `notConfigured` 状态。
  - 展示 required binary、配置键、下一步动作与 no-PATH/no-runtime notes。
- 新增 `test:system:lsp-toolchain-provider-status`，验证 API status 的 guarded policy 与候选状态。
- 扩展 `smoke:ide:lsp-provider-status`，验证 UI 中 toolchain candidates 可见。

## 边界

M12-H 明确没有做：

- 安装或启动 `gopls` / `rust-analyzer` / Eclipse JDT LS / `clangd`。
- 读取或扫描系统 PATH。
- 自动发现 binary / JDK / Rust toolchain / compile database。
- 接入 Go/Rust/Java/C/C++ diagnostics、hover、completion、definition、references、rename、formatting 或 code action runtime。
- 修改 `/api/lsp/diagnostics` runtime routing。
- 允许前端传入 command / args / env / cwd override。
- 新增第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。

## 下一步

M12-I 建议进入 Toolchain provider configuration / trust UI foundation：

- 定义 workspace-trusted provider config 的持久化位置和 schema。
- 只允许 server-side validated profile，不接收任意前端 command。
- 为每个 provider 建立 configured / missingBinary / disabledByTrust / missingWorkspaceConfig 等状态流。
- 仍然不直接接入 diagnostics，runtime proof 需逐语言单独验收。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-toolchain-provider-status`
- `npm run smoke:ide:lsp-provider-status`
- touched-doc relative link check
- `git diff --check`
