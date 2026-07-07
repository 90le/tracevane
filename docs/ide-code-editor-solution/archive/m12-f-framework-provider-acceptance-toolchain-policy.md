# M12-F Framework Provider Acceptance / Heavy Toolchain Policy Decision

## 状态

M12-F 已完成。这是 docs-only acceptance / policy closeout：验收 Vue / Svelte framework provider proof，并把 Go / Rust / Java / C / C++ 明确归入 toolchain-backed provider 策略轨道。

## 当前 provider acceptance matrix

已接受的 Tracevane LSP provider 口径：

| 分组 | Provider | 当前能力口径 |
|---|---|---|
| In-process | JSON | diagnostics + rich interactions |
| In-process | HTML / CSS | lightweight diagnostics / language service foundation |
| In-process | TypeScript / JavaScript | diagnostics、hover、completion、definition、references、semantic tokens、workspace symbols、rename / format / code action UI foundation |
| External npm | YAML / Bash / Pyright / Dockerfile / Markdown / ESLint | diagnostics-first + status metadata |
| Framework external npm | Vue / Svelte | diagnostics/status proof only |

Vue / Svelte 验收结论：

- Vue：`@vue/language-server@3.3.6` exact-pin，server-side allowlist，diagnostics route/status metadata/system test 已完成。
- Svelte：`svelte-language-server@0.18.3` exact-pin，server-side allowlist，diagnostics route/status metadata/system test 已完成。
- 两者都不承诺 hover/completion/definition/references/semantic tokens/formatting/code action；这些能力需要后续单独 safety gate。

## npm-first provider gate 冻结

后续 npm-first external provider 必须继续满足：

1. Server-side allowlist profile；frontend 不能传 command / args / env / cwd / runtime / options。
2. Dependency exact-pin 或等价可审计版本 pin。
3. License / source / installed version / pinned version / audit notes metadata。
4. Workspace root/cwd guard。
5. Provider-specific system test。
6. IDE provider status smoke。
7. 第一切片默认 diagnostics/status；rich interactions 另开阶段。
8. WorkspaceEdit 类能力必须继续走 preview/apply、root guard、dirty/conflict 保护。

## Heavy provider 上游事实

- `gopls` 是 Go team 维护的官方 Go language server，运行时会用 `$PATH` 中的 `go` command 获取 workspace 信息，并只支持最近两个 Go major releases。
- `rust-analyzer` 需要 `rust-analyzer` binary、LSP editor client 和 Rust standard library source；旧 toolchain / override 可能导致分析失败。
- Eclipse JDT LS 需要 Java 21+ runtime，支持 Maven / Gradle 项目，并需要独立 workspace data 目录。
- `clangd` 需要 `clangd` binary，并依赖 `compile_commands.json` / `compile_flags.txt` 或 fallback compile command 来理解 C/C++ 源码。

因此 Go / Rust / Java / C / C++ 不能照搬 bundled npm exact-pin 方案。

## Toolchain-backed provider policy

M12-F 决策：heavy provider 进入 toolchain-backed policy，默认不自动启动。

### 默认禁止

- system binary auto-discovery。
- runtime auto install。
- npx / curl / shell installer。
- frontend 提供 arbitrary command、args、env、cwd、runtime、options。
- 在未知 trust 状态下启动 workspace toolchain。

### 允许的未来方向

M12-G 可先做 status / configuration foundation：

- Provider candidates: Go / Rust / Java / C / C++。
- Read-only status model:
  - notConfigured
  - configured
  - missingBinary
  - unsupportedVersion
  - missingWorkspaceConfig
  - disabledByTrust
  - unavailable
- Strict configuration schema:
  - provider id
  - executable path or profile id
  - optional workspace data path for JDT LS
  - read-only version probe command policy（后续单独审查）
- UI 只展示状态和下一步说明，不启动真实 server。
- Manual verification checklist per provider。

### Runtime proof 前置条件

任何 heavy provider runtime proof 前必须先有：

1. Toolchain trust gate。
2. Path allowlist / executable validation。
3. Version probe safety budget。
4. Workspace root/cwd guard。
5. Provider-specific degraded reasons。
6. Manual or automated smoke environment。
7. Clear opt-in user action。

## 推荐下一阶段：M12-G

M12-G：Toolchain provider status / configuration foundation plan。

范围建议：

- 不安装、不发现、不启动 heavy server。
- 增加 docs / types / optional status metadata 计划。
- 如果写代码，也只做 read-only candidate/status/config schema skeleton。
- 确认 IDE provider status UI 如何表达缺失工具链和下一步动作。

## 明确未做

M12-F 不做：

- 安装或启动 `gopls` / `rust-analyzer` / Eclipse JDT LS / `clangd`。
- system binary auto-discovery。
- auto install、npx、shell installer。
- 用户自定义任意 command / env / runtime / cwd / options。
- Go / Rust / Java / C / C++ diagnostics。
- Vue / Svelte rich interactions。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 上游资料

- Go gopls official docs: <https://go.dev/gopls/>
- rust-analyzer installation docs: <https://rust-analyzer.github.io/book/installation.html>
- Eclipse JDT LS repository / requirements: <https://github.com/eclipse-jdtls/eclipse.jdt.ls>
- clangd getting started: <https://clangd.llvm.org/installation.html>
- clangd compile commands design: <https://clangd.llvm.org/design/compile-commands>

## 验证

M12-F 是 docs-only 阶段，验证范围：

- 官方/上游资料核验。
- touched-doc relative link check。
- `git diff --check`。
