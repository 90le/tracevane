# Workspace Season One Live Route 阶段记录

日期：2026-06-29

## 目的

上一阶段新增了 `createWorkspaceSeasonOneLiveModel()`，但 `/workspace/season-one` 仍然只渲染默认 preview fallback。本阶段把实验路由接到 live adapter demo，让浏览器中看到的 Season One 工作区已经由 adapter input 驱动，而不是硬编码预览。

## 改动

- `WorkspaceSeasonOnePreviewPage` 创建 `seasonOneLiveDemoModel`。
- route title 从 `Preview` 升级为 `Workspace Season One Live · Tracevane`。
- 页面加 `data-workspace-season-one-live-page` 锚点。
- `WorkspaceSeasonOneFramePreview` 通过 `model={seasonOneLiveDemoModel}` 渲染。

## Live demo input

当前 demo 注入：

- root：`project-root`
- activePath：`docs/DESIGN.md`
- open files：DESIGN、live adapter、responsive smoke
- Git changes：4
- evidence items：3
- terminalState：`passed`
- agentState：`waiting-review`
- lastRunLabel：`Season One browser smoke`
- viewportCoverage：`desktop · tablet · phone live`

## 验收

- 结构测试确认 route 使用 live adapter，而不是 `<WorkspaceSeasonOneFramePreview />` fallback。
- 浏览器 smoke 确认真实路由渲染 live adapter 状态、focused path、evidence count、terminal run。

## 下一步

把 demo input 替换为真实 Workspace hooks：root/files/git/evidence/terminal/agent 状态，然后开始把生产 `/workspace` 切到 Season One frame。
