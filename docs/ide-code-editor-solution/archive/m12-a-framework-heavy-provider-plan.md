# M12-A Framework / Heavy Language Provider Research Plan

## 状态

M12-A 已完成。此阶段是 research-first 的语言 provider 扩展决策阶段，不新增 runtime provider、不新增依赖、不改变 external language server gateway 行为。

## 本地现状

Tracevane 当前已接受的 LSP provider 批次记录见 [`m11-w-external-provider-acceptance-decision.md`](./m11-w-external-provider-acceptance-decision.md)：

- In-process rich providers：JSON、HTML、CSS、TypeScript / JavaScript。
- External diagnostics-first providers：YAML、Bash、Pyright、Dockerfile、Markdown、ESLint。
- External provider 统一通过 server-side allowlist profile、exact-pinned npm package、root/cwd guard、status metadata 和 provider-specific tests 验收。

当前本地依赖核验：

```txt
@vue/language-server: not installed
svelte-language-server: not installed
typescript-language-server: not installed
typescript: installed (^5.3.0)
pyright: installed (1.1.411)
vscode-langservers-extracted: installed (4.10.0)
```

npm 当前候选版本核验：

```txt
@vue/language-server: 3.3.6, MIT, github.com/vuejs/language-tools
svelte-language-server: 0.18.3, MIT, github.com/sveltejs/language-tools
typescript-language-server: 5.3.0, Apache-2.0, github.com/typescript-language-server/typescript-language-server
```

## 上游资料核验摘要

- Vue Language Tools 提供 `@vue/language-server` 作为 editor integration 的 language server 本体，并以 Volar.js / TypeScript performance 为基础；Vue 官方 VS Code 扩展是其主要产品入口。资料：<https://github.com/vuejs/language-tools>、<https://www.npmjs.com/package/@vue/language-server>。
- Svelte Language Tools 包含实现 LSP 的库，并驱动官方 VS Code 扩展，也可供其它 IDE 插件使用。资料：<https://github.com/sveltejs/language-tools>、<https://www.npmjs.com/package/svelte-language-server>。
- `gopls` 是 Go team 维护的官方 Go language server，但运行时会调用 workspace 中的 `go` toolchain，并且只正式支持最近两个 Go major releases。资料：<https://go.dev/gopls/>。
- `rust-analyzer` 是 Rust 生态事实标准 language server，但属于 toolchain/binary 集成，不适合直接沿用 bundled npm exact-pin 策略。资料：<https://rust-analyzer.github.io/>。
- `clangd` 是 LLVM/Clang 项目的 C/C++ language server，依赖 compilation database / compiler toolchain 语义。资料：<https://clangd.llvm.org/>。
- Eclipse JDT LS 是 Java LSP 实现，依赖 Java 21+ runtime、Maven/Gradle 项目模型和独立 workspace data 目录。资料：<https://github.com/eclipse-jdtls/eclipse.jdt.ls>。

## 候选分组与推荐顺序

### 第一批：Framework provider（M12-B 推荐）

优先研究并实现 Vue / Svelte guarded proof，原因：

- 两者都是 npm/TypeScript 生态，与当前 Node-based external gateway 更接近。
- 都有明确上游 language-tools 仓库和 npm package。
- 不需要 Go/Rust/Java/C++ 那类系统 toolchain discovery。
- 能直接提升前端项目常见 `.vue` / `.svelte` 文件体验。

建议 M12-B 先做 Vue / Svelte provider implementation plan 或单 provider proof；如果一次做两个过大，优先 Vue，Svelte 紧随其后。

### 第二批：TypeScript language server 外部化（暂不推荐立即做）

当前 TS/JS in-process provider 已支持 diagnostics、hover、completion、definition、references、semanticTokens、workspaceSymbols、rename、formatting、codeAction。`typescript-language-server` 可作为未来 parity / long-lived server 研究对象，但现在直接替换会带来重复 provider、model lifecycle 和 WorkspaceEdit 行为差异风险。

结论：不作为 M12-B 首选；除非后续明确要从 in-process TypeScript service 迁移到 long-lived external tsserver。

### 第三批：Toolchain-backed provider（M12-C+，先做 policy）

Go / Rust / Java / C / C++ 不应直接按 M11 的 bundled npm exact-pin 模式接入：

- Go：`gopls` 运行期依赖 `go` command 与 workspace Go version。
- Rust：需要 rust-analyzer binary / rustup/toolchain 生态。
- Java：JDT LS 需要 Java 21+ runtime、平台 configuration 和 workspace data 目录。
- C/C++：clangd 需要 clang/LLVM binary、compile_commands.json 或 fallback compile command。

建议在任何实现前先做 **M12-C Toolchain Provider Policy Plan**：定义 system binary / bundled binary / user configured toolchain 的 trust model、status UI、degraded reason、workspace guard、resource budget 和 smoke 环境。

## 安全与架构边界

M12 后续 provider 仍必须遵守：

- 不新增第二套 LSP / Files / Search API。
- External provider 仍由 server-side allowlist profile 启动。
- 前端不能传 command / args / env / cwd / runtime / toolchain path。
- 默认不做 auto install、npx、system binary auto-discovery。
- 新 provider 必须有 exact pin 或 toolchain policy、license/audit/status metadata、provider-specific system test 和 IDE status smoke。
- Diagnostics-first 是第一验收切片；hover/completion/definition/formatting/codeAction 必须单独经过 capability safety gate。
- WorkspaceEdit 类能力必须继续走已有 preview/apply、root guard、dirty/conflict 保护。

## M12-B 推荐实现切片

M12-B 推荐目标：**Vue / Svelte Framework Provider Guarded Proof Plan**。

建议先做 docs/plan，然后选择一个最小 runtime proof：

```txt
1. 核验 @vue/language-server / svelte-language-server 启动命令、stdio 参数、license、版本、包大小、依赖风险。
2. 明确 Vue/Svelte 是否需要 project-local TypeScript SDK、compiler、framework package 或 tsconfig/svelte.config。 
3. 增加 provider metadata seed，但不允许 frontend command/env/cwd。 
4. 增加 diagnostics-first system test：临时 workspace + minimal .vue/.svelte 文件 + provider route + status。
5. 增加 IDE provider status smoke 对新增 provider 的只读 metadata 检查。
```

如果实现切片过大：先做 Vue guarded diagnostics proof，Svelte 后置到 M12-C；Toolchain provider policy 后置到 M12-D。

## M12-A 明确未做

本阶段不做：

- 安装 `@vue/language-server` / `svelte-language-server` / `typescript-language-server`。
- 启用 Vue/Svelte/Go/Rust/Java/C/C++ runtime provider。
- system binary discovery、auto install、npx、用户自定义 provider command/env/runtime/cwd/options。
- external hover/completion/definition/references/formatting/codeAction。
- 替换既有 TypeScript / JavaScript in-process provider。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

M12-A 是 docs-only research/plan 阶段，验证范围：

```bash
# touched docs relative-link check
git diff --check
```

外部资料核验使用官方/上游 docs 与 npm metadata；runtime provider 验证后置到 M12-B+。
