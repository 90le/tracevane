# Workspace Season One Stored Session Snapshot 阶段记录

日期：2026-06-29

## 目的

Season One 已经有 source snapshot 转换层。本阶段进一步把它接到旧 Workspace 已有的 `tracevane.workspace.session.v1` localStorage session，让 `/workspace/season-one` 可以优先读取真实持久化的 root/activePath/Git diff 线索；如果没有可用 session，再回退到 demo snapshot。

## 改动

- 新增 `createWorkspaceSeasonOneStoredSessionSnapshot(storage)`。
- 读取旧 Workbench 已有 key：`tracevane.workspace.session.v1`。
- 安全解析字段：
  - `rootId` → `rootLabel`
  - `activePath` → `activePath` / `openFiles[0]`
  - `gitDiffTarget` 合法时 → `gitChanges: 1`
- 无 storage、无 root/activePath、JSON 异常时返回 `null`。
- `useWorkspaceSeasonOneLiveModel()` 优先 stored snapshot；否则 fallback demo snapshot。
- `source` 现在能标识 `workspace-hooks` 或 `demo`。

## 为什么这是有效推进

这不是最终真实 hook 接入，但已经开始读取旧 Workspace 的真实持久化状态，并通过 Season One snapshot/adapter/model 边界进入新 shell。这样可以继续绕开并发修改中的 Workbench 文件，同时让 Season One 路由逐步从 demo 走向真实状态驱动。

## 验收

- TS 测试覆盖 session key、合法 session、非法 JSON、无有效字段、无 storage。
- 结构测试确认 hook 读取 `tracevane.workspace.session.v1`，并按 stored/demo 切换 source。
- 浏览器 smoke 继续验证 `/workspace/season-one` desktop/tablet/phone 渲染。
