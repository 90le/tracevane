# M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan

## 状态

M13-G 已完成：Rust / rust-analyzer hover + definition guarded proof plan。

本阶段是 docs/research/plan，不改 runtime、不启动 rust-analyzer、不修改 `/api/lsp/hover` 或 `/api/lsp/definition`。目标是把 M13-F 冻结的 Go/gopls rich interaction guard 模板迁移到 Rust 前，先明确 rust-analyzer 的官方契约、安全边界、实现切片与验证计划。

## 官方契约核验

本阶段核验的官方/上游资料：

- rust-analyzer Security: <https://rust-analyzer.github.io/book/security.html>
- rust-analyzer Configuration: <https://rust-analyzer.github.io/book/configuration.html>
- Language Server Protocol 3.17 specification: <https://github.com/Microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md>

关键事实：

```txt
- rust-analyzer 支持标准 LSP language features；Tracevane 应继续复用 textDocument/hover 与 textDocument/definition routes。
- rust-analyzer hover documentation 默认开启（rust-analyzer.hover.documentation.enable=true）。
- rust-analyzer checkOnSave 默认开启，check command 默认 cargo check，且支持 overrideCommand/extraEnv 等配置；Tracevane 不能让前端注入 command/env/cwd。
- procMacro.enable 默认开启，并会隐含 cargo.buildScripts.enable；这意味着 Rust rich interactions 仍必须视为 trusted workspace runtime。
- linkedProjects / workspace.discoverConfig 可显式指定或动态发现 project model；M13-G/H 不应提前接入这些扩展路径。
- rust-analyzer security 文档明确项目目录配置可能覆盖 executable path；Tracevane 必须继续 server-side allowlisted profile 与 explicit trust gate。
```

## 与现有 Tracevane 基础的关系

M12-N 已完成 Rust / rust-analyzer guarded diagnostics proof，已有基础：

```txt
- rustWorkspace marker：nearest Cargo.toml，fallback rust-project.json。
- rustAnalyzerProvider：trusted config + marker 后执行 rust-analyzer --version probe。
- external stdio gateway：didOpen 后等待 publishDiagnostics。
- provider registry：Rust capability 当前仅 diagnostics。
- degraded skip：缺配置、未 trusted、缺 marker、缺 binary、probe failure 或 gateway error 返回 empty diagnostics。
```

M13-E 已完成 Go / gopls hover + definition proof，已有 rich interaction 模板：

```txt
- provider registry capability 增加 hover / definition。
- /api/lsp/hover 与 /api/lsp/definition 增加 provider branch。
- helper 共享 guarded external language server session。
- definition location 经过 workspace root guard 过滤。
- mock stdio fixture 覆盖 hoverProvider / definitionProvider 与 response mapping。
```

M13-H 应把两者合并：Rust rich interaction 复用 M12-N Rust guard + M13-E rich interaction route shape。

## M13-H 推荐实现切片

### 1. Provider registry capability

把 Rust provider capability 从 diagnostics-only 扩展为：

```txt
capabilities: diagnostics + hover + definition
```

但仅在 `/api/lsp/hover` 与 `/api/lsp/definition` 的 Rust guarded branch、system tests 和 degraded behavior 完成后更新。

### 2. Rust guarded session helper

在 `apps/api/modules/lsp/toolchain/rustAnalyzerProvider.ts` 中抽出共享 helper，避免 diagnostics、hover、definition 各自复制 gate：

```txt
withRustAnalyzerSession(input, callback)
```

共享 gate：

```txt
- toolchainProviderStatusSnapshot(config) 必须是 Rust configured/trusted。
- findRustWorkspaceMarker(rootRealPath, absolutePath) 必须找到 Cargo.toml 或 rust-project.json。
- probeRustAnalyzerVersion(profile, marker.directory) 必须成功。
- external gateway rootPath 使用 marker.directory。
- didOpen 当前 .rs 文件，languageId=rust。
- request timeout 使用现有 profile budgets，不扩大长任务预算。
- finally stop gateway，避免 orphan process。
```

返回状态继续对齐 M12-N：`configured`、`notConfigured`、`missingWorkspaceConfig`、`missingBinary`、`unsupportedVersion`、`disabledByTrust`、`unavailable`。

### 3. Hover route

新增：

```txt
hoverWithRustAnalyzer(input)
```

route 行为：

```txt
- 仅 language=rust 且 provider configured 时尝试。
- 请求 textDocument/hover，参数使用 existing TextDocumentPositionParams shape。
- null / empty hover 返回 empty hover response。
- request failure 返回 degraded empty，不抛未捕获错误。
- hover contents shape 复用现有 /api/lsp/hover response mapping，不新增 UI 专用格式。
```

### 4. Definition route

新增：

```txt
defineWithRustAnalyzer(input)
```

route 行为：

```txt
- 请求 textDocument/definition。
- 支持 Location / Location[] / LocationLink[] 的既有 service mapping。
- 每个返回 URI 必须转成 workspace relative path 前先经过 root guard。
- workspace 外、非 file URI、无法解析的 location 必须丢弃。
- 空结果返回 empty definition response，不影响 IDE。
```

### 5. Rust-specific risk boundary

M13-H 不应为了 hover/definition 额外打开更大 Rust 功能面：

```txt
- 不运行 cargo metadata 作为 marker 探测。
- 不接入 linkedProjects / workspace.discoverConfig UI。
- 不接受 frontend command/args/env/cwd override。
- 不自动安装 rust-analyzer、rustup component 或 rust-src。
- 不实现 proc macro/build script 配置面板。
- 不实现 completion/references/rename/formatting/codeAction/semantic tokens。
```

由于 rust-analyzer 默认可能运行 check/proc macro/build script 相关流程，Rust rich interactions 必须继续是 explicit trusted workspace 功能；缺 trust 就 degraded empty。

## 测试计划

M13-H 最小验证应覆盖：

```txt
- no trusted config：Rust hover/definition 返回 empty，不启动 external gateway。
- missing Cargo.toml / rust-project.json marker：返回 empty。
- missing binary / unsupported version probe：返回 empty/degraded。
- mock stdio hover：trusted config + marker + probe 后能返回 hover contents。
- mock stdio definition：trusted config + marker + probe 后能返回 workspace 内 definition location。
- definition root guard：workspace 外 location 被丢弃。
- provider registry/status：Rust capability 显示 hover / definition，仅在实现完成后更新。
```

建议验证命令：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-rust-analyzer-provider
npm run test:system:lsp-toolchain-provider-status
npm run smoke:ide:lsp-provider-status
git diff --check
```

## 明确不做

M13-G 不做，M13-H 也不应顺手做：

```txt
- Rust runtime implementation（M13-G docs-only）。
- Rust completion / references / rename / formatting / codeAction / semantic tokens。
- clangd / Java rich interactions。
- toolchain install / download / PATH discovery / rustup management / rust-src installation。
- cargo metadata workspace scan、linkedProjects UI、workspace.discoverConfig command integration。
- proc macro/build script management UX。
- 新 UI、新 command palette action、第二套 LSP / Files / Search API。
- File Manager Online Editor 产品壳变更。
```

## 风险

| 风险 | 影响 | M13-H 缓解 |
| --- | --- | --- |
| proc macros / build scripts 默认可执行 | hover/definition 也可能触发 trusted project code path | explicit trusted config；缺 trust degraded empty；文档保留风险提示 |
| Cargo / rust-toolchain / .cargo/config 改变工具链行为 | 实际执行环境可能超出用户预期 | server-side allowlisted profile；拒绝 frontend command/env/cwd override |
| 大 workspace 首次索引慢 | hover/definition timeout 或空结果 | bounded request budget；empty/degraded 不阻塞 IDE |
| definition 返回外部 crate / sysroot 路径 | 可能逃逸 workspace 或无法打开 | root guard；workspace 外 location 丢弃；sysroot preview 后置 |
| 本机缺 rust-analyzer | CI 不稳定 | mock stdio proof 必备；真实 rust-analyzer manual evidence optional |

## 下一步

进入 **M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation**：按本计划抽取 Rust guarded session helper，接入 Rust hover/definition branch，扩展 mock stdio proof 与 system tests；不做 Rust completion/references/rename/formatting/codeAction。
