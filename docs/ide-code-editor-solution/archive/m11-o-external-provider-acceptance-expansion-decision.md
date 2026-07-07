# M11-O External Provider Acceptance / Heavy Provider Expansion Decision

## 状态

M11-O 已完成。本阶段是 docs-only acceptance / decision closeout：不新增 provider runtime、不安装新依赖、不修改 LSP API，只在 YAML / Bash / Pyright 三个真实 external provider proof 后，固化验收矩阵、扩展 gate 和下一阶段 provider 选择。

## 当前 provider 验收基线

| Provider | Package / pin | License | 入口 | 当前能力 | 验收状态 |
| --- | --- | --- | --- | --- | --- |
| YAML | `yaml-language-server@1.23.0` | MIT | `process.execPath + require.resolve("yaml-language-server/bin/yaml-language-server") + --stdio` | diagnostics proof | 已接入；latest `1.24.0` 只记录，不在本阶段升级 |
| Bash | `bash-language-server@5.6.0` | MIT | `process.execPath + require.resolve("bash-language-server/out/cli.js") + start` | diagnostics proof / capability-limited proof | 已接入；保留 PATH/env guard 与 audit note |
| Pyright | `pyright@1.1.411` | MIT | `process.execPath + require.resolve("pyright/langserver.index.js") + --stdio` | Python diagnostics/status proof | 已接入；Python advanced features 后置 |

共同验收 gate：

- dependency 必须 exact pin，且 package-lock / metadata / status UI 一致。
- provider command / args / env 必须来自 server-side allowlist；前端只能读状态。
- provider metadata 必须包含 package/source/install status/resolved version/pinned version/license/audit/policy。
- 每个 provider 至少有 provider-specific system proof；状态 UI 改动必须有 `smoke:ide:lsp-provider-status` 覆盖。
- gateway 必须继续复用 root/cwd guard、timeout/degraded/crashed/stopped 状态和 stderr tail，不新增第二套 LSP API。
- provider 输出不能长期持久完整 stderr/stdout，只展示 bounded status/tail。

## 候选 provider 当前元数据核验

通过 `npm view <package> version license repository.url bin dist.unpackedSize --json` 于 2026-07-08 核验：

| 候选 | 当前版本 | License | unpacked size | 判断 |
| --- | ---: | --- | ---: | --- |
| `dockerfile-language-server-nodejs` | `0.15.0` | MIT | 约 0.11 MB | 推荐 M11-P；体量小，不与现有 in-process provider 重叠，适合作为下一 real provider proof |
| `typescript-language-server` | `5.3.0` | Apache-2.0 | 约 2.34 MB | 暂缓；当前 TS/JS 已有 in-process diagnostics/hover/definition/completion/references/rename/format/code action，迁移会改变语义边界 |
| `vscode-langservers-extracted` | `4.10.0` | MIT | 约 0.85 MB | 暂缓；HTML/CSS/JSON/Markdown/ESLint 多入口与现有 in-process JSON/HTML/CSS 重叠，需迁移计划而非直接接入 |
| `@vue/language-server` | `3.3.6` | MIT | 约 0.01 MB 包本体 | 暂缓；需要 Vue project/tooling boundary、TS peer 语义与 workspace settings |
| `svelte-language-server` | `0.18.3` | MIT | 约 1.76 MB | 暂缓；需要 Svelte 项目识别与 framework settings |
| `pyright` | `1.1.411` | MIT | 约 19.28 MB | 已接入 diagnostics/status；advanced Python features 后置 |
| `yaml-language-server` | latest `1.24.0` | MIT | 约 5.30 MB | 已 pinned `1.23.0`；升级需单独 M11.x provider upgrade proof |
| `bash-language-server` | `5.6.0` | MIT | 约 2.08 MB | 已接入 |

非 npm-first provider：`gopls`、`rust-analyzer`、Java JDT LS、C/C++ clangd 仍需要 toolchain / binary / installer / workspace trust 计划，不进入 M11-P。

## 扩展决策

### 下一步选择：M11-P Dockerfile external provider guarded proof

理由：

- `dockerfile-language-server-nodejs` 是 npm package，MIT，体量小，bin 入口明确：`docker-langserver: bin/docker-langserver`。
- Dockerfile 语言覆盖常见工程文件，且当前 Tracevane 没有已有 Dockerfile in-process provider，避免 provider overlap。
- 可沿用 YAML/Bash/Pyright 的 exact-pin、metadata、server allowlist、system test、status smoke 流程。
- 不要求系统 Docker daemon 或容器运行时；只做 language server diagnostics/status proof。

M11-P 最小实现建议：

1. `package.json` exact pin `dockerfile-language-server-nodejs@0.15.0`。
2. external provider metadata 增加 `dockerfile`，记录 MIT/license/source/audit/policy。
3. server-side profile 使用 `process.execPath + require.resolve("dockerfile-language-server-nodejs/bin/docker-langserver") + --stdio`（实际入口需在实现时通过 package 文件确认）。
4. provider registry 增加 `dockerfile`，语言范围限制为 `dockerfile` / `docker`。
5. diagnostics routing 只覆盖 Dockerfile，不做 completion/hover/format。
6. 新增 provider-specific system test 与扩展 status smoke。

### 暂缓项

- **TypeScript Language Server migration**：后置到单独迁移计划，必须先比较现有 in-process TS/JS provider 与外部 tsserver 语义差异、latency、workspace memory、project config 行为。
- **Pyright advanced features**：后置到 Python intelligence plan，必须先设计 interpreter/venv/workspace settings 和 large repo budget。
- **vscode-langservers-extracted**：后置到 JSON/HTML/CSS/Markdown provider migration plan，避免替换现有官方 in-process lightweight services 时引入行为漂移。
- **Vue/Svelte framework providers**：后置到 framework provider plan，需要项目类型识别、settings、peer dependency 与 TS integration 边界。
- **Go/Rust/Java/C/C++**：后置到 toolchain/binary installer plan，不走 npm-first provider gate。

## M11-O 明确不做

- 不新增 Dockerfile 或任何其它 provider runtime。
- 不安装新依赖。
- 不升级 YAML latest。
- 不迁移 TS/JS 到 external language server。
- 不启用 Python hover/completion/definition/rename/format/code action。
- 不做 auto install、system binary discovery、用户自定义 command/env。
- 不新增第二套 LSP/Files/Search API。
- 不做 Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

- temporary markdown relative link check for touched docs。
- `git diff --check`。

## 下一步

M11-P：Dockerfile external provider guarded proof。
