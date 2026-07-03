# M5.y-A IDE Editor Foundation 技术探查与接入计划

Status: Plan
Created: 2026-07-03
Scope: M5.y / M5.5-A
Previous: M5.x Terminal Split / Group / Panel Placement
Next suggested slice: M5.y-B Real Monaco Editor Panel

## 1. 目标

M5.y 的目标是把独立 IDE Workbench 的中间 EditorDock 从 Dockview placeholder 升级为真实可用的 Monaco 文件编辑器基础。

M5.y-A 只做技术探查、复用边界和实现切片计划，不实现真实编辑功能。

为什么放在 M6 前：M6 watcher/search/problems/output 需要稳定的真实 Editor 承载对象，包括 Monaco model、tab identity、dirty/save 状态、viewState、rename/move/delete 同步和大文件/非文本边界。继续在 placeholder 上推进 M6 会导致后续返工。

## 2. 已探查模块

### 现有 shared editor-core

路径：`apps/web/src/shared/editor-core/`

当前能力：

- `identity.ts`
  - `editorDocumentId(ref)`：稳定 document id。
  - `editorModelUriPath(ref)` / `editorModelUriString(ref)`：Monaco model URI 基础。
  - `editorTitleForPath(path)`：tab title 基础。
- `language.ts` / `monacoLanguageMetadata.ts`
  - 基于 Monaco 官方语言元数据、扩展名/文件名/内容样本的语言识别基础。
- `files.ts`
  - `readEditorFile(ref, signal, options)`：复用现有 Files API 读取内容与 metadata。
  - `saveEditorFile(request)`：复用现有 Files API 写入内容。
- `dirty.ts`
  - clean/dirty/saving/saved/error 状态转换 helpers。
- `types.ts`
  - `EditorFileRef`、`EditorDocumentId`、`EditorReadResult`、`EditorDirtyState`、`EditorSaveRequest` 等共享类型。

结论：M5.y 应优先扩展/复用 `shared/editor-core`，而不是在 `features/ide-workbench/editor` 内重写 identity/language/read/save/dirty。

### 现有 File Manager Online Editor / File Surface

路径：`apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx`

当前能力：

- 多 tab、dirty、保存当前/全部保存、关闭确认。
- Monaco viewState 捕获/恢复。
- 文件读取、写入、metadata/readVersion、保存冲突检测。
- reload/overwrite/force save 流程。
- 操作菜单、Mini Explorer、媒体/二进制 preview 边界。

结论：这里包含大量可复用规则，但当前实现是 File Manager 产品壳，不应直接搬进 IDE。M5.y 应抽取或复用底层服务/host 能力，保留 IDE 自己的 Dockview editor shell。

### 现有 Monaco host

路径：`apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`

当前能力方向：

- Monaco editor host。
- 全语言懒加载与 Monaco-first option profiles。
- File Surface 使用它承载文本/code 编辑体验。

结论：M5.y-B 应评估能否把 Monaco host 作为底层组件复用；若 File Surface chrome 或在线编辑器状态耦合过强，应抽薄底层 host，而不是复制第二套 Monaco 初始化/语言加载逻辑。

### 现有 IDE Workbench EditorDock

路径：`apps/web/src/features/ide-workbench/editor/`

当前能力：

- Dockview-backed Editor Area。
- Placeholder panel。
- IDE Explorer 打开文件到 Dockview placeholder tab。
- preview/pinned/dirty/deleted metadata 的基础类型。
- Editor tab 右键菜单包含 split right/down placeholder。
- Dockview layout serialize/restore。

结论：M5.y 应在这个目录内演进独立 Workbench editor shell，不应复用 File Manager Online Editor 弹窗容器。

## 3. 产品与架构边界

### 必须复用

```txt
- shared/editor-core：identity、model URI、language、dirty、read/save/types。
- apps/web/src/lib/api/files.ts 与 apps/web/src/lib/query/files.ts：现有 Files API。
- 现有 Monaco-first 策略和语言懒加载元数据。
- IDE Explorer 已有 rename/move/delete path sync 思路。
- Dockview layout persistence，只保存布局/metadata，不保存完整内容。
```

### 不复用

```txt
- FileOnlineEditorDialog 产品壳。
- File Manager Online Editor 的 window/tab/menu/statusbar 布局。
- Online Editor Mini Explorer 产品壳。
- 任何第二套 Files API。
- 任何第二套 Monaco language registry / dirty/save/conflict 规则。
```

### IDE Editor 独有职责

```txt
- Dockview editor group/tab/split/preview/pinned。
- Workbench 级 active editor、tab close、dirty confirm。
- 与 IDE Explorer 的 active file reveal / path sync。
- 后续 M6/M7 与 watcher/search/problems/LSP/Git/Debug 的承载接口。
```

### 分层原则

```txt
Dockview：只负责 editor layout、group、panel、tab 容器。
Monaco：负责文本模型、编辑行为、viewState、actions。
editor-core / IDE editor service：负责 file identity、read/save、dirty、conflict、metadata。
React Workbench shell：负责 tab metadata、commands、confirmation、status UI。
Files API：唯一文件读写来源。
```

## 4. 推荐实现切片

### M5.y-B：Real Monaco Editor Panel

目标：把 placeholder panel 替换为真实 Monaco text/code panel 的最小闭环。

范围：

```txt
- 新增 IDE editor service/hook，复用 readEditorFile。
- Dockview panel 内按 rootId/path 读取文件。
- 文本/code 文件显示 Monaco。
- 复用或抽薄现有 CodeEditor Monaco host。
- loading/error/retry 状态。
- binary/media/unsupported/large/truncated 文件显示明确 placeholder。
- Monaco model URI 使用 editorModelUriString。
- 切 tab/split 不重复失控创建 model。
```

不做：保存、dirty close confirm、M6 watcher/search/problems/output。

建议验证：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:ide:workbench-layout
# 可新增 smoke:ide:editor-foundation，先覆盖打开文本文件出现 Monaco 与 unsupported placeholder。
```

### M5.y-C：Save / Dirty / Close Confirm

目标：让 IDE Editor 成为可编辑保存的基础编辑器。

范围：

```txt
- Monaco onDidChangeModelContent 标记 tab dirty。
- Ctrl/Cmd+S 保存当前 active editor。
- 保存成功清 dirty，更新 modifiedAt/read metadata。
- 保存失败提示。
- dirty tab 关闭确认：保存 / 不保存 / 取消。
- reload/reopen 不丢 model 内容。
- 保存冲突流程复用 Online Editor 已有规则或抽共享 helper。
```

不做：Save As、复杂 compare UI、外部 watcher。

### M5.y-D：Preview / Pinned / Split / Path Sync

目标：补齐 Workbench editor 基础行为。

范围：

```txt
- 单击 Explorer：preview tab。
- 双击/编辑：pin tab。
- 已打开同一 rootId + path：激活已有 tab。
- split right/down 后每个 group 可承载独立 active editor。
- rename/move/delete 已打开真实 editor tab 时同步 path/title/model key/metadata/deleted。
- delete dirty 文件：保留 Monaco model 内容并标记 deleted，不能静默关闭。
- active file reveal 只在 IDE Explorer 当前范围内执行，不强制跳目录。
```

不做：完整 VS Code tab drag between groups、LSP/Git/Debug。

### M5.y-E：Docs / Acceptance

目标：M5.y 收口并给 M6 提供稳定入口。

范围：

```txt
- 更新 00 / 04 / 05 / 08 / 09 / 14。
- 更新 .codex/project-context.md 与 AGENTS.md 阶段状态。
- 新增 archive/m5y-execution-summary.md。
- 新增或扩展 smoke:ide:editor-foundation。
```

## 5. 风险与防偏移

| 风险 | 后果 | 防护 |
|---|---|---|
| 直接复制 FileOnlineEditorDialog 到 IDE | 产品壳耦合、菜单/窗口/状态栏不适配 Dockview | 只抽底层 host/service/rules，IDE shell 独立 |
| Dockview 持有文件 IO 或完整内容 | layout 序列化污染、保存/dirty 难统一 | Dockview 只保存 panel/layout metadata |
| 第二套 Monaco 初始化/语言加载 | 包体、bug、语言识别不一致 | 复用 CodeEditor host 或抽 shared Monaco host |
| React state 保存完整文件内容 | 大文件卡顿、内存泄漏、刷新/持久化风险 | 内容在 Monaco model，React 只存 metadata |
| M5.y 顺手做 M6/M7 | 阶段失焦，外部协议和 watcher 提前污染 | M5.y 只做 Editor Foundation；M6/M7 后置 |
| 大文件/二进制误进 Monaco | 性能和体验风险 | 读取 metadata 后走 unsupported/preview placeholder |

## 6. M6 入口条件

进入 M6 前，至少应满足：

```txt
- IDE Explorer 打开文本/code 文件后有真实 Monaco editor。
- tab dirty/save/close confirm 基础可用。
- rename/move/delete 已打开文件同步规则可解释且不丢 dirty 内容。
- Monaco model identity/viewState 生命周期稳定。
- binary/media/large/unsupported 文件边界清楚。
- smoke:ide:editor-foundation 通过。
```

只有这些成立后，M6 watcher/search/problems/output 才有可靠承载对象。
