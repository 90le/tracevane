# File Surface Unification & Monaco Gap Plan

Status: Draft / analysis-ready for implementation
Created: 2026-07-01
Scope: 文件管理器中的文件打开、编辑、检查、媒体预览、Monaco 能力补齐
Branch context: `feat/file-manager-online-editor-monaco-first-cleanup`

## 1. 本轮问题结论

用户反馈的问题可以合并为一个产品架构问题：

```txt
文件管理器现在同时存在“新 Monaco 在线编辑器”和“旧 FilePreviewPanel 预览/编辑器”。
打开入口按 textLike 分流，导致不同文件进入不同窗口、不同编辑器能力、不同快捷键处理链路。
```

目标不是再做第三套窗口，而是统一成一个文件表面（File Surface）：

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

**现状：大部分 Monaco 内置 basic languages 已支持懒加载高亮，但仍需要区分“Monaco 有语言包”和“文件扩展名能映射到语言”。**

当前代码状态：

- `scripts/generate-monaco-language-loaders.mjs` 扫描已安装 `monaco-editor` 包生成语言 loader。
- `apps/web/src/features/file-manager/code-editor/monacoLanguageLoaders.ts` 当前覆盖：
  - basic language contributions: 81
  - rich language contributions: 4
  - rich aliases: 5
  - total language ids: 82
- TS / HTML 已有 smoke 验证：`tests/file-manager/file-manager-monaco-highlighting.smoke.mjs`。

还不等于“所有文件名都一定高亮”：

- 文件必须由 `apps/web/src/shared/editor-core/language.ts` 映射到 Monaco language id。
- 没有映射的扩展名会进入 `plaintext`，这是安全 fallback。
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

**现状：没有。已经从“残缺版”推进到“Monaco-first”，但仍有缺口。**

已利用：

- 编辑器 contribution 批量启用。
- 全 installed basic language lazy loading。
- rich workers: CSS / HTML / JSON / TypeScript-family。
- Monaco 原生 find/replace、context menu、selection、folding、minimap、sticky scroll、word wrap、large file optimization。

未充分利用：

- Monaco DiffEditor 尚未用于冲突 compare。
- Monaco command palette / quick access 没有文件管理器入口。
- `getSupportedActions()` 没有用于能力诊断/测试。
- 本地化没有加载 zh-cn NLS。
- 快捷键隔离没有系统化测试。
- 语言 worker/provider 只覆盖 Monaco 官方 rich languages，不是所有语言都有智能服务。

### 2.4 Monaco 跟随系统语言了吗？默认中文了吗？

**现状：没有证据表明已加载中文 NLS，所以 Monaco 自身 UI 不是默认中文。**

当前项目只做了主题跟随系统/偏好：

- `themeMode = auto | light | dark`
- `effectiveTheme = themeMode === "auto" ? theme : themeMode`

但语言本地化不同于主题：

- Monaco 官方 README 说明：要加载特定语言，需要在主 Monaco editor script 前加载对应 NLS script。
- 已安装包中存在 `node_modules/monaco-editor/esm/nls.messages.zh-cn.js`。
- 当前 `CodeEditor.tsx` 没有导入或动态注入 `nls.messages.zh-cn.js`。

目标：

- 默认中文：优先 `zh-cn`。
- 后续可跟随系统/应用语言：`zh-CN` -> `zh-cn`，英文 fallback。
- 必须保证 NLS 在 `edcore.main.js` 前初始化；否则已经加载的字符串不会完全切换。

### 2.5 为什么 Ctrl+C 然后 Ctrl+V 后编辑器会闪退？

**最可能原因：外层文件管理器快捷键捕获与 Monaco 内部剪贴板快捷键冲突。**

直接证据：

- `FileManagerPage.tsx` 的 `handleFileManagerKeyDown` 在文件管理器容器上处理：
  - Ctrl/Cmd+C -> 文件剪贴板 copy
  - Ctrl/Cmd+X -> 文件剪贴板 move
  - Ctrl/Cmd+V -> 打开复制/移动 dialog
- 它只通过 `isEditableEventTarget` 排除 input/textarea/select/contentEditable。
- Monaco 的真实焦点节点、view lines、overlay widget、find widget 并不总是普通 textarea target。
- `CodeEditor` 根节点有 `data-editor-shortcuts="ignore"`，但 `isEditableEventTarget` 没有使用这个标记。

推断：

- 当用户在 Monaco 内 Ctrl+C / Ctrl+V 时，事件可能冒泡到 FileManagerPage。
- 如果文件管理器里已有 selected file 或 fileClipboard，Ctrl+V 会触发外层 copy/move dialog 或状态变化。
- 这可能关闭/重挂载当前 editor，表现成“闪退”。

修复原则：

```txt
只要事件 target 位于 [data-editor-shortcuts="ignore"], [data-code-editor="monaco-direct"], .monaco-editor, .find-widget 内，文件管理器不得处理 Ctrl/Cmd+C/X/V/A 等编辑器快捷键。
```

### 2.6 是否存在多个编辑器窗口？旧版本是否应该删除？

**现状：是。新旧两套入口并存。**

当前文件：

- 新：`apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx`
- 新：`apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
- 旧：`apps/web/src/features/file-manager/FilePreviewPanel.tsx`

当前分流：

- `openEntry`: `entry.textLike ? openFileOnlineEditor(entry) : openFilePreview(entry)`
- Ctrl/Cmd+Enter、Space、二级 Dock、ContentIndex、右键“检查文件”仍会进入旧 `FilePreviewPanel`。
- 行操作列“编辑”只在 `entry.textLike` 时显示。

建议：

- 删除“旧文本编辑器/旧二进制编辑器/旧文件预览壳”的编辑职责。
- 不建议立即删除所有媒体预览能力；应先把有用的媒体预览迁移进统一 File Surface，再删除旧壳。

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
| `FileManagerPage.tsx` lazy import `FilePreviewPanel` 和 `FileOnlineEditorDialog` | 两套窗口并存 |
| `FileManagerPage.tsx` `previewTabs` / `onlineEditorTabs` 两套状态 | 预览和编辑生命周期分裂 |
| `openEntry` 使用 `entry.textLike ? openFileOnlineEditor : openFilePreview` | 双击按 textLike 分流 |
| `FileActionsMenu.tsx` 有“检查文件（弹窗）”和 textLike 才出现的“编辑” | 右键入口不统一 |
| `FileManagerList.tsx` 行编辑按钮只在 textLike 展示 | 非 textLike 文件不能通过同一编辑入口打开 |
| `CodeEditor.tsx` 导入 `edcore.main.js` | Monaco editor contribution 已批量启用 |
| `monacoLanguageLoaders.ts` 由 generator 生成 | Monaco language coverage 懒加载 |
| `FileManagerPage.tsx` `handleFileManagerKeyDown` 捕获 Ctrl/C/V | 存在抢 Monaco 剪贴板快捷键风险 |
| `CodeEditor.tsx` 根节点已有 `data-editor-shortcuts="ignore"` | 已有隔离标记，但外层尚未使用 |

## 4. 升级目标架构

### 4.1 统一 File Surface

新目标组件边界：

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

状态从两套合并为一套：

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
- 增加抽样 smoke：ts/html/css/json/md/python/yaml/shell/sql。
- 对无法高亮的扩展，明确进入 plaintext。

## 6. 旧 FilePreviewPanel 迁移/删除策略

不要直接一刀删，否则会丢媒体预览/二进制安全提示。建议三步：

### M2.6 抽取旧预览中仍有价值的能力

从 `FilePreviewPanel.tsx` 迁移：

- metadata grid
- image preview 如已有
- binary/unsupported 提示如已有
- error boundary 经验

迁移目标：统一 `FileSurfaceDialog` 内的 `MediaPreviewPanel` / `BinaryInspectorPanel`。

### M2.7 切入口

把以下路径全部改为 `openFileSurface`：

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

### M2.8 删除旧状态和旧组件

删除：

- `previewTabs`
- `activePreviewTabId`
- `LazyFilePreviewDialog`
- `openFilePreview`
- `closePreviewWindow`
- `FilePreviewPanel.tsx` 中已迁移且无调用的旧编辑器/预览壳

保留/重命名：

- 只保留新的 `FileSurfaceDialog`。
- `FileOnlineEditorDialog` 可以重命名为 `FileSurfaceDialog`，避免“在线编辑器只适合文本”的命名误导。

## 7. 实施计划

### M2.0 — 评估与计划

Status: 本文档完成后进入实现。

产物：

- 本文档。
- README 链接更新。
- 现状差距明确。

### M2.1 — 快捷键隔离与 Ctrl+C/V 闪退修复

优先级：最高。

任务：

- 扩展 shortcut ignore 判断。
- 确保文件管理器全局 Ctrl+C/X/V 不处理 Monaco 内事件。
- 增加 smoke 复现。

验收：

- Monaco 内复制粘贴不关闭 editor、不打开文件 copy/move dialog。
- `npm run smoke:file-manager:online-editor` 通过。

### M2.2 — Monaco zh-CN 本地化

任务：

- 在 Monaco 主模块加载前加载 zh-cn NLS。
- 增加本地化 smoke 或 DOM 文案断言。

验收：

- Find/command/context menu 等 Monaco UI 优先中文。
- 不破坏动态 import 和 build。

### M2.3 — 统一 File Surface 路由

任务：

- 新增 `classifyFileSurface(entry/read?)`。
- 新增 `openFileSurface`。
- 所有打开入口先改到统一函数。
- 暂时内部仍可复用 `FileOnlineEditorDialog` 结构，但不再由 textLike 分叉到旧窗口。

验收：

- 双击、右键编辑、右键检查、操作列、快捷键都进入同一个窗口。
- 非文本文件不再打开旧 `FilePreviewPanel`。

### M2.4 — 媒体预览面板

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

任务：

- 迁移后删除旧 lazy import、旧 state、旧组件。
- 删除或改写旧 preview smoke。

验收：

- `grep FilePreviewPanel` 无运行时调用。
- 不存在两个文件窗口。

### M2.6 — Monaco 能力诊断与语言抽样验证

任务：

- 增加 action coverage diagnostic。
- 增加语言抽样 smoke。
- 更新 `11-monaco-full-capability-plan.md`，把“rich override basic”修正为“rich + basic tokenizer compose”。

验收：

- 常见代码文件高亮稳定。
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
2. 旧 FilePreviewPanel 不再承担文件打开主路径。
3. 文件管理器只保留一个文件窗口：File Surface。
4. 媒体/二进制是 File Surface 的不同 panel，不是另一个编辑器。
5. 不用 `editor.all.js`；继续 lazy language support。
6. 不承诺所有语言都有智能服务；承诺 installed Monaco language tokenizer 能懒加载，rich provider 可用时启用。
7. 默认 Monaco UI 中文化是 M2 必做。
8. Ctrl+C/V 闪退先作为 M2.1 修复，不等旧预览删除。
