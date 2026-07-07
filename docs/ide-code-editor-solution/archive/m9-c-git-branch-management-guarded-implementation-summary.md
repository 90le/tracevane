# M9-C Git branch management guarded implementation summary

## 状态

已完成。M9-C 在既有 `apps/api/modules/git`、web Git client/query 和 IDE Source Control View 上补齐受控的本地分支管理能力，没有新建第二套 Git API，也没有把 Git graph、merge/rebase、force push 或完整 VS Code Git 行为提前拉入本阶段。

## 完成内容

- 后端 Git service/routes：
  - 新增 `POST /api/git/branches/delete`。
  - 新增 `POST /api/git/branches/rename`。
  - 新增 `POST /api/git/branches/upstream`，统一承载 set/unset upstream。
  - 所有新增操作继续通过 `execFileSync("git", args[])` 参数数组执行，不拼接 shell 字符串。
- 共享类型与前端 API：
  - 新增 `GitDeleteBranchRequest`、`GitRenameBranchRequest`、`GitSetUpstreamRequest`。
  - 新增 web typed API：`deleteBranch`、`renameBranch`、`setBranchUpstream`。
  - 新增 TanStack Query mutation hooks，保持 Git client/query 绑定完整。
- IDE Source Control UI：
  - 分支行新增 action menu。
  - 支持 Checkout、Rename、Delete、Set upstream、Unset upstream、Copy branch name。
  - 当前分支禁用 delete。
  - delete 使用输入完整分支名的强确认，不做 force delete。
- 验证：
  - 新增 `smoke:ide:git-branch-management`。
  - smoke 覆盖当前分支删除拒绝、force delete 拒绝、本地分支删除、分支重命名、无效 upstream 拒绝、upstream set/unset。

## Guard 边界

- 删除分支：
  - 禁止删除当前分支。
  - 禁止 force delete；M9-C 只允许 `git branch -d`。
  - 只允许本地分支；remote-tracking branch 由后端拒绝。
- 重命名分支：
  - old/new branch 名都走统一 Git ref 校验。
  - 禁止 `HEAD`。
  - 禁止目标分支已存在。
  - 当前分支使用 `git branch -m <new>`，非当前分支使用 `git branch -m <old> <new>`。
- upstream：
  - branch 必须是本地分支。
  - set upstream 要求 remote-tracking ref 存在，例如 `origin/main`。
  - unset upstream 只清除指定本地分支的 upstream。

## 未做内容

- 不做 force delete。
- 不做 merge / rebase / cherry-pick / tag / worktree。
- 不做 force push。
- 不做 Git graph / blame；下一阶段独立进入 M9-D read-only foundation。
- 不做完整 VS Code Source Control 行为。
- 不改变 M7/M8 已完成的 LSP、Debug、Terminal、Problems/Output 线路。

## 验证记录

- `npm run typecheck:api -- --pretty false`：通过。
- `npm run typecheck:web -- --pretty false`：通过。
- `npm run smoke:ide:git-branch-management`：通过。
- `npm run smoke:ide:git-branch-stash-hardening`：通过，证明既有 branch/stash UI hardening 未回退。
- `git diff --check`：通过。
- touched docs relative-link check：通过。

## 下一步

进入 M9-D：Git graph / blame read-only foundation。M9-D 只做只读 Git history graph/blame 的安全探查与最小实现，不引入 history rewrite、merge/rebase 或 force push。
