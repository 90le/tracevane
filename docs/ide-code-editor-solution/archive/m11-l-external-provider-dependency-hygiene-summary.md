# M11-L External Provider Dependency Hygiene / Exact Pin Readiness Summary

## 状态

已完成。

M11-L 承接 M11-J/M11-K 的 external language server provider 安装、版本、audit 与只读状态策略。本阶段只做依赖治理和 exact-pin readiness，不新增 Pyright / gopls / rust-analyzer 等 runtime provider，也不改变 external gateway 生命周期。

## 完成内容

### 1. YAML/Bash bundled provider exact pin

- `yaml-language-server` 从 `^1.23.0` 收紧为 exact pin `1.23.0`。
- `bash-language-server` 保持 exact pin `5.6.0`。
- `package.json`、`package-lock.json` 与 `apps/api/modules/lsp/external/externalProviderMetadata.ts` 的 pinnedVersion 现在保持一致。

### 2. Provider metadata hygiene

- YAML provider audit note 从“仍需 exact-pin hygiene”更新为“已完成 exact-pin，后续升级必须带 provider-specific audit 与 smoke evidence”。
- Bash provider 继续记录已知 transitive audit risk，并保持 server-side allowlisted command 与 scoped PATH 说明。
- Provider policy 继续固定为：
  - `autoInstall: false`
  - `frontendCanProvideCommand: false`
  - `commandSource: server-allowlist`

### 3. 系统测试护栏

新增 `tests/system/lsp-external-provider-hygiene.test.mjs` 与 npm script：

```bash
npm run test:system:lsp-provider-hygiene
```

覆盖：

- bundled external providers 必须声明 exact `pinnedVersion`，不能使用 semver range。
- installed package version 必须等于 metadata pinnedVersion。
- root `package.json` dependency 必须等于 metadata pinnedVersion。
- root `package-lock.json` dependency 与 resolved package version 必须等于 metadata pinnedVersion。
- package-lock license 必须与 metadata license 一致。
- provider command 必须保持 `server-allowlist`。
- provider policy 必须继续禁止 auto install 与 frontend command override。

## 明确未做

M11-L 明确不做：

- Pyright / TypeScript Language Server / gopls / rust-analyzer / Vue / Svelte / Java / C/C++ runtime provider。
- 自动安装 provider。
- 前端安装按钮。
- 用户自定义 provider command / args / env。
- system binary discovery。
- external gateway lifecycle 改写。
- 第二套 LSP / Files / Search API。
- Git force / merge / rebase。
- Debug parity。
- Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-external-gateway`
- `TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status`
- `git diff --check`
- touched docs 临时 Markdown 相对链接检查

## 下一步

M11-M：Pyright external provider guarded implementation plan。

建议先做计划和最小切片确认：

- 是否采用 bundled npm `pyright`，以及 exact pin / license / package size / audit 记录。
- Python file detection 与 provider routing 的最小边界。
- Provider-specific smoke：启动、诊断、状态 UI、失败降级。
- 继续禁止 auto install、前端 command override 和第二套 LSP API。
