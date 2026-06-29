# Workspace Season One Evidence Snapshot 阶段记录

日期：2026-06-29

## 目的

Season One 已经接入 files summary root 与旧 Workspace session。本阶段继续接入真实证据闭环：读取已有 `WorkspaceEvidenceBasket` 的 localStorage key，把合法 evidence record 数量写入 `WorkspaceSeasonOneSourceSnapshot.evidenceItems`，并同步 agent 状态为 `waiting-review` 或 `idle`。

## 改动

- `useWorkspaceSeasonOneLiveModel()` 新增 evidence snapshot：
  - 读取 `WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY`；
  - 合法记录使用与 `WorkspaceEvidenceBasket.isWorkspaceEvidenceRecord` 同等字段校验；
  - `evidenceItems > 0` 时 `agentState: "waiting-review"`；
  - 无 storage、非法 JSON 返回 `null`；
  - 空数组返回 `evidenceItems: 0`。
- 新增 `mergeWorkspaceSeasonOneSourceSnapshots(base, override)`：
  - evidence snapshot 可覆盖 evidence/agent 状态；
  - 保留 base 的 activePath/openFiles 等任务上下文。

## 为什么这是关键

用户要求的是 AI 编程/写作工作区，而不是普通 IDE。证据闭环是顶级 AI workspace 的核心。这个阶段让 Season One 不再只显示 demo evidence 数字，而能从现有 Workspace evidence basket 读取真实审批证据状态。

## 验收

- 纯 TS 测试覆盖合法 evidence record 计数、无效记录过滤、空 basket、非法 JSON、snapshot merge。
- 结构测试确认 hook 使用 evidence basket storage key 和 evidence record 校验。
- 浏览器 smoke 继续验证 desktop/tablet/phone Season One 路由。
