# Workspace Season One Source Snapshot 阶段记录

日期：2026-06-29

## 目的

`useWorkspaceSeasonOneLiveModel()` 已经从页面中抽出，但内部仍是直接 demo adapter input。为了接真实 Workspace hooks，必须先定义“真实状态快照 → adapter input”的转换层。本阶段新增 `WorkspaceSeasonOneSourceSnapshot` 和 `createWorkspaceSeasonOneAdapterInputFromSnapshot()`。

## 新边界

- `WorkspaceSeasonOneSourceSnapshot`：未来 root/files/git/evidence/terminal/agent hooks 的聚合快照。
- `createWorkspaceSeasonOneAdapterInputFromSnapshot(snapshot)`：把快照标准化为 `WorkspaceSeasonOneLiveAdapterInput`。
- `createWorkspaceSeasonOneDemoSourceSnapshot()`：当前 demo 数据源，显式模拟未来真实 hooks 输出。

## 转换规则

- `activePath` 自动 trim，并置于 `openFiles` 第一位。
- 空 open file 会被过滤。
- 如果没有 activePath，则使用第一个 open file 作为 activePath。
- `gitChanges` / `evidenceItems` 会 floor 并限制为非负。
- `terminalState` 默认 `idle`。
- `agentState` 默认 `idle`。
- demo snapshot 每次复制 openFiles，避免共享可变数组。

## 为什么这是推翻式重构的一步

生产 `/workspace` 最终不能把旧 Workbench 的状态和布局耦合直接搬进 Season One。这个 snapshot 层让我们可以先聚合真实状态，再通过 adapter 生成产品模型，保持新 shell 的边界干净、可测试、可替换。

## 下一步

把 `WorkspaceSeasonOneSourceSnapshot` 的字段分别接到真实 Workspace hooks：root/files、active editor path、Git changes、evidence basket、terminal/test 状态、agent handoff 状态。
