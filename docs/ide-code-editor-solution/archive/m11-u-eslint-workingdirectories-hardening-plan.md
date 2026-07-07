# M11-U ESLint Monorepo / WorkingDirectories Hardening Plan

## 状态

已完成：M11-U 是文档与安全边界计划阶段，不改运行时代码，不启用新的 ESLint workingDirectories 行为。

承接：

- M11-S：ESLint external provider project-config/runtime safety plan。
- M11-T：ESLint external provider guarded diagnostics implementation。

下一步：M11-V ESLint guarded workingDirectories implementation。

## 背景

M11-T 已把 ESLint diagnostics 接入到现有 external language server gateway：

- `vscode-eslint-language-server` 只由后端 allowlist 启动。
- JS/TS 文件只有在路径内发现 ESLint activation marker 时才切到 ESLint diagnostics。
- external gateway 的 root/cwd 收敛到 marker directory。
- 不开放 frontend/user command、env、cwd、runtime、nodePath、execArgv 或 options。
- 不做 fix、format、code action、fix on save。

但是 monorepo 场景中，同一个 workspace 内可能有多个 ESLint config/package root。直接开启 ESLint 的 `workingDirectories`、`mode: auto` 或前端传入目录，会扩大 cwd/config/plugin 解析面，可能引入任意路径、任意项目 config 代码执行、跨 package 泄漏和不可解释的 diagnostics 行为。因此 M11-U 先固化安全模型。

## M11-U 结论

ESLint workingDirectories 必须是 **server-side derived allowlist**，不是前端输入。

推荐模型：

```txt
workspace root
  -> bounded marker discovery
  -> canonical allowed directory list
  -> per-document nearest marker root
  -> generated workspace/configuration response
  -> diagnostics-only ESLint session
```

### 允许

- 后端基于当前 workspace root 和当前文件路径发现最近的 ESLint marker directory。
- 后端可在受限预算内发现同 workspace 内的多个 ESLint marker directory，用于 monorepo root list。
- 所有目录都必须 canonicalize/normalize 后通过 workspace root guard。
- 忽略 `node_modules`、`.git`、`dist`、`build`、coverage、`.tracevane-trash`、大缓存目录等。
- 对目录数量、扫描深度、扫描耗时和 settings payload 大小设置上限。
- 超出上限时进入 degraded status，而不是继续扩大扫描。
- diagnostics 仍走 pull diagnostics；status UI 显示 activation/degraded/error 原因。

### 不允许

- 前端传入 `workingDirectories`。
- 前端传入 `eslint.runtime`、`eslint.nodePath`、`eslint.execArgv`、`command`、`args`、`env`、`cwd` 或 provider options。
- 启用 ESLint `workingDirectories: [{ mode: "auto" }]` 作为默认行为。
- 向 ESLint 暴露 workspace 外目录、绝对任意路径或 symlink 逃逸路径。
- 在 M11-V 同时启用 fix、format、code action 或 fix on save。
- 新建第二套 LSP、Files、Search 或 provider API。

## 安全设计

### 1. Marker discovery

ESLint activation marker 只来自 server-side allowlist，例如：

```txt
eslint.config.js
eslint.config.mjs
eslint.config.cjs
eslint.config.ts
eslint.config.mts
eslint.config.cts
.eslintrc
.eslintrc.json
.eslintrc.js
.eslintrc.cjs
package.json with eslintConfig
```

发现策略：

1. 从当前文件目录向上查找最近 marker，直到 workspace root。
2. 可选 monorepo list 只在 workspace root 内 bounded scan。
3. marker directory 必须位于 workspace root 内。
4. sibling package marker 不应影响当前文件，除非当前文件属于该 marker subtree。

### 2. Root/cwd guard

所有 candidate directory 必须：

- 经过 `realpath` / canonical path 处理。
- 通过 existing Files root guard 语义。
- 不允许 `..`、symlink escape、绝对外部路径。
- 不允许 frontend override。

### 3. WorkingDirectories payload

M11-V 可以选择两种保守策略之一：

A. **Nearest-root only**（推荐第一步）

```txt
workspace/configuration -> workingDirectory = nearest marker directory
```

优点：最小行为变化，避免跨 package 泄漏。

B. **Bounded allowed-list**（后续增强）

```txt
workspace/configuration -> workingDirectories = canonical allowed marker directories
```

约束：最大数量、排序稳定、全部 root-guarded、不可由用户/前端注入。

### 4. Degraded states

M11-V 应提供可观测状态，而不是静默失败：

- `missing-config`：当前文件无 ESLint marker，回退 TS/JS provider。
- `too-many-directories`：marker 数量超过上限，只使用 nearest-root 或禁用 monorepo list。
- `directory-outside-root`：候选目录不在 workspace root 内，拒绝。
- `scan-timeout`：扫描超时，回退 nearest-root 或禁用。
- `server-start-failed`：language server 启动失败。
- `diagnostics-timeout`：pull diagnostics 超时。
- `eslint-library-missing` / plugin parser load failure：记录 provider status，不扩展命令面。

## M11-V 推荐实现切片

### 后端

- 抽出或扩展 ESLint activation helper：
  - `findNearestEslintMarkerDirectory(root, filePath)`。
  - `discoverEslintWorkspaceDirectories(root, filePath, budget)`（可选 bounded list）。
- 所有 helper 复用 Files root/path guard 语义。
- external provider profile 不接受 frontend/user workingDirectories。
- workspace/configuration response 只由后端 generated safe settings 产生。
- provider status 暴露 degraded reason。

### 测试

新增/扩展 system tests：

- root config 可以激活当前文件。
- nested package config 选择 nearest marker。
- sibling package config 不污染当前文件。
- `node_modules` / `dist` / `.git` 下 marker 被忽略。
- workspace 外路径或 symlink escape 被拒绝。
- marker 数量超过上限进入 degraded state。
- 无 marker 时继续回退 TS/JS provider，不启动 ESLint。

### Smoke

扩展 `smoke:ide:lsp-provider-status` 或新增 ESLint monorepo smoke：

- provider status 能显示 ESLint active/degraded/disabled。
- 打开 nested package JS/TS 文件时 provider route 可解释。
- 未配置项目不显示误导性 ESLint error。

## M11-U 明确不做

- 不改运行时代码。
- 不启用 monorepo workingDirectories runtime 行为。
- 不启用 ESLint auto-fix、formatting、code actions、fix on save。
- 不开放用户/前端自定义 runtime、nodePath、execArgv、command、args、env、cwd、options。
- 不引入 system binary discovery、auto install 或第二套 LSP API。
- 不替换既有 TS/JS hover/completion/definition/references provider。
- 不改变 File Manager Online Editor 产品壳。

## 验证

M11-U 是 docs-only 阶段，验证要求：

```bash
git diff --check
# touched docs markdown relative link check
```

