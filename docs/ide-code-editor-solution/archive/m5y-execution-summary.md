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

