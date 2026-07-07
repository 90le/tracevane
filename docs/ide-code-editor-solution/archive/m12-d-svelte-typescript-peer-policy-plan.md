# M12-D Svelte Dependency Compatibility / TypeScript Peer Policy Plan

## 状态

已完成。M12-D 是 docs-only 兼容性与版本策略阶段，不安装 `svelte-language-server`，不启用 Svelte runtime provider，不修改 external gateway。

## 本次核验

命令：

```bash
npm view svelte-language-server version license repository.url bin dependencies peerDependencies engines --json
node -e "const p=require('typescript/package.json'); console.log(p.version,p.license)"
```

当前证据：

```txt
svelte-language-server: 0.18.3
license: MIT
repository: git+https://github.com/sveltejs/language-tools.git
bin: svelteserver -> bin/server.js
engines: node >= 18.0.0
peerDependencies: typescript ^5.9.2 || ^6.0.2
key dependencies: svelte ^4.2.19, svelte2tsx ~0.7.57, prettier ~3.3.3, prettier-plugin-svelte ^3.5.0, chokidar ^4.0.1, vscode-languageserver 9.0.1
current installed TypeScript: 5.9.3 / Apache-2.0
current package.json TypeScript range: ^5.3.0
```

## 结论

M12-B 根据当时“项目 TypeScript range 是 `^5.3.0`”将 Svelte 后置是合理的保守决策。M12-D 重新核验后发现当前 lock/installed TypeScript 已是 `5.9.3`，实际满足 `svelte-language-server@0.18.3` 的 peer range。

但这仍不能直接进入 runtime implementation，原因是：

1. `package.json` 仍声明 `typescript: ^5.3.0`，没有显式表达 Svelte provider 的最低 peer 需求。
2. 当前 lockfile 能保证本仓库安装到 `5.9.3`，但后续依赖重解、维护者改动或 workspace 拆分可能让 peer guarantee 变得不透明。
3. Svelte provider 会引入 Svelte / Prettier / chokidar / config loader 等 runtime 面，风险大于 Vue M12-C 的 diagnostics/status proof。
4. Svelte LS 可能依赖 project-local `svelte.config.*`、`tsconfig` 与 Svelte package 解析；必须有 missing project dependency / config load failure 的 degraded status，而不能静默扩大扫描或让前端提供路径。

## 推荐 M12-E 实现前置条件

M12-E 进入 Svelte guarded runtime proof 前，必须满足：

```txt
- 明确 TypeScript peer policy：至少记录当前 lock 的 TypeScript 5.9.3 满足 Svelte LS peer，或把 package.json range 提升到能表达 >=5.9.2 的策略。
- 不因为 Svelte provider 替换现有 TS/JS in-process provider。
- svelte-language-server 必须 exact-pin。
- provider metadata 必须记录 package/version/license/peer requirement/install status/audit notes。
- external profile 必须 server-side allowlist：process.execPath + require.resolve('svelte-language-server/bin/server.js') + --stdio。
- frontend 不能提供 command/args/env/cwd/runtime/options/tsdk/svelte package path。
- diagnostics proof 可以先要求 route/status/lifecycle + bounded diagnostics response；不追 VS Code Svelte parity。
- degraded reason 必须覆盖 peer-mismatch、missing-project-svelte、config-load-failure、diagnostics-timeout、server-start-failed。
```

## M12-E 推荐切片

建议下一步命名：**M12-E Svelte external provider guarded diagnostics proof**。

范围：

```txt
1. 添加 exact-pinned dependency: svelte-language-server@0.18.3。
2. 若不调整 package.json TypeScript range，则在文档和 metadata 中明确依赖当前 package-lock TypeScript 5.9.3；若调整 range，则先只做最小 TypeScript peer alignment，不升级到 TS 6。
3. 在 externalProviderProfiles.ts 增加 svelte profile。
4. 在 provider registry 增加 svelte provider descriptor，diagnostics-only。
5. 在 externalProviderMetadata.ts 增加 peer policy notes。
6. normalizeLanguage 支持 .svelte / language svelte。
7. diagnoseDocument 将 svelte 路由到 existing external gateway。
8. 增加 tests/system/lsp-svelte-provider.test.mjs：profile lifecycle、metadata、route contract、bounded response。
9. 运行 provider hygiene 与 IDE provider status smoke。
```

## 本阶段明确不做

- 不安装 `svelte-language-server`。
- 不启用 Svelte runtime provider。
- 不升级 TypeScript 或改 TypeScript provider。
- 不接 Svelte hover / completion / definition / references / semantic tokens / formatting / code action。
- 不接 Go / Rust / Java / C / C++ heavy provider。
- 不做 system binary discovery、auto install、npx、用户自定义 provider command/env/runtime/cwd/options。
- 不新增第二套 LSP / Files / Search API。
- 不做 Git force/merge/rebase、Debug parity、Terminal 新能力或 File Manager Online Editor 产品壳变更。

## 验证

M12-D 是 docs-only policy 阶段：

```bash
npm view svelte-language-server version license repository.url bin dependencies peerDependencies engines --json
node -e "const p=require('typescript/package.json'); console.log(p.version,p.license)"
touched docs relative-link check
git diff --check
```
