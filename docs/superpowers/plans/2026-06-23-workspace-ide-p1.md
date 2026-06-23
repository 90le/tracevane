# Workspace IDE P1 实现计划（全屏壳 + 文件管理核心 + CodeMirror 编辑器 + Markdown 实时预览 + 终端）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/ide` 从只读证据工作台升级为真正的全屏本地优先 IDE：全屏专用壳（不带 AppShell）、可复用文件操作核心（真 CRUD）、CodeMirror 6 多 tab 编辑器+保存、Markdown 实时预览、xterm 终端面板。

**Architecture:** `/ide` 渲染独立全屏 `IdeShell`（脱离 AppShell layout route）。文件操作做成可复用核心（`features/files/` 下：数据层+操作原语+树/菜单组件），IDE Explorer 复用它；后续 `/files` 全功能管理器（track B）在同一核心上扩展。后端文件 CRUD/git/终端全部已存在，P1 无新后端。

**Tech Stack:** React 19, TypeScript, TanStack Query, CodeMirror 6（已是依赖：`@codemirror/*` + 8 语言包 + one-dark）, xterm.js（`@xterm/*`），node-pty 后端，remark→rehype→stringify + dompurify + highlight.js（MD 预览，已是依赖），node:test，Playwright。

**设计真相源：** spec `docs/superpowers/specs/2026-06-23-workspace-ide-p1-design.md`；后端 `apps/api/modules/{files,git,terminal}/routes.ts` + `types/{files,git}.ts`；现有 `/ide` 代码 `apps/web/src/features/ide/WorkspaceIdePage.tsx`。

---

## 文件结构（文件操作做成可复用核心）

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/lib/api/files.ts` | 增加**写绑定**：content(PUT)/directories/files/rename/copy/move/delete/upload/archive/unarchive（读绑定已有） |
| `apps/web/src/lib/api/git.ts` | 增加**写绑定**：stage/unstage/commit/branches/checkout（读绑定已有） |
| `apps/web/src/lib/query/files.ts` | 写操作的 mutation hooks（含 tree query） |
| `apps/web/src/lib/query/git.ts` | stage/unstage/commit/branches/checkout mutation hooks |
| `apps/web/src/features/files/api.ts` | 文件操作**原语**（orchestration：CRUD + 失败处理 + 证据），IDE 与未来 `/files` 共用 |
| `apps/web/src/features/files/FileTree.tsx` | 可复用文件树组件（展开/折叠/面包屑/选中/右键菜单挂载点） |
| `apps/web/src/features/files/FileActionsMenu.tsx` | 右键上下文菜单（新建/重命名/移动/复制/删除/上传/下载/打包） |
| `apps/web/src/features/ide/IdeShell.tsx` | 全屏 IDE 窗口编排（ActivityBar + SidePanel + Editor + Preview + Bottom + StatusBar） |
| `apps/web/src/features/ide/panels/{ActivityBar,SidePanel,BottomPanel,StatusBar}.tsx` | IDE 面板 |
| `apps/web/src/features/ide/explorer/IdeExplorer.tsx` | IDE Explorer（复用 FileTree + FileActionsMenu + git 视图） |
| `apps/web/src/features/ide/editor/{EditorTabs,CodeEditor}.tsx` | 多 tab + 分屏 + CodeMirror |
| `apps/web/src/features/ide/preview/MarkdownPreview.tsx` | 实时 MD 渲染 |
| `apps/web/src/features/ide/terminal/IdeTerminal.tsx` | xterm 面板 |
| `apps/web/src/app/router.tsx` | `/ide` → IdeShell（脱离 AppShell）；删除 WorkspaceIdePage |
| `apps/web/src/features/ide/WorkspaceIdePage.tsx` | 删除（被 IdeShell 取代） |

---

## Phase 0：可复用文件操作数据层

### Task 0.1：files.ts 增加写绑定

**Files:** Modify `apps/web/src/lib/api/files.ts`

- [ ] **Step 1: 写失败测试** `tests/system/web-files-api.test.mjs`（node:test，静态源码断言 `files.ts` 导出各写函数且引用正确端点字符串）：

```javascript
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../apps/web/src/lib/api/files.ts", import.meta.url), "utf-8");
test("files api binds write endpoints", () => {
  for (const [fn, path] of [
    ["writeFileContent", "/api/files/content"],
    ["createDirectory", "/api/files/directories"],
    ["createFile", "/api/files/files"],
    ["renameFile", "/api/files/rename"],
    ["copyFile", "/api/files/copy"],
    ["moveFile", "/api/files/move"],
    ["deleteFiles", "/api/files"],
    ["archiveFiles", "/api/files/archive"],
    ["unarchiveFile", "/api/files/unarchive"],
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`), `missing ${fn}`);
    assert.ok(src.includes(`"${path}"`) || src.includes(`'${path}'`), `missing path ${path}`);
  }
});
```

- [ ] **Step 2: Run** `node --test tests/system/web-files-api.test.mjs` Expected: FAIL（函数未定义）。

- [ ] **Step 3: 实现** 在 `apps/web/src/lib/api/files.ts` 追加（payload 类型来自 `types/files.ts`，import 它们）：

```typescript
import type {
  // existing read types...
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesWritePayload,
  FilesRenamePayload,
  FilesTransferPayload,
  FilesDeletePayload,
  FilesUploadPayload,
  FilesArchivePayload,
  FilesUnarchivePayload,
} from "../../../../../types/files";

/** PUT /api/files/content — overwrite file content (IDE save). */
export function writeFileContent(payload: FilesWritePayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/content`, { method: "PUT", body: JSON.stringify(payload) });
}
export function createDirectory(payload: FilesCreateDirectoryPayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/directories`, { method: "POST", body: JSON.stringify(payload) });
}
export function createFile(payload: FilesCreateFilePayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/files`, { method: "POST", body: JSON.stringify(payload) });
}
export function renameFile(payload: FilesRenamePayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/rename`, { method: "POST", body: JSON.stringify(payload) });
}
export function copyFile(payload: FilesTransferPayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/copy`, { method: "POST", body: JSON.stringify(payload) });
}
export function moveFile(payload: FilesTransferPayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/move`, { method: "POST", body: JSON.stringify(payload) });
}
export function deleteFiles(payload: FilesDeletePayload): Promise<{ ok: true; paths: string[] }> {
  return apiRequest(`${BASE}`, { method: "DELETE", body: JSON.stringify(payload) });
}
export function archiveFiles(payload: FilesArchivePayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/archive`, { method: "POST", body: JSON.stringify(payload) });
}
export function unarchiveFile(payload: FilesUnarchivePayload): Promise<{ ok: true; path: string }> {
  return apiRequest(`${BASE}/unarchive`, { method: "POST", body: JSON.stringify(payload) });
}
```

- [ ] **Step 4: Run** `node --test tests/system/web-files-api.test.mjs` Expected: PASS。

- [ ] **Step 5: Commit** `git add apps/web/src/lib/api/files.ts tests/system/web-files-api.test.mjs && git commit -m "feat(web): files api write bindings (content/crud/archive)"`

### Task 0.2：files mutation hooks

**Files:** Modify `apps/web/src/lib/query/files.ts`

- [ ] **Step 1: 实现** 为 Task 0.1 的每个写函数加 `useXMutation`，`onSuccess` 统一 invalidate files keys（`["files"]` 前缀；browse/summary/search 都在此前缀下）。确保 query key 工厂 `filesKeys` 导出 `all = ["files"]`。

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api/files";

export const filesKeys = {
  all: ["files"] as const,
  summary: () => [...filesKeys.all, "summary"] as const,
  browse: (p: unknown) => [...filesKeys.all, "browse", p] as const,
};

export function useWriteFileContentMutation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.writeFileContent, onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }) });
}
// ...同模式：useCreateDirectoryMutation/useCreateFileMutation/useRenameFileMutation/useCopyFileMutation/useMoveFileMutation/useDeleteFilesMutation/useArchiveFilesMutation/useUnarchiveFileMutation
```

- [ ] **Step 2: Run** `npm run typecheck:web` Expected: PASS。

- [ ] **Step 3: Commit** `git add apps/web/src/lib/query/files.ts && git commit -m "feat(web): files mutation hooks"`

### Task 0.3：git 写绑定 + hooks

**Files:** Modify `apps/web/src/lib/api/git.ts`, `apps/web/src/lib/query/git.ts`

- [ ] **Step 1: 实现写绑定**（端点来自 `apps/api/modules/git/routes.ts`：stage/unstage/commit/branches/checkout）。请求体字段按后端 handler 读取（READ 每个 handler 确认；常见为 `{ rootId, path?, files?: string[], message?, branch?, name? }`）。命名：`stageFiles`/`unstageFiles`/`commitFiles`/`createBranch`/`checkoutBranch`，全部 `apiRequest(BASE + "/stage"`, { method: "POST", body })`。

- [ ] **Step 2: 实现 mutation hooks**，`onSuccess` invalidate `["git"]`。

- [ ] **Step 3: Run** `npm run typecheck:web` Expected: PASS。

- [ ] **Step 4: Commit** `git add apps/web/src/lib/api/git.ts apps/web/src/lib/query/git.ts && git commit -m "feat(web): git write bindings + hooks (stage/unstage/commit/branch)"`

---

## Phase 1：可复用文件操作核心（IDE 与未来 /files 共用）

### Task 1.1：文件操作原语 features/files/api.ts

**Files:** Create `apps/web/src/features/files/api.ts`

- [ ] **Step 1: 实现** —— 对 Task 0.x hooks 的薄封装，统一证据/toast/确认语义，供 FileTree/FileActionsMenu 与未来 `/files` 调用。导出：`useFileOperations()` 返回 `{ createDirectory, createFile, rename, copy, move, remove, archive, unarchive, saveContent, upload, download }`，内部组合对应 mutation + `toast`（`@/design/ui/sonner`）成功/失败证据。

```typescript
import * as React from "react";
import { toast } from "@/design/ui/sonner";
import { useCreateDirectoryMutation, useCreateFileMutation, useRenameFileMutation,
  useCopyFileMutation, useMoveFileMutation, useDeleteFilesMutation,
  useArchiveFilesMutation, useUnarchiveFileMutation, useWriteFileContentMutation } from "@/lib/query/files";
// types
type OpCtx = { rootId: string; directoryPath?: string };
export function useFileOperations() {
  const m = {
    createDir: useCreateDirectoryMutation(), createFile: useCreateFileMutation(),
    rename: useRenameFileMutation(), copy: useCopyFileMutation(), move: useMoveFileMutation(),
    remove: useDeleteFilesMutation(), archive: useArchiveFilesMutation(),
    unarchive: useUnarchiveFileMutation(), save: useWriteFileContentMutation(),
  };
  // 每个 mutation.mutateAsync 包 try/catch，成功 toast.success(动作+路径)，失败 toast.error(动作+err.message)
  // 返回封装后的异步函数，签名见上
  // （实现略——按 mutation 名一一对应，错误用 apiRequest 抛出的 ApiError.message）
}
```

- [ ] **Step 2: Run** `npm run typecheck:web` Expected: PASS。

- [ ] **Step 3: Commit** `git add apps/web/src/features/files && git commit -m "feat(web): reusable file operations primitive"`

### Task 1.2：FileTree 组件

**Files:** Create `apps/web/src/features/files/FileTree.tsx`

- [ ] **Step 1: 实现** —— 懒加载树（`useQuery` browseFiles per directory），展开/折叠、面包屑（当前路径）、选中、键盘上下/左右、右键触发 `onContextMenu(path, entry)` 回调。props: `{ rootId, selectedPath?, onSelect(path), onContextMenu(ctx) }`。复用 `LoadingState/EmptyState/ErrorState`。空目录/隐藏文件开关可选。

- [ ] **Step 2: Run** `npm run typecheck:web` Expected: PASS。

- [ ] **Step 3: Commit** `git add apps/web/src/features/files/FileTree.tsx && git commit -m "feat(web): reusable FileTree component"`

### Task 1.3：FileActionsMenu（右键上下文菜单）

**Files:** Create `apps/web/src/features/files/FileActionsMenu.tsx`

- [ ] **Step 1: 实现** —— 基于设计 `@/design/ui` 的 Popover/Menu（若无则用受控定位 div + 点击外部关闭）。菜单项：新建文件/目录、重命名、复制、移动、下载、打包、解包、删除（danger，红色）。删除/覆盖类走确认 `Dialog`。调用 `useFileOperations()`。新增/重命名用 inline input 或小 Dialog。

- [ ] **Step 2: Run** `npm run typecheck:web` Expected: PASS。

- [ ] **Step 3: Commit** `git add apps/web/src/features/files/FileActionsMenu.tsx && git commit -m "feat(web): FileActionsMenu context menu"`

---

## Phase 2：全屏 IdeShell（脱离 AppShell）

### Task 2.1：IdeShell 骨架 + 路由

**Files:** Create `apps/web/src/features/ide/IdeShell.tsx`; Modify `apps/web/src/app/router.tsx`

- [ ] **Step 1: 写合同测试** `tests/system/web-ide-shell.test.mjs`：静态断言 `router.tsx` 把 `/ide` 路由渲染在 AppShell **之外**（`IdeShell` 不在 layout route children 内），且 `IdeShell.tsx` 导出 `IdeShell`。

```javascript
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const router = fs.readFileSync(new URL("../../apps/web/src/app/router.tsx", import.meta.url), "utf-8");
test("/ide renders IdeShell outside AppShell layout", () => {
  assert.match(router, /import \{ IdeShell \}/);
  // /ide 的 Route element 是 IdeShell，且出现在 AppShell layout Route 之外
  assert.ok(router.includes('<Route path="/ide" element={<IdeShell />} />'));
});
```

- [ ] **Step 2: Run** `node --test tests/system/web-ide-shell.test.mjs` Expected: FAIL。

- [ ] **Step 3: 实现 IdeShell.tsx** —— 全屏 `h-dvh w-screen` grid 容器：左侧细 ActivityBar（图标竖排：Files/Search/Git/Preview/Agent）+ 右侧主区（SidePanel + Editor + Preview 横排 + BottomPanel 底部 + StatusBar 最底）。各面板先用占位，后续 Task 填实。提供布局状态（当前 activity、面板折叠、分屏）用 useState/URL search params。

```tsx
export function IdeShell() {
  const [activity, setActivity] = React.useState<"files"|"search"|"git"|"agent">("files");
  return (
    <div className="grid h-dvh w-screen grid-cols-[var(--ide-activity)_minmax(0,1fr)] bg-canvas text-ink">
      <IdeActivityBar activity={activity} onChange={setActivity} />
      <div className="grid min-w-0 grid-rows-[minmax(0,1fr)_auto_auto]">
        <div className="grid min-h-0 grid-cols-[var(--ide-side)_minmax(0,1fr)_var(--ide-preview)]">
          <IdeSidePanel activity={activity} />
          <IdeEditorArea />
          <IdePreview />
        </div>
        <IdeBottomPanel />
        <IdeStatusBar />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 改 router.tsx** —— 把 `/ide` 的 `<Route>` 从 AppShell layout 内移出，置顶为独立路由 `element={<IdeShell/>}`。删除 `WorkspaceIdePage` import 与其 route。

- [ ] **Step 5: Run** `node --test tests/system/web-ide-shell.test.mjs` Expected: PASS。`npm run typecheck:web` PASS。

- [ ] **Step 6: 删除旧只读实现** `git rm apps/web/src/features/ide/WorkspaceIdePage.tsx`。

- [ ] **Step 7: Run** `npm run build:web` Expected: PASS。

- [ ] **Step 8: Commit** `git add -A && git commit -m "feat(web): full-bleed IdeShell outside AppShell, remove read-only WorkspaceIdePage"`

### Task 2.2：ActivityBar + StatusBar

**Files:** Create `apps/web/src/features/ide/panels/ActivityBar.tsx`, `StatusBar.tsx`

- [ ] **Step 1: 实现** ActivityBar（图标按钮 Files/Search/Git/Agent，active 高亮，aria-label/tooltip；Agent 标 P3 占位禁用）。StatusBar（branch 来自 git status、changes 数量、当前文件路径+光标位、save-state、agent/model 占位）。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): IDE activity bar + status bar"`

---

## Phase 3：IDE Explorer（文件管理，复用核心）

### Task 3.1：IdeExplorer

**Files:** Create `apps/web/src/features/ide/explorer/IdeExplorer.tsx`

- [ ] **Step 1: 实现** —— SidePanel 在 activity=files 时渲染 `<IdeExplorer>`：`<FileTree rootId onSelect onContextMenu>` + `<FileActionsMenu>`（来自 Phase 1）。顶部工作目录根选择（summary roots）+ 新建按钮。`onSelect(path)` → 打开到编辑器（Phase 4）。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): IDE Explorer (reusable file core)"`

### Task 3.2：Git 视图（SidePanel activity=git）

**Files:** Create `apps/web/src/features/ide/explorer/GitPanel.tsx`

- [ ] **Step 1: 实现** —— 变更文件列表（`useGitStatus`）分 staged/unstaged/untracked；每项 stage/unstage 按钮 + 点击在编辑器打开 diff（`getGitDiff`）。底部 commit 消息输入 + 提交按钮（`useCommitFilesMutation`）。分支切换下拉（`useCreateBranchMutation`/checkout）。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): IDE Git panel (stage/unstage/commit)"`

---

## Phase 4：CodeMirror 编辑器

### Task 4.1：CodeEditor 组件

**Files:** Create `apps/web/src/features/ide/editor/CodeEditor.tsx`

- [ ] **Step 1: 实现** —— 给定 `{ path, content, readOnly? }`，挂载 CodeMirror 6 EditorState/EditorView，按扩展名选语言包（js/ts/json/md/html/css/python/sql/yaml，已依赖）。theme one-dark/默认随主题。对外 `onChange(value)` + `dirty` 由父管。大文件（超阈值，如 1MB）只读降级用 `CodeBlock`。

```tsx
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
// ...其它语言 + oneDark
```

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): CodeMirror 6 code editor"`

### Task 4.2：EditorTabs + 编辑区编排 + 保存

**Files:** Create `apps/web/src/features/ide/editor/EditorTabs.tsx`, `EditorArea.tsx`

- [ ] **Step 1: 实现 EditorArea** —— 多 tab 状态（path 列表 + active），最多 2 分屏（左右）。每 tab 懒加载 `readFile` → `<CodeEditor>`。脏状态跟踪；`Cmd/Ctrl+S` → `useWriteFileContentMutation` → 成功清脏 + invalidate git。关闭 tab 有未保存时 `Dialog` 确认。EditorTabs：tab 列表 + dirty 标记 + 关闭按钮 + 拖拽排序（可选）。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): multi-tab editor area with save semantics"`

---

## Phase 5：Markdown 实时预览

### Task 5.1：MarkdownPreview

**Files:** Create `apps/web/src/features/ide/preview/MarkdownPreview.tsx`

- [ ] **Step 1: 实现** —— 接受当前编辑器内容（节流 ~150ms，useEffect+timeout），用已有管线 `unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeRaw).use(rehypeStringify)` 生成 HTML，经 `dompurify.sanitize`，`dangerouslySetInnerHTML`（代码块接 highlight.js；mermaid 可选）。非 MD 文件时 Preview 显示提示或代码预览（CodeBlock）。错误降级显示原文。

```tsx
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import DOMPurify from "dompurify";
```

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): Markdown live preview (remark/rehype/dompurify)"`

---

## Phase 6：终端面板

### Task 6.1：IdeTerminal（xterm + node-pty）

**Files:** Create `apps/web/src/features/ide/terminal/IdeTerminal.tsx`

- [ ] **Step 1: 实现** —— `@xterm/xterm` Terminal + addon-fit/webgl/web-links。会话管理：新建（`useLaunchTerminalMutation` + profile codex/claude/opencode）、选择、关闭（`useEndTerminalSessionMutation`）。连 `/api/terminal/sessions/:id/stream`（SSE/HTTP-stream，按后端 line-delimited JSON），写输入用后端输入端点（READ `terminal/routes.ts` 的 input/resize 端点确认 path+body）。resize 同步（addon-fit + resize 端点）。断线重连。

- [ ] **Step 2: Run** `npm run typecheck:web` PASS。

- [ ] **Step 3: Commit** `git commit -am "feat(web): IDE terminal panel (xterm + node-pty)"`

---

## Phase 7：验证

### Task 7.1：合同测试 + smoke 升级

**Files:** Modify `tests/system/web-ide-shell.test.mjs`（Task 2.1 已建），Create `scripts/smoke-web-ide.py`

- [ ] **Step 1: 扩合同测试** —— 断言 IdeShell 渲染、Explorer 引用 `features/files`（复用核心）、CodeEditor 引用 `@codemirror`、MarkdownPreview 引用 `remarkParse`、终端引用 `@xterm/xterm`、`/files` 路由仍存在（P1 不动）。

- [ ] **Step 2: 升级 smoke** `scripts/smoke-web-ide.py` —— 桌面 1440 + 移动 390 打开 `/#/ide`，断言 IdeShell 全屏渲染（#root 含 activitybar/explorer/editor/preview/bottom/statusbar 文本/选择器）、0 console error、0 横向溢出；交互冒烟：新建文件→编辑→保存→Markdown 预览出现→终端 tab 可见（不强制真实命令）。

- [ ] **Step 3: Run** `npm run dev:restart` then `python3 scripts/smoke-web-ide.py` Expected: SMOKE PASSED。`node --test tests/system/web-ide-shell.test.mjs` PASS。

- [ ] **Step 4: 全闸** `npm run typecheck:web && npm run build:web` PASS。

- [ ] **Step 5: Commit** `git commit -am "test(web): IDE P1 contract + playwright smoke"`

### Task 7.2：文档更新

**Files:** Modify `docs/当前进展.md`, `docs/工作区IDE目标.md`

- [ ] **Step 1: 更新** 当前进展记录 IDE P1 完成（全屏壳+文件管理核心+编辑器+MD 预览+终端）；工作区IDE目标标 P1 完成、P2/P3/P4 待续；记录 `/files` 全功能管理器为 track B。

- [ ] **Step 2: Commit** `git add docs && git commit -m "docs: record Workspace IDE P1 complete"`

---

## Self-Review

- **Spec 覆盖**：spec §2-9 每节均有任务（架构→Task2.1；Explorer/文件管理→Phase1+3；编辑器→Phase4；MD 预览→Phase5；终端→Phase6；错误/确认→Task1.1+各；测试→Phase7）。§11 /files track B 明确不在 P1。
- **占位扫描**：无 TBD；所有后端端点与 payload 字段来自 `types/files.ts` 与 `routes.ts` 实测；CodeMirror/xterm/remark 管线函数名与依赖一致。
- **类型一致**：`writeFileContent`/`createDirectory`/... 命名在 Task0.1 定义，0.2 hook 与 1.1 原语复用同名；FilesWritePayload.path/content、FilesDeletePayload.paths 等字段与 types 一致。
- **风险**：xterm 在 SSR/构建需 `import` 动态化避免 break（实现期注意 `useEffect` 内 new Terminal）；CodeMirror EditorView 需在 effect 内创建并 dispose。这些是已知 React 集成点，非占位。
