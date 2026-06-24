# 全功能文件管理器实现计划（`/files`，track B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/files` 从只读证据浏览器重建为系统级全功能文件管理器，并抽取共享 `FileEditor` 供 `/files` 与 `/ide` 复用。

**Architecture:** 复用 IDE P1 文件核心（`useFileOperations` + 数据层 + CodeEditor）；抽取共享 `FileEditor`（CodeMirror + 脏状态 + PUT 保存 + Cmd/Ctrl+S），让 `/ide` 与 `/files` 共用同一编辑控件；管理器新增多视图/批量/拖放/上传下载 UI。后端零变更（CRUD/tree/download/archive 全已存在）。

**Tech Stack:** React 19, TypeScript, TanStack Query, CodeMirror 6（复用）, xterm 无关, node:test, Playwright。

**设计真相源：** spec `docs/superpowers/specs/2026-06-24-file-manager-design.md`；现有 `apps/web/src/features/ide/editor/CodeEditor.tsx` + `panels/EditorArea.tsx`（保存逻辑待抽取）；`apps/web/src/features/files/{api.ts,FileTree.tsx,FileActionsMenu.tsx}`；后端 `apps/api/modules/files/routes.ts`；`types/files.ts`（`FilesDirectoryPayload`/`FileEntrySummary`/`FilesTransferPayload` 等）。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/shared/file-editor/FileEditor.tsx` | **共享编辑控件**：CodeMirror（复用 CodeEditor）+ useFileRead + 脏状态 + PUT 保存 + Cmd/Ctrl+S + saveState 回调。`/ide` 与 `/files` 共用 |
| `apps/web/src/features/ide/panels/EditorArea.tsx` | **重构**：用 `FileEditor` 替代内联保存逻辑（多 tab 编排仍在，单 tab 编辑交给 FileEditor） |
| `apps/web/src/features/ide/editor/CodeEditor.tsx` | 保持（被 FileEditor 复用）；或提升到 shared——保持原位，FileEditor import |
| `apps/web/src/features/files/views/ManagerToolbar.tsx` | 管理器工具栏：位置/面包屑/后退/新建/上传/搜索/视图切换/排序 |
| `apps/web/src/features/files/views/ManagerSidebar.tsx` | 侧栏：位置(roots)/最近 |
| `apps/web/src/features/files/views/FileListing.tsx` | 主区 listing：列表/详细视图 + 多选 + 拖放 + 行操作 |
| `apps/web/src/features/files/views/FileInspector.tsx` | 右侧检视器：元数据 + 共享 FileEditor（文本内联编辑）/ 缩略图 / 只读 |
| `apps/web/src/features/files/views/BulkActionBar.tsx` | 选中 N 项的批量操作栏（复制/移动/删除/打包/下载） |
| `apps/web/src/features/files/FilesPage.tsx` | **重建**：管理器编排（toolbar+sidebar+listing+inspector），替代旧只读 1126 行 |
| `apps/web/src/features/files/views/upload.ts` | 上传辅助（拖放 + base64 编码） |
| `scripts/smoke-web-files.py` | 升级 smoke（多视图/CRUD/批量/搜索/上传） |
| `tests/system/web-file-manager.test.mjs` | 合同测试 |

---

## Phase 1：共享 FileEditor 控件（先做，IDE 与管理器都依赖）

### Task 1.1：抽取共享 FileEditor

**Files:** Create `apps/web/src/shared/file-editor/FileEditor.tsx`; Read `apps/web/src/features/ide/panels/EditorArea.tsx` + `apps/web/src/features/ide/editor/CodeEditor.tsx`

- [ ] **Step 1: 写失败测试** `tests/system/web-file-editor.test.mjs`（静态断言 FileEditor 导出且复用 CodeEditor + PUT content + Cmd/Ctrl+S）：

```javascript
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../apps/web/src/shared/file-editor/FileEditor.tsx", import.meta.url), "utf-8");
test("FileEditor is a shared control", () => {
  assert.match(src, /export function FileEditor/);
  assert.match(src, /CodeEditor/);                 // 复用 CM6
  assert.match(src, /useWriteFileContentMutation/); // PUT /api/files/content
  assert.match(src, /Cmd|ctrlKey|metaKey/i && /KeyS|\"s\"/i ? /s/ : /KeyS|"s"/i); // Cmd/Ctrl+S
});
```

- [ ] **Step 2: Run** `node --test tests/system/web-file-editor.test.mjs` → FAIL（文件不存在）。

- [ ] **Step 3: 实现** `apps/web/src/shared/file-editor/FileEditor.tsx` —— 从 `EditorArea.tsx` 抽取**单文件**保存逻辑（lines ~140-210 的 saveActive 模式）封装成接受单个 `{ rootId, path }` 的组件。Props：
```tsx
export interface FileEditorProps {
  rootId: string;
  path: string;
  onSaved?: () => void;
  onSaveStateChange?: (s: "idle" | "dirty" | "saving" | "saved") => void;
  className?: string;
}
```
行为：
- `useFileReadQuery({ rootId, path })` 取内容（loading→Skeleton, 非 textLike/二进制→只读 CodeBlock from `@/shared/diff`, truncated→只读）。
- 渲染 `<CodeEditor key={path} path={path} initialContent={content ?? ""} onChange={(v)=>setDirty(v)} />`。
- 脏状态：`dirtyRef` 持当前编辑串；`isDirty = dirty !== undefined && dirty !== loadedContent`。
- `save()`（PUT via `useWriteFileContentMutation`，成功清脏 + toast + onSaved/onSaveStateChange；失败 toast）。
- Cmd/Ctrl+S：组件根 `keydown` 监听（preventDefault + save）。
- 大文件/二进制由 CodeEditor 内部降级（CodeBlock），FileEditor 不重复判断。
- READ EditorArea.tsx 现有实现确保语义一致（成功才清脏、no-op 检测）。

- [ ] **Step 4: Run** `node --test tests/system/web-file-editor.test.mjs` → PASS。

- [ ] **Step 5: Commit** `git add apps/web/src/shared/file-editor/FileEditor.tsx tests/system/web-file-editor.test.mjs && git commit -m "feat(web): shared FileEditor control (CM6 + save, IDE & file-manager reuse)"`

### Task 1.2：IDE EditorArea 复用 FileEditor

**Files:** Modify `apps/web/src/features/ide/panels/EditorArea.tsx`

- [ ] **Step 1: 重构** —— EditorArea 仍管多 tab + active + 打开/关闭/未保存关闭拦截，但**单个 active tab 的编辑+保存交给 `<FileEditor>`**（删掉内联的 saveActive/writeMutation/CodeEditor 直挂；onSaveStateChange 上报 IdeShell）。保持 split（两个 FileEditor）、loadedContent、dirty-set（用 FileEditor 的 saveState 判断未保存）。注意：多 tab 时只有 active 渲染 FileEditor（keyed by active path），未保存关闭拦截需 FileEditor 暴露 dirty（onSaveStateChange "dirty" 即可）。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS；`npm run build:web` PASS。

- [ ] **Step 3: 验证 IDE 仍工作** `npm run dev:restart` → `python3 scripts/smoke-web-ide.py` PASS（0 error/0 overflow）。

- [ ] **Step 4: Commit** `git add apps/web/src/features/ide/panels/EditorArea.tsx && git commit -m "refactor(web): IDE EditorArea reuses shared FileEditor"`

---

## Phase 2：管理器骨架（toolbar + sidebar + listing 占位）

### Task 2.1：FilesPage 重建 + 布局骨架

**Files:** Modify `apps/web/src/features/files/FilesPage.tsx`; Create `views/{ManagerToolbar,ManagerSidebar,FileListing,FileInspector,BulkActionBar}.tsx`

- [ ] **Step 1: 写合同测试** `tests/system/web-file-manager.test.mjs`：
```javascript
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const page = fs.readFileSync(new URL("../../apps/web/src/features/files/FilesPage.tsx", import.meta.url), "utf-8");
test("FilesPage is a manager (not read-only)", () => {
  assert.match(page, /ManagerToolbar/);
  assert.match(page, /ManagerSidebar/);
  assert.match(page, /FileListing/);
  assert.match(page, /useFileOperations/);
  assert.match(page, /FileEditor/); // 内联编辑共享控件
});
```

- [ ] **Step 2: Run** `node --test tests/system/web-file-manager.test.mjs` → FAIL。

- [ ] **Step 3: 实现** FilesPage：用 `RowsInspectorLayout`（或自管 grid）三区：左 ManagerSidebar（roots + 最近）、中 FileListing、右 FileInspector。顶 ManagerToolbar。状态：`rootId`（默认 root）、`directoryPath`（当前目录）、`selected: string[]`（多选 path）、`view: "list"|"detail"`（grid 在 P2）、`sortKey/sortDirection`、`searchMode/searchQuery`、`hidden`。空骨架先渲染 chrome，子组件 Task 2.2-2.4 填实。

- [ ] **Step 4: Commit** `git add apps/web/src/features/files && git commit -m "feat(web): file manager layout skeleton"`（先允许 typecheck 通过——子组件用最小占位 export，后续填）。

### Task 2.2：ManagerToolbar

**Files:** Create/expand `views/ManagerToolbar.tsx`

- [ ] **Step 1: 实现** —— 面包屑（来自 browse 的 breadcrumbs，点击导航）、后退/上级、新建▾（文件/目录，复用 useFileOperations + 小 Dialog）、上传（拖放区 + 文件选择 → base64 → upload）、搜索框（切 searchMode）、视图切换（list/detail）、排序选择（sortKey + 升降序）、隐藏文件开关。所有控制通过 props 回调上报 FilesPage 状态。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git add apps/web/src/features/files/views/ManagerToolbar.tsx && git commit -m "feat(web): file manager toolbar"`

### Task 2.3：ManagerSidebar

**Files:** `views/ManagerSidebar.tsx`

- [ ] **Step 1: 实现** —— roots 列表（useFilesSummaryQuery）+ 最近访问目录（localStorage）。点击切换 root/directoryPath。

- [ ] **Step 2: Run** typecheck PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): file manager sidebar (roots + recent)"`

### Task 2.4：FileListing（列表 + 详细 + 多选 + 拖放）

**Files:** `views/FileListing.tsx`

- [ ] **Step 1: 实现** —— `useFilesBrowseQuery({ rootId, path: directoryPath, sortKey, sortDirection, hidden })`。
  - **列表视图**：紧凑行（图标+名+大小+时间）。**详细视图**：表格列（名/大小/修改时间/类型/隐藏），点击表头排序（更新 sortKey/sortDirection）。
  - **多选**：点击选（Cmd 多选 / Shift 范围）、Ctrl+A 全选、空白取消；selected 上报。
  - **行操作**：双击目录进入；双击文件→ FilesPage 设 inspector 文件。右键→复用 `FileActionsMenu`（已有）。
  - **拖放**：行可拖（dragstart 记 path）；目录行可作 drop target（drop → move 到该目录，复用 useFileOperations.move）；空白区 drop → 上传（Phase 2.6）。
  - 三态：Skeleton / EmptyState（空目录）/ ErrorState+retry。
  - 用 FileEntrySummary 字段渲染（kind/ext/size/modifiedAt/imageLike）。

- [ ] **Step 2: Run** typecheck + build PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): file manager listing (list/detail/select/drag)"`

---

## Phase 3：检视器（内联编辑共享 FileEditor）

### Task 3.1：FileInspector

**Files:** `views/FileInspector.tsx`

- [ ] **Step 1: 实现** —— props `{ rootId, file: FileEntrySummary | null, selectionCount, selectionSize }`。
  - 无选中：空态。
  - 多选：显示"N 项已选 · 合计大小"，不编辑。
  - 单选目录：元数据。
  - 单选文本/Markdown 文件：渲染 `<FileEditor rootId path={file.path} onSaveStateChange={...} />`（共享编辑控件，与 IDE 一致）。
  - 单选图片：缩略图 `<img src="/api/files/download?rootId=&path=">`（小尺寸 + object-contain）。
  - 单选二进制/不可编辑：只读 CodeBlock + "不可编辑"提示。
  - 元数据条：大小/修改时间/类型/路径。

- [ ] **Step 2: Run** typecheck + build PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): file manager inspector with shared inline editor"`

---

## Phase 4：批量操作 + 上传/下载/打包

### Task 4.1：BulkActionBar + 批量操作

**Files:** `views/BulkActionBar.tsx`; Modify `features/files/api.ts`（若需批量辅助）

- [ ] **Step 1: 实现** BulkActionBar —— 选中 N 时显示：复制/移动（对话框选目标目录 → **逐个**循环 useFileOperations.copy/move，显示进度 x/N）、删除（危险确认 → useFileOperations.remove({paths:selected})，已支持数组）、打包（名称 → archive({paths:selected})）、下载（selected.length>1 → download-archive；=1 → download）。进度/结果汇总（成功/失败 + 原因 toast）。
  - 注意 copy/move 后端是单源（FilesTransferPayload），故批量 = 前端循环；用 Promise.allSettled 汇总。

- [ ] **Step 2: Run** typecheck + build PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): file manager bulk actions (copy/move/delete/archive/download)"`

### Task 4.2：上传（拖放 + 选择）

**Files:** `views/upload.ts`; Modify `views/FileListing.tsx` + `ManagerToolbar.tsx`

- [ ] **Step 1: 实现 upload helper** `upload.ts` —— `encodeFile(file: File): Promise<{fileName, relativePath?, dataBase64, size}>`（FileReader → base64）；`selectFiles()` 触发隐藏 `<input type=file multiple>`。
- **Step 2: 接线** —— ManagerToolbar 上传按钮 + FileListing 空白区 drop：收集 files → 批量 useFileOperations.upload（单次或循环；大文件不分片，后端无分片端点）→ 进度/结果 toast。
- **Step 3: Run** typecheck + build PASS。
- **Step 4: Commit** `git add apps/web/src/features/files && git commit -m "feat(web): file manager upload (drag-drop + select)"`

---

## Phase 5：搜索/筛选/键盘

### Task 5.1：搜索模式 + 筛选 + 键盘导航

**Files:** Modify `FileListing.tsx`, `ManagerToolbar.tsx`, `FilesPage.tsx`

- [ ] **Step 1: 搜索模式** —— searchMode 时用 `useFilesSearchQuery({ rootId, query, recursive, hidden })` 渲染结果列表（FileSearchResult 含 matchKind/snippet，高亮）。退出清空。
- **Step 2: 筛选** —— 按类型筛（全部/文件/目录/图片）、隐藏开关（已接 browse）。
- **Step 3: 键盘** —— 上下移动选择、Enter 进入目录/打开文件到检视器、Delete 删除选中、F2 重命名、空格切换选、Escape 取消选/退出搜索。
- **Step 4: Run** typecheck + build PASS。
- **Step 5: Commit** `git commit -am "feat(web): file manager search/filter/keyboard nav"`

---

## Phase 6：验证

### Task 6.1：合同测试 + smoke 升级

**Files:** `tests/system/web-file-manager.test.mjs`; Modify `scripts/smoke-web-files.py`

- [ ] **Step 1: 扩合同测试** —— FilesPage 渲染多视图 + 复用 useFileOperations + 复用 FileEditor + 绑定现有文件 CRUD 端点（grep）/ide 与其它域不受影响（路由仍存在）。
- **Step 2: 升级 smoke** —— 桌面 1440 + 移动 390 打开 `/#/files`：渲染（toolbar/listing/inspector）、列表↔详细切换、新建文件流、重命名、删除确认流、多选 + 批量栏、搜索、上传入口；0 console error / 0 横向溢出。
- **Step 3: Run** `node --test tests/system/web-file-manager.test.mjs` PASS；`npm run dev:restart` + `python3 scripts/smoke-web-files.py` PASS。
- **Step 4: 全闸** `npm run typecheck:web && npm run build:web` PASS。
- **Step 5: Commit** `git commit -am "test(web): file manager contract + playwright smoke"`

### Task 6.2：文档更新

**Files:** Modify `docs/当前进展.md`, `docs/前端功能架构.md`

- [ ] **Step 1: 更新** —— 当前进展记录 `/files` 重建为系统级全功能文件管理器（多视图/批量/拖放/上传下载/内联编辑共享 FileEditor）；前端功能架构记录 FileEditor 共享控件。研究清单补一条 research 记录（决策：复用文件核心、共享编辑控件、后端零变更、批量 copy/move 前端循环）。
- **Step 2: Commit** `git add docs && git commit -m "docs: record full file manager (/files) complete"`

---

## Self-Review

- **Spec 覆盖**：§2 共享控件→Task1；§3 布局→Task2.1；§4 视图→Task2.4(list/detail) + 网格在 P2(明确推迟)；§5 CRUD→Task1/2.4 + 批量 Task4.1 + 上传 Task4.2 + 内联编辑 Task3.1；§6 搜索/筛选/排序→Task5/2.2；§7 检视器内联编辑→Task3.1；§8 错误/确认→各 task（危险确认）；§10 非目标（压缩包/回收站/权限）遵守。
- **占位扫描**：无 TBD；所有端点/payload 来自实测；FileEditor 契约（path-keyed, 成功清脏, Cmd+S）与 IDE 现有实现一致。
- **类型一致**：FileEntrySummary/FileRootSummary/FilesTransferPayload/FilesMutationResponse 字段与 types 一致；FileEditor props 在 Task1.1 定义并被 1.2/3.1 复用同名。
- **风险**：批量 copy/move 是前端循环（后端单源），需 allSettled 汇总——已在 Task4.1 说明；多 tab IDE 重构（Task1.2）需保持未保存拦截与 split 不回归——smoke 覆盖。
