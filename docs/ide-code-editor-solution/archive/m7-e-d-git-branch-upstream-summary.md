# M7-E-D Git Branch / Upstream Status Foundation 验收总结

## 完成状态

M7-E-D 已完成 Git branch / upstream status 的最小可见性闭环：IDE Workbench 现在会在 Source Control View 与全局 StatusBar 中展示当前分支、upstream、ahead/behind 和变更计数汇总。

## 已完成内容

```txt
- 复用既有 apps/api/modules/git service/routes 与 apps/web/src/lib/api/git getGitStatus，不新增第二套 Git API。
- 后端既有 Git status payload 的 branch / upstream / ahead / behind / branches 字段继续作为唯一数据源。
- Source Control summary 从单行 branch + change count 升级为 branch/upstream/tracking + staged/unstaged/untracked 计数。
- IDE 全局 StatusBar 新增 Git segment，显示 branch、upstream、ahead/behind 和 change count。
- 新增 smoke:ide:git-branch-upstream，通过临时本地 Git fixture 验证 upstream origin/main、ahead/behind=1/1，以及 staged/unstaged/untracked 汇总。
```

## 关键边界

```txt
- M7-E-D 只做 branch/upstream/status 可见性。
- 不做 push / pull / fetch / sync / publish。
- 不做 branch checkout / create / delete / rename。
- 不做 merge / rebase / stash / Git graph / blame。
- 不做 Debug Adapter Protocol。
- Git 状态仍是 volatile workspace state，不写入 Dockview/editor layout persistence。
```

## 复用关系

```txt
- Source Control 与 StatusBar 继续复用 M7-D 的 useIdeGitStatus。
- 变更计数基于既有 GitFileChange staged/unstaged/kind，不新增前端 Git 解析器。
- smoke fixture 使用真实 git CLI 构造 upstream/ahead/behind，验证现有 API 与 UI 显示链路。
```

## 验收

```txt
- npm run typecheck:web -- --pretty false
- npm run typecheck -- --pretty false
- TRACEVANE_WEB_PORT=5192 npm run smoke:ide:git-branch-upstream
- TRACEVANE_WEB_PORT=5192 npm run smoke:ide:git-status
- git diff --check
- Markdown relative links OK for touched docs
```

## 下一步

建议进入 M7 Git acceptance closeout，更新 Git 子阶段总体验收口径；随后进入 M7-F Debug Adapter Protocol 研究与最小实现计划。
