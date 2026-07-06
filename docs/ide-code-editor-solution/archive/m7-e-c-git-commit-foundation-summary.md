# M7-E-C Git Commit Foundation 验收总结

## 完成状态

M7-E-C 已完成 Git commit 最小闭环：IDE Workbench Source Control 中现在可以输入提交信息，并对已暂存变更执行 commit。提交后继续复用既有 Git status 刷新链路，同步 Source Control、Explorer decoration 与 Editor tab decoration，并写入 Git Output channel。

## 已完成内容

```txt
- 复用既有 apps/api/modules/git service/routes，不新增第二套 Git API。
- 前端复用 apps/web/src/lib/api/git.ts 的 commitFiles。
- Source Control 增加 commit message 输入框。
- Source Control 增加 Commit staged changes 入口。
- commit 前校验 Git 仓库可用、存在 staged changes、message 非空。
- commit 成功后清空 message，刷新 M7-D Git status hook，驱动 Source Control list、Explorer decoration、Editor tab decoration 同步更新。
- commit 成功/失败信息写入 Git Output channel，并通过 toast 给出用户反馈。
- 新增 smoke:ide:git-commit，覆盖 untracked 文件 stage -> message -> commit -> status 清理 -> 最新 commit subject 校验，并在测试结束后 reset 生成的 smoke commit。
```

## 关键边界

```txt
- M7-E-C 只做 staged changes commit。
- 不做 commit all changes 自动暂存语义。
- 不做 push / pull / fetch / sync / publish。
- 不做 branch checkout / create / merge / rebase。
- 不做 hunk stage、partial stage、stash、Git graph、blame。
- 不做 Debug Adapter Protocol。
```

## 复用关系

```txt
- 后端继续复用 apps/api/modules/git/service.ts 的 commit。
- 前端继续复用 apps/web/src/lib/api/git.ts 的 commitFiles。
- Source Control 继续复用 M7-D git status/decorations、M7-E-A diff tab 与 M7-E-B stage/unstage。
- Git 状态仍是 volatile workspace state，不写入 Dockview/editor layout persistence。
```

## 验收

```txt
- Markdown relative links OK for touched docs
- npm run typecheck:web -- --pretty false
- npm run typecheck -- --pretty false
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-commit
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-stage
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-diff
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-status
- git diff --check
```

## 下一步

建议 M7-E-D 进入 Git branch / upstream status foundation 或先做 M7 Git acceptance closeout，取决于是否继续扩展 Git 面板：

```txt
- 如果继续 Git：Source Control / StatusBar 显示 branch、ahead/behind、基础 branch 切换只读/最小入口。
- 如果收口 M7 Git：更新文档，进入 M7-F Debug Adapter Protocol 研究与最小实现计划。
- 仍然不做 push/pull/merge/rebase/stash/Git graph，除非单独开 M7-E.x 阶段。
```
