# Workspace Season One Preview Page 阶段记录

日期：2026-06-29

## 目标

第一季新 frame preview 已经存在于 shared 层，但要真正推进“推翻旧前端框架”，还需要页面级接入层。这个阶段新增未挂路由的 `WorkspaceSeasonOnePreviewPage`，为后续安全挂载实验路由或替换旧 Workbench 做准备。

## 完成范围

- 新增 `apps/web/src/features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx`。
- 页面设置独立 document title：`Workspace Season One Preview · Tracevane`。
- 页面使用 `h-dvh min-h-0 min-w-0 overflow-hidden`，避免旧页面 padding/scroll 框架干扰。
- 页面直接渲染 `WorkspaceSeasonOneFramePreview`。
- 新增 `season-one/index.ts` 作为未来路由懒加载入口。
- 本阶段不修改 `router.tsx`、`WorkspaceWorkbench.tsx` 或 `WorkspaceEditorStage.tsx`，避免覆盖当前并发改动。

## 验证

```bash
node --test tests/system/workspace-season-one-preview-page.test.mjs tests/system/workspace-season-one-frame-preview.test.mjs
npx tsc --noEmit --pretty false -p /tmp/tracevane-workspace-season-one-preview-page.tsconfig.json
git diff --check -- apps/web/src/features/workspace/season-one/WorkspaceSeasonOnePreviewPage.tsx apps/web/src/features/workspace/season-one/index.ts tests/system/workspace-season-one-preview-page.test.mjs docs/WorkspaceSeasonOnePreviewPage阶段记录.md
```
