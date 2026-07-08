# M12-M Rust / rust-analyzer Runtime Proof Plan

## 目标

M12-M 是 Rust / rust-analyzer runtime proof 前的 docs-only 研究与实现计划。它承接 M12-L 的 toolchain provider acceptance，目标是确认 Rust 作为第二个 toolchain-backed provider 时，如何复用现有 status/config/trust gate 与 external language server gateway，而不是直接复制 Go/gopls 实现或绕过安全边界。

本阶段不新增 runtime 代码、不启动 `rust-analyzer`、不修改 `/api/lsp/diagnostics` 路由。

## 官方契约核验

官方/上游资料给出的关键事实：

- rust-analyzer 是 Rust 的 language server，需要 `rust-analyzer` binary、支持 LSP 的编辑器，以及 Rust 标准库源码；标准库源码可通过 `rustup component add rust-src` 安装。
- rustup 将 `rust-analyzer` 列为可安装 component；这意味着 Tracevane 可以把 `rust-analyzer` 当作系统 toolchain binary，但不应自动安装。
- rust-analyzer 会通过 Cargo 项目信息理解 workspace。配置文档中 `cargo.autoreload` 会在 `Cargo.toml` 或 `.cargo/config.toml` 改变时刷新 project info；`workspace.discoverConfig` 与 `rust-project.json` 可用于非 Cargo workspace。
- rust-analyzer 默认会运行 Cargo 相关流程：`cargo metadata`、build scripts、proc macros、check on save 等配置项均可能触发外部命令。
- 官方 security 文档明确：rust-analyzer 当前假设代码可信；proc macros 和 build scripts 默认执行，`.cargo/config`、`rust-toolchain.toml`、编辑器配置也可能改变实际执行的工具路径。

资料来源：

- rust-analyzer Installation: <https://rust-analyzer.github.io/book/installation.html>
- rust-analyzer Configuration: <https://rust-analyzer.github.io/book/configuration.html>
- rust-analyzer Security: <https://rust-analyzer.github.io/book/security.html>
- rustup Components: <https://rust-lang.github.io/rustup/concepts/components.html>

## 与现有 Tracevane toolchain gate 的关系

M12-G 到 M12-L 已经建立以下不变量：

- `/api/lsp/status` 暴露 Go / Rust / Java / clangd 候选与配置状态。
- Toolchain status surface 不做 PATH / binary 自动探测。
- OpenClaw config 只接受 allowlisted `profileId=workspace`，拒绝 `command` / `args` / `env` / `cwd` runtime override。
- Runtime proof 当前只允许 Go：`runtimeProofProviderIds=["go"]`。
- Go/gopls proof 只有在 trusted config + allowlisted profile + workspace marker + bounded version probe 通过后才启动 external stdio gateway。

M12-N Rust proof 应沿用这个模式，但 Rust 的 workspace/trust 风险比 Go 更敏感：Cargo metadata、build scripts、proc macros、`.cargo/config` 与 `rust-toolchain.toml` 都可能影响执行路径。因此 Rust proof 必须比 Go proof 更保守。

## M12-N 推荐实现切片

### 1. Provider registry 与状态策略

M12-N 可以新增 `rust` provider descriptor，但能力只声明 diagnostics：

```txt
id: rust
source: rust-analyzer
mode: external
languages: [rust]
capabilities: diagnostics only
```

同时把 toolchain status policy 的 `runtimeProofProviderIds` 从 `["go"]` 扩展为 `["go", "rust"]`，但必须仅在 Rust diagnostics route 真正完成并通过测试后更新。

### 2. Workspace marker 策略

新增 `apps/api/modules/lsp/toolchain/rustWorkspace.ts`，只做同步、只读、root-guarded marker 查找：

优先级：

1. 从当前 `.rs` 文件向上查找 nearest `Cargo.toml`。
2. 如当前目录或祖先目录存在 `rust-project.json`，可作为非 Cargo project marker。
3. 不做全仓库 Cargo workspace scan。
4. 不运行 `cargo metadata` 来判断 workspace root。
5. 忽略 `.git`、`node_modules`、`dist`、`build`、`coverage`、`.tracevane-trash` 等目录。

返回结构建议：

```ts
type RustWorkspaceMarkerKind = "Cargo.toml" | "rust-project.json";
interface RustWorkspaceMarker {
  kind: RustWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}
```

`cwd` 使用 marker directory，不接受前端传入 cwd。

### 3. Version probe 策略

新增 server-side allowlisted probe：

```txt
rust-analyzer --version
```

约束：

- 只在 trusted OpenClaw config + allowlisted workspace profile + marker 已通过后运行。
- `cwd` 使用 marker directory。
- timeout 建议 2s。
- output bounded，例如 500 bytes。
- output 必须能识别 `rust-analyzer`，否则 `unsupportedVersion`。
- `ENOENT` -> `missingBinary`。
- 其它错误 -> `unavailable`。

不做：PATH 自动发现、rustup install、`rustup component add rust-analyzer`、用户 command override。

### 4. rust-analyzer 初始化策略

M12-N 只做最小 diagnostics proof，推荐初始化参数保持保守：

- `rootPath` / workspace folder 指向 marker directory。
- `didOpen` 当前 `.rs` 文件后等待 `textDocument/publishDiagnostics`。
- 初始 proof 不显式配置 `check.overrideCommand`、`buildScripts.overrideCommand`、`workspace.discoverConfig`、`linkedProjects`。
- 不把 project-local config 转换为前端可编辑项。
- 不暴露 custom command/env/cwd。

Rust 特有风险处理：

- 官方 security 文档说明 build scripts/proc macros 默认可执行。M12-N 必须把 Rust runtime proof 仅作为 trusted workspace 功能。
- 如果未来需要禁用或收紧 `cargo.buildScripts.enable`、`procMacro.enable`、`checkOnSave`，必须单独做 M12-N 前的小范围 Spike 或在实现中明确记录折中。不能隐式假设 rust-analyzer 是纯静态解析器。
- 缺少 Cargo marker 的单文件 `.rs` 不启动 runtime，返回 degraded empty diagnostics。

### 5. Diagnostics route 策略

新增 `diagnoseWithRustAnalyzer`，形状与 Go proof 对齐：

```txt
input: config, rootRealPath, absolutePath, content, version, profile?, probe?
output: diagnostics, skipped, status, marker, versionSummary, reason
```

route 行为：

- `language === "rust"` 且 provider configured 时才尝试 Rust runtime。
- 缺配置、未 trusted、profile rejected、缺 marker、缺 binary、probe failure、timeout/error 都返回 `[]` diagnostics + `skipped=true`，不破坏普通 LSP route。
- LSP diagnostic 转换沿用现有 severity/range/source 映射，source 默认 `rust-analyzer`。

### 6. 测试策略

M12-N 最小验证应覆盖：

- `findRustWorkspaceMarker`：nearest `Cargo.toml`、`rust-project.json`、root escape、ignored directory。
- status policy：Rust 未实现前仍 status-only；实现后 `runtimeProofProviderIds` 包含 rust。
- config gate：missing config / untrusted / forbidden runtime override / unknown profile 均 skip。
- probe：missing binary、unsupported output、unavailable、success。
- mock stdio diagnostics proof：不依赖本机 `rust-analyzer`，通过 fake LSP server 证明 didOpen -> publishDiagnostics -> Tracevane diagnostics shape。
- optional real toolchain proof：如果 CI/本机存在 `rust-analyzer` 和 trusted config，可运行；否则 skip/degraded，不强制失败。
- provider status smoke：Rust configured 与 degraded reason 可见。

建议命令：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-rust-analyzer-provider
npm run smoke:ide:lsp-provider-status
git diff --check
```

## 明确不做

M12-M / M12-N 都不做：

- 安装或下载 `rust-analyzer` / Rust toolchain / `rust-src`。
- PATH discovery 或 frontend command override。
- 运行 `cargo metadata` 作为 marker 探测。
- 任意用户自定义 `command` / `args` / `env` / `cwd`。
- Rust hover / completion / definition / references / rename / formatting / code action / semantic tokens。
- Java / Eclipse JDT LS runtime proof。
- C/C++ / clangd runtime proof。
- Go rich interactions。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 风险

| 风险 | 影响 | M12-N 缓解 |
| --- | --- | --- |
| build scripts / proc macros 默认可执行 | Trusted workspace 中仍可能执行项目代码 | 只允许 explicit trusted config；记录 security warning；缺 trust 直接 skip |
| `.cargo/config` / `rust-toolchain.toml` 可改变工具链路径 | 运行环境可能超出用户预期 | 不接受 Tracevane runtime override；只在 marker dir 启动；degraded reason 可见 |
| Cargo workspace 复杂、多根、多 manifest | marker 选择错误可能造成诊断缺失 | M12-N 只用 nearest marker；多 root/linkedProjects 后置 |
| 本机缺 `rust-analyzer` | CI 不稳定 | mock stdio proof 必须覆盖；real binary proof optional/skip |
| rust-analyzer 首次加载较慢 | diagnostics timeout | bounded request timeout；timeout 返回 degraded empty diagnostics |

## 下一步

进入 **M12-N Rust / rust-analyzer guarded diagnostics proof**：按本计划实现 `rustWorkspace`、`diagnoseWithRustAnalyzer`、provider descriptor、runtimeProofProviderIds 更新、system test 与 provider status smoke。
