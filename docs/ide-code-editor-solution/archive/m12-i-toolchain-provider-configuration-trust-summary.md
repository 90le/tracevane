# M12-I Toolchain Provider Configuration / Trust UI Foundation Summary

## 状态

已完成。

M12-I 在 M12-H 只读候选状态基础上，增加 server-side OpenClaw config 读取、allowlisted profile 校验和 IDE Provider Status 配置/信任展示。它仍然不启动任何 Go/Rust/Java/C/C++ language server，不探测 PATH，不接 diagnostics routing。

## 完成内容

- `toolchainProviderStatusSnapshot(config)` 从 `openclawConfigFile` 读取受控配置状态。
- 支持配置路径：
  - `lsp.toolchains.go.gopls`
  - `lsp.toolchains.rust.rustAnalyzer`
  - `lsp.toolchains.java.jdtls`
  - `lsp.toolchains.cxx.clangd`
- 只接受 allowlisted `profileId`：当前仅 `workspace`。
- 明确拒绝 runtime override keys：`command` / `args` / `env` / `cwd`。
- 状态流基础：
  - 无配置或 disabled：`notConfigured`
  - enabled 但未 trusted：`disabledByTrust`
  - trusted + allowlisted profile：`configured`
  - 非 allowlisted profile 或 runtime override：`unavailable`
  - 缺少 profile：`missingWorkspaceConfig`
- `/api/lsp/status` 的 `toolchainProviders.policy` 增加：
  - `acceptsOnlyAllowlistedProfiles=true`
  - `configSource=openclaw-config`
- IDE Provider Status dialog 显示每个 toolchain candidate 的：
  - enabled / trusted
  - profileId
  - config source
  - accepted profile ids
  - rejected reason
- 系统测试覆盖默认未配置、trusted allowlisted configured、未信任 disabledByTrust、非法 profile 和 command override 拒绝。
- Provider status smoke 覆盖 UI 中 config/trust 基础字段。

## 边界

M12-I 明确没有做：

- 启动 `gopls` / `rust-analyzer` / Eclipse JDT LS / `clangd`。
- 读取 PATH 或探测 binary/version。
- 验证 JDK、Rust toolchain、Go module、compile_commands.json。
- 接入 Go/Rust/Java/C/C++ diagnostics、hover、completion、definition、references、rename、formatting 或 code action runtime。
- 修改 `/api/lsp/diagnostics` runtime routing。
- 允许前端传入 command / args / env / cwd override。
- 新增第二套 LSP / Files / Search API。

## 下一步

M12-J 建议进入 Go / gopls toolchain provider runtime proof plan：

- 先做 docs/plan，明确 Go provider 的 runtime proof、cwd/root guard、workspace trust、binary/version check、smoke 条件和 CI skip 策略。
- 然后再做单语言 guarded runtime proof，不一次性启用 Rust/Java/clangd。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-toolchain-provider-status`
- `npm run smoke:ide:lsp-provider-status`
- touched-doc relative link check
- `git diff --check`
