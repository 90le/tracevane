# M6 Watcher / Search / Diff / Problems / Output 总体验收

## 状态

M6 已完成。M6 的目标是补齐 IDE Workbench 在真实编辑器基础上的工程可用性基础：文件外部变更感知、全局搜索、保存冲突对比、Problems 结构化问题列表和 Output channel/log。M6 不接 LSP、Git、Debug，也不追完整 VS Code 行为。

## 已完成范围

### M6-A：研究与切片计划

- 探查现有 Files search/content-index、IDE Workbench panel placeholder、editor dirty/save/path sync 和缺失 watcher/event bus。
- 确定 M6-B watcher、M6-C search、M6-D diff/conflict、M6-E problems/output、M6-F 验收文档的切片顺序。
- 记录：[`m6-a-watcher-search-problems-output-plan.md`](./m6-a-watcher-search-problems-output-plan.md)。

### M6-B：Watcher Foundation

- 新增 Files watch snapshot contract，复用 Files root/path guard。
- 新增 Workbench file event bus，当前使用 bounded polling fallback。
- created/changed/deleted 事件可刷新当前 Explorer browse query。
- opened editor tab 可标记外部 changed/deleted。
- dirty 文件被外部删除时保留 Monaco panel，不静默关闭或覆盖内容。
- 验证：`smoke:ide:watcher-foundation`。
- 记录：[`m6-b-watcher-foundation-summary.md`](./m6-b-watcher-foundation-summary.md)。

### M6-C：Search Foundation

- Search ActivityBar item 从 placeholder 升级为可用 Search View。
- Search View 支持 query、scope、case sensitive、regex、hidden、recursive。
- 复用现有 `/api/files/search` 与 `useFilesSearchQuery`，不新增第二套搜索 API。
- 结果列表可点击打开 IDE Editor tab；目录结果切换 Explorer 当前目录。
- 验证：`smoke:ide:search-foundation`。
- 记录：[`m6-c-search-foundation-summary.md`](./m6-c-search-foundation-summary.md)。

### M6-D：Diff / Conflict Flow

- shared/editor-core save 请求携带 `expectedModifiedAt` / `expectedSize` / `force`。
- 新增 shared/diff MonacoDiffPanel，IDE 冲突对比使用 Monaco DiffEditor。
- save 409 `file_write_conflict` 会读取磁盘当前版本并进入 compare / reload / overwrite / cancel。
- watcher changed + dirty 复用同一冲突对比入口。
- deleted + dirty 不进入 overwrite，继续保留 Monaco 内容并提示后续恢复/另存边界。
- 验证：`smoke:ide:editor-conflict-diff`。
- 记录：[`m6-d-editor-conflict-diff-summary.md`](./m6-d-editor-conflict-diff-summary.md)。

### M6-E：Problems / Output Foundation

- 新增 WorkbenchProblem 数据模型和本地 store，支持 severity/source/path/range/code/createdAt。
- Problems Panel 支持结构化列表、severity 计数、清空和点击打开文件并 reveal 行列。
- 新增 WorkbenchOutput channel/event 数据模型和本地 store，支持 channel select、append、clear、scroll lock。
- Output Panel 支持 System/Watcher/自定义 channel 和基础 log 查看。
- watcher 文件事件写入 Output；deleted 事件写入 warning Problem。
- 验证：`smoke:ide:problems-output`。
- 记录：[`m6-e-problems-output-foundation-summary.md`](./m6-e-problems-output-foundation-summary.md)。

## M6 边界

M6 已完成的是 foundation，不是完整 IDE 协议层。

M6 明确没有做：

- LSP Gateway 或真实 LSP diagnostics。
- Git status / diff / stage / commit。
- Debug Adapter Protocol / Debug Console runtime。
- 真实 task runner 输出接入。
- Search Replace / Replace All。
- watcher recursive/native provider 或可靠 rename oldPath/newPath 推断。
- 三方 merge 或自动冲突解决。
- Problems 完整分组/筛选全集。
- Output 大日志持久化到 layout/localStorage。
- 完整 VS Code Search / Problems / Output 行为。

## 架构口径

- Watcher、Search、Diff、Problems、Output 都复用已有 Files API、editor-core、Workbench shell 和 Aurora token。
- Problems 在 M6 是结构化问题面板，不等于 LSP diagnostics；M7 的 LSP diagnostics 应作为 producer 写入现有 Problems store。
- Output 在 M6 是 channel/log 基础；后续 task/LSP/Git/debug producer 应追加到现有 Output store，不应新建平行日志面板。
- Monaco model 仍是文件内容和编辑状态的所有者；React state 只保存 metadata、view state、problem/output snapshot。
- Dockview 仍只负责 editor panel/layout，不拥有文件 IO、save/conflict 或 Problems/Output 数据。

## 验收证据

M6-F 是 docs-only 收口。本阶段最终验证口径：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:editor-conflict-diff
npm run smoke:ide:watcher-foundation
npm run smoke:ide:terminal-foundation
npm run smoke:ide:terminal-split-layout
npm run smoke:ide:terminal-panel-placement
git diff --check
```

M6-F 实际只修改文档，因此执行 `git diff --check` 和 touched Markdown 相对链接检查作为本次直接验证；M6-B 到 M6-E 的功能验证记录见各阶段 summary。

## 下一阶段入口：M7-A

下一步建议进入 M7-A：LSP / Git / Debug 研究与最小实现计划。

M7-A 应先做：

- 探查当前后端 server/module 结构和可复用 workspace/root guard。
- 探查前端 Workbench Problems/Output/editor reveal/Search/Watcher 接入点。
- 研究 LSP、Git、Debug 的最小协议和依赖边界。
- 给出分段实现路线：M7.1 单语言 LSP diagnostics、M7.2 Git status/diff、M7.3 Git 基础操作、M7.x Debug。

M7-A 不应直接实现完整 LSP/Git/Debug，也不应新建平行 Problems/Output 面板。
