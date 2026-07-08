# M13-H Rust / rust-analyzer Hover + Definition Guarded Implementation Summary

## 状态

已完成。M13-H 把 M13-G 的 Rust / rust-analyzer hover + definition proof plan 落到现有 LSP runtime：Rust provider 在通过 trusted OpenClaw config、Cargo workspace marker、bounded `rust-analyzer --version` probe 与 external stdio gateway guard 后，可以复用现有 `/api/lsp/hover` 与 `/api/lsp/definition` 路由返回 hover 内容和 definition locations。

## 已完成内容

- `apps/api/modules/lsp/toolchain/rustAnalyzerProvider.ts`
  - 将原 diagnostics-only flow 抽为 shared guarded session helper。
  - 保留 M12-N guard：provider 必须 configured/trusted，文件必须位于 `Cargo.toml` 或 `rust-project.json` marker 内，version probe 必须通过。
  - 新增 `hoverWithRustAnalyzer(input)`。
  - 新增 `defineWithRustAnalyzer(input)`。
  - 复用 external language server gateway，不新增 Rust 专用 LSP transport。
  - 对 unavailable / missing binary / missing workspace config 返回 degraded empty result，不把失败扩散为 IDE hard failure。
- `apps/api/modules/lsp/service.ts`
  - `/api/lsp/hover` 增加 Rust branch。
  - `/api/lsp/definition` 增加 Rust branch。
  - definition locations 继续通过 `relativePathInsideRoot` 做 root guard，root 外路径被过滤。
- `apps/api/modules/lsp/providers/registry.ts`
  - Rust provider capability 从 diagnostics-only 扩展为 diagnostics + hover + definition。
- `tests/system/lsp-rust-analyzer-provider.test.mjs`
  - 增加 provider registry capability proof。
  - 增加 mock stdio hover + definition guarded proof。
- `tests/fixtures/lsp-mock-server.mjs`
  - mock hover 文案改为语言中性，供 Go/Rust 共同复用。

## Guard / degraded 规则

M13-H 没有放宽 Rust 安全边界：

1. 未配置或未 trust 的 Rust toolchain provider 返回空 hover/definition/diagnostics。
2. 缺少 `Cargo.toml` / `rust-project.json` marker 时返回 `missingWorkspaceConfig` degraded empty result。
3. `rust-analyzer --version` probe 失败时不启动 gateway。
4. hover/definition 只在 server-side allowlisted profile 下运行。
5. definition location 会在 service 层转换为 workspace relative path；root 外路径被丢弃。
6. 不保存完整 LSP output，也不把 frontend command/args/env/cwd override 暴露给用户。

## 本阶段明确未做

- Rust completion / references / rename / formatting / code action / semantic tokens。
- rust-analyzer installer、download、PATH discovery 或 rustup / rust-src 管理。
- Cargo metadata、build script、proc macro、linkedProjects、workspace.discoverConfig 的 UI 或配置管理。
- clangd / Java rich interactions。
- 新的 LSP / Files / Search API。
- File Manager Online Editor 产品壳变更。

## 验收口径

M13-H 的完成证据是：

- TypeScript API / Web typecheck 通过。
- Rust provider system test 覆盖 diagnostics guard、provider registry capability、mock stdio hover、mock stdio definition。
- Toolchain provider status system test 通过，确认不破坏 existing toolchain gate/status surface。
- IDE LSP provider status smoke 通过，确认 provider status UI surface 未回退。
- `git diff --check` 通过。

## 下一步

建议进入 **M13-I Toolchain Rich Interaction Acceptance / Next Capability Decision**：验收 Go + Rust 两个 toolchain-backed rich interaction proofs 是否足够稳定，再决定是否继续推进 clangd/Java hover+definition、Go completion/references、Rust semantic tokens，或先收口 provider status / docs / smoke gate。
