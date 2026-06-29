# Workspace Season One Preview Route 阶段记录

日期：2026-06-29

## 目标

第一季新前端框架必须能被真实打开验证。本阶段将 `WorkspaceSeasonOnePreviewPage` 挂到显式实验路由 `/workspace/season-one`，让设计、产品和工程可以在浏览器中审查新 frame，而不是继续在旧 Workbench 上猜测。

## 完成范围

- 在 `AppRouter` 中懒加载 `WorkspaceSeasonOnePreviewPage`。
- 新增 full-bleed route：`/workspace/season-one`。
- route 放在 `/workspace` 之前，避免未来路由匹配或重构时被基础 workspace route 抢占。
- 保持现有 `/workspace` 不变；不替换 `WorkspaceWorkbench`。

## 验证

```bash
node --test tests/system/workspace-season-one-preview-route.test.mjs tests/system/workspace-season-one-preview-page.test.mjs
npx tsc --noEmit --pretty false -p /tmp/tracevane-workspace-season-one-preview-route.tsconfig.json
git diff --check -- apps/web/src/app/router.tsx tests/system/workspace-season-one-preview-route.test.mjs docs/WorkspaceSeasonOnePreviewRoute阶段记录.md
```
