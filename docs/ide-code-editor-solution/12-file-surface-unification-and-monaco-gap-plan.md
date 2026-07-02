# File Surface Unification & Monaco Gap Plan

Status: Implemented / verified
Created: 2026-07-01
Scope: 文件管理器中的文件打开、编辑、检查、媒体预览、Monaco 能力补齐
Branch context: implemented through M2 and M2.x, merged to `main`

## 1. 本轮问题结论

用户反馈的问题可以合并为一个产品架构问题：

```txt
文件管理器曾经同时存在“新 Monaco 在线编辑器”和“旧 FilePreviewPanel 预览/编辑器”。M2 已把这些入口统一到一个 File Surface。
```

已完成目标：不再做第三套窗口，而是统一成一个文件表面（File Surface）：

```txt
双击 / 右键编辑 / 检查文件 / 操作列编辑 / 快捷键打开
  -> 同一个文件表面窗口
  -> 文本与代码使用 Monaco
  -> 图片/视频/音频/PDF/二进制等使用对应预览器
  -> 未知但可文本读取的文件仍用 Monaco plaintext
  -> 不可读取或不支持的文件显示统一的安全预览/下载/属性面板
```

## 2. 对 8 个问题的直接回答

### 2.1 Monaco 其它文件支持高亮了吗？

**现状：大部分 Monaco 内置 basic languages 已支持懒加载高亮；语言识别已从“只看扩展名”升级为“Monaco 元数据 + 文件名/扩展名 + firstLine/MIME + 有界内容样本”。**

当前代码状态：

- `scripts/generate-monaco-language-loaders.mjs` 扫描已安装 `monaco-editor` 包生成语言 loader。
- `apps/web/src/features/file-manager/code-editor/monacoLanguageLoaders.ts` 当前覆盖：
  - basic language contributions: 81
  - rich language contributions: 4
  - rich aliases: 5
  - total language ids: 82
- TS / HTML 已有 smoke 验证：`tests/file-manager/file-manager-monaco-highlighting.smoke.mjs`。

还不等于“所有文件名都一定高亮”：

- 文件由 `apps/web/src/shared/editor-core/language.ts` 映射到 Monaco language id；该 resolver 复用 Monaco 官方 metadata，并对未知扩展名、无扩展名和备份后缀文件做有界内容样本识别。
- 典型已覆盖：`openclaw.json.last-good`、`openclaw.json.bak.2`、`openclaw.json.backup`、`openclaw.json.pre-update`、`openclaw.json.clobbered.<timestamp>`、无扩展名 JSON（如 `123`）。
- 大 JSON 不会为了识别语言做完整 `JSON.parse`；只用有界前部样本判断 JSON 结构，小 JSON 才严格 parse 以降低误判。
- 没有映射且内容无法可靠识别的文件会进入 `plaintext`，这是安全 fallback。
- Monaco 不提供某语言 tokenizer 的文件无法凭空高亮，除非后续加依赖或自定义 Monarch grammar。

### 2.2 Monaco 所有快捷键和功能都支持了吗？

**现状：Monaco editor contributions 已大幅启用，但不能声明“所有快捷键都无条件可用”。**

已启用：

- `CodeEditor.tsx` 导入 `monaco-editor/esm/vs/editor/edcore.main.js`，这会注册 Monaco 大部分编辑器 contribution。
- Monaco 自带 find/replace、hover、suggest、folding、multicursor、line/word operations、context menu 等能力已交给 Monaco。

限制：

- 部分功能需要对应 provider / worker / language service。例如 rename、format、code action、semantic tokens，不是所有语言都有。
- 外层文件管理器也有 Ctrl/Cmd+C/X/V/A/N/U/Enter/F5 等快捷键，必须隔离 Monaco 焦点区域，否则会抢 Monaco 快捷键。
- 移动端/浏览器安全策略会限制剪贴板、文件系统和部分快捷键。

### 2.3 Monaco 所有功能都能利用上了吗？

**现状：核心编辑能力已按 Monaco-first 打开；仍不承诺所有语言都有 LSP 级能力。**

已利用：

- 编辑器 contribution 批量启用。
- 全 installed basic language lazy loading。
- rich workers: CSS / HTML / JSON / TypeScript-family。
- Monaco 原生 find/replace、context menu、selection、folding、minimap、sticky scroll、word wrap、large file optimization。

未充分利用：

- Monaco DiffEditor 尚未用于冲突 compare。
- LSP 级 rename/format/code action 仍需要后续 provider/LSP 轨道。
- 后续重点转向 Mini Explorer / Explorer Core，而不是重复实现 Monaco 内部 UI。
- Monaco zh-CN NLS 已在 editor API/contributions 前加载。
- 快捷键隔离已有系统化 smoke 测试。
- 语言 worker/provider 只覆盖 Monaco 官方 rich languages，不是所有语言都有智能服务。

### 2.4 Monaco 跟随系统语言了吗？默认中文了吗？

**现状：Monaco UI 已默认中文；主题仍跟随应用主题偏好。**

当前项目已同时处理主题和语言本地化：

- `themeMode = auto | light | dark`
- `effectiveTheme = themeMode === "auto" ? theme : themeMode`
- `CodeEditor.tsx` 在 Monaco editor API/contribution 模块前加载 `monaco-editor/esm/nls.messages.zh-cn.js`。
- `tests/file-manager/file-manager-monaco-nls.smoke.mjs` 覆盖 Find widget 中文文案。

后续如果需要跟随应用语言，应保持 NLS 初始化顺序约束：语言包必须早于 Monaco 主 editor/contribution 模块。

### 2.5 为什么 Ctrl+C 然后 Ctrl+V 后编辑器会闪退？

**已修复：根因是外层文件管理器快捷键捕获与 Monaco 内部剪贴板快捷键冲突。**

历史根因：

- `FileManagerPage.tsx` 的 `handleFileManagerKeyDown` 在文件管理器容器上处理：
  - Ctrl/Cmd+C -> 文件剪贴板 copy
  - Ctrl/Cmd+X -> 文件剪贴板 move
  - Ctrl/Cmd+V -> 打开复制/移动 dialog
- 旧判断只排除 input/textarea/select/contentEditable。
- Monaco 的真实焦点节点、view lines、overlay widget、find widget 并不总是普通 textarea target。
- 因此 Monaco 内 Ctrl+C / Ctrl+V 可能被文件管理器当成“复制/粘贴文件”处理，触发外层 dialog 或重挂载，表现成编辑器闪退。

当前修复原则：

```txt
只要事件 target 位于 [data-editor-shortcuts="ignore"], [data-code-editor="monaco-direct"], .monaco-editor, .find-widget 内，文件管理器不得处理 Ctrl/Cmd+C/X/V/A 等编辑器快捷键。
```

### 2.6 是否存在多个编辑器窗口？旧版本是否应该删除？

**当前状态：旧版本已经删除，文件管理器只保留统一 File Surface。**

当前文件：

- 统一 File Surface：`apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx`
- Monaco host：`apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
- 旧 `apps/web/src/features/file-manager/FilePreviewPanel.tsx` 已删除。

当前路由：

- `openFileSurface` 进入在线编辑器 tab 生命周期。
- 文本/代码由 Monaco 渲染。
- 图片/视频/音频/PDF/二进制由 File Surface 内部 preview panel 渲染。

结论：

- 不再保留旧文本编辑器、旧二进制编辑器、旧文件预览壳。
- 后续不要新增平行预览窗口；媒体/文档能力继续作为 File Surface panel 扩展。

### 2.7 双击打开文件、右键编辑/检查文件是否应变成同一个编辑器？

**应该。**

统一后入口语义：

| 入口 | 目标行为 |
|---|---|
| 双击文件 | 打开统一 File Surface |
| 右键“编辑” | 打开统一 File Surface，并优先聚焦 Monaco 编辑模式 |
| 右键“检查文件” | 打开统一 File Surface，并展示合适的 inspect/preview tab |
| 行操作列“编辑” | 所有文件可见或改名为“打开/编辑”，由 File Surface 内判断是否可编辑 |
| Ctrl/Cmd+Enter / Space | 打开统一 File Surface |

### 2.8 媒体文件、所有文件如何编辑/预览？

目标分类：

| 文件类型 | 默认打开 | 是否可编辑 | 实现建议 |
|---|---|---:|---|
| text/code/json/yaml/md 等 | Monaco | 是 | read API + Monaco language mapping |
| unknown text-like | Monaco plaintext | 是 | 不伪造语言，高亮 fallback |
| image | MediaPreview image | 否，后续可 metadata/rename | 原生 `<img>`，可后续加缩放/旋转库 |
| video | MediaPreview video | 否 | 原生 `<video controls>` 优先 |
| audio | MediaPreview audio | 否 | 原生 `<audio controls>` 优先；波形后续再考虑依赖 |
| PDF | DocumentPreview | 否/后续可注释 | 可考虑 `pdfjs-dist`，需评估 bundle/worker |
| binary/archive/unknown | BinaryInspector | 否 | 元数据、下载、复制路径、可选前 N bytes/hex |
| large/truncated text | Monaco readonly | 否 | 继续使用 large-readonly profile |

依赖策略：

1. 先用浏览器原生能力：image/video/audio/object/embed。
2. PDF 如需要页码/缩放/搜索，再引入 `pdfjs-dist`。
3. 图片如需要缩放/旋转/缩略图墙，再评估轻量 pan/zoom 库；不要为首版引大包。
4. 音频波形不是首版必须；如需要再评估 wavesurfer 类库。

## 3. 当前代码证据

| 证据 | 含义 |
|---|---|
| `FileManagerPage.tsx` lazy import `FileOnlineEditorDialog` | 当前只保留统一在线 File Surface 入口 |
| `FileManagerPage.tsx` `openFileSurface` 直接进入 `openFileOnlineEditor` | 双击、编辑、检查等文件打开路径共用在线编辑器 tab 生命周期 |
| `tests/system/web-file-manager-domain.test.mjs` 断言无 `LazyFilePreviewDialog` / `FilePreviewPanel` import | 旧预览壳已从运行时路径删除 |
| `FileOnlineEditorDialog.tsx` `FileSurfacePreviewPanel` | 非文本文件在同一窗口内按 image/video/audio/pdf/binary 渲染 |
| `CodeEditor.tsx` 导入 `edcore.main.js` | Monaco editor contribution 已批量启用 |
| `monacoLanguageLoaders.ts` 由 generator 生成 | Monaco language coverage 懒加载 |
| `monacoLanguageMetadata.ts` 由 generator 生成 | language resolver 可复用 Monaco 官方 extensions / filenames / filenamePatterns / firstLine / mimetypes 元数据 |
| `language.ts` `detectLanguageForFile` | 未知扩展、无扩展和备份后缀文件通过有界内容样本识别语言，安全回退 plaintext |
| `FileManagerPage.tsx` 快捷键处理已过滤 editor-owned descendants | 文件管理器不再抢 Monaco 剪贴板快捷键 |
| `CodeEditor.tsx` 根节点有 `data-editor-shortcuts="ignore"` | 编辑器区域是快捷键隔离边界 |

## 4. 已落地目标架构

### 4.1 统一 File Surface

当前组件边界：

```txt
FileSurfaceDialog
  FileSurfaceTabStrip
  FileSurfaceToolbar
  FileSurfaceBody
    MonacoTextEditorPanel
    MediaPreviewPanel
    BinaryInspectorPanel
    UnsupportedFilePanel
  FileSurfaceStatusBar
```

状态已从旧 preview tabs 与 online editor tabs 两套合并为一套 online editor tabs。目标类型可表达为：

```ts
type FileSurfaceMode = "text" | "image" | "video" | "audio" | "pdf" | "binary" | "unsupported";

type FileSurfaceTab = {
  id: string;
  rootId: string;
  entry: FileEntrySummary;
  mode: FileSurfaceMode;
};
```

### 4.2 打开路由

统一函数：

```ts
openFileSurface(entry, { intent: "open" | "edit" | "inspect" })
```

行为：

1. directory -> navigate
2. file -> classifyFileSurface(entry)
3. 打开同一个 FileSurfaceDialog tab
4. 根据 mode 渲染 Monaco / Media / Binary / Unsupported

### 4.3 文件类型判断

优先级：

1. 后端已返回的 `textLike`, `imageLike`, `ext`, `size`, `mime`（如有）。
2. 扩展名映射：image/video/audio/pdf/archive/binary。
3. 读取 API 结果：`textLike`, `editable`, `truncated`。
4. fallback：binary inspector / unsupported。

应补强后端/类型：

- 增加或规范 `mime` 字段。
- 区分 `mediaKind`: image/video/audio/pdf/archive/binary/text。
- 为媒体预览提供安全 file URL / blob endpoint，避免把大二进制读成文本。

## 5. Monaco 能力补齐清单

### M2.1 Monaco 本地化

- 默认加载 `monaco-editor/esm/nls.messages.zh-cn.js`。
- 必须保证在 `edcore.main.js` 之前。
- 增加 smoke：打开 Monaco find widget，断言中文文案或至少不再是英文默认关键文案。

### M2.2 快捷键隔离

- 扩展 `isEditableEventTarget`：
  - `.monaco-editor`
  - `[data-code-editor="monaco-direct"]`
  - `[data-editor-shortcuts="ignore"]`
  - `.find-widget`
  - `.suggest-widget`
  - `.context-view`
- 增加 smoke：Monaco 内 Ctrl/Cmd+C 后 Ctrl/Cmd+V 不关闭/重挂载编辑器，不打开文件复制/移动 dialog。

### M2.3 Monaco action coverage diagnostic

- 开发/测试环境可暴露只读诊断：`editor.getSupportedActions().map(a => a.id)`。
- smoke 覆盖核心 action：
  - `actions.find`
  - `editor.action.startFindReplaceAction`
  - `editor.action.commentLine`
  - `editor.action.formatDocument`（provider 存在时）
  - `editor.action.rename`（provider 存在时）
- 不承诺所有 action 在所有语言都有 provider。

### M2.4 DiffEditor 复用

- 外部修改 compare 使用 `monaco.editor.createDiffEditor`。
- 旧 `<pre>` compare 保留为移动/降级 fallback。

### M2.5 Language mapping audit

- 保持 `node --test tests/system/monaco-language-loaders.test.mjs`。
- 增加抽样 smoke：ts/html/css/json/md/python/yaml/shell/sql，以及未知扩展、无扩展、备份后缀 JSON。
- language resolver 不解析完整大 JSON；使用有界样本识别，避免为了高亮判断放大大文件成本。
- 对无法高亮的扩展，明确进入 plaintext。

## 6. 旧 FilePreviewPanel 迁移/删除策略

已按“三步走”完成：先迁移有价值的预览能力，再切入口，最后删除旧状态和旧组件。

### M2.6 抽取旧预览中仍有价值的能力（已完成）

已迁移/保留的能力：

- metadata grid
- image preview 如已有
- binary/unsupported 提示如已有
- error boundary 经验

迁移目标：统一 `FileSurfaceDialog` 内的 `MediaPreviewPanel` / `BinaryInspectorPanel`。

### M2.7 切入口（已完成）

以下路径已统一改为 `openFileSurface` 或等效在线 File Surface 打开路径：

- `openEntry`
- `Ctrl/Cmd+Enter`
- `Space`
- SecondaryDock `onOpenFile`
- ContentIndex `onOpenFile`
- FileList `onOpen`
- FileList `onEdit`
- FileActionsMenu `onPreviewRequest`
- FileActionsMenu `onEditRequest`
- BulkActionBar edit/open

### M2.8 删除旧状态和旧组件（已完成）

已删除：

- `previewTabs`
- `activePreviewTabId`
- `LazyFilePreviewDialog`
- `openFilePreview`
- `closePreviewWindow`
- `FilePreviewPanel.tsx` 中已迁移且无调用的旧编辑器/预览壳

当前保留：

- 运行时只保留 `FileOnlineEditorDialog` 作为统一 File Surface 壳。
- 后续如重命名为 `FileSurfaceDialog`，应作为独立小重构处理，避免和 Mini Explorer 混在一个提交。

## 7. 实施计划

### M2.0 — 评估与计划

Status: Complete.

产物：

- 本文档。
- README 链接更新。
- 现状差距明确。

### M2.1 — 快捷键隔离与 Ctrl+C/V 闪退修复

Status: Complete.

任务：

- 扩展 shortcut ignore 判断。
- 确保文件管理器全局 Ctrl+C/X/V 不处理 Monaco 内事件。
- 增加 smoke 复现。

验收：

- Monaco 内复制粘贴不关闭 editor、不打开文件 copy/move dialog。
- `npm run smoke:file-manager:online-editor` 通过。

### M2.2 — Monaco zh-CN 本地化

Status: Complete.

任务：

- 在 Monaco 主模块加载前加载 zh-cn NLS。
- 增加本地化 smoke 或 DOM 文案断言。

验收：

- Find/command/context menu 等 Monaco UI 优先中文。
- 不破坏动态 import 和 build。

### M2.3 — 统一 File Surface 路由

Status: Complete.

任务：

- 新增 `classifyFileSurface(entry/read?)`。
- 新增 `openFileSurface`。
- 所有打开入口先改到统一函数。
- 暂时内部仍可复用 `FileOnlineEditorDialog` 结构，但不再由 textLike 分叉到旧窗口。

验收：

- 双击、右键编辑、右键检查、操作列、快捷键都进入同一个窗口。
- 非文本文件不再打开旧 `FilePreviewPanel`。

### M2.4 — 媒体预览面板

Status: Complete.

任务：

- 图片：`<img>` + contain + zoom controls（首版可无依赖）。
- 视频：`<video controls>`。
- 音频：`<audio controls>`。
- PDF：先用浏览器 `<object>` / `<iframe>`；如不满足再评估 `pdfjs-dist`。
- 二进制：metadata + download + copy path + unsupported message。

验收：

- 常见 image/video/audio/pdf/binary 打开不崩溃。
- 文本/代码仍走 Monaco。

### M2.5 — 删除旧 FilePreviewPanel

Status: Complete.

任务：

- 迁移后删除旧 lazy import、旧 state、旧组件。
- 删除或改写旧 preview smoke。

验收：

- `grep FilePreviewPanel` 无运行时调用。
- 不存在两个文件窗口。

### M2.6 — Monaco 能力诊断与语言抽样验证

Status: Complete.

任务：

- 增加 action coverage diagnostic。
- 增加语言抽样 smoke。
- 增加 language detector 系统测试，覆盖备份后缀、无扩展名和大 JSON 样本。
- 更新 `11-monaco-full-capability-plan.md`，把“rich override basic”修正为“rich + basic tokenizer compose”。

验收：

- 常见代码文件高亮稳定。
- 无扩展名/备份后缀 JSON 识别稳定，且不依赖完整文件 parse。
- Monaco action 清单可诊断。

## 8. 风险与约束

| 风险 | 说明 | 缓解 |
|---|---|---|
| 旧 FilePreviewPanel 过大 | 可能包含隐藏能力 | 先迁移能力再删除入口 |
| 媒体预览需要 blob/file endpoint | 当前 read API 偏文本 | 优先复用已有 download/read endpoint，必要时补后端 |
| Monaco NLS 初始化顺序 | 必须早于 editor imports | 单独入口模块，避免被静态 import 抢跑 |
| Ctrl/C/V 与文件剪贴板冲突 | 外层快捷键会抢编辑器 | data attribute + closest ignore |
| PDF 依赖体积 | `pdfjs-dist` 较重 | 首版原生 iframe/object，需求明确后再加 |
| “所有功能”表述过强 | Monaco 功能依赖 provider | 文档和 UI 均表达“可用时启用” |

## 9. 验证矩阵

必跑：

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:monaco-highlighting
```

新增建议：

```bash
npm run smoke:file-manager:monaco-clipboard
npm run smoke:file-manager:file-surface-routing
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:monaco-nls
```

最终删除旧预览前：

```bash
npm run build:web
npm run test:system
```

## 10. 决策

1. Monaco 是文本/代码编辑唯一内核。
2. 旧 FilePreviewPanel 已删除，不再承担文件打开主路径。
3. 文件管理器只保留一个文件窗口：File Surface。
4. 媒体/二进制是 File Surface 的不同 panel，不是另一个编辑器。
5. 不用 `editor.all.js`；继续 lazy language support。
6. 不承诺所有语言都有智能服务；承诺 installed Monaco language tokenizer 能懒加载，rich provider 可用时启用。
7. 默认 Monaco UI 中文化已完成。
8. Ctrl+C/V 快捷键隔离已完成，并有 smoke 覆盖。


## 11. 完成状态

M2/M2.x 已完成并合并到主线：

```txt
- Monaco 快捷键隔离与剪贴板 smoke 覆盖。
- Monaco zh-CN NLS。
- 统一 File Surface 路由。
- 文本/代码 Monaco；图片/视频/音频/PDF/二进制同窗预览。
- 删除旧 FilePreviewPanel / LazyFilePreviewDialog / previewTabs。
- Monaco language lazy loader 和高亮抽样验证。
- Monaco language metadata + bounded content detector 覆盖未知扩展、无扩展和备份后缀文件。
- 图片预览 pan/zoom/rotate/reset；视频/音频播放控制增强。
```

后续文件导航需求不应在本文继续扩张；进入 `13-mini-explorer-shared-explorer-plan.md`。
