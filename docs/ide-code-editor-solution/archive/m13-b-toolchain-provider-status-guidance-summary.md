# M13-B Toolchain Provider Status / Setup Guidance UX Foundation Summary

## 状态

M13-B 已完成：Toolchain Provider Status / Setup Guidance UX Foundation。

本阶段承接 M13-A 的 post-diagnostics roadmap，在不扩大 runtime 执行面的前提下，强化 Go / gopls、Rust / rust-analyzer、C/C++ / clangd、Java / Eclipse JDT LS 这四类 toolchain-backed provider 的状态可解释性。

## 完成内容

### `/api/lsp/status` setup guidance payload

`toolchainProviders.candidates[]` 新增 `setupGuidance`，每个 provider 都暴露：

```txt
- summary：当前 provider 的启用前提摘要。
- requiredRuntime：后端 runtime / binary / trust / workspace 前提。
- workspaceMarkers：Go/Rust/clangd/Java 对应 workspace marker。
- configurationHint：只读 OpenClaw config 示例片段。
- degradedReasons：notConfigured / disabledByTrust / missingWorkspaceConfig / missingBinary / unsupportedVersion / unavailable 的原因和下一步。
- docs：官方文档链接 metadata。
- copyableHint：可复制的排障和配置建议文本。
```

该 payload 继续复用现有 LSP status API，不新增第二套 provider setup API。

### IDE Provider Status UI

IDE Provider Status dialog 的 Toolchain provider candidate 行新增 setup guidance 区块：

```txt
- Required runtime 列表。
- Workspace markers chips。
- OpenClaw config hint 代码块。
- Degraded reasons 明细。
- 官方 docs link。
- “复制建议”按钮。
```

UI 仍是只读 status / guidance surface，不安装、不启动、不修改配置。

### 测试覆盖

- `tests/system/lsp-toolchain-provider-status.test.mjs` 覆盖 setupGuidance JSON shape、config hint、copyable hint、docs link 和 degraded reason。
- `tests/ide-workbench/ide-lsp-provider-status.smoke.mjs` 覆盖 Go/Rust/clangd/Java 四个 provider 的 UI setup guidance、config hint、degraded reason 与 docs link。
- smoke 的 runtimeProofProviderIds 断言已从 Go/Rust 更新为 Go/Rust/clangd/Java，匹配 M12-U 之后的 heavy provider proof 状态。

## 保持的边界

M13-B 不做：

```txt
- toolchain binary 下载、安装或升级。
- PATH 自动发现或任意 binary 探测。
- 自动写入 OpenClaw config。
- 启动新的 rich LSP runtime。
- Go/Rust/clangd/Java hover/completion/definition/references/rename/formatting/code action。
- Maven/Gradle import UI、clangd compile DB generator、Cargo metadata/proc macro UX implementation。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。
```

## 下一步

进入 M13-C：Single Provider Rich Interaction Proof Decision。

建议先选择 Go / gopls hover + definition proof 作为最低风险候选，但需要在 M13-C 明确 analyzer/version/settings gate、workspace marker、degraded reason 和 smoke strategy 后再实现。

## 验证

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run smoke:ide:lsp-provider-status
临时 markdown relative-link check for touched docs

git diff --check
```
