# M11-K External Provider Optional Installer / Status Implementation Summary

## 阶段状态

已完成。M11-K 在 M11-J policy gate 后实现 external provider 的只读安装/版本/策略状态 metadata，并把这些 metadata 接入 `/api/lsp/status` 与 IDE 外部 LSP Provider 状态对话框。阶段保持只读：不新增 heavy provider runtime，不提供安装按钮，不允许前端传 command/args，不新增第二套 LSP API。

## 完成内容

### 后端 metadata

- 新增 `apps/api/modules/lsp/external/externalProviderMetadata.ts`。
- 为 external provider 生成只读 metadata：
  - `providerId`
  - package/source
  - install mode / install status
  - resolved package version
  - pinned version
  - license
  - optional flag
  - command source
  - audit summary
  - policy notes
- `/api/lsp/status` 的 `externalProviders` 增加：
  - `profiles[].install`
  - `metadata[]`
- 继续通过 `server-allowlist` 表示 command/args 来源，前端不能传命令。

### 前端状态 UI

- 扩展 `apps/web/src/features/ide-workbench/lsp/lspStatusClient.ts` 类型。
- IDE 外部 LSP Provider 状态对话框展示：
  - installed / missing / disabled / degraded
  - resolved version
  - pinned version
  - npm/source
  - package name
  - audit note
  - policy notes
- UI 仍是只读状态入口，不启动、不停止、不安装 provider。

### 验证覆盖

- 更新 `tests/ide-workbench/ide-lsp-provider-status.smoke.mjs`：
  - 校验 `/api/lsp/status` 中 YAML/Bash metadata。
  - 校验 Bash version `5.6.0`。
  - 校验 policy metadata 仍禁止 auto install 与 frontend command。
  - 校验 IDE dialog 展示 install status、source、version、audit note。

## 保留边界

M11-K 明确不做：

- Pyright / TypeScript Language Server / gopls / rust-analyzer / Vue / Svelte / Java / C/C++ runtime provider。
- runtime `npm install`、`npx`、curl installer 或任意自动安装。
- 前端安装按钮。
- 用户自定义 provider command / args / env。
- system binary discovery。
- external gateway lifecycle 行为改写。
- 第二套 LSP/Files/Search API。
- File Manager Online Editor 产品壳变更。

## 下一步建议

进入 M11-L：External provider dependency hygiene / exact pin readiness。

建议先处理：

1. YAML `^1.23.0` exact pin readiness / lockfile hygiene。
2. external provider audit 风险分级与可接受例外文档。
3. Bash `editorconfig/minimatch` 风险是否有安全替代、patch、override 或等待上游。
4. 再决定 Pyright guarded implementation 是否进入 M11-M。

## 验证结果

已运行并通过：

```txt
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run test:system:lsp-external-gateway
TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status
```
