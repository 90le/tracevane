# M12-O Toolchain Provider Acceptance / Next Heavy Provider Decision

## 目标

M12-O 是 docs-only acceptance / decision closeout。它验收 M12-G 到 M12-N 已完成的 toolchain-backed provider gate，并决定下一步 heavy provider 顺序。

本阶段不改 runtime 代码、不启动 Java JDT LS 或 clangd、不扩展 Rust/Go rich interactions。

## 当前完成状态

已完成的 toolchain provider 基础：

- M12-G：定义 Go / Rust / Java / clangd 的 toolchain provider status / configuration foundation plan。
- M12-H：`/api/lsp/status` 暴露只读 toolchain candidates 和 policy。
- M12-I：OpenClaw config/trust/profile gate 落地，只接受 allowlisted `profileId=workspace`，拒绝 `command` / `args` / `env` / `cwd` override。
- M12-J / M12-K：Go / gopls runtime proof plan 与 guarded diagnostics proof 已完成。
- M12-L：验收 Go proof 并选择 Rust 作为下一 toolchain proof。
- M12-M / M12-N：Rust / rust-analyzer runtime proof plan 与 guarded diagnostics proof 已完成。

当前 runtime proof policy：

```txt
runtimeProofProviderIds = ["go", "rust"]
```

Go 与 Rust 共享的完成口径：

- 只有 trusted OpenClaw config + allowlisted workspace profile 才允许进入 runtime proof。
- Status surface 不做 PATH / binary 自动探测。
- 运行前必须通过 workspace marker guard。
- 版本 probe 必须 server-side allowlisted、bounded timeout、bounded output。
- 缺配置、未 trusted、profile rejected、缺 marker、缺 binary、probe failure 或 gateway error 都 degraded empty diagnostics。
- Mock stdio system test 证明 Tracevane external gateway contract，不依赖本机真实 toolchain。

## 官方/上游证据摘要

已核验的当前外部事实：

- Go 官方文档将 `gopls` 定义为 Go team 开发的官方 language server，并支持 diagnostics、navigation、completion、refactoring 等 IDE 功能；当前 Tracevane 只启用 guarded diagnostics proof。
- gopls settings 文档显示 server-side file watcher 默认 `off`，依赖客户端发送 file change notifications；这与 Tracevane 当前 watcher/LSP gate 可兼容，但 rich interactions 仍应单独规划。
- rust-analyzer security 文档说明 proc macros 和 build scripts 默认执行，`.cargo/config` 可覆盖工具路径；因此 Rust runtime 必须保持 explicit trusted workspace gate。
- clangd 官方 installation 文档说明 generic LSP client 可运行 `clangd` 并通过 stdio 通信；clangd 依赖 compile commands / compile flags 来理解项目。
- clangd design 文档说明 clangd 会为每个文件确定 virtual compiler command，理想来源是 build system/compilation database；compile flags 会深刻影响 parser 行为。
- Eclipse JDT LS 项目文档说明它是 Java-specific LSP implementation，可把 Maven 等 build system 转换到 JDT project structure。
- Eclipse JDT LS upstream README 当前要求至少 Java 21 runtime，并提供多种安装方式；这意味着 Tracevane 接入 JDT LS 需要额外处理 Java runtime、server distribution、per-workspace data directory 与 build tool side effects。

## 下一步决策

M12-O 建议下一步进入：

```txt
M12-P C/C++ / clangd runtime proof plan
```

理由：

1. **接入形态更接近 Go/Rust proof**：clangd 是 stdio LSP binary，能复用现有 external language server gateway、toolchain status/config/trust gate 与 mock stdio proof。
2. **明确但可控的 workspace marker**：M12-P 可先规划 `compile_commands.json`、`compile_flags.txt`、`.clangd` 的 root-guarded marker 策略，不必马上处理复杂 build system generation。
3. **Java JDT LS 接入面更大**：JDT LS 至少需要 Java 21、server distribution / launcher jar / config dir、workspace data dir isolation、Maven/Gradle/project import 行为，适合在 clangd plan 后单独做 Java-specific plan。
4. **不抢 Go/Rust rich interactions**：Go/Rust rich LSP 能力应该在 toolchain diagnostics batch 稳定后，再以 provider-specific interaction expansion 进入；现在先补齐 C/C++ diagnostics proof plan 更符合多语言覆盖路线。

## M12-P 推荐边界

M12-P 只做 clangd runtime proof plan，不实现 runtime：

- 核验 clangd 官方 installation/design/compile commands/config 文档。
- 定义 C/C++ workspace marker：nearest `compile_commands.json`、`compile_flags.txt`、`.clangd`，并说明没有 marker 时是否允许 fallback diagnostics。
- 定义 `clangd --version` bounded probe。
- 定义 trusted config + allowlisted profile + root/cwd guard。
- 定义 diagnostics-only proof，rich interactions 后置。
- 定义 mock stdio system test、provider status smoke 和 optional real clangd manual proof。

## 继续后置

M12-O 不做且后置：

- clangd runtime implementation。
- Java / Eclipse JDT LS runtime plan 或 implementation。
- Go / Rust hover、completion、definition、references、rename、formatting、code action、semantic tokens。
- PATH discovery、auto install、download manager、npx 或 arbitrary command override。
- build system generation：Bear/CMake/Bazel/Maven/Gradle project import。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验收证据

M12-O 依赖 M12-N 已提交验证：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-rust-analyzer-provider
npm run test:system:lsp-toolchain-provider-status
npm run smoke:ide:lsp-provider-status
git diff --check
```

本阶段自身为 docs-only，验证要求：touched docs markdown relative link check + `git diff --check`。
