# M6-E Problems / Output Foundation Summary

M6-E 已完成 IDE Workbench Problems / Output 的最小数据基础和面板 UI。该阶段只建立承载面，不接 LSP、Git、Debug 或真实任务系统。

## 完成内容

- 新增 `WorkbenchProblem` 数据模型与本地 store：
  - `severity`: `error | warning | info | hint`
  - `source`: `search | task | custom | watcher | lsp-placeholder`
  - 支持 `rootId`、`path`、range、code、createdAt。
- 新增 Problems Panel：
  - severity 计数。
  - 结构化列表。
  - 清空。
  - 点击带 path 的 problem 会打开 IDE Editor tab，并 reveal line/column。
- 新增 `WorkbenchOutputChannel` / `WorkbenchOutputEvent` 数据模型与本地 store。
- 新增 Output Panel：
  - channel select。
  - append log event。
  - clear 当前 channel。
  - auto-scroll / scroll-lock。
- Workbench watcher 事件接入最小生产者：
  - 文件事件写入 `Watcher` Output channel。
  - deleted 事件写入 warning Problem。
- 新增 `smoke:ide:problems-output` 覆盖 Problems 渲染、点击打开文件、Output channel/log、clear。

## 变更文件

- `apps/web/src/features/ide-workbench/problems/`
- `apps/web/src/features/ide-workbench/output/`
- `apps/web/src/features/ide-workbench/IdeWorkbenchPage.tsx`
- `apps/web/src/features/ide-workbench/types.ts`
- `apps/web/src/features/ide-workbench/editor/IdeEditorFilePanel.tsx`
- `tests/ide-workbench/ide-problems-output.smoke.mjs`
- `package.json`

## 保留边界

M6-E 不做：

- LSP diagnostics。
- Git status/diff/problems。
- Debug Console runtime。
- 真实 task runner 输出。
- Output 大日志持久化。
- Problems 完整分组、复杂筛选、快速修复。
- 完整 VS Code Problems / Output 行为。

## 下一步

推荐进入 M6-F：M6 watcher/search/diff/problems/output 总体验收与文档收口，然后再进入 M7 LSP / Git / Debug。

## 验证

- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:problems-output`
