# M11-J External Provider Installer / Version / Security Policy Plan

## 阶段状态

已完成。M11-J 是 docs-only policy closeout：在 YAML 与 Bash 两个真实 external language server provider proof 之后，先固化 provider 安装、版本、可选启用、安全审计与后续扩展门槛，再继续接入 Pyright、TypeScript Language Server、Go、Rust、Vue/Svelte 等更重 provider。

## 已审计现状

- 当前 external provider runtime：`apps/api/modules/lsp/external/*`，通过 server-side allowlist profile 启动 stdio language server。
- 当前 external provider：
  - `yaml-language-server@^1.23.0`，profile id `yaml`，命令为 `process.execPath + require.resolve("yaml-language-server/bin/yaml-language-server")`。
  - `bash-language-server@5.6.0`，profile id `bash`，命令为 `process.execPath + require.resolve("bash-language-server/out/cli.js")`，并使用 scoped `PATH` 避免 initialize 阶段枚举完整开发环境 PATH 超时。
- 当前 in-process provider：`vscode-json-languageservice`、`vscode-html-languageservice`、`vscode-css-languageservice`、既有 TypeScript provider。
- `npm view` 当前候选信息（2026-07-08 本地查询）：
  - `yaml-language-server@1.23.0`，MIT，unpacked size 约 4.9 MB。
  - `bash-language-server@5.6.0`，MIT，unpacked size 约 2.1 MB。
  - `pyright@1.1.411`，MIT，unpacked size 约 19.3 MB。
  - `typescript-language-server@5.3.0`，Apache-2.0，unpacked size 约 2.3 MB。
  - `vscode-langservers-extracted@4.10.0`，MIT，unpacked size 约 0.85 MB。
- `npm audit --json` 当前完整依赖树显示 13 项漏洞：1 low、3 moderate、9 high；`npm audit --omit=dev --json` 生产视角显示 10 项漏洞：1 low、2 moderate、7 high。
- Bash provider 相关 audit 风险来自 `bash-language-server -> editorconfig -> minimatch`，npm 给出的 fixAvailable 指向 `bash-language-server@5.4.3` 且标记 semver major，不应自动降级或强制修复。

## M11-J 策略决议

### 1. Provider 安装策略

- **默认仓库内只允许随应用一起 pin 的 provider**：生产 runtime 不能在请求时动态执行 `npm install`、`npx`、curl installer 或用户传入命令。
- **Provider command/args 必须 server-side allowlist**：继续由 `externalProviderProfiles.ts` 通过 `require.resolve` 和 `process.execPath` 固定入口，前端只读 status，不能传入 command、args、cwd、env。
- **Heavy provider 采用 optional plan，不一次性加入 dependencies**：Pyright、typescript-language-server、gopls、rust-analyzer、Vue/Svelte 等必须先有单独阶段评估 size、license、audit、spawn cost、workspace budget 与 smoke，再决定是否加入 root dependencies、optionalDependencies 或系统外部二进制 allowlist。
- **系统外部二进制后置**：gopls / rust-analyzer 一类非 npm provider 必须先设计 binary discovery、version check、hash/path trust 与用户提示，不在当前 npm provider proof 中混入。

### 2. 版本策略

- **External provider 版本应优先 exact pin**：例如 Bash 已使用 `5.6.0`；YAML 当前 `^1.23.0` 后续应在 M11-K 或下一个 dependency hygiene 阶段改为 exact pin，并记录升级流程。
- **升级必须有 provider-specific smoke**：升级任一 external provider 后至少运行对应 system test、`/api/lsp/status` smoke 和 `git diff --check`；涉及前端状态展示时追加 `smoke:ide:lsp-provider-status`。
- **版本状态要可见**：后续 M11-K 应把 provider package version / resolved command / enabled / optional missing / audit policy note 通过只读 status 暴露给 IDE 状态对话框或 API metadata。
- **不以“最新”作为自动升级理由**：每次升级都要记录 license、size、audit、启动耗时、初始化预算与回归结果。

### 3. 安全与资源边界

- **Root/cwd guard 不放松**：external provider cwd 必须 stay inside workspace root；profile env 只允许 allowlisted scoped env。
- **不保存完整源码或完整 provider 输出**：继续使用 stderr tail、diagnostics/status summary；不把完整 stdout/stderr 或文件内容持久化。
- **Timeout/resource budgets 是 provider 入场条件**：每个 provider 需要 initialize/request/shutdown budget，且失败要 degraded/unavailable，不阻塞 IDE。
- **Audit 处理必须显式**：不得对 LSP provider 运行 `npm audit fix --force`；涉及 semver major、降级或替换的修复必须单独阶段评估。
- **Supply-chain gate**：新增 provider 前必须记录 license、repository、package size、transitive risk、维护状态与替代方案；不满足条件时保持 unsupported 或 optional missing。

### 4. Provider 分层路线

```txt
Tier 1：in-process lightweight provider
- 已有 JSON / HTML / CSS / SCSS / LESS / TS / JS。
- 继续优先复用官方 language service 包，不启动进程。

Tier 2：npm-bundled external provider
- 已有 YAML / Bash proof。
- 下一步 M11-K 先做 optional installer/status metadata，而不是直接加入 Pyright。
- Pyright / TypeScript Language Server 只有在 version/audit/status policy 落地后再进入 guarded implementation。

Tier 3：system binary external provider
- gopls / rust-analyzer / Java / C/C++ 等必须后置。
- 需要 binary discovery、version command、workspace trust、resource budget 与清晰 install guidance。
```

## M11-K 推荐切片

M11-K 建议命名为 **External provider optional installer/status implementation**，只做元数据与状态，不新增 heavy runtime provider：

1. 新增 provider manifest / metadata 类型，记录：provider id、package/binary source、pinned version、install mode、optional/required、license、size note、audit note、status reason。
2. `/api/lsp/status` 扩展只读 metadata：installed / missing / disabled / degraded / version / command source。
3. IDE provider status dialog 展示版本与安装状态，但不提供任意安装按钮。
4. 将 YAML `^1.23.0` 改为 exact pin 的可行性纳入依赖 hygiene；如改动 dependencies，必须跑 YAML/Bash provider system tests 与 status smoke。
5. 不接 Pyright runtime，不做 auto install，不做用户自定义 command，不做 system binary discovery。

## 明确未做

- 未新增 provider runtime。
- 未新增 auto install / npx / dynamic package install。
- 未接 Pyright、TypeScript Language Server、gopls、rust-analyzer、Vue、Svelte、Java、C/C++。
- 未修改 external language server gateway 行为。
- 未修改前端 provider status UI。
- 未执行 `npm audit fix` 或 dependency replacement。
- 未新增第二套 LSP/Files/Search API。

## 验证

- 本阶段为 docs-only。
- 验证命令：
  - 临时 Markdown 相对链接检查（覆盖本次 touched docs）。
  - `git diff --check`。
- 参考审计命令：
  - `npm view yaml-language-server version license dist.unpackedSize repository.url --json`
  - `npm view bash-language-server version license dist.unpackedSize repository.url --json`
  - `npm view pyright version license dist.unpackedSize repository.url --json`
  - `npm view typescript-language-server version license dist.unpackedSize repository.url --json`
  - `npm view vscode-langservers-extracted version license dist.unpackedSize repository.url --json`
  - `npm audit --json`
  - `npm audit --omit=dev --json`
