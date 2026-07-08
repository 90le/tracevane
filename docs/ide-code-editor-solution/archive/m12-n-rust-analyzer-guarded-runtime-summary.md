# M12-N Rust / rust-analyzer Guarded Diagnostics Proof Summary

## 完成口径

M12-N 把 M12-M 的 Rust / rust-analyzer runtime proof plan 落地为受控 diagnostics proof。Rust 现在是第二个 toolchain-backed runtime provider，但只在 explicit trusted OpenClaw config、allowlisted workspace profile、root-guarded workspace marker 与 bounded version probe 通过后才启动 external stdio gateway。

本阶段继续复用既有 LSP service、external language server gateway、Toolchain provider status/config gate、Files root/path guard 与 Problems diagnostics response contract；没有新建第二套 LSP / Files / Search API。

## 代码完成项

- 新增 `apps/api/modules/lsp/toolchain/rustWorkspace.ts`：从当前 `.rs` 文件向上查找 nearest `Cargo.toml`，并在无 Cargo marker 时 fallback 到 `rust-project.json`；路径必须位于 workspace root 内，并忽略 `.git`、`node_modules`、`dist`、`build`、`coverage`、`.tracevane-trash`。
- 新增 `apps/api/modules/lsp/toolchain/rustAnalyzerProvider.ts`：提供 `createRustAnalyzerProfile`、`probeRustAnalyzerVersion`、`diagnoseWithRustAnalyzer` 与 diagnostics 转换。
- `rust-analyzer --version` probe 只在 trusted config + marker 后执行，timeout 2s，output bounded 500 bytes；`ENOENT` degraded 为 `missingBinary`，无法识别 rust-analyzer degraded 为 `unsupportedVersion`。
- `/api/lsp/diagnostics` 对 `rust` 语言接入 Rust route；缺配置、未 trusted、profile rejected、缺 marker、缺 binary、probe failure 或 gateway error 均返回空 diagnostics，不破坏普通 LSP route。
- Provider registry 增加 `rust` descriptor，capability 仅声明 diagnostics。
- Toolchain status policy 的 `runtimeProofProviderIds` 从 `['go']` 扩展到 `['go', 'rust']`，并把 Rust configured nextAction 更新为 M12-N guarded proof 文案。

## 验证覆盖

新增 `tests/system/lsp-rust-analyzer-provider.test.mjs` 与 npm 脚本 `test:system:lsp-rust-analyzer-provider`，覆盖：

- Rust marker detection：nearest `Cargo.toml`、fallback `rust-project.json`。
- root escape / ignored directory 不激活 marker。
- Rust diagnostics route 在未配置与缺 marker 时 degraded empty diagnostics。
- probe 对 missing binary 与 unsupported output 的 degraded 状态。
- mock stdio server 证明 trusted config + marker + probe 通过后，`didOpen` -> `publishDiagnostics` 能转换为 Tracevane diagnostics shape。

更新 `tests/system/lsp-toolchain-provider-status.test.mjs`，覆盖 `runtimeProofProviderIds=['go','rust']` 与 Rust trusted profile 的 M12-N nextAction。

## 明确不做

M12-N 不做：

- 安装或下载 `rust-analyzer` / Rust toolchain / `rust-src`。
- PATH discovery、auto install、rustup component management。
- 运行 `cargo metadata`、build-script/proc-macro 配置管理或 workspace scan。
- 用户/前端自定义 `command` / `args` / `env` / `cwd`。
- Rust hover / completion / definition / references / rename / formatting / code action / semantic tokens。
- Java / Eclipse JDT LS runtime proof。
- C/C++ / clangd runtime proof。
- Go rich interactions。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 风险与后置

Rust/rust-analyzer 仍是 trust-sensitive runtime：rust-analyzer 官方 security model 假设代码可信，Cargo metadata、build scripts、proc macros、`.cargo/config` 与 `rust-toolchain.toml` 可能影响实际执行行为。因此 M12-N 只允许 trusted workspace diagnostics proof，缺少信任或 marker 时必须 degraded skip。

下一步建议进入 **M12-O Toolchain provider acceptance / next heavy provider decision**：验收 Go + Rust 两个 toolchain-backed diagnostics proof 的统一 gate，并决定 Java JDT LS、clangd，或 Rust/Go rich interactions 的后续顺序。
