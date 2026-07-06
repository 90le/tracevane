# M7-E-B Git Stage / Unstage Foundation 验收总结

## 完成状态

M7-E-B 已完成 Git stage / unstage 最小操作闭环：IDE Workbench Source Control 中的变更项现在可以执行单文件暂存/取消暂存，并提供全部暂存/全部取消入口。操作后复用既有 Git status 刷新链路，同步 Source Control、Explorer decoration 与 Editor tab decoration，并写入 Git Output channel。

## 已完成内容

```txt
- 复用既有 apps/api/modules/git service/routes，不新增第二套 Git API。
- 前端复用 apps/web/src/lib/api/git.ts 的 stageFiles / unstageFiles。
- Source Control toolbar 增加 Stage All / Unstage All 入口。
- Source Control 变更行增加单文件 Stage / Unstage 操作。
- 操作后刷新 M7-D Git status hook，驱动 Source Control list、Explorer decoration、Editor tab decoration 同步更新。
- 操作结果与失败信息写入 Git Output channel，并通过 toast 给出用户反馈。
- 新增 smoke:ide:git-stage，覆盖 untracked 文件 stage -> staged added -> unstage -> untracked 以及 diff 入口保持可用。
```

## 关键边界

```txt
- M7-E-B 只做 file/all 级 stage / unstage。
- 不做 commit / push / pull / branch checkout。
- 不做 hunk stage、partial stage、stash、Git graph、blame、merge/rebase。
- 不做 Debug Adapter Protocol。
```

## 复用关系

```txt
- 后端继续复用 apps/api/modules/git/service.ts 的 stagePaths / unstagePaths。
- 前端继续复用 apps/web/src/lib/api/git.ts 的 stageFiles / unstageFiles。
- Source Control 继续复用 M7-D git status/decorations 与 M7-E-A diff tab。
- Git 状态仍是 volatile workspace state，不写入 Dockview/editor layout persistence。
```

## 验收

```txt
- npm run typecheck:web -- --pretty false
- npm run typecheck -- --pretty false
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-stage
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-diff
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-status
- git diff --check
```

## 下一步

建议 M7-E-C 进入 Git commit foundation：

```txt
- Source Control 增加 commit message 输入。
- 支持 commit staged changes。
- 空 message / 无 staged changes 明确禁用或提示。
- commit 成功后刷新 Git status/decorations/Output。
- 继续不做 push/pull/branch/hunk stage/Debug。
```
