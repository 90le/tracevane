# M5.y / M5.5 IDE Editor Foundation 执行总结

## 完成状态

M5.y / M5.5 **IDE Editor Foundation 已完成**。本阶段把独立 IDE Workbench 中间 EditorDock 从 M4/M5 时期的 Dockview placeholder 升级为真实 Monaco 文件编辑器基础，并完成进入 M6 watcher/search/problems/output 之前所需的核心承载对象。

当前完成口径是：IDE 可以通过自己的 Workbench editor shell 打开、编辑、保存、关闭和拆分文件 tab；它复用 `shared/editor-core`、现有 Files API、Monaco-first 语言/模型能力和 M4 已完成的 Dockview Workbench 布局，不复用 File Manager Online Editor 产品壳，也不创建第二套文件 API。

## 已完成内容

### M5.y-A：技术探查与接入计划

- 明确 IDE Editor 不搬 `FileOnlineEditorDialog`，而是在 `apps/web/src/features/ide-workbench/editor/` 建立独立 Workbench editor shell。
- 明确复用边界：`shared/editor-core`、Files API、Monaco model/language/dirty/save 规则、Explorer path sync 规则。
- 明确 Dockview 只保存 layout/panel metadata，不拥有 FileService、SaveService 或 Monaco model lifecycle。
- 归档计划见 [`m5y-a-ide-editor-foundation-plan.md`](./m5y-a-ide-editor-foundation-plan.md)。

### M5.y-B：真实 Monaco Editor Panel

- IDE Explorer 打开文本/code 文件后，Dockview panel 内显示真实 Monaco editor。
- 通过 `useIdeEditorFile` / `IdeEditorFilePanel` 复用 `readEditorFile`、metadata、language 和 model URI 规则。
- loading/error/deleted/unsupported/binary/large 文件边界明确，不把非文本文件强塞 Monaco。
- 文件内容留在 Monaco model / editor runtime，不写入 Dockview layout 或 React 长期 layout state。

### M5.y-C：保存、dirty 与关闭保护

- 编辑后 tab dirty 状态更新。
- Ctrl/Cmd+S 和菜单保存当前文件，保存成功清除 dirty，保存失败保留 dirty 并提示错误。
- dirty tab 关闭进入保存 / 不保存 / 取消流程。
- 保存与 dirty 状态通过 IDE editor runtime 和 shared editor-core 文件读写能力完成，不新建文件 API。

### M5.y-D：多标签、右键菜单、split 与路径同步

- IDE Editor tabs 支持 preview/pinned 基础行为：单击 Explorer 文件使用 preview，双击/固定转为 pinned，dirty preview 不被静默替换。
- tab 标题不显示冗长 `pinned/preview` 文案；preview 使用小图标表达，tab 有关闭按钮、最大宽度和横向滚动保护。
- tab 右键菜单和右侧 “操作” 菜单通过 portal 挂到 `document.body`，避免被 Dockview header clipping 遮挡。
- tab 右键菜单提供保存、关闭、关闭其他、关闭右侧、关闭已保存、关闭全部、复制路径、复制相对路径、固定、向右拆分、向下拆分。
- 向右/向下拆分从 placeholder 升级为真实 file panel split：同一 editor tab/document 可以在多个 Dockview panel 实例中显示同一个 Monaco-backed 文件。
- Dockview panel id 与 editor tab/document id 解耦；同步文件 panel 时以 `params.tab.id` 为 document identity。
- Explorer rename/move/delete 会同步 primary panel 和 split panel 的 path/title/tab params；close tab 会移除同 document 的所有 split panel。

## 验收证据

M5.y 阶段新增/更新的核心验证：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:workbench-layout
git diff --check
```

最近一次 M5.y-D 收口验证结果：

```txt
npm run typecheck:web -- --pretty false      ✅
npm run smoke:ide:editor-save-dirty         ✅
npm run smoke:ide:editor-foundation         ✅
npm run smoke:ide:workbench-layout          ✅
git diff --check                            ✅
```

其中：

- `smoke:ide:editor-foundation` 覆盖 `/ide` 中真实 Monaco panel、文本文件读取、unsupported/binary placeholder。
- `smoke:ide:editor-save-dirty` 覆盖 dirty、保存、关闭确认、preview/pinned、tab 右键菜单和操作菜单基础。
- `smoke:ide:workbench-layout` 覆盖 IDE Workbench 不白屏、Explorer 打开/rename/move/delete、真实 file panel split、Reset layout 和响应式基础。

## 产品与架构边界

M5.y 已完成的是 **IDE Editor Foundation**，不是完整 IDE。

M5.y 明确没有做：

- M6 watcher / search / problems / output。
- M7 LSP / Git / Debug。
- 文件 watcher 外部变更监听。
- 全局搜索索引与搜索结果面板。
- Problems 真实 diagnostics 数据流。
- Output channel/log 数据接入。
- LSP diagnostics/completion/hover/definition。
- Git status/diff/stage/commit。
- Debug Adapter Protocol。
- 完整 VS Code editor behavior。
- 把 File Manager Online Editor 产品壳复用进 IDE。
- 让 Dockview 拥有 FileService、SaveService 或 Monaco model lifecycle。

## 下一阶段入口

下一阶段进入 **M6-A：Watcher / Search / Problems / Output 研究与最小实现计划**。

建议 M6-A 先做本地探查与计划，不直接大规模实现：

- 探查 Files API / Explorer / IDE Editor tab 如何接 watcher。
- 明确 watcher 事件如何同步 Explorer tree、open editor tabs、dirty/save/conflict 状态。
- 明确全局搜索后端/前端边界、过滤规则和结果跳转到 Monaco 的承载方式。
- 明确 Problems 数据模型与 Output channel/log 模型。
- 保持 M6 边界：不做 LSP/Git/Debug；Problems 可以先承载结构化问题数据，真实 LSP diagnostics 到 M7。



## M5.y-F 补充：Shared File Surface + IDE Editor Preferences

M5.y-F 已在 M6 前完成共享预览和 IDE Monaco 偏好补齐：

- 新增 `apps/web/src/shared/file-surface`，抽出 File Surface 预览分类与 image/video/audio/pdf/binary renderer。
- File Manager Online Editor 改为复用共享 File Surface renderer，原有媒体预览行为保持。
- IDE Editor 打开非文本/code 文件时复用共享 File Surface 只读预览，不再只显示“后续 IDE Preview”占位。
- IDE Editor 操作菜单新增“小地图”开关，偏好持久化到 `tracevane:ide-workbench:editor-preferences:v1`，split panel 共享同一 Monaco option。

详细记录见 [`m5y-f-shared-file-surface-summary.md`](./m5y-f-shared-file-surface-summary.md)。


## M5.y-G 补充：IDE Preview StatusBar + Hex Editor Foundation

M5.y-G 已在 M6 前完成 IDE 预览布局、Workbench StatusBar 和二进制查看基础收口：

- IDE Editor 的非文本预览继续复用 `apps/web/src/shared/file-surface`，但在 Workbench 内使用 embedded chrome，避免图片/视频/PDF/Hex 预览再叠加完整 File Surface 标题栏和底部状态栏。
- 活动文件信息从单个 Monaco panel 底部迁移到 Workbench StatusBar，展示 path、save state、language/mime、size、readonly、preview 等 metadata。
- Workbench Panel 完全收起后不再占用底部一行；恢复入口在顶部 header 右侧，旧 `M4 Workbench foundation` 状态栏文案已删除。
- 二进制文件进入共享 Hex Editor 只读基础：通过 `/api/files/download` 的 Range 读取限定字节，展示 offset/hex/ascii，支持 Hex/Text 搜索、复制 Hex 和下载文件。
- 二进制写回暂不做：现有 `/api/files/content` 是 UTF-8 文本写入语义；可编辑 Hex 保存必须先新增/确认 binary read/write API、mtime/version/hash 冲突校验、分段/最大文件边界，不能把未知二进制内容经文本 API 写回。

详细记录见 [`m5y-g-editor-preview-statusbar-hex-summary.md`](./m5y-g-editor-preview-statusbar-hex-summary.md)。


## M5.y-H 补充：IDE Layout Reset / Empty State / Header Actions

M5.y-H 已在 M6 前完成 IDE Workbench editor 可用性收口：

- `workbench.resetLayout` 语义收窄为“只重置布局”：恢复 sidebar/panel 几何状态和清理 Dockview split metadata，但保留 Explorer 上下文、已打开 editor tabs、active group 和终端 session。
- EditorDock 未打开文件时显示面向用户的“未打开文件”空状态，不再暴露阶段实现说明。
- Panel 完全收起后不再占据底部一行，顶部右侧只显示图标恢复入口。
- Dockview header 的右侧“操作”菜单通过稳定 adapter/context 注入，避免按钮闪烁、失焦或不可点击。
- `smoke:ide:workbench-layout` 覆盖 Reset layout 后已打开/重命名的 tab 仍保留，防止 layout reset 退化为 workspace reset。

详细记录见 [`m5y-h-layout-reset-empty-action-summary.md`](./m5y-h-layout-reset-empty-action-summary.md)。
