# M12-E Svelte External Provider Guarded Diagnostics Proof Summary

## 状态

M12-E 已完成。该阶段把 Svelte 作为第二个 framework external provider proof 接入 Tracevane 现有 LSP provider 体系，范围严格限定为 diagnostics/status。

## 完成内容

- 安装并 exact-pin `svelte-language-server@0.18.3`。
- 在 external provider profiles 中加入 server-side allowlisted Svelte profile：
  - command: `process.execPath`
  - args: `require.resolve("svelte-language-server/bin/server.js")`, `--stdio`
  - languages: `svelte`
  - capabilities: diagnostics only
- 在 provider registry / shared LSP types 中增加 `svelte` provider id。
- 在 provider metadata 中登记 package/source/license/pinnedVersion/audit notes。
- 在 LSP service 中增加：
  - `.svelte` / `svelte` language normalization
  - Svelte diagnostics route
  - request-timeout empty diagnostics degradation
- 新增 `tests/system/lsp-svelte-provider.test.mjs` 与 `npm run test:system:lsp-svelte-provider`。

## TypeScript peer 策略

M12-D 已核验 `svelte-language-server@0.18.3` peer 为 `typescript ^5.9.2 || ^6.0.2`。当前 lockfile / installed TypeScript 为 `5.9.3`，满足该 peer，因此 M12-E 不升级 TypeScript，也不修改 TS/JS provider。

## 边界

M12-E 明确不做：

- Svelte hover / completion / definition / references / semantic tokens / formatting / code action。
- SvelteKit / Vite / project config parity。
- TypeScript 升级或 TS/JS provider 替换。
- Go / Rust / Java / C / C++ heavy provider runtime。
- system binary discovery、auto install、npx、用户自定义 provider command/env/runtime/cwd/options。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-provider-hygiene`
- `npm run test:system:lsp-svelte-provider`
- `npm run smoke:ide:lsp-provider-status`
- touched-doc relative link check
- `git diff --check`

## 下一步

M12-F：Framework provider acceptance / heavy toolchain policy decision。

建议 M12-F 不直接接 Go/Rust/Java/C/C++，而是先冻结 Vue/Svelte framework proof 的验收口径，并决定 heavy provider 的 toolchain trust、binary discovery、workspace permission、install/status UI 与 smoke strategy。
