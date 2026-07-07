# M9-D Git graph / blame read-only foundation summary

## 状态

已完成。M9-D 在现有 Git service/client/Source Control 基础上增加只读 Git history graph 与 blame foundation，没有引入 merge、rebase、cherry-pick、tag、worktree、force push、credential manager 或完整 VS Code Git 行为。

## 完成内容

- 后端只读 API：
  - 新增 `GET /api/git/graph`，返回 bounded commit graph/log list，包含 commit hash、parents、refs、author/date/subject。
  - 新增 `GET /api/git/blame`，返回指定 repo-relative 文件的 bounded line blame。
  - 继续复用 `apps/api/modules/git` 的 root/repository guard、repo-relative path normalization 和 `execFileSync("git", args[])` 参数数组执行模式。
- 共享类型与前端 API：
  - 新增 `GitGraphPayload` / `GitGraphCommit`。
  - 新增 `GitBlamePayload` / `GitBlameLine`。
  - 新增 web typed API：`getGitGraph`、`getGitBlame`。
  - 新增 query hooks：`useGitGraphQuery`、`useGitBlameQuery`。
- IDE Source Control UI：
  - 新增只读“历史”区域，显示最近 commits、parents 数量和 refs。
  - 新增 Blame 文件路径输入与只读 blame 结果预览。
  - UI 只展示读取结果，不触发任何 history rewrite 操作。
- 验证：
  - 新增 `smoke:ide:git-graph-blame`，覆盖 graph `--all`、file-scoped graph、blame line metadata。
  - 回跑 `smoke:ide:git-branch-management`，确认 M9-C branch management 未回退。

## 只读边界

- `GET /api/git/graph` 使用 bounded `git log`，支持 `limit`、`all` 和可选 file scope。
- `GET /api/git/blame` 只接受 repo-relative file path，并使用 line limit 防止超大结果长期占用 UI/API。
- 本阶段不保存 Git history 输出、不写入仓库、不切换分支、不改 upstream、不做任何 history rewrite。

## 未做内容

- 不做 merge / rebase / cherry-pick / tag / worktree。
- 不做 force push 或 credential manager。
- 不做图形化 lane layout / DAG canvas；当前 graph 是只读 list foundation。
- 不做 hunk blame gutter 与 Monaco inline blame decoration。
- 不做完整 VS Code Source Control 行为。
- 不改变 LSP、Debug、Terminal 后续阶段边界。

## 验证记录

- `npm run typecheck:api -- --pretty false`：通过。
- `npm run typecheck:web -- --pretty false`：通过。
- `npm run smoke:ide:git-graph-blame`：通过。
- `npm run smoke:ide:git-branch-management`：通过。
- `git diff --check`：通过。
- touched docs relative-link check：通过。

## 下一步

进入 M10-A：LSP semantic tokens / workspace symbols foundation plan。M10-A 应先探查现有 LSP provider/editor integration，规划 semantic tokens 与 workspace symbols 的最小复用边界，不和 Debug、Git history rewrite 或完整多语言 LSP parity 同时扩张。
