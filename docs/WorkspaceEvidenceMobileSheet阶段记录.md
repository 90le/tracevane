# Workspace Evidence Mobile Sheet 阶段记录

日期：2026-06-29

## 研究先行记录

- VS Code Sidebars UX Guidelines（https://code.visualstudio.com/api/ux-guidelines/sidebars）：相关 Views 与内容应聚合在一起，View Container 与 View 使用清晰名称，避免过多容器和视图。结论：Evidence Review 应作为一个明确入口复用，而不是散落成多个按钮。
- VS Code Accessibility（https://code.visualstudio.com/docs/configure/accessibility/accessibility）：编辑器需要支持键盘-only、读屏、高对比与可见状态。结论：移动/窄屏入口必须使用 Radix Sheet/Dialog 语义、明确标题/描述、aria-label 与可聚焦 trigger。
- OpenAI Canvas（https://openai.com/index/introducing-canvas/）：写作与代码协作需要独立协作界面、上下文理解、用户控制和可审查输出。结论：Evidence sheet 只承载 review/handoff，不自动执行编辑或覆盖文档。

## 完成范围

- 新增 `WorkspaceEvidenceMobileSheet.tsx`：提供可复用 trigger + sheet，内部挂载 `WorkspaceEvidenceReviewSurface`。
- Sheet 宽度使用 `w-[min(720px,96vw)]` 与 `sm:w-[min(760px,94vw)]`，服务手机、平板和窄窗口。
- 使用 `SheetTitle` / `SheetDescription` / trigger `aria-label`，保留可访问语义。
- 更新 workspace shared barrel export，后续 Workbench 右栏、移动浮动按钮或 tablet drawer 可直接挂载。
- 本阶段未触碰当前有协作者改动的 `AppShell`、`WorkspaceWorkbench`、file-manager 或主 goal 文档。

## 验证

```bash
node --test tests/system/workspace-evidence-mobile-sheet.test.mjs tests/system/workspace-evidence-review-surface.test.mjs tests/system/workspace-evidence-review-panel.test.mjs
(cd apps/web && npx tsc --noEmit --pretty false -p tsconfig.workspace-evidence-mobile-sheet.tmp.json)
git diff --check -- apps/web/src/features/workspace/shared/WorkspaceEvidenceMobileSheet.tsx apps/web/src/features/workspace/shared/index.ts tests/system/workspace-evidence-mobile-sheet.test.mjs docs/WorkspaceEvidenceMobileSheet阶段记录.md
```

## 后续接入建议

- 桌面：将 `WorkspaceEvidenceReviewSurface` 放入 Workspace secondary rail 或 evidence tab。
- 手机/平板：将 `WorkspaceEvidenceMobileSheet` 挂到 Workbench 顶栏或底部 floating action cluster。
- 接入前先等待当前 AppShell / Workbench / file-manager 并发修改收敛，避免覆盖他人工作。
