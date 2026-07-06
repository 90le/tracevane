# M7-E-A Git Diff Foundation 验收总结

## 完成状态

M7-E-A 已完成 Git diff 最小查看闭环：IDE Workbench Source Control 中的 Git 变更项现在可以打开到 Editor Dock 的只读 Git Diff tab，复用既有 Git API、Source Control 状态和 Monaco Diff 能力。

## 已完成内容

```txt
- 复用既有 apps/api/modules/git service/routes 与 apps/web/src/lib/api/git getGitDiff，不新增第二套 Git API。
- GET /api/git/diff 在保留 unified diff 的同时返回 originalContent / modifiedContent / originalPath / modifiedPath 等只读 diff viewer 所需数据。
- Git diff 继续使用 repository root guard 与 repo-relative path 归一化，避免路径逃逸。
- 支持 untracked / staged / working tree 的基础内容读取。
- Source Control 变更项点击打开 Git Diff tab，而不是直接编辑文件。
- Editor Dock 新增 mode=git-diff tab，使用 MonacoDiffPanel 显示只读差异。
- Git Diff tab 不参与保存/dirty，不执行 stage/commit，只作为查看面板。
- Git diff 生命周期写入 Git Output channel。
- 新增 smoke:ide:git-diff。
```

## 关键边界

```txt
- M7-E-A 只做 Git diff 查看。
- 不做 stage / unstage / commit / push / pull / branch checkout。
- 不做 hunk stage、partial stage、stash、Git graph、blame、merge/rebase。
- 不做 Debug Adapter Protocol。
- Dockview 仍只承载布局/tab shell，不拥有 Git/File IO。
```

## 复用关系

```txt
- 后端继续复用 apps/api/modules/git/service.ts 与 routes.ts。
- 前端继续复用 apps/web/src/lib/api/git.ts 的 getGitDiff。
- Diff UI 复用 shared/diff/MonacoDiffPanel，不另写 Monaco diff 实现。
- Source Control 复用 M7-D 的 git status hook/decorations 与 Output channel。
```

## 验收

```txt
- npm run typecheck:web -- --pretty false
- npm run typecheck -- --pretty false
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-diff
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-status
- git diff --check
```

## 下一步

建议 M7-E-B 进入 stage / unstage foundation：

```txt
- Source Control 支持 stage / unstage 单文件与全部。
- 操作后刷新 Git status、Explorer/Editor decorations 和 Output channel。
- 继续不做 commit/push/pull/branch/hunk stage。
```
