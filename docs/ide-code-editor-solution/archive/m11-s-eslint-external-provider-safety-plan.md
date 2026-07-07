# M11-S ESLint External Provider Project-Config / Runtime Safety Plan

日期：2026-07-08

## 结论

M11-S 已完成 ESLint external provider 的研究与最小实现计划。本阶段只做安全边界、项目配置策略和验收切片，不启用 `vscode-eslint-language-server` runtime provider。

下一步进入 M11-T：ESLint external provider guarded diagnostics implementation。

## 当前仓库事实

- Tracevane 已安装 `vscode-langservers-extracted@4.10.0`，该包提供 `vscode-eslint-language-server`、`vscode-markdown-language-server`、`vscode-json-language-server`、`vscode-html-language-server` 与 `vscode-css-language-server` 等 bin。
- M11-R 只启用了 Markdown bin；JSON/HTML/CSS/ESLint bins 仍被 Tracevane policy 禁用。
- 当前 external LSP gateway 已具备 server-side allowlist、cwd root guard、startup/request/shutdown budgets、stderr tail、lifecycle status、provider metadata/status UI 与 provider-specific system/smoke gate。
- 当前 root package 没有直接安装 `eslint` 或 `vscode-eslint-language-server` 独立包；ESLint server 来自 `vscode-langservers-extracted` 的 bundled bin。

## 外部依据

- Microsoft `vscode-eslint` 文档说明 ESLint validation 受 `eslint.validate` / `eslint.probe` 控制，并且 working directory 会影响 ESLint 配置解析。
- Microsoft `vscode-eslint` 文档列出 `eslint.workingDirectories` 的 `location`、`auto`、显式目录和 glob pattern 等模式，并说明 monorepo 需要显式 working directory 配置。
- ESLint 官方 CLI 文档说明 ESLint 会加载项目配置、支持 `--print-config`、`--fix`、`--fix-dry-run`、`--debug` 等模式；其中 `--fix` 会修改真实文件，而 editor integration 必须避免未经确认的写入。

这些事实决定：ESLint provider 不能像 Markdown/Dockerfile 一样仅凭 language id 启动。它必须先有项目配置、workspace trust、cwd/root guard、plugin/config resolution 和超时降级策略。

参考：

- https://github.com/microsoft/vscode-eslint
- https://eslint.org/docs/latest/use/command-line-interface
- https://www.npmjs.com/package/vscode-langservers-extracted/v/4.10.0

## M11-T 最小实现切片

M11-T 只允许实现 diagnostics/status proof：

1. Provider profile
   - provider id: `eslint`
   - command: `process.execPath`
   - args: `require.resolve("vscode-langservers-extracted/bin/vscode-eslint-language-server")`, `--stdio`
   - source/package: `vscode-langservers-extracted@4.10.0`
   - install mode: bundled npm
   - capabilities: diagnostics only
   - initial language allowlist: `javascript`, `javascriptreact`, `typescript`, `typescriptreact`

2. Activation gate
   - 默认不对所有 JS/TS 文件无条件运行 ESLint。
   - 只有满足至少一个配置发现条件才激活：`eslint.config.js/mjs/cjs/ts`、`.eslintrc*`、`package.json` 包含 `eslintConfig` 或相关 lint script/依赖。
   - 配置发现必须在 workspace root 内；禁止向 root 外查找。
   - 对 monorepo，M11-T 先只支持 root-level config；多 workingDirectories 后置到 M11-U。

3. Runtime guard
   - cwd 必须通过现有 `resolveExternalLanguageServerCwd` / `isWithinRoot`。
   - 不允许前端传 command/args/env/cwd。
   - env 只允许最小安全集合，例如 `NODE_ENV=production` 与必要 PATH；不透传用户 shell env。
   - request budget 需要短且可降级；config/plugin resolution 卡住时返回 degraded status，不阻塞 IDE。
   - 不持久化完整 lint output；只保留 bounded stderr tail/status。

4. LSP initialization/settings
   - client capabilities 必须支持 `workspace/configuration`，否则 ESLint server 可能无法获得 settings。
   - Tracevane server 需要提供受控 settings：`eslint.enable=true`、`eslint.validate` 为语言 allowlist、`eslint.run=onType` 或 `onSave` 的明确选择、`eslint.workingDirectories=[{ mode: "location" }]` 或 root-only explicit directory。
   - 不开启 fix/format/code action。

5. Diagnostics route
   - 复用 `/api/lsp/diagnostics` 和 Problems pipeline。
   - `diagnoseWithExternalLanguageServer` 只扩展 `providerId: "eslint"`。
   - 对 config missing / server timeout / unsupported file 进行 explainable empty diagnostics 或 degraded metadata，而不是抛出全局错误。

6. Tests / smoke
   - `test:system:lsp-eslint-provider`：构造临时 workspace，含 root `eslint.config.*`、示例 JS/TS 文件，证明 provider 启动、diagnostics route、status lifecycle、root guard。
   - `test:system:lsp-provider-hygiene`：纳入 ESLint metadata exact-pin、license、server allowlist、禁止 auto install、禁止 frontend command override。
   - `smoke:ide:lsp-provider-status`：状态 UI 显示 ESLint provider installed/version/source/policy。
   - 如 diagnostics 在某些 ESLint config 下不稳定，M11-T 仍必须证明 bounded failure/degraded status，不允许 silent crash。

## 明确不做

M11-S / M11-T 不做：

- ESLint auto-fix、formatting、code actions、fix on save。
- `eslint.workingDirectories` glob / monorepo auto-discovery。
- 用户自定义 `eslint.runtime`、`eslint.nodePath`、`eslint.execArgv`、provider command/env。
- auto install、system binary discovery、前端安装按钮。
- JSON/HTML/CSS bins from `vscode-langservers-extracted`。
- 替换现有 TS/JS provider、JSON/HTML/CSS provider 或 Problems pipeline。
- 第二套 LSP/Files/Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| ESLint config/plugin 执行用户项目代码 | 只在 workspace root guard 内运行；先 root-level config gate；短 timeout；metadata 中标记 accepted-known-risk |
| monorepo working directory 错误 | M11-T root-only；M11-U 再规划 explicit workingDirectories |
| server 需要 workspace/configuration | M11-T 先补受控 configuration response，不让前端传 settings |
| `--fix` / code action 写文件 | M11-T 禁用 fix/format/code action，只接 diagnostics |
| extracted package multi-bin 膨胀 | 继续只 allowlist eslint bin；JSON/HTML/CSS bins 禁用 |
| 不同 ESLint 版本/flat config 行为差异 | system test 使用最小 fixture；status 显示 version/policy；config failure 可降级 |

## M11-T 验收命令建议

```bash
npm run typecheck:api -- --pretty false
npm run test:system:lsp-eslint-provider
npm run test:system:lsp-provider-hygiene
TRACEVANE_API_PORT=3918 TRACEVANE_WEB_PORT=5227 python /home/binbin/.agents/skills/webapp-testing/scripts/with_server.py --server "exec bash scripts/dev-web-smoke-external-api.sh" --port 5227 --timeout 90 -- node tests/ide-workbench/ide-lsp-provider-status.smoke.mjs
git diff --check
```

## 阶段状态

- M11-S：已完成。
- 下一步：M11-T ESLint external provider guarded diagnostics implementation。
