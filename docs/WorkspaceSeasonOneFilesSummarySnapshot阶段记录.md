# Workspace Season One Files Summary Snapshot 阶段记录

日期：2026-06-29

## 目的

Season One 已经能读取旧 Workspace session。为了继续接真实 Workspace 状态，本阶段把 `useWorkspaceSeasonOneLiveModel()` 接入已有 `useFilesSummaryQuery()`，让 Season One 优先用真实 files summary roots 校准 `rootLabel`，同时保留 stored session 和 demo fallback。

## 改动

- `useWorkspaceSeasonOneLiveModel()` 调用 `useFilesSummaryQuery()`。
- 新增 `createWorkspaceSeasonOneFilesSummarySnapshot(summary, baseSnapshot)`。
- 新增 root 选择规则：
  1. base/session rootLabel 对应的 root；
  2. files summary `defaultRootId`；
  3. `preferred` root；
  4. 第一个 root。
- 如果 files summary 尚未加载，则继续使用 stored session；如果 stored session 也没有，则 fallback demo。
- 不修改当前并发中的 `WorkspaceWorkbench` 或 `apps/web/src/lib/query/files.ts`。

## 验收

- 纯 TS 测试覆盖 preferred/session root、default root、summary 缺失 fallback。
- 结构测试确认 hook 使用 `useFilesSummaryQuery()`、`FilesSummaryPayload` 和 `createWorkspaceSeasonOneFilesSummarySnapshot()`。
- 浏览器 smoke 继续验证 `/workspace/season-one` desktop/tablet/phone 渲染。

## 下一步

继续把 source snapshot 接入更多真实状态：active editor path、evidence basket、terminal/test 状态、agent handoff 状态。
