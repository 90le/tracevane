# M13-F Toolchain Rich Interaction Acceptance / Next Provider Decision

## 状态

M13-F 已完成：Toolchain rich interaction acceptance / next provider decision。

本阶段不改 runtime，不新增 provider，不修改 UI。它验收 M13-C~M13-E 的第一个 toolchain-backed rich interaction proof：Go / gopls hover + definition 已通过现有 `/api/lsp/hover`、`/api/lsp/definition`、external language server gateway、Files root/path guard 与 mock stdio system proof 接入，并在缺配置、缺 marker、缺 binary 或 request failure 时保持 degraded empty response。

## 验收结论

Go / gopls hover + definition guarded proof 可以作为后续 toolchain rich interaction 的基准模板。

冻结的实现口径：

```txt
- 不新增第二套 LSP route：rich interaction 继续复用 /api/lsp/hover、/api/lsp/definition 和后续既有 interaction routes。
- 不让 Dockview、Monaco shell 或前端拥有 provider runtime；runtime 仍在 API service / external gateway 中。
- 每个 toolchain rich provider 必须先通过 explicit trusted config 与 allowlisted profile。
- workspace marker 必须 server-side 派生，不能接受前端 cwd/command/args/env override。
- binary/version probe 必须 bounded、timeout、output limited。
- request failure、缺配置、缺 marker、缺 binary、unsupported version 必须 degraded/empty，不拖垮 IDE。
- 所有返回 file location 必须经过 Files root/path guard；workspace 外 location 必须丢弃。
- CI proof 以 mock stdio LSP server 证明 routing/shape/lifecycle；真实 toolchain binary 作为 optional manual evidence。
```

## M13-E 证据

M13-E 已提供以下验证基础：

```txt
- Go provider registry capability 暴露 hover / definition。
- Go hover/definition helper 共享 guarded gopls session。
- external LSP initialize capability 声明 hoverProvider / definitionProvider。
- mock stdio fixture 覆盖 hover / definition request response。
- system test 覆盖 no trusted config empty response 与 mock stdio hover/definition proof。
```

M13-F 采用 M13-E 的验证记录作为收口证据，并只补文档/阶段决策，不重复修改 runtime。

## 下一 provider 决策

下一步选择 **M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan**。

选择 Rust 的原因：

```txt
- Rust 已在 M12-N 完成 rust-analyzer guarded diagnostics proof，具备 provider registry、marker、version probe、external gateway 与 degraded skip 基础。
- rust-analyzer 支持 LSP hover / definition，能复用 M13-E 的 rich interaction shape。
- Rust 的 Cargo metadata、build scripts、proc macros 与 rust-toolchain 配置风险高于 Go，因此必须先做 docs-only proof plan，再实施 runtime。
- 继续推进 Rust 比直接扩展 Go completion/references/rename 更能验证 “多 toolchain provider 复用同一 rich interaction guard 模板” 的可迁移性。
```

M13-G 应先做计划，不直接实现 runtime：

```txt
- 复核 rust-analyzer hover/definition capability 与 M12-N diagnostics guard。
- 定义 Rust rich interaction 继续 explicit trusted config、Cargo.toml / rust-project.json marker、version probe、external gateway 与 root guard。
- 明确 proc macro / build script / cargo metadata 风险如何被 trust boundary 约束。
- 定义 mock stdio proof、degraded empty behavior 与 optional real rust-analyzer manual evidence。
```

## 明确没有做

M13-F 不做：

```txt
- Rust / rust-analyzer hover 或 definition runtime implementation。
- Go completion / references / rename / formatting / codeAction。
- clangd / Java rich interactions。
- toolchain install / download / PATH discovery / auto-write config。
- provider marketplace、LSP server installer、build-system generator。
- 新 UI、新 command palette action、第二套 LSP / Files / Search API。
- File Manager Online Editor 产品壳变更。
```

## 验证

Docs-only 验证：

```bash
git diff --check
临时 Markdown 相对链接检查（覆盖本次 touched docs）
```

未运行 runtime test：M13-F 不改变 runtime；M13-E 已运行 API/web typecheck、Go provider system tests、toolchain status tests、Provider Status smoke 与 diff/link checks。

## 下一步

进入 **M13-G Rust / rust-analyzer Hover + Definition Guarded Proof Plan**：仅做 docs/research/plan，先冻结 Rust rich interaction 的 guard、degraded、mock proof 与风险边界，再进入后续 implementation。
