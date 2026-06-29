# Workspace Evidence Review Density 阶段记录

日期：2026-06-29

## 研究先行记录

- VS Code Views / Sidebars UX Guidelines（https://code.visualstudio.com/api/ux-guidelines/views 与 https://code.visualstudio.com/api/ux-guidelines/sidebars）：同一工作对象应通过清晰命名和少量可复用 view 形态承载，避免重复创建多个类似视图。结论：Evidence Review 应通过 density 变体适配右栏、移动 sheet、完整 cockpit，而不是复制不同组件。
- VS Code Accessibility（https://code.visualstudio.com/docs/configure/accessibility/accessibility）：状态变化、键盘操作和读屏反馈必须清晰可感知。结论：Evidence live surface 需要 `aria-live="polite"`，复制/刷新/清空状态应能被辅助技术感知。
- OpenAI Canvas（https://openai.com/index/introducing-canvas/）：写作和代码协作界面强调上下文理解、用户控制、inline feedback 与可审查输出。结论：Evidence Review 的 compact/comfortable 变体仍必须保持 read-only guardrail，不自动执行编辑。

## 完成范围

- `WorkspaceEvidenceReviewPanel` 新增 `WorkspaceEvidenceReviewDensity = "comfortable" | "compact"`。
- comfortable 保留完整双栏 cockpit；compact 切为单栏、收紧 padding、限制 records 区高度并滚动，适配右栏、平板窄窗和移动 sheet。
- `WorkspaceEvidenceReviewSurface` 接收并透传 `density`，增加 `aria-live="polite"` 和 `data-workspace-evidence-review-density`。
- `WorkspaceEvidenceMobileSheet` 默认使用 `density="compact"`，避免手机/窄窗中出现过重的桌面布局。
- 更新结构测试覆盖 density、aria-live、compact record scroller 和 mobile sheet 默认 compact。

## 验证

```bash
node --test tests/system/workspace-evidence-review-surface.test.mjs tests/system/workspace-evidence-review-panel.test.mjs tests/system/workspace-evidence-mobile-sheet.test.mjs
npx tsc --noEmit --pretty false -p /tmp/tracevane-workspace-evidence-density.tsconfig.json
git diff --check -- apps/web/src/features/workspace/shared/WorkspaceEvidenceReviewSurface.tsx apps/web/src/features/workspace/shared/WorkspaceEvidenceReviewPanel.tsx apps/web/src/features/workspace/shared/WorkspaceEvidenceMobileSheet.tsx tests/system/workspace-evidence-review-surface.test.mjs tests/system/workspace-evidence-review-panel.test.mjs tests/system/workspace-evidence-mobile-sheet.test.mjs docs/WorkspaceEvidenceReviewDensity阶段记录.md
```
