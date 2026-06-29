# Workspace Season One Live Adapter 阶段记录

日期：2026-06-29

## 目的

Season One 已经有产品模型，但要真正替换旧 Workspace，必须能从真实工作区状态生成这个模型。本阶段新增纯函数 live adapter，先把生产接入点明确下来，避免继续把旧 Workbench 的耦合逻辑搬进新 shell。

## 新增文件

- `apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter.ts`
- `tests/workspace/workspace-season-one-live-adapter.test.ts`
- `tests/system/workspace-season-one-live-adapter-contract.test.mjs`

## Adapter 输入

`WorkspaceSeasonOneLiveAdapterInput` 当前覆盖：

- `rootLabel`
- `activePath`
- `openFiles`
- `gitChanges`
- `evidenceItems`
- `terminalState`
- `agentState`
- `lastRunLabel`
- `viewportCoverage`

这些字段对应第一季要接入的真实工作区状态：文件/写作 artifact、Git review scope、证据审批、terminal/test 运行状态、AI handoff 状态和响应式验收。

## 输出效果

`createWorkspaceSeasonOneLiveModel()` 生成完整 `WorkspaceSeasonOneProductModel`：

- 更新资源地图为真实打开文件、Git 状态、证据状态、terminal 状态和 AI handoff 状态。
- 更新 AI partner 的 badge、上下文和值守下一步。
- 更新主画布 focused file、写作说明和代码示例。
- 无证据时显示 `Evidence required`，失败运行时显示 `run failed`。
- 保持预览模型作为 fallback，不触碰旧 Workbench。

## 下一步

在不破坏并发修改的前提下，把 `/workspace/season-one` 页面接入一个 live model demo；随后再从真实 Workspace hooks 生成 adapter input，逐步替换生产 `/workspace`。
