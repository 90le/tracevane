# M11-V ESLint Guarded WorkingDirectories Implementation Summary

## 状态

已完成：M11-V 在 M11-T ESLint diagnostics proof 与 M11-U hardening plan 之上，落地最小安全的 ESLint monorepo workingDirectory 支持。

下一步建议：M11-W External provider acceptance / next provider decision。

## 完成内容

### 1. Nearest marker root 作为唯一运行时 workingDirectory

ESLint diagnostics 现在仍只在 JS/TS 文件路径内发现 ESLint activation marker 时启用，但运行时配置从静态 `workingDirectory: { mode: "location" }` 改为后端派生：

```txt
current document path
  -> workspace root/path guard
  -> realpath canonicalization
  -> nearest ESLint activation marker root
  -> external gateway cwd/root
  -> workspace/configuration settings.workingDirectory.directory
```

这样 monorepo 中 `packages/web/.eslintrc.json` 下的文件会以 `packages/web` 作为 ESLint cwd/workingDirectory，不会因为 sibling package marker 或前端输入改变解析边界。

### 2. Discovery ignore guard

ESLint marker discovery 增加忽略目录：

```txt
.git
node_modules
dist
build
coverage
.next
.nuxt
.turbo
.vite
.tracevane-trash
```

如果当前文件路径位于这些目录下，即使内部存在 ESLint marker，也不会激活 ESLint external provider，避免依赖目录、构建产物或缓存目录污染 diagnostics。

### 3. Profile settings override 保持后端所有权

External gateway 增加每次诊断的 profile settings override 用法，但只由后端 service 调用。前端仍不能提供：

- `workingDirectories`
- `cwd`
- `env`
- `command` / `args`
- `eslint.runtime`
- `eslint.nodePath`
- `eslint.execArgv`
- arbitrary `options`

ESLint profile metadata 更新为：workingDirectory 已由 server-side nearest marker root 派生，fix/format/code actions 仍后置。

## 测试覆盖

扩展 `tests/system/lsp-eslint-provider.test.mjs`：

- 无 activation marker 时 JS/TS 仍走 TypeScript provider。
- root ESLint config 存在时走 ESLint diagnostics。
- nested monorepo package 使用 nearest marker root。
- sibling package marker 不会激活 unrelated file。
- `node_modules` 下的 marker 被忽略，不激活 ESLint。

## M11-V 明确不做

- 不做 ESLint fix。
- 不做 formatting。
- 不做 code actions。
- 不做 fix on save。
- 不开放前端或用户自定义 command/env/cwd/runtime/options/workingDirectories。
- 不做 glob/auto workingDirectories。
- 不做 system binary discovery 或 auto install。
- 不新建第二套 LSP/Files/Search API。
- 不替换既有 TS/JS hover/completion/definition/references provider。

## 验证

```bash
npm run typecheck:api -- --pretty false
npm run test:system:lsp-eslint-provider
node --test tests/system/lsp-external-provider-hygiene.test.mjs
npm run smoke:ide:lsp-provider-status
git diff --check
```
