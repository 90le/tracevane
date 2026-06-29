# Workspace Season One Live Model Hook 阶段记录

日期：2026-06-29

## 目的

`/workspace/season-one` 已经接入 live adapter demo，但 demo input 仍在 page 组件里。为了继续向真实 Workspace 状态接入推进，本阶段抽出 `useWorkspaceSeasonOneLiveModel()`，让页面只消费 `model` 和 `source`，后续可以把 demo 输入替换为真实 hooks，而不改 Season One shell。

## 新增边界

- `apps/web/src/features/workspace/season-one/useWorkspaceSeasonOneLiveModel.ts`
  - `WorkspaceSeasonOneLiveModelState`
  - `useWorkspaceSeasonOneLiveModel()`
  - `createWorkspaceSeasonOneDemoAdapterInput()`

当前 `source` 明确为 `demo`，类型上预留 `workspace-hooks`，表示下一阶段切入真实 root/files/git/evidence/terminal/agent hooks 的位置。

## 页面变化

`WorkspaceSeasonOnePreviewPage` 不再直接创建 demo model：

- 调用 `useWorkspaceSeasonOneLiveModel()`；
- 把 `model` 传给 `WorkspaceSeasonOneFramePreview`；
- 输出 `data-workspace-season-one-live-source={source}`，便于浏览器 smoke 或后续 QA 判断数据来源。

## 验收

- 纯 TS 测试确认 demo adapter input 可生成 live model，且 openFiles 每次复制，避免共享可变数组。
- 结构测试确认 page 不再直接调用 `createWorkspaceSeasonOneLiveModel()`，而是通过 hook 获取 model。
- 原 live route 和跨视口 smoke 继续通过。

## 下一步

把 `useWorkspaceSeasonOneLiveModel()` 内部的 demo input 替换为真实 Workspace hooks：文件 root/activePath、Git changes、evidence basket、terminal/test 状态、agent handoff 状态。
