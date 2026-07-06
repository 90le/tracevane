# M7-D Git Status + Explorer Decoration + Source Control View 验收总结

## 完成状态

M7-D 已完成 Git status 最小可见性闭环：IDE Workbench 现在可以通过既有 Git API 读取当前工作区 Git 状态，并在 Source Control View、Explorer、Editor tab 中展示文件变更 decoration。

## 已完成内容

```txt
- 复用既有 apps/api/modules/git service/routes，不新增第二套 Git API。
- Git status 解析切换到 git status --porcelain=v1 -z -b，提升空格路径/rename 路径稳定性。
- Git root guard 对齐 Files service 的 openclaw-root 语义，IDE Explorer root-relative path 可直接用于 Git status。
- 新增 IDE Git status hook/decorations：把 repo-relative Git change 映射回 Files root-relative path。
- ActivityBar Source Control 从占位禁用变为可用最小视图。
- Source Control View 显示 branch、ahead/behind、变更文件列表、刷新和 empty/error state。
- Source Control 变更文件点击打开 IDE Editor tab（deleted 文件不强行打开）。
- Explorer 文件树显示 Git decoration，目录聚合显示轻量 dot。
- Editor tab 显示 Git decoration，并与 dirty 状态区分。
- 新增 smoke:ide:git-status。
```

## 关键边界

```txt
- M7-D 只做 Git status 可见性和打开文件闭环。
- 不做 stage / unstage / commit / push / pull / branch checkout。
- 不做 Git diff editor 或 Source Control 完整工作流。
- 不做 Git graph、stash UI、merge/rebase 或 conflict resolve。
- 不做 Debug Adapter Protocol。
```

## 复用关系

```txt
- 后端复用 apps/api/modules/git/service.ts 与 routes.ts。
- 前端复用 apps/web/src/lib/api/git.ts 的 getGitStatus。
- Explorer decoration 只在 IDE Explorer 壳层接入，不改造成通用 mode 大组件。
- Editor tab decoration 由 EditorDock 读取 volatile Git decoration map，不把 Git 状态写进持久化 editor tab metadata。
```

## 验收

```txt
- npm run typecheck:web -- --pretty false
- npm run typecheck -- --pretty false
- TRACEVANE_WEB_PORT=5189 npm run smoke:ide:git-status
- git diff --check
```

## 下一步

建议 M7-E 进入 Git diff / stage / unstage / commit：

```txt
- Source Control 中点击文件进入 Git diff/working tree preview。
- 支持 stage / unstage 单文件与全部。
- 支持 commit message + commit。
- 继续复用现有 Git API/query hooks，不新增第二套 Git API。
```
