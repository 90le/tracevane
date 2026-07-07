# M7.z-I Git branch / stash hardening and acceptance closeout 验收总结

## 状态

已完成。

M7.z-I 在 M7.z-H 的 branch / stash UI foundation 上做收口加固：保留既有 Git service/client 与 Source Control View，不新增第二套 Git API，不引入 force push、merge、rebase、Git graph、credential manager 或完整 VS Code SCM parity。

## 完成内容

### 1. Branch UI 输入门禁

- Source Control 的新建分支输入增加前端轻量校验：
  - 空值不报错但不能提交。
  - 禁止 `HEAD`。
  - 禁止过长名称。
  - 禁止以 `/` 或 `.` 开头、以 `/` 结尾。
  - 禁止 `.lock` 结尾。
  - 禁止 `..`、`@{`、连续 `/`、空白和 Git ref 特殊字符。
- 校验失败时显示 `data-ide-source-control-branch-error`，并禁用创建按钮。
- 后端仍保留 `normalizeGitRefName` 作为最终权威 guard；前端只做产品级提前反馈。

### 2. Branch 创建与 checkout 边界

- 创建分支继续使用 `checkout: false`，避免新建分支隐式改变当前工作区。
- checkout 继续在存在工作区变更时弹出确认，失败由既有 Git service 错误流进入 toast / Output。
- hardening smoke 明确验证：创建 `hardening/ui-created` 后 `main` 仍为 current branch。

### 3. Stash 操作保护

- clean repo 下 “保存储藏”保持禁用，避免无效 stash 操作。
- stash apply / pop / drop 继续走确认；drop 作为不可恢复操作保留明确确认文案。
- stash 操作按钮在 stash loading 期间禁用，避免列表刷新时对过期 ref 发起操作。

### 4. 验收覆盖

新增：

```bash
npm run smoke:ide:git-branch-stash-hardening
```

覆盖：

- 后端拒绝无效 branch ref。
- 前端无效 branch name 展示错误并禁用创建。
- 创建分支不自动 checkout。
- clean repo 禁用 save stash。
- drop stash 需要确认并能删除目标 stash。

## 未做内容

仍后置：

- force push。
- merge / rebase / conflict resolver。
- branch delete / rename / upstream set UI。
- Git graph / blame。
- credential manager。
- hunk / partial stage。
- 完整 VS Code SCM parity。
- 第二套 Git API。

## 验证

已运行：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:ide:git-branch-stash-hardening
```

后续提交前仍需运行：

```bash
npm run typecheck:api -- --pretty false
npm run smoke:ide:git-branch-stash-foundation
TRACEVANE_WEB_PORT=5203 npm run smoke:ide:git-branch-upstream
# touched docs relative link check
git diff --check
```

## 下一步

M7.z-J：LSP / Git / Debug enhancement acceptance closeout。

建议 M7.z-J 只做总体验收和缺口登记：汇总 M7.z-B 到 M7.z-I 的 advanced LSP、Git remote/branch/stash 与 Debug hardening 增强，明确仍不追完整 VS Code parity，并决定是否进入新的 post-M7 roadmap 或收敛为 release candidate。
