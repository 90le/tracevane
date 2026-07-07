# M8-B RC Smoke Matrix Runner / Documentation Cleanup Foundation

## 状态

已完成。M8-B 把 M8-A 定义的 IDE release-candidate quick gate / full RC matrix 固化为仓库内可重复执行的本地 runner，并完成阶段文档状态收口。

下一步进入 **M8-C：RC smoke matrix execution and blocker triage**。

## 完成内容

### 1. RC matrix runner

新增 `scripts/ide-rc-matrix.mjs`：

- 支持 `--quick`：执行 PR/阶段收口用 quick gate。
- 支持 `--full`：执行完整 RC domain matrix。
- 支持 `--domain=<name>`：按域执行 File Surface、Workbench Editor、Terminal、Search/Problems/Output、LSP、Git、Debug 等子矩阵。
- 支持 `--list`：只列出将执行的命令。
- 支持 `--dry-run`：只打印命令，不运行 smoke。
- 支持 `--continue-on-error`：用于 M8-C 收集全矩阵失败清单。
- 内置 `:git-diff-check` 特殊命令，对应 `git diff --check`。

新增 npm 入口：

```bash
npm run ide:rc:list
npm run ide:rc:quick
npm run ide:rc:quick:dry
npm run ide:rc:full
npm run ide:rc:full:dry
```

### 2. Matrix 覆盖域

M8-B runner 将 M8-A RC 范围整理为这些域：

- `fileSurface`
- `workbenchEditor`
- `terminal`
- `searchProblemsOutput`
- `lsp`
- `git`
- `debug`

quick gate 保留 typecheck + 代表性 smoke + whitespace check；full gate 展开全部域 smoke。

### 3. 文档状态与 cleanup

更新阶段状态：

- M8-A：已完成。
- M8-B：已完成。
- 下一阶段：M8-C RC smoke matrix execution and blocker triage。

同步更新：

- `.codex/project-context.md`
- `docs/ide-code-editor-solution/00-README.md`
- `docs/ide-code-editor-solution/07-终端运行语言服务Git方案.md`
- `docs/ide-code-editor-solution/08-实施阶段验收与风险.md`

同时清理 M7.z-E 的过期边界口径：M7.z-E 当时不做 branch/stash UI；后续 M7.z-H/I 已完成受控 branch/stash UI 与 hardening，但 branch delete/rename/upstream set UI、force push、merge/rebase、Git graph/blame 仍后置。

## 明确未做

M8-B 只建立可重复验证入口，不做：

- 不执行完整 RC matrix 并修 blocker。
- 不新增 IDE runtime feature。
- 不新增 Files/Git/LSP/Debug/Terminal API。
- 不改 CI workflow。
- 不调整产品 UI 或业务行为。

## 验证

本阶段验证 runner 可解析/列出矩阵、文档链接可解析、diff 无 whitespace 错误：

```bash
npm run ide:rc:quick:dry
npm run ide:rc:list
node --check scripts/ide-rc-matrix.mjs
git diff --check
```

> M8-C 再执行 `npm run ide:rc:quick` / domain matrix / full matrix，并按 blocker severity 修复。

## M8-C 入口

M8-C 建议顺序：

1. 先执行 `npm run ide:rc:quick`，建立 quick gate 真实结果。
2. 如 quick gate 失败，按 release blocker / major / minor 分级修复。
3. quick gate 通过后执行 domain matrix，必要时用 `--continue-on-error` 汇总失败清单。
4. 最后再决定是否把 runner 接入 CI。
