# M12-U Toolchain Provider Acceptance / Heavy Provider Closeout

## 状态

M12-U 已完成：Toolchain provider acceptance / heavy provider closeout。

这是 docs-only acceptance closeout：验收 M12-G 到 M12-T 已完成的 Go / gopls、Rust / rust-analyzer、C/C++ / clangd、Java / Eclipse JDT LS toolchain-backed diagnostics proof，并冻结下一轮 M13 的进入边界。

## 已验收能力矩阵

| Provider | Runtime proof | Workspace marker gate | Version/runtime probe | Diagnostics route | Rich interactions |
|---|---:|---|---|---|---|
| Go / gopls | 已完成 M12-K | `go.work` / `go.mod` | bounded `gopls version` | guarded mock stdio proof + degraded empty diagnostics | 后置 |
| Rust / rust-analyzer | 已完成 M12-N | `Cargo.toml` / `rust-project.json` | bounded `rust-analyzer --version` | guarded mock stdio proof + degraded empty diagnostics | 后置 |
| C/C++ / clangd | 已完成 M12-Q | `compile_commands.json` / `compile_flags.txt` / `.clangd` | bounded `clangd --version` | guarded mock stdio proof + degraded empty diagnostics | 后置 |
| Java / Eclipse JDT LS | 已完成 M12-T | `pom.xml` / Gradle build or settings / `.project` | Java 21+ probe + launcher/config/data guard | guarded mock stdio proof + degraded empty diagnostics | 后置 |

## 统一验收口径

M12-U 将 heavy provider 的共同 contract 固化为以下规则：

```txt
- runtimeProofProviderIds = ["go", "rust", "clangd", "java"]。
- Provider registry/status surface 暴露 Go/Rust/clangd/Java candidates，但不做 PATH discovery 或 auto install。
- Runtime proof 必须来自 server-side trusted OpenClaw config，且 profileId 仅允许 allowlisted workspace profile。
- command / args / env / cwd override 继续被拒绝，不能从前端传入任意 runtime。
- 每个 provider 启动前必须通过 root-guarded workspace marker 检测。
- 每个 provider 必须先做 bounded version/runtime probe，输出长度与超时受限。
- 缺配置、未 trusted、profile rejected、缺 marker、缺 binary/runtime、probe failure、gateway error 均 degraded empty diagnostics。
- External language server gateway 是唯一 stdio LSP runtime 边界，不新增第二套 LSP/Files/Search API。
- Toolchain provider 只证明 diagnostics；hover/completion/definition/references/rename/formatting/code action/semantic tokens 后置。
```

## 完成证据来源

M12-U 依赖并验收以下已提交记录：

```txt
archive/m12-g-toolchain-provider-status-configuration-plan.md
archive/m12-h-toolchain-provider-status-skeleton-summary.md
archive/m12-i-toolchain-provider-configuration-trust-summary.md
archive/m12-j-go-gopls-runtime-proof-plan.md
archive/m12-k-go-gopls-guarded-runtime-summary.md
archive/m12-l-toolchain-provider-acceptance-decision.md
archive/m12-m-rust-analyzer-runtime-proof-plan.md
archive/m12-n-rust-analyzer-guarded-runtime-summary.md
archive/m12-o-toolchain-provider-acceptance-decision.md
archive/m12-p-clangd-runtime-proof-plan.md
archive/m12-q-clangd-guarded-runtime-summary.md
archive/m12-r-toolchain-provider-acceptance-java-decision.md
archive/m12-s-java-jdtls-runtime-proof-plan.md
archive/m12-t-java-jdtls-guarded-runtime-summary.md
```

对应 verification surface：

```bash
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-go-gopls-provider
npm run test:system:lsp-rust-analyzer-provider
npm run test:system:lsp-clangd-provider
npm run test:system:lsp-java-jdtls-provider
```

## 当前明确不做

M12-U 不做且继续后置：

```txt
- 安装 / 下载 / 自动发现 gopls、rust-analyzer、clangd、JDT LS、JDK 或 build tools。
- PATH discovery、auto install、download manager、npx 或 arbitrary command override。
- Go/Rust/C/C++/Java rich LSP interactions：hover、completion、definition、references、rename、formatting、code action、semantic tokens。
- Build system generation / import UI：CMake/Bear/Bazel/Meson/Ninja/Make、Maven/Gradle task runner、Java package explorer。
- Java standalone-file 默认启动策略。
- LSP server marketplace / installer UX。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## 下一阶段建议

下一步进入：

```txt
M13-A Toolchain Provider Post-Diagnostics Roadmap Plan
```

M13-A 不应直接扩展某个 provider 的 rich interaction runtime。它应先做 research / planning / acceptance gate，比较以下路线的优先级和风险：

1. **Toolchain installer / dependency status UX**：是否需要 server-side install instructions、manual path validation、版本检查、状态 UI 和可恢复错误说明。
2. **Provider-specific rich interactions**：Go/Rust/clangd/Java 哪些 hover/completion/definition/references/rename/formatting/code action 能在当前 guard 下安全开启。
3. **Workspace/build-system integration**：JDT LS Maven/Gradle import、clangd compile database UX、Rust proc macro/build scripts trust、Go workspace handling 是否需要额外预算和 explicit trust。
4. **Release hardening**：是否优先把现有 diagnostics proof 纳入更稳定的 CI / smoke matrix / status UI regression，而不是继续扩能力。

建议 M13-A 仍为 docs-first plan，避免在 heavy toolchain diagnostics 刚收口后直接打开 installer 或 rich interactions 的安全面。

## 验证

M12-U 本身为 docs-only closeout，验证要求：

```bash
git diff --check
临时 markdown relative-link check for touched docs
```
