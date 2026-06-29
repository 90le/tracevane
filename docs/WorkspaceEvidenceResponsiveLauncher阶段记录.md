# Workspace Evidence Responsive Launcher 阶段记录

日期：2026-06-29

## 研究先行记录

- VS Code Views UX Guidelines（https://code.visualstudio.com/api/ux-guidelines/views）：View 应以清晰命名、少量 action 和稳定入口承载相关任务，避免重复入口造成认知负担。结论：Evidence Review 需要一个 responsive launcher，而不是每个 shell 面各写一套入口。
- VS Code Sidebars UX Guidelines（https://code.visualstudio.com/api/ux-guidelines/sidebars）：相关 Views 应聚合在一个容器，并且不要创建过多 view container。结论：桌面/平板应复用 compact rail surface。
- VS Code Accessibility（https://code.visualstudio.com/docs/configure/accessibility/accessibility）：键盘、读屏和可见状态需要一致。结论：launcher 保留 `aria-label="Workspace evidence rail"` 和明确 data hooks，移动端入口继续复用 Radix Sheet trigger。

## 完成范围

- 新增 `WorkspaceEvidenceResponsiveLauncher.tsx`。
- 手机视口：显示 `WorkspaceEvidenceMobileSheet` trigger。
- `md` 及以上：显示 compact `WorkspaceEvidenceReviewSurface` rail。
- 统一透传 objective、initialRecords、copy callback 与 records callback。
- 更新 shared barrel export，后续 Workspace shell 只需要挂载这一个 launcher。

## 验证

```bash
node --test tests/system/workspace-evidence-responsive-launcher.test.mjs tests/system/workspace-evidence-mobile-sheet.test.mjs tests/system/workspace-evidence-review-surface.test.mjs
npx tsc --noEmit --pretty false -p /tmp/tracevane-workspace-evidence-responsive-launcher.tsconfig.json
git diff --check -- apps/web/src/features/workspace/shared/WorkspaceEvidenceResponsiveLauncher.tsx apps/web/src/features/workspace/shared/index.ts tests/system/workspace-evidence-responsive-launcher.test.mjs docs/WorkspaceEvidenceResponsiveLauncher阶段记录.md
```
