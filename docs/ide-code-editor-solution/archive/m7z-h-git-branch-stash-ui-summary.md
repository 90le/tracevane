# M7.z-H Git branch / stash UI foundation 验收总结

## 状态

已完成。

M7.z-H 复用既有 Git service、HTTP routes 和 `@/lib/api/git` client，在 IDE Source Control View 中补齐 branch / stash 的基础产品入口，使 M7-E-D 已具备的 branch/upstream payload 和后端 stash routes 不再停留在未产品化状态。

## 完成内容

- Source Control View 新增 Branches 区域：
  - 展示 `GitStatusPayload.branches`。
  - 标记当前分支。
  - 支持创建新分支，默认 `checkout: false`，避免创建即切换带来的工作区副作用。
  - 支持对已有分支执行受控 checkout；当工作区存在变更时弹出确认。
- Source Control View 新增 Stashes 区域：
  - 调用 `GET /api/git/stashes` 读取 stash 列表。
  - 支持保存 stash，默认 include untracked。
  - 提供 apply / pop / drop 入口，均带确认提示。
  - 操作后刷新 Git status 与 stash list。
- 继续复用：
  - `apps/api/modules/git/service.ts`
  - `apps/api/modules/git/routes.ts`
  - `apps/web/src/lib/api/git.ts`
  - 现有 Source Control Output/toast 反馈模式。
- 新增 smoke：`npm run smoke:ide:git-branch-stash-foundation`。

## 明确未做

- 不做 force push。
- 不做 merge / rebase / conflict resolver。
- 不做 branch delete / rename / upstream set UI。
- 不做 Git graph / blame。
- 不做 credential manager。
- 不做 hunk/partial stage。
- 不做完整 VS Code Source Control parity。
- 不新增第二套 Git API。

## 验证

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:git-branch-stash-foundation`
- `TRACEVANE_WEB_PORT=5203 npm run smoke:ide:git-branch-upstream`

说明：`smoke:ide:git-branch-upstream` 首次在默认 5176 端口出现页面未渲染超时，使用独立端口 5203 重跑通过；Git 断言没有失败。

## 下一步

M7.z-I：Git branch / stash hardening and acceptance closeout。

建议优先补充 branch/stash 操作禁用态、错误态、dirty 工作区提示一致性和文档验收，再决定是否进入 Git graph / blame 或更高风险的 merge/rebase/branch delete/rename。
