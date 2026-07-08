# M13-A Toolchain Provider Post-Diagnostics Roadmap Plan

## 状态

M13-A 已完成：Toolchain Provider Post-Diagnostics Roadmap Plan。

这是 docs-only roadmap / decision plan，承接 M12-U 已收口的 Go / Rust / clangd / Java guarded diagnostics proof。M13-A 不实现新 runtime 能力，而是决定 diagnostics 之后的优先级、风险门禁和下一阶段切片。

## 上游依据摘要

M13-A 重新核对当前上游契约，结论如下：

- Go / gopls 官方文档说明 gopls 覆盖 diagnostics、navigation、completion、analysis、refactoring 等 LSP/IDE 能力，并区分 gopls build Go、runtime Go toolchain、source language version 等版本面。后续 rich interactions 可以复用现有 gopls route，但需要先定义版本/设置/diagnosticsTrigger 与 analyzer gate。
- rust-analyzer 官方 security 文档说明 proc macros 和 build scripts 默认会执行，且项目配置可能覆盖可执行文件路径；configuration 文档也涉及 proc macro/build-script 相关开销。因此 Rust rich interactions 或 installer/status UX 必须继续 explicit trust + bounded budget。
- clangd 官方 config/design 文档强调 compile command / compilation database 对 parser、diagnostics、completion 的影响，且 `QueryDriver` 等配置可能带来额外不确定性。clangd 后续不能在缺 compile database UX 的情况下贸然开启完整 semantic/refactor parity。
- Eclipse JDT LS upstream README 继续要求 Java 21+ runtime、launcher jar、platform config 与 per-workspace `-data`；Java rich interactions 还会牵涉 Maven/Gradle import、workspace indexing 和 dependency resolution。

## M13 方向决策

M13 应优先做 **Provider Status / Trust / Dependency UX hardening**，然后再选择单 provider rich interaction proof。

理由：

1. M12 已经证明 diagnostics runtime guard，但用户仍需要知道为什么某个 provider degraded、缺哪个 binary/config/marker，以及如何修复。
2. Installer/download/auto-discovery 会扩展信任和供应链边界，不应在没有 UX/policy plan 时直接实现。
3. Rich interactions 比 diagnostics 更容易触发 provider-specific side effects：Rust proc macro/build script、clangd compile DB、JDT LS import/indexing、gopls analyzer/settings 均需要更细门禁。
4. 当前已有 Provider Status UI foundation，可作为 M13-B 的低风险承载面。

## 推荐阶段切片

### M13-B：Toolchain Provider Status / Setup Guidance UX Foundation

目标：不安装、不自动发现、不启动额外 runtime，只强化 status UX 与 setup guidance。

允许做：

```txt
- Provider Status UI 展示 per-provider setup guidance：required binary/config/marker/version/trust state。
- 显示最后一次 degraded reason：not trusted、missing marker、missing binary、unsupported version、runtime unavailable。
- 显示 manual configuration hint：OpenClaw trusted config 字段、profileId=workspace、禁止 command/args/env/cwd override。
- 增加复制诊断/配置建议文本的 UI。
- 增加 docs 链接到 Go/Rust/clangd/JDT LS 官方安装/配置页面。
- 增加 system/UI tests 覆盖 status JSON shape 与 Provider Status 可见性。
```

不做：

```txt
- 下载或安装 toolchain/server。
- PATH 自动发现或任意 binary 探测。
- 自动修改 OpenClaw config。
- 启动 rich LSP runtime。
```

### M13-C：Single Provider Rich Interaction Proof Decision

M13-B 后再决定第一个 rich provider。建议优先级：

1. **Go / gopls hover + definition proof**：风险最低，已有 Go diagnostics route 和 workspace marker，官方 gopls 覆盖 navigation/completion/refactoring。先选 hover/definition，不直接做 rename/code action。
2. **clangd hover/definition proof**：依赖 compile database，适合在 compile DB UX 更清楚后做。
3. **Rust hover/definition proof**：需先处理 proc macro/build script trust、Cargo metadata budget 和 degraded reason。
4. **Java hover/definition proof**：需先处理 JDT LS workspace/import/indexing 状态与更长启动预算。

### M13-D：Installer / Dependency Policy Plan

如果用户更看重“开箱即用”，M13-D 应先做 policy plan：

```txt
- 哪些 provider 允许项目管理安装，哪些只给 manual guidance。
- 下载源、版本 pin、checksum、缓存位置、升级/回滚策略。
- Windows/macOS/Linux 差异。
- 离线和代理环境。
- 是否允许 workspace-local toolchain，如何避免前端 command override。
```

不得在 M13-B 里直接实现。

## M13-A 明确不做

```txt
- Go/Rust/clangd/Java hover/completion/definition/references/rename/formatting/code action runtime。
- Toolchain binary install/download/PATH discovery。
- 自动写 OpenClaw config。
- Maven/Gradle import UI、clangd compile DB generator、Cargo metadata/proc macro UX implementation。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## 下一步

进入：

```txt
M13-B Toolchain Provider Status / Setup Guidance UX Foundation
```

M13-B 是低风险 implementation slice：它只改善当前已存在 Provider Status 面板和 status payload 的可解释性，不扩大 runtime 执行面。

## 验证

M13-A 为 docs-only plan：

```bash
git diff --check
临时 markdown relative-link check for touched docs
```
