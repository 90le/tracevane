# M12-S Java / Eclipse JDT LS Runtime Proof Plan

## 阶段定位

M12-S 是 docs-only research / implementation plan。它在 M12-R 决定 Java 作为下一个 heavy toolchain provider 后，先定义 Eclipse JDT LS 的 runtime proof 边界，再允许后续 M12-T 进入 guarded diagnostics proof。

本阶段不实现 Java diagnostics，不启动 JDT LS，不修改 provider runtime code。

## 上游契约核验

基于 Eclipse JDT LS 官方 README / project 信息，M12-S 采用以下事实作为实现约束：

- Eclipse JDT LS 是 Java 的 Language Server Protocol 实现，基于 LSP4J、Eclipse JDT、M2Eclipse 和 Buildship。
- 它支持 Maven、Gradle、standalone Java files、diagnostics、completion、hover、navigation、formatting、semantic highlighting 等能力。
- 运行 JDT LS 需要 Java 21+ runtime。
- 常规启动需要 `java`、launcher jar、平台相关 `config_linux` / `config_win` / `config_mac` configuration directory，以及 `-data` 指向的绝对路径。
- `-data` 保存 workspace-specific information，必须按 workspace/project 唯一。
- JDT LS 支持 socket、named pipe 和 standard streams；Tracevane M12-T 优先继续复用现有 stdio external language server gateway。

参考：<https://github.com/eclipse-jdtls/eclipse.jdt.ls>

## 为什么 Java 需要独立计划

JDT LS 比 gopls、rust-analyzer、clangd 的 proof 面更宽：

```txt
- 需要 Java 21+ runtime。
- 需要 JDT LS distribution root / launcher jar / platform configuration directory。
- 需要 Tracevane 管理 per-workspace -data directory，不能让前端传任意绝对路径。
- Maven / Gradle import 可能触发 dependency resolution、workspace indexing、annotation processing。
- Java 项目形态包括 Maven、Gradle、Eclipse project 和 standalone Java files，marker 策略不能只看单一文件。
```

因此 M12-T 必须是 guarded diagnostics proof，而不是“发现 java 后直接启动”。

## M12-T 推荐 runtime profile

M12-T 应在 server-side trusted OpenClaw config 中表达 Java profile，禁止前端传 command/args/env/cwd override。

建议字段语义：

```ts
type JavaJdtlsProfile = {
  providerId: "java";
  profileId: string;
  trusted: boolean;
  javaCommand?: "java" | string; // 仅 server-side allowlist；默认 java 也必须经 profile/trust gate
  jdtlsHome?: string;            // trusted distribution root
  launcherJar?: string;          // 可由 jdtlsHome/plugins 派生或 server-side 显式配置
  configurationDirectory?: string; // config_linux/config_win/config_mac 或 trusted explicit path
  dataRoot?: string;             // Tracevane 管理的 base；最终 -data 按 workspace hash 派生
  maxStartupMs?: number;
  maxProbeMs?: number;
};
```

实现约束：

- `launcherJar` 与 `configurationDirectory` 必须来自 server-side trusted config 或从 trusted `jdtlsHome` 派生。
- `-data` 必须由 Tracevane 在受控 cache/state root 下按 `workspaceId + rootPath` stable hash 派生。
- 不接受前端提供 `-data`、`-configuration`、`-jar`、`cwd`、`env` 或任意 JVM args。
- 不自动下载 JDT LS distribution，不自动安装 JDK，不做 PATH discovery。
- `java -version` probe 只在 trusted profile + marker 通过后执行，并 bounded timeout / output。

## Workspace marker 策略

M12-T 不应在任意 `.java` 文件上无条件启动 JDT LS。推荐 marker 顺序：

1. 最近的 `pom.xml`。
2. 最近的 `build.gradle` / `build.gradle.kts`。
3. 最近的 `settings.gradle` / `settings.gradle.kts`。
4. 最近的 `.project`。
5. Standalone Java file fallback 继续后置，或仅在后续显式 profile 中打开。

原因：JDT LS 支持 standalone Java files，但 Tracevane 当前 proof 目标是项目级 guarded diagnostics。没有 marker 时默认 degraded empty diagnostics，避免为单个文件隐式创建重型 workspace state。

## 安全与副作用边界

M12-T 必须保持以下 guard：

```txt
- workspace/root guard：所有 marker、file path、data dir 派生都限制在 workspace 语义内。
- trust gate：未 trusted 的 Java profile 不启动。
- marker gate：缺 Maven/Gradle/Eclipse marker 默认 degraded skip。
- binary/distribution gate：缺 Java 21+、launcher jar 或 config dir 默认 degraded skip。
- bounded probe：java version probe / JDT LS startup / diagnostics request 都有 timeout 与输出上限。
- no arbitrary args：不接受前端或文件内容提供 JVM args / env / cwd / LSP command override。
- no output persistence：不长期保存完整 JDT LS 输出或项目敏感路径日志。
```

M12-T 不直接运行 Maven/Gradle CLI；但 JDT LS 自身可能在 import/index 阶段读取 build files、解析依赖或执行受 JDT LS 控制的 project import。该能力必须只在 trusted workspace/profile 下启用，并在文档和 provider status 中暴露风险。

## M12-T 推荐实现切片

建议文件：

```txt
apps/api/modules/lsp/toolchain/javaWorkspace.ts
apps/api/modules/lsp/toolchain/javaJdtlsProvider.ts
tests/system/lsp-java-jdtls-provider.test.mjs
docs/ide-code-editor-solution/archive/m12-t-java-jdtls-guarded-runtime-summary.md
```

实现顺序：

1. 增加 Java workspace marker resolver。
2. 增加 JDT LS profile resolver：trusted profile -> launcher/config/data dir -> rejected/degraded reason。
3. 增加 Java 版本 probe，接受 Java 21+，失败 degraded。
4. 复用 existing external language server gateway 的 stdio route 发起 diagnostics proof。
5. 将 `java` 加入 runtime proof provider allowlist，仅 diagnostics capability。
6. 增加 mock stdio system test，覆盖 didOpen -> publishDiagnostics -> Tracevane diagnostics shape。
7. 更新 provider status metadata 与 docs summary。

## M12-T 验收建议

最小验证：

```txt
npm run typecheck:api -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-java-jdtls-provider
git diff --check
```

测试应覆盖：

- 未 trusted profile -> degraded empty diagnostics。
- 缺 marker -> degraded empty diagnostics。
- 缺 launcher/config/java/probe failure -> degraded empty diagnostics。
- Java 21+ probe + marker + trusted profile + mock stdio diagnostics -> 返回 Problems-compatible diagnostics。
- 前端/user command override 或任意 args 不可进入 runtime path。

## 明确不做

M12-S 不做：

```txt
- Java diagnostics runtime implementation。
- 启动 JDT LS 或 Java process。
- JDT LS distribution 下载/安装。
- JDK 安装或 PATH 自动发现。
- Maven/Gradle task runner。
- Standalone Java file 默认启动策略。
- Java hover/completion/definition/references/rename/formatting/code action。
- Java debug/test runner/package explorer。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## 下一步

M12-T：Java / Eclipse JDT LS guarded diagnostics proof。

M12-T 可以开始实现最小 Java diagnostics route，但必须保持 docs-first 定义的 launcher/config/data-dir/trust/marker/degraded 策略。
