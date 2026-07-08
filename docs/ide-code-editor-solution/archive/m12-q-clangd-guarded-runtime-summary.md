# M12-Q C/C++ / clangd Guarded Diagnostics Proof Summary

## 状态

M12-Q 已完成：C/C++ / clangd guarded diagnostics proof。

本阶段把 M12-P 的 clangd runtime proof plan 落地为受控 diagnostics proof：`clangd` provider 已加入 provider registry，`/api/lsp/diagnostics` 仅在 trusted OpenClaw config + allowlisted workspace profile + root-guarded C/C++ marker + bounded `clangd --version` probe 通过后，才通过 existing external stdio gateway 等待 diagnostics。

## 完成内容

- 新增 `clangd` LSP provider descriptor，语言范围限定为 `c` / `cpp`，能力仅声明 diagnostics。
- 新增 clangd workspace marker detection：
  - 优先 nearest `compile_commands.json`。
  - 其次 nearest `compile_flags.txt`。
  - 最后 fallback nearest `.clangd`。
  - root escape 和 `.git` / `node_modules` / `dist` / `build` / `coverage` / `.tracevane-trash` 等忽略目录直接拒绝。
- 新增 `diagnoseWithClangd`：
  - 复用 `toolchainProviderStatusSnapshot` 的 trusted config / allowlisted profile gate。
  - 复用 Files root/path guard 后的 resolved path。
  - marker 缺失、配置缺失、未 trusted、profile rejected、binary 缺失、version probe 失败、gateway error 都 degraded empty diagnostics。
  - 只在 marker directory 内启动 existing external language server gateway。
- 新增 bounded `clangd --version` probe：
  - server-side allowlisted profile command。
  - 2s timeout / 8KB maxBuffer / 500 字符 version summary。
  - 输出必须包含 `clangd`。
- `/api/lsp/diagnostics` 对 `c` / `cpp` 走 clangd guarded diagnostics route。
- `runtimeProofProviderIds` 扩展为 `["go", "rust", "clangd"]`，status surface 仍不做 PATH 探测。
- 新增系统测试覆盖 marker priority、root guard、degraded route、version probe failure、mock stdio diagnostics proof。

## 明确未做

M12-Q 不做：

- 安装、下载或自动发现 `clangd`。
- PATH discovery、auto install、CMake/Bear/Bazel/Meson/Ninja/Make invocation。
- `--query-driver` 自动推断。
- 用户 command/args/env/cwd override。
- C/C++ hover/completion/definition/references/rename/formatting/code action。
- Java/JDT LS runtime。
- Go/Rust rich interactions。
- 第二套 LSP/Files/Search API。
- Git/Debug/Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验收证据

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-toolchain-provider-status`
- `npm run test:system:lsp-clangd-provider`
- `git diff --check`

## 下一步建议

M12-R Toolchain Provider Acceptance / Java JDT LS Decision：验收 Go/Rust/clangd 三个 toolchain-backed diagnostics proof，冻结当前 heavy provider gate，并决定是否进入 Java / Eclipse JDT LS runtime proof plan。Java 应单独处理 Java runtime、server distribution、workspace data dir、Maven/Gradle import 和更强 trust boundary，不应混入 clangd proof。
