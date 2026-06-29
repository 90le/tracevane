# Workspace Season One Default Entry 阶段记录

日期：2026-06-29

## 本阶段目标

把“第一季推翻式重构”从隐藏候选路线推进到默认 Workspace 入口：用户访问 `#/workspace` 时不再进入旧 `WorkspaceWorkbench`，而是进入 Season One replacement shell。

## 修改策略

- 不修改当前已有他人脏改动的 `router.tsx`、`AppShell.tsx`、`navigation.ts`。
- 只修改当前干净的 `apps/web/src/features/workspace/WorkspacePage.tsx`，让既有 `/workspace` route 继续指向 `WorkspacePage`，但页面内部渲染 `WorkspaceSeasonOnePreviewPage`。
- 保留独立 `#/workspace/season-one` 候选入口，方便对照和回滚。

## 用户可见变化

默认工作区入口现在显示 Season One 新框架：

- Rebuild Studio
- Legacy shell replacement
- Command Deck
- Task context map
- Primary Stage
- AI Work Partner
- Evidence rail
- Run panel
- desktop / tablet / phone manifest

这一步解决了“重构很久但默认 IDE 看不出变化”的核心问题。

## 验收

- `tests/system/workspace-season-one-default-entry.test.mjs`：锁定 `WorkspacePage` 不再渲染旧 `WorkspaceWorkbench`。
- `tests/workspace/workspace-season-one-default-entry.smoke.mjs`：真实 Chromium 访问 `#/workspace`，验证看到 Season One replacement shell。
- `tests/workspace/workspace-season-one-responsive.smoke.mjs`：继续验证独立 Season One route 的桌面/平板/手机布局。

## 后续

下一阶段要把旧 Workbench 的真实编辑、文件、终端、Git、证据操作逐步迁移为 Season One slot/adapters，而不是回到旧壳上继续补丁式修复。
