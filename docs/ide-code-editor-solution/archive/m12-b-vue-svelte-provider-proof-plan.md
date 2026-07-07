# M12-B Vue / Svelte Framework Provider Guarded Proof Plan

## 状态

M12-B 已完成。此阶段是 Vue / Svelte framework provider 的 guarded proof 计划阶段，不新增 runtime provider、不安装依赖、不改变 external language server gateway 行为。

## M12-A 承接

M12-A 决定先从 npm / TypeScript 生态的 framework provider 入手，而不是直接接 Go / Rust / Java / C / C++ toolchain-backed provider。M12-B 继续保持 research-first：先定义可安全实现的最小 runtime proof，再进入 M12-C。

## 当前 npm / 本地核验

### Vue candidate

```txt
package: @vue/language-server
version: 3.3.6
license: MIT
repository: github.com/vuejs/language-tools
bin: vue-language-server -> bin/vue-language-server.js
peerDependencies: typescript: *
key dependencies: @volar/language-server 2.4.28, @vue/language-core 3.3.6, @vue/language-service 3.3.6, @vue/typescript-plugin 3.3.6
local install: not installed
```

判断：Vue 是 M12-C 的首选 runtime proof。它的 TypeScript peer 约束宽泛，和当前项目 `typescript ^5.3.0` 的冲突风险低于 Svelte；同时 `@vue/language-server` 有明确 bin，可沿用当前 external gateway 的 `process.execPath + require.resolve` 模式。

### Svelte candidate

```txt
package: svelte-language-server
version: 0.18.3
license: MIT
repository: github.com/sveltejs/language-tools
bin: svelteserver -> bin/server.js
peerDependencies: typescript: ^5.9.2 || ^6.0.2
key dependencies: svelte ^4.2.19, svelte2tsx ~0.7.57, prettier ~3.3.3, vscode-languageserver 9.0.1, chokidar ^4.0.1
local install: not installed
```

判断：Svelte 不应和 Vue 一起在 M12-C 直接实现。当前项目 TypeScript 版本是 `^5.3.0`，与 `svelte-language-server@0.18.3` peer range 不匹配。Svelte 需要先在后续阶段做 dependency compatibility / TypeScript upgrade impact 评估，或寻找兼容当前 TypeScript 版本的受控版本。

## M12-C 推荐切片：Vue External Provider Guarded Diagnostics Proof

M12-C 推荐只做 Vue provider guarded proof，暂不做 Svelte runtime。

建议实现范围：

```txt
1. 添加 exact-pinned dependency: @vue/language-server 3.3.6。
2. 在 externalProviderProfiles.ts 增加 server-side allowlist profile：
   - id: vue
   - command: process.execPath
   - args: [require.resolve('@vue/language-server/bin/vue-language-server.js'), '--stdio'] 或上游验证后的 stdio 参数
   - languages: vue
   - capabilities: diagnostics: true
   - budgets: initialize 10s, request 5s, shutdown 1.5s
   - env: NODE_ENV=production
3. 在 provider registry 增加 vue provider descriptor，mode external，diagnostics-only。
4. 在 externalProviderMetadata.ts 增加 @vue/language-server exact pin / MIT / audit note。
5. 在 file language detection / Monaco language mapping 中确认 .vue 归为 vue；如果已有则只复用。
6. 增加 tests/system/lsp-vue-provider.test.mjs：
   - profile/status metadata 暴露 vue。
   - minimal .vue workspace 文件能 route 到 Vue provider。
   - diagnostics 至少能证明 provider lifecycle/request path，不要求完整 template/script typechecking parity。
7. 扩展 smoke:ide:lsp-provider-status，确认 IDE provider status dialog 展示 Vue provider。
8. 保持 frontend 不能提供 command/env/cwd/runtime/options。
```

如果上游启动参数或 diagnostics 行为无法稳定证明，M12-C 可以降级为 profile/status proof + runtime degraded reason，不强行伪造 diagnostics 通过。

## Svelte 后置计划

Svelte 推荐后置到 M12-D 或 M12-E，先做以下问题：

```txt
1. 确认是否升级项目 TypeScript 到满足 svelte-language-server peer range。
2. 如果不升级 TypeScript，查找并固定兼容当前 TypeScript 的 svelte-language-server 版本。
3. 评估 Svelte provider 是否需要 project-local svelte / svelte.config / tsconfig。
4. 评估 prettier / chokidar / config loader 带来的依赖、安全与性能影响。
5. 设计 status degraded：peer mismatch、missing project dependency、config load failure。
```

## 安全边界

M12-C/M12-D 仍必须遵守 M11/M12 provider gate：

- 不新增第二套 LSP / Files / Search API。
- External provider 仅由 server-side allowlist profile 启动。
- 前端不能提供 command / args / env / cwd / runtime / TypeScript SDK path / framework package path。
- 不做 auto install、npx、system binary discovery。
- Provider dependency 必须 exact pin，并有 license/audit/status metadata。
- 第一阶段只做 diagnostics-first；hover/completion/definition/formatting/codeAction 后置到单独 safety gate。
- WorkspaceEdit 类能力必须继续走 preview/apply、root guard、dirty/conflict 保护。

## 明确未做

M12-B 不做：

- 安装 `@vue/language-server` 或 `svelte-language-server`。
- 启用 Vue / Svelte runtime provider。
- 修改 external gateway runtime。
- 修改 provider registry runtime。
- 升级 TypeScript。
- external hover / completion / definition / references / formatting / codeAction。
- Go / Rust / Java / C / C++ provider。
- system binary discovery、auto install、npx、用户自定义 provider command/env/runtime/cwd/options。
- 第二套 LSP / Files / Search API。
- Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

M12-B 是 docs-only plan 阶段，验证范围：

```bash
npm view @vue/language-server version license repository.url bin dependencies peerDependencies --json
npm view svelte-language-server version license repository.url bin dependencies peerDependencies --json
# touched docs relative-link check
git diff --check
```

Runtime verification 后置到 M12-C Vue guarded diagnostics proof。
