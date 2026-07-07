# M11-G External Provider Expansion and IDE Status UI Plan

## 状态

已完成计划。M11-G 不接入第二个真实 external language server，而是在 M11-F-B/C/D 的 gateway、YAML proof 与 lifecycle/status 基础上，确定后续 provider 扩展顺序、IDE status UI 暴露方式、安装/版本边界和 smoke matrix。

## 当前证据核验

通过 `npm view <package> version license repository.url bin dist.unpackedSize --json` 核验当前候选包元数据：

| Provider 候选 | 当前版本 | License | Bin / 入口 | unpacked size | 判断 |
| --- | ---: | --- | --- | ---: | --- |
| `bash-language-server` | 5.6.0 | MIT | `bash-language-server: out/cli.js` | 约 2.1 MB | 推荐作为第二个 real provider proof，体量小、安装边界清楚、脚本类语言验证成本低 |
| `pyright` | 1.1.411 | MIT | `pyright-langserver: langserver.index.js` | 约 19.3 MB | 推荐作为后续 heavy provider，需单独处理 Python workspace、venv、settings 和性能预算 |
| `vscode-langservers-extracted` | 4.10.0 | MIT | HTML/CSS/JSON/Markdown/ESLint bins | 约 0.85 MB | 可用于后续替换/增强 HTML/CSS/JSON/Markdown，但会与现有 in-process provider 重叠，不能直接替换 |
| `typescript-language-server` | 5.3.0 | Apache-2.0 | `typescript-language-server: lib/cli.mjs` | 约 2.3 MB | TS/JS 当前已有 in-process provider；如迁移到外部 tsserver，需要独立迁移计划 |
| `yaml-language-server` | 1.23.0 | MIT | `yaml-language-server: bin/yaml-language-server` | 约 4.9 MB | 已在 M11-F-C 接入 diagnostics proof |
| `@vue/language-server` | 3.3.6 | MIT | `vue-language-server: bin/vue-language-server.js` | 包本身很小 | 后续 framework provider，需要 peer/tooling 边界，不能作为下一个基础 proof |
| `svelte-language-server` | 0.18.3 | MIT | `svelteserver: bin/server.js` | 约 1.8 MB | 后续 framework provider，需要项目类型识别与配置边界 |

Go `gopls`、Rust `rust-analyzer`、Java JDT LS 不适合作为 npm-first 阶段：它们更依赖系统 toolchain 或大体量二进制安装策略，应进入后续 toolchain/provider installer 计划，而不是直接塞入 npm dependency。

## 扩展顺序建议

1. **M11-H：IDE external provider status UI foundation**
   - 先把 M11-F-D 的 `/api/lsp/status.externalProviders` 暴露到 IDE：StatusBar / Command Palette / Problems or Output detail。
   - 显示 provider id、label、languages、status、reason、lastError、stderr tail 摘要和 lastTransitionAt。
   - 不新增 provider，不新增 API，不做 provider install。

2. **M11-I：Bash external provider proof**
   - 以 `bash-language-server` 作为第二个真实 provider。
   - 复用 `ExternalLanguageServerGateway`、server-side allowlisted profile、root/cwd guard、status snapshot、diagnostics timeout。
   - 最小能力先做 diagnostics/parse feedback（若 server 行为有限，则记录 capability limitation），不承诺完整 shellcheck parity。

3. **M11-J：External provider installer/version policy plan**
   - 处理 dependency vs user-installed binary、版本 pin、license、size、security audit、offline fallback、workspace trust。
   - 决定 heavy provider 是否进入项目依赖、可选依赖或用户本地 profile。

4. **M11-K：Python/Pyright heavy provider foundation**
   - 仅在 status UI 与 Bash proof 稳定后推进。
   - 重点处理 venv/interpreter、workspace settings、large repo timeout、diagnostics volume 和 restart/backoff。

5. **M11-L+：framework/system provider expansion**
   - Vue/Svelte/Go/Rust/Java 按项目类型和 toolchain readiness 独立推进。

## IDE status UI 方案

- **数据来源**：复用现有 `/api/lsp/status` 返回的 `externalProviders`，不新增第二套 external LSP API。
- **首屏位置**：IDE StatusBar 增加轻量入口，例如 `LSP: available / degraded`。
- **详情入口**：Command Palette 命令 `LSP: Show External Provider Status`，必要时打开 Output channel / popover。
- **信息边界**：
  - 展示 status、reason、languages、lastTransitionAt、lastError。
  - stderr 只展示 tail 摘要，不展示完整输出，不持久化。
  - 不允许用户在 UI 输入 command/args。
- **交互边界**：M11-H 只读；start/stop/restart/install/provider settings 后置。

## Smoke / 验收矩阵

M11-H 应新增或扩展 smoke：

- `/ide` 可见 LSP provider status 入口。
- `/api/lsp/status` 包含 `externalProviders.profiles/statuses`。
- YAML provider 初始 stopped/not_started 可显示。
- 模拟 degraded/crashed 状态至少在 system test 覆盖，UI 只做只读渲染。
- Command Palette 可打开 provider status 详情。
- 不影响现有 diagnostics、Problems、Output、editor reveal。

M11-I Bash provider proof 应覆盖：

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-external-gateway`
- 新增 `npm run test:system:lsp-bash-provider`
- 如前端 status UI 受影响，增加对应 IDE smoke。

## 明确不做

- 不在 M11-G 接入第二个 provider。
- 不安装 pyright/gopls/rust-analyzer/JDT LS。
- 不实现 provider pool、restart/backoff、provider installer、settings UI 或用户自定义 command。
- 不新增 `/api/lsp/external-*` 第二套 API。
- 不承诺一次性“全语言支持”。
- 不改 Git force/merge/rebase、Debug parity、Terminal 或 File Manager Online Editor 产品壳。

## 下一步

M11-H：IDE external provider status UI foundation。先把 M11-F-D 已有 status snapshot 以只读方式展示到 IDE，再进入 Bash provider proof。
