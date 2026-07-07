# M7.z-E Git Remote Operations Foundation Hardening Summary

## 阶段状态

M7.z-E 已完成：Git remote operations foundation hardening。

本阶段把 M7.z-D 规划中的 Git remote 基础从“已有 pull/push/sync/publish 表面 + 计划”推进到“可验证的最小 Source Control 远端操作闭环”。实现仍复用现有 Git service、HTTP routes 和前端 Git API，不新增第二套 Git API。

## 完成内容

### 后端 Git service / route

- 在 `apps/api/modules/git/service.ts` 的既有 `GitService` 上增加 `fetch()`。
- `fetch()` 复用既有：
  - `resolveRepositoryRoot()` workspace/root guard。
  - `buildRemoteArgs()` remote/branch 校验。
  - `buildStatus()` 状态刷新。
- 新增 `POST /api/git/fetch`，返回刷新后的 `GitStatusPayload`。

### 前端 Git client

- 在 `apps/web/src/lib/api/git.ts` 增加 `fetchBranch()`。
- 继续复用既有 `GitRemoteActionParams`，保持 pull/push/sync/publish 同一参数语义。

### Source Control View

- 在 Source Control summary 下方增加远端操作入口：
  - Fetch：始终可见，刷新 remote tracking refs。
  - Pull：仅 behind > 0 时显示，执行 `git pull --ff-only`。
  - Push：有 upstream 且 ahead > 0 时显示。
  - Publish：无 upstream 且当前分支不是 HEAD 时显示。
  - Sync：ahead/behind 同时存在时显示，先 pull --ff-only 再 push。
- Pull / Push / Publish / Sync 均有显式确认；Fetch 不需要确认。
- 操作结果写入 Workbench Output 的 Git channel，并通过 toast 反馈。

### Smoke 验证

- 新增 `tests/ide-workbench/ide-git-remote-foundation.smoke.mjs`。
- 新增 `npm run smoke:ide:git-remote-foundation`。
- 覆盖：
  - fixture repo + bare remote + remote/local divergence。
  - `POST /api/git/fetch` 能把 behind 更新为 1。
  - Source Control View 显示 branch/upstream/ahead/behind。
  - Fetch / Pull / Push / Sync 按钮按状态出现。
  - Fetch 按钮可点击且不白屏。

## 明确没有做

本阶段不做：

- force push。
- merge / rebase 自动化。
- branch checkout/create/delete/rename UI。
- stash UI。
- Git graph / blame。
- credential manager / remote account UI。
- hunk stage / partial stage。
- 完整 VS Code Source Control 行为。
- Debug / LSP mutation 实现。

## 验证记录

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `TRACEVANE_WEB_PORT=5186 npm run smoke:ide:git-remote-foundation`

说明：本地 5176 被常驻 dev frontend 占用且该前端连接旧 3761 API，因此本阶段 smoke 使用独立 5186 端口验证当前源码内嵌 API，避免命中旧服务。

## 下一步入口

下一阶段建议进入 M7.z-F：LSP WorkspaceEdit preview/apply foundation。

目标是承接 M7.z-C 的 rename / formatting / code actions 计划，先建立 WorkspaceEdit 的预览、root guard、dirty/conflict 和 apply 边界，再逐步接入具体 LSP mutation 能力。
