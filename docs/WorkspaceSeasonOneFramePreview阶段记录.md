# Workspace Season One Frame Preview 阶段记录

日期：2026-06-29

## 目标

第一季重构不能停留在文字总纲。这个阶段新增未挂载的 `WorkspaceSeasonOneFramePreview`，用真实 React slots 展示新的产品骨架：全局 topbar、activity rail、resources、primary stage、context/evidence rail、bottom run panel、status bar、mobile task switcher。

## 设计取向

- 主舞台优先，不让文件树和终端压过写作/代码任务。
- Evidence / AI handoff 成为右侧上下文，不再是随机悬浮按钮。
- 终端与测试进入 bottom run panel，不默认吞掉主舞台。
- 手机使用 bottom task switcher，而不是缩小桌面三栏。

## 完成范围

- 新增 `WorkspaceSeasonOneFramePreview.tsx`。
- 复用 `WorkspaceSeasonOneFrame` 和 `WorkspaceEvidenceResponsiveLauncher`。
- 提供 Season One topbar、activity rail、resources、primary stage、context rail、bottom panel、status bar、mobile switcher 的真实 JSX 样板。
- 更新 shared barrel export。
- 新增结构测试锁定 preview 不是空壳。

## 验证

```bash
node --test tests/system/workspace-season-one-frame-preview.test.mjs tests/system/workspace-season-one-redesign.test.mjs
npx tsc --noEmit --pretty false -p /tmp/tracevane-workspace-season-one-preview.tsconfig.json
git diff --check -- apps/web/src/features/workspace/shared/WorkspaceSeasonOneFramePreview.tsx apps/web/src/features/workspace/shared/index.ts tests/system/workspace-season-one-frame-preview.test.mjs docs/WorkspaceSeasonOneFramePreview阶段记录.md
```
