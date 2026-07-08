# M12-P C/C++ / clangd Runtime Proof Plan

## 目标

M12-P 是 C/C++ / clangd runtime proof 前的 docs-only 研究与实现计划。它承接 M12-O 的 toolchain provider acceptance：Go/gopls 与 Rust/rust-analyzer 已证明同一套 trusted config、workspace marker、bounded version probe、external stdio gateway 与 degraded empty diagnostics gate 可复用；现在为 clangd 定义第三个 toolchain-backed diagnostics proof 的最小、安全、可验证切片。

本阶段不新增 runtime 代码、不启动 `clangd`、不修改 `/api/lsp/diagnostics` 路由、不改变 Provider Status UI。

## 官方契约核验

官方 clangd 文档给出的关键事实：

- clangd 通过 Language Server Protocol 提供 C/C++ IDE 能力；generic LSP client 可以运行 `clangd` 并通过 standard input/output 通信。
- clangd 理解 C/C++ 代码强依赖 build flags。默认会假设 `clang some_file.cc`，真实项目通常需要 compilation database 或 compile flags，否则可能出现 include / macro / language-standard 相关误诊断。
- `compile_commands.json` 是主要 compilation database；clangd 会在源文件父目录中查找它。
- 简单项目可用 `compile_flags.txt`，一行一个 flag；如果存在 `compile_commands.json`，`compile_flags.txt` 会被忽略。
- `.clangd` 是 source tree 中的项目配置文件；clangd 会在 active file 的父目录中查找。`.clangd` 可调整 compile flags、compilation database 搜索策略和 diagnostics / clang-tidy 行为。
- `--query-driver` 可让 clangd 调用匹配的 compiler driver 提取 include paths；这会执行外部 compiler driver，因此 Tracevane 初始 proof 必须默认禁止用户自定义 query-driver / arbitrary args，后续如需要需单独安全设计。
- Background index 会在发现 compilation database 后排队索引项目文件，并把缓存写入 `.cache/clangd/index/` 或用户 cache 目录；这意味着真实运行存在 CPU/IO 成本。
- clangd troubleshooting 文档明确：大量误诊断通常意味着缺少或错误的 compile command；日志可显示是否找到 `compile_commands.json` 与最终 compile command。

资料来源：

- clangd Getting started / installation: <https://clangd.llvm.org/installation.html>
- clangd Compile commands design: <https://clangd.llvm.org/design/compile-commands>
- clangd Configuration: <https://clangd.llvm.org/config>
- clangd Indexing design: <https://clangd.llvm.org/design/indexing.html>
- clangd Troubleshooting: <https://clangd.llvm.org/troubleshooting>

## 与现有 Tracevane toolchain gate 的关系

M12-G 到 M12-O 已建立以下不变量：

- `/api/lsp/status` 可显示 Go / Rust / Java / clangd toolchain candidates 与 config/trust 状态。
- Status surface 不做 PATH / binary 自动探测。
- OpenClaw config 只接受 allowlisted `profileId=workspace`，拒绝 `command` / `args` / `env` / `cwd` runtime override。
- runtime proof 当前只允许：

```txt
runtimeProofProviderIds = ["go", "rust"]
```

- Go 与 Rust runtime proof 均在 trusted config + allowlisted profile + root-guarded marker + bounded version probe 之后，才启动 existing external stdio gateway。
- 缺配置、未 trusted、profile rejected、缺 marker、缺 binary、probe failure 或 gateway error 都返回 degraded empty diagnostics，不破坏普通 LSP route。

clangd 应复用同一条链路，但它的项目正确性更依赖 compilation database，因此 M12-Q 必须先把 marker/trust 策略定义清楚，不能把 “单个 .c/.cpp 文件可被 clangd 默认解析” 误当作项目级 proof。

## M12-Q 推荐实现切片

### 1. Provider registry 与状态策略

M12-Q 可以新增或激活 `clangd` provider descriptor，但能力只声明 diagnostics：

```txt
id: clangd
source: clangd
mode: toolchain-external
languages: [c, cpp, objective-c, objective-cpp, cuda? later]
capabilities: diagnostics only
```

`runtimeProofProviderIds` 只有在 clangd diagnostics route、marker guard、probe、mock stdio proof 都完成后，才能从 `["go", "rust"]` 扩展为：

```txt
["go", "rust", "clangd"]
```

语言范围建议先限制：

- `.c`
- `.cc`
- `.cpp`
- `.cxx`
- `.h`
- `.hpp`
- `.hh`
- `.hxx`

Objective-C / CUDA / embedded cross compile 先保持 candidate 后置，不在 M12-Q 进入 runtime proof。

### 2. Workspace marker 策略

新增建议文件：

```txt
apps/api/modules/lsp/toolchain/clangdWorkspace.ts
```

只做同步、只读、root-guarded marker 查找，不执行 build system，不生成 compilation database。

推荐优先级：

1. 从目标文件目录向上查找 nearest `compile_commands.json`。
2. 若无 `compile_commands.json`，查找 nearest `compile_flags.txt`。
3. 若无前两者，查找 nearest `.clangd`。
4. 如果以上均不存在，M12-Q 默认 `missingWorkspaceConfig`，不启动 clangd runtime。

理由：clangd 虽然可 fallback 到 `clang $FILENAME`，但 Tracevane 的 M12-Q 目标是可信项目 diagnostics proof，不是“尽量启动然后接受大量误诊断”。无 marker 时 degraded skip 更符合当前 Go/Rust gate。

返回结构建议：

```ts
type ClangdWorkspaceMarkerKind = "compile_commands.json" | "compile_flags.txt" | ".clangd";
interface ClangdWorkspaceMarker {
  kind: ClangdWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}
```

约束：

- marker 查找只从当前文件目录向上到 workspace root。
- 忽略 `.git`、`node_modules`、`dist`、`build`、`coverage`、`.tracevane-trash` 等目录。
- `cwd` 使用 marker directory，不接受前端传入 cwd。
- 不运行 CMake、Bear、Bazel、Meson、Ninja、Make、compiler driver 或任何 build command。
- 不解析/信任 `compile_commands.json` 中的 command 作为 Tracevane 自己执行的命令；它只是 clangd 的项目输入。

### 3. Version / binary probe 策略

新增 server-side allowlisted probe：

```txt
clangd --version
```

约束：

- 只在 trusted OpenClaw config + allowlisted workspace profile + marker 已通过后运行。
- `cwd` 使用 marker directory。
- timeout 建议 2s。
- stdout/stderr bounded，例如 500 bytes。
- output 必须能识别 `clangd`，否则 `unsupportedVersion`。
- `ENOENT` -> `missingBinary`。
- 其它错误 -> `unavailable`。

不做：PATH 自动发现、LLVM/clangd 下载、Homebrew/apt/pacman 安装、VS Code extension 安装、用户 binary picker、frontend command override。

### 4. clangd 初始化策略

M12-Q 只做 diagnostics proof，推荐初始化保持保守：

- 通过 existing external stdio gateway 启动 allowlisted `clangd` profile。
- `rootUri` / workspace folder 指向 marker directory。
- `didOpen` 当前 C/C++ 文件后等待 `textDocument/publishDiagnostics`。
- 初始 args 可保持最小：`clangd` 本体，不默认加 `--background-index`、`--clang-tidy`、`--query-driver`、`--compile-commands-dir` 或 `--log=verbose`。
- 若需要禁用或限制 background index，必须先核验 clangd 当前支持参数并在 M12-Q 实现中记录；M12-P 不承诺该参数。
- 不暴露 custom command/env/cwd/args。
- 不读取或持久保存完整 clangd logs；只保留 bounded status summary。

clangd 特有风险处理：

- `.clangd` 与 compilation database 会影响 parser 和 diagnostics；仅在 trusted workspace 下启动。
- `--query-driver` 会执行 compiler driver 提取 include paths，M12-Q 默认不启用，也不允许用户配置。
- 大型项目 background index 可能产生 CPU/IO 压力；M12-Q system proof 使用小 fixture，真实项目体验后置。
- 头文件 diagnostics 可能依赖 includer/source file 的 compile command；M12-Q 对 header 文件只要求 degraded-safe，不承诺准确 header-only diagnostics。

### 5. Diagnostics route 策略

新增建议模块：

```txt
apps/api/modules/lsp/toolchain/clangdProvider.ts
```

形状与 Go/Rust proof 对齐：

```txt
input: config, rootRealPath, absolutePath, content, version, profile?, probe?
output: diagnostics, skipped, status, marker, versionSummary, reason
```

route 行为：

- `language` 属于 C/C++ 且 provider configured 时才尝试 clangd runtime。
- 缺配置、未 trusted、profile rejected、缺 marker、缺 binary、probe failure、timeout/error 都返回 `[]` diagnostics + `skipped=true`。
- 不改变 JSON/HTML/CSS/TS/JS/YAML/Bash/Pyright/Dockerfile/Markdown/ESLint/Vue/Svelte/Go/Rust route。
- LSP diagnostic 转换沿用现有 severity/range/source 映射，source 默认 `clangd`。

### 6. Provider status / UI 策略

M12-Q 最小 UI/状态只需复用现有 Provider Status surface：

- candidate `clangd` 从 configured/trusted/status-only 进入 runtime proof capable。
- 显示 marker kind + marker directory。
- 显示 bounded `clangd --version` summary。
- 显示 degraded reason：missingConfig / disabledByTrust / profileRejected / missingWorkspaceConfig / missingBinary / unsupportedVersion / unavailable。
- 不新增 clangd-specific 设置面板。
- 不提供前端 command picker、args editor、query-driver editor、compile database generator。

### 7. 测试策略

M12-Q 最小验证应覆盖：

- `findClangdWorkspaceMarker`：nearest `compile_commands.json`、`compile_flags.txt`、`.clangd`、priority、root escape、ignored directory。
- status policy：实现前 clangd 仍 status-only；实现后 `runtimeProofProviderIds` 包含 `clangd`。
- config gate：missing config / untrusted / forbidden runtime override / unknown profile 均 skip。
- probe：missing binary、unsupported output、unavailable、success。
- mock stdio diagnostics proof：不依赖本机 `clangd`，fake LSP server 证明 didOpen -> publishDiagnostics -> Tracevane diagnostics shape。
- optional real toolchain proof：如果本机存在 configured/trusted clangd 与小型 C/C++ fixture，可运行；否则 skip/degraded，不阻塞 CI。
- provider status smoke：clangd configured/degraded reason 可见。

建议命令：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-toolchain-provider-status
npm run test:system:lsp-clangd-provider
npm run smoke:ide:lsp-provider-status
git diff --check
```

如果 M12-Q 只实现后端 proof 且 UI 不变，可以把 smoke 限定为 provider status；不能要求 CI 机器必须安装真实 clangd。

## 明确不做

M12-P / M12-Q 都不做：

- 安装、下载或自动发现 `clangd` / LLVM / compiler toolchain。
- PATH discovery、auto install、Homebrew/apt/pacman integration、VS Code extension reuse。
- 用户自定义 `command` / `args` / `env` / `cwd`。
- `--query-driver`、compiler driver execution、build system generation、CMake/Bear/Bazel/Meson/Ninja/Make invocation。
- 修改或生成 `compile_commands.json` / `compile_flags.txt` / `.clangd`。
- C/C++ hover / completion / definition / references / rename / formatting / code action / semantic tokens。
- Java / Eclipse JDT LS runtime plan 或 implementation。
- Go / Rust rich interactions。
- 第二套 LSP / Files / Search API。
- Git / Debug / Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 风险

| 风险 | 影响 | M12-Q 缓解 |
| --- | --- | --- |
| 缺少或错误的 compilation database | 误诊断、缺 include、宏/标准不正确 | 缺 marker 默认 skip；有 marker 才 proof；degraded reason 可见 |
| `.clangd` / compile database 影响 diagnostics | 运行结果依赖项目配置 | 只在 trusted workspace 启动；不让前端覆盖 command/args/env/cwd |
| `--query-driver` 会执行 compiler driver | 可能触发外部命令和路径扩展风险 | M12-Q 默认不启用、不暴露；后续单独安全计划 |
| background index CPU/IO 成本 | 大项目性能波动 | M12-Q 只做小 fixture diagnostics proof；不承诺大型项目 indexing 体验 |
| 头文件无独立 compile command | header diagnostics 不稳定 | M12-Q 仅要求 degraded-safe；header rich accuracy 后置 |
| 本机缺 clangd | CI 不稳定 | mock stdio proof 必须覆盖；real clangd proof optional/skip |

## 下一步

进入 **M12-Q C/C++ / clangd guarded diagnostics proof**：按本计划实现 `clangdWorkspace`、`clangdProvider`、provider descriptor / runtimeProofProviderIds 更新、bounded `clangd --version` probe、mock stdio system test 与 provider status smoke。

M12-Q 的第一条实现规则是：只有 trusted config + allowlisted profile + marker + bounded probe 全通过，才允许启动 clangd；否则 degraded empty diagnostics，不破坏其它语言 provider。

## 验证

M12-P 是 docs-only 阶段，验证范围：

- touched-doc markdown relative link check。
- `git diff --check`。
