# M12-L Toolchain Provider Acceptance / Next Toolchain Decision

## 目标

M12-L 收口 M12-G 到 M12-K 的 heavy toolchain provider 批次，确认当前实现已经形成可复用的受控模式，然后选择下一步 toolchain provider 入口。

这是 docs-only acceptance / decision，不新增 runtime 代码，也不改变现有 Go/gopls 行为。

## 验收范围

已验收的阶段：

- M12-G：定义 Go / Rust / Java / C/C++ toolchain provider status、配置边界和 UI 呈现计划。
- M12-H：实现只读 status skeleton，暴露候选 provider 与 guarded policy。
- M12-I：接入 OpenClaw config / trust / allowlisted profile 状态，拒绝前端或 config 中的 command/args/env/cwd override。
- M12-J：基于官方 gopls contract 制定 Go runtime proof plan。
- M12-K：实现 Go/gopls guarded diagnostics proof。

## 当前完成口径

Toolchain provider 当前能力：

- `/api/lsp/status` 可展示 Go / Rust / Java / clangd 候选、状态、配置来源、allowlisted profile 和 next action。
- Status surface 不做 PATH / binary 自动探测：`probesRuntimePath: false`。
- Runtime proof 只允许 Go：`runtimeProofProviderIds: ["go"]`。
- 前端或 OpenClaw config 中的 `command` / `args` / `env` / `cwd` override 被拒绝。
- Go/gopls diagnostics route 只有在 trusted config + allowlisted workspace profile + go.work/go.mod marker + bounded version probe 都通过后才启动 external stdio gateway。
- 缺配置、未信任、缺 marker、缺 `gopls` binary 或 probe 失败都降级为空 diagnostics，不破坏普通 LSP route。
- Rust / Java / clangd 仍是候选状态，不启动 runtime。

## 风险与后置边界

仍后置：

- Rust / rust-analyzer runtime proof。
- Java / Eclipse JDT LS runtime proof。
- C/C++ / clangd runtime proof。
- Go hover / completion / definition / references / rename / formatting / code action。
- Toolchain binary 安装、自动下载、PATH discovery、版本管理 UI。
- 用户自定义 command/args/env/cwd。
- 多 root / remote / container toolchain 语义。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。

## 下一步决策

选择 **M12-M Rust / rust-analyzer runtime proof plan** 作为下一步，而不是直接实现 Rust runtime。

原因：

1. Rust / rust-analyzer 是与 Go 类似的 system toolchain-backed provider，但 workspace marker 和 build-system 语义不同，需要先做 research/plan。
2. M12-K 已证明 Go diagnostics 的通用 guarded pattern；下一步应验证该 pattern 是否能迁移到第二个 heavy provider。
3. Java/JDT LS 和 clangd 的 workspace data / compile database 风险更高，应等 Rust proof plan 后再决定。
4. Go rich interactions 可以后置；当前更需要先确认 toolchain provider expansion policy。

M12-M 建议只做研究和计划：

- 核验 rust-analyzer 官方启动、workspace、diagnostics、Cargo project discovery contract。
- 定义 Cargo.toml / rust-project.json / workspace marker 策略。
- 定义 trusted config、profile、version probe、degraded skip、mock stdio proof 策略。
- 不直接写 Rust runtime implementation。

## 验证

M12-L 是 docs-only 收口，验证要求：

```bash
node --input-type=module <temporary markdown-link-check>
git diff --check
```

可选参考上一阶段 M12-K 的实现验证：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-go-gopls-provider
npm run smoke:ide:lsp-provider-status
```
