# M11-M Pyright External Provider Guarded Implementation Plan

## 状态

已完成。M11-M 是 docs-only / plan 阶段，不安装 `pyright`，不新增 runtime provider。

## 背景

M11-F 到 M11-L 已经完成：

- external stdio LSP gateway skeleton。
- YAML real provider proof。
- Bash real provider proof。
- provider lifecycle/status hardening。
- IDE external provider status UI。
- provider install/version/audit/policy metadata。
- bundled external provider exact-pin hygiene。

下一步可以考虑第三个真实 external language server。Python 是高价值语言，但 Pyright 比 YAML/Bash 更重，必须先定义 guarded implementation 计划，避免把 external provider 扩展变成“全语言一次性支持”。

## 当前证据

本地状态：

- `package.json` 当前未安装 `pyright`。
- 当前 server-side allowlisted external providers 仍只有 `yaml` 与 `bash`。
- M11-L 已要求 bundled external providers 必须 exact pin，并通过 `test:system:lsp-provider-hygiene` 约束 package.json/package-lock/metadata 一致。

外部包信息（2026-07-08 核验）：

- `npm view pyright version license dist.unpackedSize bin --json`
- version: `1.1.411`
- license: `MIT`
- unpackedSize: `19284989` bytes
- bin:
  - `pyright`: `index.js`
  - `pyright-langserver`: `langserver.index.js`

官方/上游证据：

- Microsoft Pyright GitHub: <https://github.com/microsoft/pyright>
- npm package: <https://www.npmjs.com/package/pyright>

## M11-N 推荐实现切片

### 1. 依赖与 metadata

如果进入 M11-N，实现应：

- 在 root `package.json` dependencies 添加 exact pin：`"pyright": "1.1.411"`。
- 更新 `package-lock.json`。
- 在 `externalProviderMetadata` 增加：
  - `providerId: "pyright"`
  - `packageName: "pyright"`
  - `source: "npm:pyright"`
  - `installMode: "bundled-npm"`
  - `pinnedVersion: "1.1.411"`
  - `license: "MIT"`
  - `optional: false`
  - audit note 包含 package size / startup budget / no auto install。
- 确保 `test:system:lsp-provider-hygiene` 覆盖 Pyright exact pin、lockfile、license 与 policy。

### 2. Server-side allowlist profile

新增 profile 时必须继续复用现有 external gateway，不新增第二套 LSP API：

```ts
export const PYRIGHT_LANGUAGE_SERVER_BIN = require.resolve("pyright/langserver.index.js");

{
  id: "pyright",
  label: "Pyright Language Server",
  command: process.execPath,
  args: [PYRIGHT_LANGUAGE_SERVER_BIN, "--stdio"],
  languages: ["python", "py", "python3", "pyi"],
  capabilities: { diagnostics: true },
  budgets: { initializeMs: 10_000, requestMs: 5_000, shutdownMs: 1_500 },
  env: { NODE_ENV: "production" }
}
```

边界：

- command / args 只能来自 server-side allowlist。
- frontend 仍只能读 status，不能传 command / args / env。
- cwd 继续走 `resolveExternalLanguageServerCwd` root guard。
- stderr tail、crashed/degraded/timeout 状态继续走现有 gateway。

### 3. LSP service routing

M11-N 只做 Python diagnostics proof：

- `.py` / `.pyi` 与 Monaco language `python` 路由到 `pyright`。
- 只接 diagnostics 到现有 Problems contract。
- 不做 hover/completion/definition/rename/format/code action。
- 不做 interpreter / virtualenv discovery。
- 不做 Pylance 私有能力或 VS Code Python extension parity。

### 4. 验证建议

新增：

```bash
npm run test:system:lsp-pyright-provider
```

覆盖：

- Pyright profile 存在且 server-side allowlisted。
- `args` 末尾为 `--stdio`。
- `gateway.start("pyright")` 返回 available。
- 打开一个简单 invalid Python 文档后能收到 diagnostics，或者至少 normalized diagnostics 响应不崩。
- `service.getStatus().externalProviders` 包含 Pyright metadata/version/pin/status。
- stop 后状态明确。

扩展：

```bash
npm run test:system:lsp-provider-hygiene
TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status
```

UI smoke 应验证 Pyright 在 External Provider Status dialog 中展示 installed/version/pin/source/audit/policy。

## 明确不做

M11-M / M11-N 都不应顺手引入：

- Python hover / completion / definition / rename / formatting / code actions。
- virtualenv / interpreter discovery。
- dependency install UI。
- runtime `npm install` / `npx`。
- frontend-provided command / args / env。
- system binary discovery。
- Pylance private features or VS Code Python extension parity。
- gopls / rust-analyzer / Vue / Svelte / Java / C/C++ providers。
- 第二套 LSP / Files / Search API。
- Git force / merge / rebase。
- Debug parity。
- Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 下一步

M11-N：Pyright external provider guarded implementation。

推荐顺序：

1. exact-pin `pyright` dependency and lockfile。
2. metadata + hygiene test first。
3. allowlisted profile + system test。
4. LSP service diagnostics routing。
5. provider status UI smoke expansion。
6. archive summary + docs closeout。
