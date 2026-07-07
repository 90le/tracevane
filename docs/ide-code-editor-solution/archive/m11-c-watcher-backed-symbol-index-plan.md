# M11-C Watcher-backed Symbol Index Research and Minimal Plan

## 状态

已完成。M11-C 是 docs-only 研究与最小计划阶段：它不新增 runtime 代码、不改变 `/api/lsp/workspace-symbols` contract，也不把 M6 watcher 或 Files content-index 扩张成新的后台符号守护进程。

## 触发背景

M10-C 已提供受控 TypeScript / JavaScript workspace symbols：每次请求在 root/path guard 后扫描有限数量 TS/JS 文件，并用 TypeScript `LanguageService.getNavigateToItems` 返回符号。M11-B 已把该能力接入 IDE Command Palette / Go to Symbol。这个链路可用，但大型工作区里“每次查询都扫描并临时创建 language service”可能成为性能瓶颈。

M11-C 的目标是先固定 watcher-backed symbol index 的边界和复用方式，避免后续直接新增第二套 symbol daemon、第二套 Files API 或持久化完整源码。

## 当前实现证据

### M6 watcher / search 基础

- `apps/web/src/features/ide-workbench/watcher/useWorkbenchFileEvents.ts` 已有 Workbench watcher hook：
  - 通过 `getFilesWatchSnapshot({ rootId, path, hidden })` 轮询当前目录快照。
  - 将 snapshot diff 成 `created` / `changed` / `deleted` 事件。
  - 变更后 invalidates `filesKeys.browse(...)` 与 files summary。
  - 当前是目录级 snapshot/polling fallback，不是递归文件系统 watcher，也不是跨 root 全局事件总线。
- `apps/web/src/features/ide-workbench/search/IdeSearchView.tsx` 已有 Search 视图：
  - 文件/内容搜索复用 `useFilesSearchQuery` 与 `/api/files/search`。
  - 符号模式直接调用 `requestLspWorkspaceSymbols(...)`。
  - 搜索结果打开复用 IDE Editor open/reveal，不新增产品壳。

### Files content-index 基础

- `apps/api/modules/files/routes.ts` 与 `apps/api/modules/files/service.ts` 已有 Files content-index 系列接口和 SQLite/records/rebuild/stats 基础。
- 该系统是文件内容/哈希/搜索相关索引，不是 symbol index。
- 可复用的经验是：root guard、单 root rebuild、records/stats、预算限制、clean/rebuild job、避免 global rebuild。
- 不应直接把完整源码或符号长期塞入现有 content-index，除非未来实现阶段明确 schema、隐私、清理和 provider version 边界。

### M10-C workspace symbols 基础

- `apps/api/modules/lsp/service.ts` 的 `workspaceSymbols(...)` 已有：
  - `rootId` / `path` root guard：`resolveFilesServiceDirectoryPath(...)`。
  - query 长度、result limit、扫描文件数、单文件大小、hidden、排除目录、symlink/root 外路径边界。
  - TS/JS/TSX/JSX 文件收集与临时 TypeScript `LanguageService`。
  - 通过 `getNavigateToItems(query, limit, ...)` 返回 workspace symbol items。
  - 请求结束后 dispose language service。
- 它不包含 watcher-backed index，也不持久化 symbol DB。

### M11-B Command Palette 基础

- Command Palette / Go to Symbol 已作为用户入口存在。
- 该入口消费同一 `requestLspWorkspaceSymbols(...)`，所以未来 index 应隐藏在现有 workspace symbols 后端内部，而不是新增一套前端调用。

## 设计决策

### 1. 继续保持一个 workspace symbols contract

未来 watcher-backed symbol index 如果实现，应保持：

- 前端仍调用 `requestLspWorkspaceSymbols(...)`。
- 后端仍由 `apps/api/modules/lsp` 暴露 `/api/lsp/workspace-symbols` 和 `/ws/lsp` `workspaceSymbols` message。
- index 是 provider 内部优化，不成为第二套用户可见 API。
- 直接扫描路径保留为 fallback：索引缺失、过期、禁用、构建失败或测试模式下都可回退。

### 2. Symbol index 只存最小元数据，不存完整源码

允许的记录形态应限制为：

- `rootId`
- normalized `path`
- `language`
- `mtimeMs` / `size` / optional content hash or version
- `provider` / `providerVersion`
- symbol `name`
- symbol `kind`
- optional `containerName`
- range：`startLine` / `startColumn` / `endLine` / `endColumn`
- `indexedAt`
- stale/deleted marker

明确不存：完整文件内容、长 snippet、用户终端输出、跨 root 全局符号库。

### 3. Watcher-backed 意味着“失效/刷新触发”，不是独立 daemon

M6 watcher 当前是 UI 侧目录 snapshot/polling。M11-C 后续实现可以选择两条轻量路径：

1. **API 请求驱动 + opportunistic cache**：workspace symbols 请求时检测 records 是否过期，按预算重建当前 scope。
2. **Watcher event hint**：IDE watcher 收到 changed/deleted/created 后，通过既有 Files/LSP client 发起“mark stale”或简单 invalidate，不长期运行独立进程。

第一阶段不要实现独立常驻 symbol daemon。若后续确实需要 backend watcher，应先在 M6 watcher/event bus 统一升级，而不是只为 symbols 写一套。

### 4. Invalidation 规则

- `created`：如果文件类型可被 symbol provider 支持，标记为 candidate，下一次查询或轻量 queue 可索引。
- `changed`：按 path/version/hash/mtime 标记 stale；查询时优先重建 stale file。
- `deleted`：删除或 tombstone 该 path 下 symbol records。
- `rename/move`：若只有 snapshot diff，可按 delete + create 处理；若未来 fileOperations 提供 old/new path event，再做 path-level records move。
- dirty editor buffer：未保存内容不进入持久 symbol index；保存后通过 existing save/write path 触发 watcher/invalidation。

### 5. Budget / safety

必须沿用或收紧 M10-C 边界：

- 单 root / 单 scope 预算，不做 global rebuild。
- 最大扫描文件数、最大单文件 bytes、最大 records、最大 query 长度。
- 跳过 symlink、root 外路径、排除目录和默认 hidden。
- index rebuild 可取消/超时；失败只降级到 direct scan 或空结果，不阻塞编辑器。
- stats/diagnostics 只报告计数、耗时、stale 状态，不泄露源码内容。

## 最小实现切片建议

如果下一阶段进入实现，建议命名为 **M11-C-B watcher-backed symbol index guarded implementation**，范围如下：

1. 在 `apps/api/modules/lsp` 内新增薄的 symbol-index adapter，而不是新建第二套 LSP API。
2. 抽出并复用 M10-C 的 source-file 收集、language detection、TypeScript navigate item -> symbol item 转换逻辑。
3. 建立 root-scoped in-memory 或 small SQLite records（优先 in-memory + version guard；SQLite 只有在持久化收益明确时才做）。
4. `workspaceSymbols(...)` 内部按顺序选择：fresh index -> stale bounded rebuild -> direct scan fallback。
5. 暴露最小 stats 到 response metadata 或 debug-only logs，便于 smoke 判断 cache path，但不要改变前端主 contract。
6. 补 `smoke:ide:lsp-symbol-index` 或扩展 `smoke:ide:lsp-workspace-symbols`：覆盖首次扫描、二次查询命中/不崩、文件修改后结果更新、删除后结果消失。

## 明确不做

M11-C 不做：

- runtime symbol index 实现。
- 独立后台 symbol daemon。
- 第二套 Files / Search / LSP API。
- 持久化完整文件内容或全局符号库。
- 多语言 LSP provider。
- 完整 `tsserver` / `typescript-language-server` 长驻进程。
- AI semantic search。
- File Manager Online Editor 产品壳变更。
- Git force/merge/rebase、Debug parity、Terminal 新能力。

## 验收口径

M11-C 本阶段验收：

- `.codex/project-context.md`、`00-README.md`、`07-终端运行语言服务Git方案.md`、`08-实施阶段验收与风险.md` 更新 M11-C 完成状态与下一步入口。
- 新增本 archive plan，清楚说明 reuse、index boundary、invalidations、safety budget、not-do list。
- 通过 markdown relative link check 与 `git diff --check`。

未来 M11-C-B 实现验收：

- `npm run typecheck:api -- --pretty false`
- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:lsp-workspace-symbols`
- `npm run smoke:ide:command-palette`
- 新增或扩展 symbol-index smoke
- `git diff --check`

## 下一步

建议进入 **M11-C-B watcher-backed symbol index guarded implementation**。若真实项目性能数据表明 direct workspace symbols 已足够，也可以跳过实现，改走 **M11-D multi-language LSP provider research plan**；但在继续扩展多语言前，必须保留本文件定义的 workspace symbols contract、fallback 和 root guard 约束。
