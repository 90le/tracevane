# 全功能文件管理器设计方案（`/files`，track B）

> 日期：2026-06-24
> 状态：设计待确认
> 范围：把 `/files` 从只读证据浏览器（1126 行）重建为系统级全功能文件管理器（Finder/Explorer 级），比 IDE Explorer 与历史只读版本更全面。复用并扩展 Workspace IDE P1 已建的文件操作核心（`apps/web/src/features/files/`）。
> 与 IDE 的关系：IDE Explorer 是工作区集成子集；本管理器是独立、更全的系统级文件管理。两者共享 `useFileOperations` 原语与数据层，UI 各自呈现。

## 1. 背景与定位

- 产品优先级：网关/IM/CLI Agent 三底层核心 + IDE 为最核心延伸；文件管理是 IDE 之外的独立核心工具面，必须做且要比历史版更全。
- 现状：`/files`（`FilesPage.tsx`，1126 行）是只读浏览/搜索/预览/diff 证据浏览器，**不是文件管理**。
- 目标：系统级文件管理器——多视图（列表/网格/详细列）、完整元数据、缩略图、批量操作、拖拽、打包/上传/下载、搜索筛选排序、全键盘导航。

## 2. 复用与扩展

- **复用**（IDE P1 已建，在 `apps/web/src/features/files/`）：`useFileOperations()`（createDirectory/createFile/rename/copy/move/remove/archive/unarchive/saveContent/upload，统一证据/toast）、数据层 `lib/api/files.ts` + `lib/query/files.ts`（全部写绑定 + mutation hooks 已就绪）、`types/files.ts` 契约。
- **共享编辑控件（关键）**：文本编辑在 `/files` 与 `/ide` **共享同一控件**，而非各自实现或仅靠跳转。抽取 `apps/web/src/features/files/FileEditor.tsx`——封装 CodeMirror（复用 `features/ide/editor/CodeEditor.tsx`，或将其提升到 `shared/`）+ 内容读取 + 脏状态 + 保存（PUT `/api/files/content`）+ Cmd/Ctrl+S + saveState。`/ide` 的 `EditorArea` 重构为复用 `FileEditor`；`/files` 管理器的编辑/检视面板也用 `FileEditor`。这样编辑器、保存语义、脏状态、快捷键在两处完全一致（共享控件）。
- **扩展**：文件管理器比 IDE Explorer 需要更多 UI——多视图渲染、批量选择、拖拽移动、上传（拖放）、下载/打包下载、详细元数据列、缩略图。这些作为新组件加到 `features/files/`（manager 专用），不污染 IDE Explorer。

## 3. 布局（系统文件管理器形态）

```
┌Toolbar: 位置/面包屑 | 后退/上级 | 新建▾ | 上传 | 搜索 | 视图(列表/网格/详细) | 排序 ┐
├Sidebar: 位置(roots) + 最近 + 收藏 ┬── 主区（当前目录 listing）──────────────────┤
│  树/快捷                          │  [ ] name    size    modified  type   ... │
│                                  │  多选 + 批量操作栏（选中 N：复制/移动/删除/打包/下载）│
│                                  │  拖放目标（拖入上传 / 拖出移动）              │
└──────────────────────────────────┴────────────────────────────────────────────┘
检视器（可选右侧）：选中项预览/元数据（复用 CodeBlock/MarkdownPreview 只读 + 缩略图）
```
- 响应式：桌面三区（侧栏+主区+检视器）；≤1080 收检视器为抽屉；移动端纵向堆叠 + 侧栏抽屉。
- 不使用 IDE 的全屏 IdeShell；`/files` 仍在 AppShell 下（系统工具页），但主区自占满。

## 4. 视图模式

- **列表视图**：紧凑行（图标+名+大小+时间），默认。
- **详细视图**：完整列（名/大小/修改时间/类型/权限/路径），可排序、可调列宽。
- **网格视图**：图标+名 tile，图片/视频显示缩略图（后端无缩略图端点时用 `download` 或类型图标占位；图片缩略图用 `<img src="/api/files/download?...">` 小尺寸，或类型 icon）。
- 切换持久化（localStorage）。

## 5. 文件操作（真 CRUD，全接现有后端）

- 单项：新建文件/目录、重命名、复制/移动（拖拽或对话框选目标）、下载、打包、解包、删除（危险确认）、**编辑（文本文件直接在管理器内编辑，使用共享 `FileEditor` 控件，与 `/ide` 一致的保存/脏状态/Cmd+S；非文本/二进制只读预览）**。
- **批量**：多选（Shift/Cmd + 框选）→ 批量复制/移动/删除/打包/下载。批量复用 `useFileOperations`（delete/archive 已支持 paths 数组；copy/move 循环或后端批量——核对后端是否支持批量，不支持则前端循环+进度）。
- **上传**：拖放上传 + 按钮（`upload`，dataBase64；大文件分片若后端支持，否则单文件）。
- **下载**：单文件 download；多文件 download-archive（后端 `GET /api/files/download-archive`）。
- 打包/解包：`archive`/`unarchive`（后端不支持"进入压缩包浏览"，故压缩包=解包到目录，不做 in-place 浏览）。
- 危险操作（删除/覆盖）一律确认 + 证据；删除为永久删除（后端无回收站——如实呈现"永久删除"，不伪造回收站）。

## 6. 搜索/筛选/排序

- 搜索：复用 `searchFiles`（名称+内容），结果列表。
- 筛选：按类型（文件/目录/图片/...）、按隐藏文件开关。
- 排序：名/大小/时间/类型，升降序。

## 7. 检视器（选中项）与内联编辑

- 右侧检视器：选中文件元数据（大小/时间/类型/路径）+ 图片缩略图。
- **文本/Markdown 文件：内联编辑**——检视器渲染共享 `FileEditor`（可编辑，与 `/ide` 同控件：CodeMirror + 脏状态 + PUT 保存 + Cmd/Ctrl+S + saveState）。非文本/二进制：只读预览（CodeBlock）。
- 多选时显示"N 项已选 + 合计大小"，不进入编辑。

## 8. 错误处理与边界

- 危险写确认 + 证据；批量操作显示进度/结果汇总（成功 N / 失败 M + 原因）。
- 空目录、无权限、大文件只读降级、上传失败重试，均诚实状态，不伪造。
- 不引入"回收站"伪能力（后端无）；明确"永久删除"。

## 9. 验收与测试

- `typecheck:web` / `build:web` 通过。
- 合同测试：断言 FilesPage 渲染多视图 + 绑定现有文件 CRUD 端点 + 复用 useFileOperations；`/ide` 与其他域不受影响。
- Playwright smoke（`scripts/smoke-web-files.py` 升级）：桌面+移动，列表/网格/详细切换、新建/重命名/删除流、批量选、搜索、上传入口——0 console error、0 横向溢出。
- 后端无变更回归（typecheck:api/build:api 不受影响）。

## 10. 非目标

- 不做"进入压缩包浏览"（后端无；压缩包=解包）。
- 不做回收站（后端无永久→回收语义；如实永久删除）。
- 不做权限/属主编辑（只读显示元数据）。
- 不复制 IDE 编辑器逻辑：文本编辑通过共享 `FileEditor` 控件（`/files` 与 `/ide` 共用），不各自实现。
- 不做云端/远程文件系统（本地优先，现有 roots）。

## 11. 分阶段（建议，单 spec 内增量）

- **P1**：布局（侧栏+主区+检视器）+ 列表/详细视图 + 完整 CRUD（单项+批量）+ 搜索/筛选/排序 + 上传/下载/打包 + 危险确认 + 键盘导航。
- **P2**：网格视图 + 图片缩略图 + 拖放移动/上传 + 检视器富预览。
