# M12-T Java / Eclipse JDT LS Guarded Diagnostics Proof Summary

## 阶段定位

M12-T 将 M12-S 的 Java / Eclipse JDT LS runtime proof plan 落地为受控 diagnostics proof。Java provider 现在进入 toolchain-backed runtime proof allowlist，但只开放 diagnostics，不开放 Java rich IDE 能力。

## 完成内容

```txt
- 新增 Java provider registry entry，语言范围限定为 java，capability 仅 diagnostics。
- 新增 Java workspace marker resolver：pom.xml > Gradle build/settings > .project。
- 新增 Java/JDT LS provider：复用 existing external language server gateway 与 Files root/path guard。
- Java diagnostics route 只在 trusted OpenClaw config + allowlisted workspace profile + marker + Java 21+ probe + JDT LS launcher/config/data guard 通过后启动。
- JDT LS -data 目录由 Tracevane 在受控 cache/state root 下按 workspace/root 派生，不接受前端绝对路径。
- toolchain provider status runtimeProofProviderIds 扩展为 ["go", "rust", "clangd", "java"]。
- 新增 system test 覆盖 marker、degraded skip、Java version guard 与 mock stdio diagnostics proof。
```

## 关键文件

```txt
apps/api/modules/lsp/toolchain/javaWorkspace.ts
apps/api/modules/lsp/toolchain/javaJdtlsProvider.ts
apps/api/modules/lsp/providers/registry.ts
apps/api/modules/lsp/service.ts
apps/api/modules/lsp/toolchain/toolchainProviderStatus.ts
types/lsp.ts
tests/system/lsp-java-jdtls-provider.test.mjs
package.json
```

## Guard / degraded 策略

Java diagnostics 仍是 guarded proof，不是自动 JDT LS 管理器：

```txt
- 未启用、未 trusted、profileId 缺失或非 allowlist：degraded empty diagnostics。
- 缺 pom.xml / Gradle build/settings / .project marker：degraded empty diagnostics。
- 缺 launcher jar、platform configuration directory 或 Java command：degraded empty diagnostics。
- Java version probe 低于 21 或不可解析：degraded empty diagnostics。
- Gateway startup / diagnostics wait failure：degraded empty diagnostics。
```

实现继续拒绝前端或用户传入 `command` / `args` / `env` / `cwd` override；JDT LS runtime 参数来自 server-side trusted config 或从 trusted `jdtlsHome` 派生。

## 明确不做

M12-T 不做：

```txt
- JDT LS distribution 下载/安装。
- JDK 安装或 PATH discovery。
- Maven/Gradle task runner。
- standalone Java file 默认启动策略。
- Java hover/completion/definition/references/rename/formatting/code action。
- Java debug/test runner/package explorer。
- Maven/Gradle import UI 或 project model UI。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## 验证

```txt
npm run typecheck:api -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-java-jdtls-provider
git diff --check
```

## 下一步

M12-U：Toolchain provider acceptance / heavy provider closeout。

建议验收 Go、Rust、clangd、Java 四个 toolchain-backed diagnostics proof 的共同 guard、status surface、degraded behavior 和下一轮 rich capability / installer / UX 优先级。
