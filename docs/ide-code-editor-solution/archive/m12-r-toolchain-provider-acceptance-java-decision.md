# M12-R Toolchain Provider Acceptance / Java JDT LS Decision

## 状态

M12-R 已完成：Toolchain provider acceptance / Java JDT LS decision。

这是 docs-only acceptance / decision closeout：验收 M12-G 到 M12-Q 的 toolchain provider status/config/trust gate，以及 Go/gopls、Rust/rust-analyzer、C/C++/clangd 三个 guarded diagnostics proof，并决定下一步进入 Java / Eclipse JDT LS runtime proof plan。

## 已验收能力

```txt
- Toolchain provider candidates 已覆盖 go、rust、java、clangd。
- Status/config/trust gate 已统一：只接受 server-side OpenClaw config、trusted=true、allowlisted profileId=workspace。
- command/args/env/cwd runtime override 仍被拒绝。
- Status surface 仍不探测 PATH、不自动安装、不从前端接收 command override。
- runtimeProofProviderIds 当前为 ["go", "rust", "clangd"]。
- Go diagnostics proof：trusted config + go.work/go.mod marker + bounded gopls version probe + external stdio gateway。
- Rust diagnostics proof：trusted config + Cargo.toml/rust-project.json marker + bounded rust-analyzer --version probe + external stdio gateway。
- clangd diagnostics proof：trusted config + compile_commands.json/compile_flags.txt/.clangd marker + bounded clangd --version probe + external stdio gateway。
- 三个 runtime proof 均保持 degraded empty diagnostics：缺配置、未 trusted、profile rejected、缺 marker、缺 binary/probe failure 或 gateway error 不破坏普通 LSP route。
```

## Java / Eclipse JDT LS 当前上游契约

基于 Eclipse JDT LS upstream README / project metadata 的当前结论：

- JDT LS 是 Java language server，基于 LSP4J、Eclipse JDT、M2Eclipse 和 Buildship。
- 当前 server runtime 需要 Java 21+。
- JDT LS 支持 Java 1.8 到 25 项目、Maven、Gradle、standalone Java files、as-you-type diagnostics、completion、hover、navigation、formatting、semantic highlighting 等能力。
- 启动命令不是单一 binary：需要 Java executable、launcher jar、platform `config_linux` / `config_win` / `config_mac`、以及 `-data` workspace data directory。
- `-data` 必须是 absolute path 且应 per workspace/project 唯一，因为 JDT LS 会存储 workspace-specific state。
- 不设置 socket/named-pipe 环境时，JDT LS 可 fallback 到 stdio，理论上可复用 existing external language server gateway。

## 决策

下一步选择 **M12-S Java / Eclipse JDT LS runtime proof plan**，先做 research / implementation plan，不直接实现 runtime。

原因：Java/JDT LS 相比 Go/Rust/clangd 需要额外安全与生命周期设计：

- Java 21+ runtime / `JAVA_HOME` / allowlisted `java` binary 需要独立 gate。
- JDT LS server distribution 不是一个固定 binary，需要 launcher jar 与 OS-specific configuration directory。
- `-data` workspace state directory 必须由 Tracevane 派生并 root/trust-aware 管理，不能由前端或用户任意传入。
- Maven/Gradle import、dependency download、annotation processing、workspace indexing 可能触发网络、文件写入和长任务，需要更明确的 trust、budget 和 degraded policy。
- Java rich capabilities 很多，M12-S/T 应先限定 diagnostics proof，不应一次性开启 completion/refactor/code action/debug 等完整 IDE parity。

## M12-R 明确不做

- 不实现 Java/JDT LS runtime。
- 不下载、安装或自动发现 JDT LS / Java runtime。
- 不新增 JDT LS server distribution 管理。
- 不启动 Maven/Gradle import。
- 不启用 Java diagnostics/rich interactions。
- 不修改现有 Go/Rust/clangd runtime route。
- 不新增第二套 LSP/Files/Search API。
- 不新增 Git/Debug/Terminal 能力。
- 不改变 File Manager Online Editor 产品壳。

## M12-S 建议输入

M12-S 应做 Java / Eclipse JDT LS runtime proof plan，并至少明确：

```txt
- JDT LS profile shape：java command、launcher jar、configuration dir、data dir policy。
- Java workspace marker：pom.xml、build.gradle/settings.gradle、.project 或 standalone Java fallback 是否允许。
- Data dir：Tracevane-managed cache under OpenClaw state，不接受 frontend absolute path。
- Version/start probe：java -version / launcher existence / configuration dir existence / bounded startup failure reason。
- Trust and budgets：Maven/Gradle import、dependency download、annotation processing、indexing 的默认禁用或 explicit-trust policy。
- Diagnostics-only proof：只接 .java diagnostics，不做 hover/completion/refactor/code action/debug。
- CI strategy：mock stdio proof + degraded paths，真实 JDT LS manual/optional smoke 后置。
```

## 验收证据

M12-R 为 docs-only closeout，验证命令：

- `python3 scripts/check-markdown-links.py docs/ide-code-editor-solution/archive/m12-r-toolchain-provider-acceptance-java-decision.md docs/ide-code-editor-solution/00-README.md docs/ide-code-editor-solution/07-终端运行语言服务Git方案.md docs/ide-code-editor-solution/08-实施阶段验收与风险.md .codex/project-context.md`
- `git diff --check`
