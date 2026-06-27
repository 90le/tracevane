# Workspace 前端架构

> 状态：Active frontend architecture
> 更新：2026-06-25

## 1. 当前目录

```text
apps/web/src/features/workspace/
  WorkspacePage.tsx
  workbench/             # Dockview workbench + ActivityBar/SidePanel shell
  files/                 # explorer/search/context file actions only
  editor/                # editor stage, tabs, code editor
  preview/               # markdown/preview surface
  terminal/              # xterm/PTTY UI only
  git/                   # git changes/diff entry
  shared/                # owner/types
```

已删除：`agent/`、`evidence/`、`stores/`、独立 `WorkspaceFileManager` surface。未完成设计前不保留空 owner 或占位组件。

## 2. Owner boundary

| Owner | Owns | Must not own |
| --- | --- | --- |
| files | Explorer、Search、右键文件动作、root/path 选择 | Terminal session、CLI Agent run、Provider secret |
| editor | 打开文件、dirty/save、编辑 stage、tabs | 批量文件管理、terminal lifecycle |
| preview | Markdown/preview render | editor dirty state、文件批量操作 |
| terminal | shell session、xterm、resize、split panel | 文件管理主流程、CLI Agent readiness/run |
| git | changes、diff entry | generic file CRUD、terminal lifecycle |
| workbench | ActivityBar、SidePanel、Dockview pane orchestration、layout persistence | 业务 mutation、真实文件/终端事实源 |

## 3. 默认工作台

```text
Activity Rail | Side Panel        | Center Workbench | Bottom Dock
Files/Search/Git | 当前活动内容 | Editor/Preview    | Terminal
```

- Center 默认只含 `Editor / Preview`。
- `Explorer / Search / Git` 是固定侧边功能，由 ActivityBar 切换和收起；不要把它们恢复成 Dockview tab。
- 无文件时显示 editor empty state。
- 完整 FileOps 需要重新设计为显式模式；不再默认作为 center tab。

## 4. 状态策略

- Server state：TanStack Query。
- Layout prefs：localStorage + versioned model。
- Dock state：Dockview `api.toJSON()/api.fromJSON()` + versioned storage。
- 当前 Dockview storage key：`tracevane.workspace.dockview.v2`，只持久化 Editor/Preview/Terminal。
- Editor dirty state：Editor owner 内部管理，不让 Files/Terminal 直接写入。

## 5. Command-first 规则

所有低频/高级动作进入 command registry：

- open Files/Search/Git
- open Editor/Preview
- toggle sidebar/terminal
- split right/down
- maximize/restore/reset layout
- terminal split/unsplit
- layout presets

可见 UI 只保留当前任务必要入口；避免顶栏/面板头堆按钮。

## 6. 验收测试

每次 Workspace 迭代至少验证：

- `npm run typecheck:web`
- 默认 Workspace 不出现重复文件管理 surface
- desktop 无横向溢出
- mobile 使用 mode nav，不压缩桌面多栏
- command palette 可发现布局动作

## 7. Side Explorer P0

侧边文件管理由 `workspace/files` 拥有，当前可用能力：

- `WorkspaceExplorer`：root selector、toolbar、upload input、query refresh、hidden toggle、collapse reset、context menu orchestration。
- `FileTree`：lazy browse、分页加载更多、已加载项分段渲染（避免 DOM 暴涨）、keyboard navigation、hidden file toggle、file selection。
- `FileActionsMenu`：文件/目录 CRUD、归档/解归档、下载。
- `uploadManager`：单文件/批量/文件夹上传队列，保留 `webkitRelativePath`，走二进制分片上传，显示进度、速率、暂停、取消、localStorage checkpoint 续传和重名冲突策略。
- `fileOperations`：统一调用 Files mutation hooks 并发出 toast evidence。

上传与归档默认：

- 上传默认进入当前 Explorer 目录，不再写死根目录。
- 上传入口先打开上传管理弹层，不直接弹出系统文件选择器；工具栏和右键菜单都进入同一个上传管理器。
- 资源管理器聚焦时支持剪贴板文件直接粘贴快速上传；上传管理弹层打开时也支持粘贴，但只保留一个全局 paste 处理源，避免重复入队。
- 文件夹上传使用浏览器 `webkitdirectory` 能力；分片初始化仍携带 `relativePath` 以保留目录结构。
- 高性能上传主路径为 `/api/files/uploads/init` → `PUT /chunks/:index` → `/complete`，使用二进制 chunk，避免 base64 JSON 放大和一次性读完整文件。P3 增加同名同内容 SHA-256 校验：小于 512MB 的文件会计算浏览器端哈希，服务端命中相同内容时可免传并按策略跳过/覆盖/服务端复制为 `name (1).ext`。
- 暂停/续传按 chunk checkpoint 继续；checkpoint 写入浏览器 localStorage，页面刷新后重新选择同一文件可查询后端 upload status 并继续未完成分片；取消会清理后端临时分片。
- 重名冲突策略由弹窗用户选择：保留两者（默认，自动生成 `name (1).ext`）、覆盖、跳过、冲突时报错；资源管理器快捷粘贴不弹窗，固定使用默认“保留两者”。默认不覆盖以保护用户数据。
- 上传行展示后端最终目标路径；跳过文件显示“已跳过”，避免把 skip 当成已写入；上传弹窗关闭后保留侧栏任务条，可重新打开、暂停/继续/取消；任务快照写入 localStorage，刷新后展示“待恢复上传”，提示重新选择文件恢复。
- 服务端上传临时分片具备 24 小时 TTL 清理，入口在 init/status/chunk 请求时触发。
- 跨设备续传仍是后续增强项；当前已支持同 root 范围内 size/hash 命中的轻量复用，并维护按 root + sha256 前缀分片的内容索引库，避免文件增多后每次都扫描目录；索引管理 UI 后续归入独立文件管理器域。
- 打包保存目录默认为当前目录，可在 dialog 中改成指定相对路径。
- 解压目录默认为当前目录，冲突策略必须显式选择：失败、覆盖、跳过、自动重命名。

禁止：

- 在 Center 默认恢复完整 FileManager 表格；
- 让 Terminal 通过 shell 命令代替文件管理；
- 在未设计批量选择/拖拽前添加半成品按钮。


## 独立文件管理器域边界

`/file-manager` 是系统级文件管理器域，运行在 AppShell 内；它可以复用 Workspace 的 `WorkspaceExplorer`、`FileActionsMenu`、上传管理和文件查询 hooks，但不是 Workspace IDE 的一部分。内容索引库的统计、清理、重建和失效扫描都放在该域，避免 Workspace 编辑/终端工作面继续膨胀。

## 2026-06-25 编辑/预览/源码同标签页原则

Workspace IDE 顶部多标签页的最小单位是“文件”，不是“源码窗口”或“预览窗口”。每个文件标签内部可以切换：

- `源码`：Monaco 编辑器，负责代码高亮、快捷键查找/替换、基础 IDE 编辑能力。
- `预览`：Markdown/HTML/图片/视频/音频/PDF 等按文件类型渲染。
- `边写边预览`：Markdown/HTML 等文本渲染类文件在同一标签内左右分栏，左侧源码，右侧渲染结果。

因此资源管理器只负责打开文件；打开后所有编辑、预览、源码模式都归属于当前文件 tab。后续补强全局搜索、跨文件替换、多光标和 WYSIWYG 时，也必须遵守这个边界。

### 搜索与批量替换边界

Workspace 左侧 Search 面板负责跨文件检索。当前阶段支持在搜索结果内执行保守批量替换：逐个读取 text-like 文件、按当前查询字符串替换、写回并刷新文件查询缓存；失败文件不会阻断其余文件，最终 toast 给出成功/失败证据。更高级的正则跨文件替换、diff 预览、撤销包和审批回滚应作为下一阶段能力加入，而不能把替换动作藏到终端命令里。

#### 2026-06-25 替换预览确认

跨文件替换已从“点击即写入”改为“预览后确认”：Search 面板先读取当前 text-like 搜索结果，计算每个文件命中数和 before/after 摘要；用户在 `预览跨文件替换` 对话框确认后才逐个写回。该能力先保持字面量替换，regex/大小写保留/撤销包进入后续增强，避免高级语义和实际写入不一致。

#### 2026-06-25 批量替换撤销包

跨文件替换确认执行后，Search 面板会为成功写入的文件保留一次内存撤销包：路径、替换前内容、替换后内容、时间和查询信息。用户可立即“撤销上次替换”。撤销前会重新读取当前文件内容，只有当前内容仍等于替换后内容时才写回旧内容；如果文件已经被其它编辑改变，则跳过并报告失败，避免撤销覆盖用户后续修改。该撤销包目前是会话级内存能力，后续可升级为持久操作历史/恢复点。

#### 2026-06-25 替换预览 Diff 化

跨文件替换预览从纯摘要升级为文件级 diff 行：每个命中文件展示最多 8 个命中行，使用 `-`/`+` 双行对比并高亮被替换字面量。当前实现保持轻量、无新增依赖；更完整的 Monaco DiffEditor/多文件差异树可以在后续抽象为统一 Diff Workbench，但不能退回到只显示一行摘要后直接写盘。

#### 2026-06-25 Diff 预览组件共享化

替换预览的行级 diff 已从 `WorkspaceSearchPanel` 内部抽到 `workspace/shared/ReplaceDiffPreview.tsx`。该组件只负责纯展示和字面量差异行生成，不持有文件读写状态。后续 FileManager 的批量操作确认、操作历史详情、撤销包审阅都应复用它，避免每个文件域各自实现一套不一致的 diff UI。

## 2026-06-26：文件标签内统一编辑 / 预览 / 源码

- Workspace 不再把 Markdown/HTML/媒体预览建成独立 Dockview 窗口；`Preview` dock 面板入口被移除，避免同一个文件在布局层重复出现两个窗口。
- 文件 tab 是唯一的文档单元；`源码`、`预览`、`边写边预览` 是当前 tab 内部 view mode。拆分布局只拆编辑区域，不改变文件归属。
- 单文件查找/替换复用 Monaco 原生 find/replace action，并通过源码视图的轻量上下文按钮暴露；跨文件搜索/批量替换继续由左侧 Search 域负责，先 Diff 预览再确认写入。
- 设计原则：左侧活动栏负责资源管理/搜索/Git 的域切换；顶部编辑器 tab 负责文件生命周期；文档表现模式不再上升为独立窗口，防止 workspace 变成重复、低级、难理解的多面板堆砌。

### 2026-06-26 共享 DocumentPreview 渲染层

Workspace 与独立 FileManager 不再各自维护 Markdown/HTML/图片/视频/音频/PDF 的文件类型判断和渲染分支。`workspace/shared/DocumentPreview.tsx` 是轻量共享渲染层：只接收 path/content/rootId/downloadUrl/imageLike，不拥有 dirty/save/tab/layout 状态。Workspace 仍拥有文件 tab、view mode、dirty buffer；FileManager 仍拥有文件详情、下载、保存和操作历史。这样既保证两个功能域体验一致，也避免共享组件膨胀成新的“万能文件管理器”。

### 2026-06-26 共享 TextSearchReplaceStrip

单文件查找/替换条从 FileManager 私有实现抽到 `workspace/shared/TextSearchReplaceStrip.tsx`。共享层只负责当前文本内容的 literal/regex 计数与替换，不持有文件读写和保存状态；FileManager 传入 draft 内容与 onChange，Workspace 后续需要可视化单文件替换条时也必须复用该组件。跨文件搜索/批量替换仍由左侧 Search 域负责，并继续使用 Diff 预览和撤销包，不与单文件替换混为一个入口。

### 2026-06-26 Workspace 单文件查找替换条

Workspace 文件 Tab 的源码/边写边预览模式接入共享 `TextSearchReplaceStrip`，通过工具条“查找替换”开关按需展开，默认不占用编辑空间。替换结果只更新当前 tab 的 dirty buffer，不直接写后端；用户仍通过 Ctrl/⌘+S 或保存流程提交。Monaco 原生查找/替换快捷键继续保留，显式查找替换条用于可视化批量替换和与 FileManager 保持一致体验。

## 2026-06-26 共享 Document Workbench

Workspace Editor 与独立文件管理器现在共用 `workspace/shared/DocumentWorkbench.tsx` 作为当前文件工作台基础层。源码、渲染预览、边写边预览、当前文件查找替换、代码高亮和内联媒体预览都属于同一个文件 tab/context，不再在 Workspace 与 FileManager 分别复制一套“编辑窗口 + 预览窗口”。

边界：
- Workspace 继续拥有多 tab、dirty buffer、保存快捷键、Dockview 布局和跨文件 Search/Replace。
- FileManager 继续拥有系统文件操作、详情面板、保存按钮、操作历史和内容索引管理。
- `DocumentWorkbench` 只拥有当前文档的 view mode、源码编辑器、渲染预览和当前文档查找/替换；不直接写后端、不拥有文件列表、不拥有跨文件替换。

后续扩展 Monaco DiffEditor、Markdown WYSIWYG、HTML 所见即所得、Office/压缩包预览时，应优先作为 Document Workbench 的可插拔 viewer/editor，而不是把能力散落回两个功能域。

## 2026-06-26 Search Panel 批量替换选择模型

Workspace Search 继续作为跨文件搜索/批量替换 owner。当前阶段的批量替换必须先生成预览，预览内允许逐文件勾选/排除，并显示已选文件数与已选匹配数；确认后只写入已选文件，并保留可撤销包。隐藏文件搜索由用户显式开启，默认不纳入搜索和替换。

该模型与 `DocumentWorkbench` 的当前文件查找/替换互补：Workbench 负责单个文件标签内的编辑体验和 Monaco 高亮；Search Panel 负责跨文件范围、替换预览、选择性应用和撤销。不要再新增一个独立 Preview dock panel 来承载同一个文件的预览。

## 2026-06-26 同标签页文档工作台修正

研究记录：对照 VS Code 官方 User Interface / Markdown 文档、Monaco Editor API、CodeMirror search 文档后，继续采用轻量 Monaco + 自研文档工作台，而不是引入完整 Web IDE 套件；原因是当前需要保持 Workspace 可拆分 Dock、文件管理器独立域、上传/索引服务复用，并避免依赖膨胀。VS Code 的核心契约是“文件标签页是主对象，预览/源码/侧边预览是同一文档视图状态”，Monaco 提供代码高亮、查找/替换和 decorations 能力，CodeMirror 的搜索包证明查找替换应是编辑器基础能力而不是外置窗口。

落地约束：
- Workspace 顶部文件标签页仍然只表示文件；Preview/Edit/Source 不再创建第二个窗口或第二个标签页。
- 当前文件标签条右侧提供同标签页视图模式：`源码`、`预览`、`编辑+预览`；模式状态按 path 存储在 `viewModes`。
- `DocumentWorkbench` 继续作为 Workspace 与独立文件管理器共享的唯一文档工作台：源码编辑、预览、查找替换、高亮、媒体/PDF/HTML/Markdown 预览都在同一组件内聚合。
- Monaco 仍是源码编辑底座：保留原生 Ctrl/Cmd+F、替换动作，同时通过 decorations 展示 Tracevane 自研查找条的当前匹配/全部匹配高亮。
- 后续 WYSIWYG Markdown/HTML 预览内编辑必须作为同一 DocumentWorkbench 的新 mode 增量实现，不允许回到“一个文件拆成 editor/preview 两个窗口”的旧设计。

### 2026-06-26 预览时编辑基础模式

研究记录：MDN `contenteditable` 文档确认可编辑元素支持 `plaintext-only`，`input` event 适用于 contenteditable 与 `designMode`；MDN `HTMLIFrameElement.srcdoc` 与 `Document.designMode` 文档确认 HTML srcdoc 可作为内联预览文档并在 iframe 文档内启用编辑。基于这些浏览器原生契约，本阶段不新增 WYSIWYG 依赖，先在 `DocumentWorkbench` 内增加 `visual` mode。

落地约束：
- `visual` 仍是当前文件标签页内的 view mode，不是新 Dock 窗口、不创建第二个 tab。
- Markdown `预览时编辑` 采用块级 Markdown Live Editor：识别标题、列表、引用、代码缩进、段落和空行，在可视写作面板中编辑文本并同步回原 Markdown buffer，右侧保留实时渲染预览。
- HTML `预览时编辑` 使用 sandboxed srcdoc iframe + `document.designMode`，iframe 内输入同步回当前 HTML buffer。
- 该能力是无依赖基础层；后续若引入 ProseMirror/Tiptap/Plate 等富文本能力，必须先证明依赖收益大于体积和迁移成本，并继续复用 `DocumentWorkbench` 的同标签页边界。

### 2026-06-26 同标签页查找替换快捷键

当前文件的 `Ctrl/⌘+F` 与 `Ctrl/⌘+H` 统一收敛到 `DocumentWorkbench` 内部查找替换条：无论用户在源码、预览、编辑+预览中，都先打开同一文件标签页内的搜索 UI，并把焦点放到查找或替换输入框。Monaco 原生查找仍保留在源码编辑器内部作为高级代码编辑能力，但产品级入口必须保持“文件标签页 = 文档对象，源码/预览/查找替换 = 同一文档模式”。

### 2026-06-26 Document View Registry

文档预览/可视编辑能力抽到 `workspace/shared/DocumentViewRegistry.ts`。注册表只描述 viewer/editor 能力、扩展名、是否需要文本或下载 URL；具体渲染仍由 `DocumentPreview`、`VisualDocumentEditor` 承担。这样后续新增 Office、压缩包、日志、大文件抽样、二进制十六进制预览时，只需要新增 descriptor + renderer，不再把文件类型判断散落到 Workspace 和 FileManager。

设计边界：
- `DOCUMENT_VIEWERS`：Markdown、HTML、Image、Video、Audio、PDF、Text。
- `DOCUMENT_VISUAL_EDITORS`：Markdown、HTML。
- Workspace 与 FileManager 都只能通过 `DocumentWorkbench`/registry 使用这些能力；不要在页面级组件重新判断扩展名。
- HTML 普通预览使用 sandboxed `srcdoc`，不授予脚本能力；HTML 预览时编辑仍在受控 visual editor 内同步回当前文件 buffer。

### 2026-06-26 压缩包清单预览 Viewer

`DocumentViewRegistry` 增加 `archive` viewer，支持 `.zip/.tar/.tar.gz/.tgz/.tar.bz2/.tbz2/.tar.xz/.txz` 等当前后端已支持格式。Workspace 和 FileManager 选择压缩包文件时，不再只能下载或解压；详情/预览区会调用后端 `dryRunUnarchiveFile` 读取归档清单，并以默认 fail 策略对当前目录进行安全预检。

该 viewer 的定位是“只读清单 + 风险提示”，不是执行入口：真正解压仍需要进入文件操作弹窗选择目标目录和冲突策略。这样文件管理器更接近云服务/系统文件管理器，同时保持高风险解压操作的显式确认边界。

### 2026-06-26 大文本 / 日志切片预览

文件读取 API 增加 `offset/limit` 切片参数，并在返回体中暴露 `contentOffset/contentBytes/readLimitBytes`。默认仍读取首段最多 1 MiB；超过限制的文本文件保持只读，并在 `DocumentPreview` 中进入 `TextSlicePreview`。该预览只渲染当前切片前 2000 行，提供上一段/下一段/尾部导航，避免大日志、大 JSON、生成文件一次性塞入 Monaco 或 DOM 导致卡顿。

原则：
- 源码编辑仍使用 Monaco；大文件自动只读，避免高亮、折叠、替换等编辑器能力拖垮页面。
- 预览使用服务端字节切片，不在浏览器里加载完整大文件。
- FileManager 和 Workspace 共用同一个 `TextSlicePreview`，不要各自实现“大文件预览”。

### 2026-06-26 二进制 / Office / 未知文件安全占位预览

`DocumentViewRegistry` 增加 `binary` fallback viewer。当文件不是 text-like，且不是图片、音视频、PDF、压缩包等可安全内联预览类型时，Workspace/FileManager 展示 `BinaryFilePreview`：文件类型猜测、MIME、大小、路径、下载和“尝试浏览器打开”入口。该组件不会把二进制内容交给 Monaco、Markdown、HTML iframe 或 `<pre>`，也不会尝试执行或解析未知格式。

定位：这是系统文件管理器必须具备的专业兜底能力。Office、安装包、字体、镜像、动态库、未知 `application/octet-stream` 等文件都应有清晰说明和下载操作，而不是显示空白或“无法预览”。后续如引入 Office 在线预览或十六进制 viewer，也必须作为新的 registry viewer 增量接入。

### 2026-06-26 同标签文档模式与主题化编辑器

本轮继续收敛 Workspace / FileManager 的文档编辑模型：顶部文件 Tab 是唯一的文档对象，`源码`、`预览`、`编辑+预览`、`可视编辑` 都只是同一 Tab 内的 view mode，不允许再把 Preview 做成与 Editor 平级的 Dock 窗口。源码模式继续使用 Monaco，保留原生查找/替换动作，并叠加 Tracevane 当前文件查找替换条的 decorations 高亮与批量替换能力；模式切换增加 `Ctrl/⌘+Alt+1..4` 快捷键，避免用户在资源管理器、预览、编辑器之间来回找入口。

设计约束：代码编辑器主题必须跟随全局浅色/深色主题，浅色用 Monaco `vs`，深色用 `vs-dark`，浮层按钮也跟随 Aurora token，而不是固定深色编辑器。后续如果接入 Monaco DiffEditor、Markdown 更完整 WYSIWYG 或 HTML 设计器，也必须挂到 `DocumentWorkbench` 的同一文档模式系统里。

### 2026-06-26 Document-tab 视图模式约束

Workspace IDE 的顶部标签页只表达“打开的文件”。源码、预览、编辑+预览、预览时编辑都是当前文件标签页内的视图模式，不再创建第二个 Preview/Editor 窗口。这样符合 VS Code/现代 Web IDE 的心智模型，也避免文件管理器预览和 Workspace 编辑器产生两套入口。

- 代码文件：默认 Monaco 源码编辑，保留语法高亮、内置查找替换入口和 Tracevane 同标签查找替换条。
- Markdown/HTML：同一 tab 内支持源码、渲染预览、左右联动、可视编辑。
- 搜索：左侧 Search 面板承担 workspace 级搜索和跨文件批量替换；替换必须先生成 Diff 预览，支持勾选文件、大小写/正则选项和撤销包。
- 文件管理器预览：复用 DocumentWorkbench，保持“文件=标签/面板，视图=模式”的统一规则。

### 2026-06-26 Workspace Explorer 属性弹窗复用

Workspace 资源管理器继续保持“左侧只负责资源导航与上下文操作，文件内容在编辑区/弹窗工作台打开”的边界：右键菜单新增/复用共享 `FilePropertiesDialog`，并支持 `Alt+Enter` 对当前 active entry 打开属性。属性只展示名称、路径、root、类型、大小、修改时间、隐藏状态与复制路径能力，不恢复右侧常驻预览/详情侧栏。

设计约束：
- FileManager 与 Workspace 共用 `workspace/shared/FilePropertiesDialog`，避免属性信息面板出现两套 UI。
- Workspace 资源管理器的“预览/编辑”仍由文件打开模型承载；属性弹窗只读，不承担预览/编辑职责。
- `Alt+Enter` 与右键“属性”对齐系统文件管理器心智；不在 Explorer 顶部增加重复按钮，避免再次形成杂乱工具栏。
