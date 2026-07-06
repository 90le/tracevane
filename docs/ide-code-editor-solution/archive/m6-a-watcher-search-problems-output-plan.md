# M6-A：Watcher / Search / Problems / Output 研究与最小实现计划

## 目标

M6-A 只做实现前研究、边界和切片计划，不实现 M6-B+ 运行时代码。

M6 的目标是在 M5.y 已完成真实 IDE Editor Foundation 后，为 Workbench 增加工程可用性基础：

- 文件 watcher / 外部变更事件。
- 全局搜索与结果跳转。
- 保存冲突和 Diff/Compare 流程。
- Problems 数据模型与 Panel 渲染基础。
- Output channel/log 数据模型与 Panel 渲染基础。

M6 仍不做 LSP / Git / Debug。Problems 可以先承载结构化问题数据，真实 LSP diagnostics 到 M7 接入。

## 本地现状探查

### 已有能力

- Files API 已有 `GET /api/files/search`：参数包含 `rootId`、`path`、`q`、`recursive`、`hidden`、`caseSensitive`、`regex`、`limit`。
- Files API 已有 content-index 系列接口：
  - `GET /api/files/content-index`
  - `GET /api/files/content-index/records`
  - `POST /api/files/content-index/scan`
  - `POST /api/files/content-index/clean`
  - `POST /api/files/content-index/rebuild`
  - `POST /api/files/content-index/rebuild-jobs`
  - `GET /api/files/content-index/rebuild-jobs`
- `apps/api/modules/files/service.ts` 已有 content-index SQLite/FTS 基础、search fallback、path/root guard、read/write/version、409 `file_write_conflict`。
- IDE Workbench 已有：
  - `/ide` / `/ide/:workspaceId`。
  - `features/ide-workbench` Workbench shell。
  - `EditorDock` + Dockview + 真实 Monaco file panel。
  - `IdeEditorFilePanel` dirty/save/deleted/unsupported 处理。
  - `layoutState` 持久化和 reset layout 只重置布局。
  - Panel tabs：Terminal / Problems / Output / Debug Console。
- Terminal tab 已真实接入；Problems / Output / Debug Console 仍是 placeholder。
- `shared/editor-core` 已提供 file identity、model URI、language、read/save 类型。
- `shared/explorer-core` / `shared/explorer-ui` 已提供 Explorer path/tree/file-operation primitives。

### 缺口

- 没有 dedicated watcher module / SSE / WebSocket event stream。
- 没有 Workbench 文件事件总线，也没有把外部 changed/deleted/renamed 映射到 opened editor tabs 的统一入口。
- 没有 Monaco DiffEditor 的 IDE compare shell。
- 没有 Search Activity/View UI、结果模型、结果跳转到 Monaco range 的工作台入口。
- Problems / Output 只有占位 Panel，没有数据 store、过滤、点击跳转、channel 选择、主题 severity/token 适配。
- 当前保存冲突主要依赖 Files API 409，前端还缺完整 compare / reload / overwrite / cancel UX。

## M6 总体边界

### M6 做

- watcher 事件 contract 与最小后端事件流。
- Workbench 前端 file event bus / useWorkbenchFileEvents。
- Search Panel 或 Search Activity 的最小搜索结果列表和打开/跳转。
- Monaco DiffEditor wrapper，用于 compare disk/current model/version。
- Problems 数据模型和 Problems Panel 基础渲染。
- Output channel/log 数据模型和 Output Panel 基础渲染。
- dirty/conflict 安全：changed/deleted/renamed/save 409 都不能静默覆盖用户内容。

### M6 不做

- LSP Gateway。
- 真实 LSP diagnostics / completion / hover / definition。
- Git status/diff/stage/commit。
- Debug Adapter Protocol。
- Terminal editor-like tab 或完整 View Movement。
- 插件市场。
- 完整 VS Code watcher/search/problems/output 行为。

## 推荐切片

### M6-B：Watcher Foundation

后端建议新增或收拢到 `apps/api/modules/files` 下，避免第二套 Files root/path 规则：

```txt
apps/api/modules/files/watcher.ts 或 apps/api/modules/files/watch-service.ts
```

事件模型：

```ts
type FileWatchEvent =
  | { type: "created"; rootId: string; path: string; directoryPath: string; stat?: FileEntrySummary }
  | { type: "changed"; rootId: string; path: string; mtimeMs?: number; size?: number; hash?: string }
  | { type: "deleted"; rootId: string; path: string }
  | { type: "renamed"; rootId: string; oldPath: string; newPath: string; stat?: FileEntrySummary }
  | { type: "error"; rootId: string; message: string; path?: string };
```

实现建议：

- 优先使用 Node `fs.watch` / 有界 polling fallback；新依赖（如 chokidar）只有在确认 license、bundle/安装影响和跨平台稳定性后再引入。
- watch scope 必须经过 `resolveRoot` / `resolveTargetPath` / `isWithinRoot` 等 Files root guard 语义。
- 初版只 watch 当前 workspace/root 下用户打开的目录或 Explorer 当前目录，可按需扩展递归。
- rename 只有底层能可靠提供 oldPath/newPath 时发 `renamed`；否则发 deleted + created，不猜测。
- 事件 debounce/coalesce：同一路径短时间 changed 合并，避免保存时事件风暴。
- 前端建立 `useWorkbenchFileEvents`，统一把事件映射到：Explorer query refresh、opened editor tab 状态、dirty/conflict flow。

前端规则：

- `created`：刷新 parent directory query。
- `changed + clean opened tab`：提示/可自动 reload，并更新 metadata token。
- `changed + dirty opened tab`：进入 compare / overwrite / reload / cancel，不自动覆盖 Monaco model。
- `deleted + clean`：标记 deleted 或关闭，行为需一致且可解释。
- `deleted + dirty`：保留 Monaco model 内容并标记 deleted。
- `renamed`：复用 IDE Explorer 已有 path sync 规则，同步 primary/split panels；delete+create 不猜测 rename。

### M6-C：Search Foundation

复用已有 `GET /api/files/search` 和 content-index，不新增第二套搜索 API。

数据模型：

```ts
type WorkbenchSearchResult = {
  id: string;
  rootId: string;
  path: string;
  name: string;
  directoryPath: string;
  matchKind: "name" | "content";
  line?: number;
  column?: number;
  length?: number;
  snippet?: string;
  size?: number;
  modifiedAt?: string | null;
};
```

前端建议：

- Search ActivityBar item 从 disabled/placeholder 升级为 Search View。
- Search View 输入 query、scope path、case sensitive、regex、hidden、recursive、limit。
- 点击结果：打开/pin IDE editor tab，并通过 `CodeEditorHandle.gotoLine(line,column)` reveal。
- content match 若后端只有 snippet 没 line/column，M6-C 可先打开文件并在 Monaco find 中搜索 query；M6-C+ 再补精确 line/column。
- 搜索输出可同时写入 Output channel `search`，便于追踪失败/耗时。

### M6-D：Diff / Conflict Flow

新增共享 diff adapter，优先用 Monaco DiffEditor，不复用旧轻量 diff 作为最终编辑器冲突 UI。

建议目录：

```txt
apps/web/src/shared/diff/MonacoDiffPanel.tsx
apps/web/src/features/ide-workbench/editor/EditorConflictDialog.tsx
```

流程：

- 保存前继续携带 `expectedModifiedAt` / `expectedSize`，后续可升级 hash/version。
- `file_write_conflict` 409：读取磁盘当前内容，与 Monaco model 内容进入 compare。
- 用户选择：Reload disk / Overwrite / Cancel；Overwrite 必须显式点击，不默认发生。
- watcher changed + dirty 也进入同一 compare 组件。
- deleted + dirty 不进入 overwrite，保留 model 并提示另存/恢复后续阶段处理。

### M6-E：Problems / Output Foundation

Problems 模型：

```ts
type WorkbenchProblem = {
  id: string;
  rootId: string;
  path?: string;
  severity: "error" | "warning" | "info" | "hint";
  source: "search" | "task" | "custom" | "lsp-placeholder";
  message: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  code?: string;
  createdAt: string;
};
```

Output 模型：

```ts
type WorkbenchOutputChannel = {
  id: string;
  label: string;
  kind: "system" | "task" | "terminal" | "search" | "extension";
};

type WorkbenchOutputEvent = {
  channelId: string;
  sequence: number;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  text: string;
};
```

实现建议：

- 新增 `apps/web/src/features/ide-workbench/problems/` 和 `output/`，不塞进 TerminalPanel。
- Problems 点击：打开文件并 reveal range；无 path 的问题只显示详情。
- Output 支持 channel select、clear、append、scroll lock；不把完整大日志塞 localStorage。
- 主题使用 Aurora token：severity 色、channel 边框、log 文本不能硬编码 VS Code/terminal 默认色。
- M6 不接真实 LSP diagnostics；可从 search/task/custom validation 写入结构化 Problems 验证 UI。

### M6-F：验收与文档收口

- 更新 `00-README.md` / `05` / `06` / `07` / `08` / `.codex/project-context.md`。
- 新增 smoke：
  - `smoke:ide:watcher-foundation`
  - `smoke:ide:search-foundation`
  - `smoke:ide:problems-output`
  - `smoke:ide:editor-conflict-diff`

## 验收建议

M6-B+ 完成后至少验证：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:watcher-foundation
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:editor-conflict-diff
git diff --check
```

M6-A 本身为文档/计划，验证 `git diff --check` 和 touched docs markdown 相对链接即可。

## 风险与防偏移

| 风险 | 影响 | 约束 |
|---|---|---|
| watcher 误判 rename | tab 路径错误、dirty 内容丢失 | 只有可靠 oldPath/newPath 才发 renamed；否则 deleted+created |
| watcher changed 覆盖 dirty model | 用户编辑丢失 | dirty 必须 compare/reload/overwrite/cancel |
| 新建第二套 search/files API | root guard 和权限分裂 | 复用 `/api/files/search`、content-index 和 Files service guard |
| Problems 过早绑定 LSP | M6/M7 边界混乱 | M6 Problems 是结构化数据面板；LSP diagnostics 到 M7 |
| Output 保存完整大日志 | 内存/localStorage 膨胀 | Output store 有截断/环形缓冲，不持久化完整日志 |
| Diff/Problems/Output 主题割裂 | 深浅主题不可读 | 统一 Aurora token / semanticTheme 映射 |

## M6-B 推荐入口

先做 **M6-B Watcher Foundation**：

1. 复用 Files root guard，建立 watcher event contract。
2. 做最小事件流（SSE 或 WebSocket 二选一，优先项目现有 server 接入最薄路径）。
3. 前端 Workbench 注册 `useWorkbenchFileEvents`。
4. 实现 changed/deleted 对已打开 editor tab 的安全状态处理。
5. 补 `smoke:ide:watcher-foundation`，重点验证 dirty 不被覆盖。

Search / Problems / Output 可以并行设计，但不要在 watcher 安全边界未验证前接入复杂外部数据源。
