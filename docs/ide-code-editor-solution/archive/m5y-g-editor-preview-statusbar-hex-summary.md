# M5.y-G IDE Preview StatusBar + Hex Editor Foundation 执行总结

## 状态

M5.y-G 已完成。它是 M5.y / M5.5 IDE Editor Foundation 在进入 M6 前的最后一轮体验与边界收口，重点解决 IDE 预览空间、活动文件状态呈现、Panel 收起占位和二进制文件查看能力。

## 已完成内容

### 1. IDE embedded File Surface 预览

- `shared/file-surface` 新增 `chrome="embedded"` 形态。
- File Manager Online Editor 默认仍使用完整 File Surface chrome，保持原行为。
- IDE Editor 打开 image/video/audio/pdf/binary 时使用 embedded chrome，减少额外标题栏和底部状态栏，预览内容在 Dockview panel 内获得更大可用空间。

### 2. Workbench StatusBar 活动文件信息

- Monaco panel 不再在自身底部重复显示 path/save/language/size。
- `IdeEditorFilePanel` 将当前文件 metadata 上报给 Workbench editor tab。
- Workbench StatusBar 统一展示 active file path、save state、language/mime、size、readonly、preview 等信息。
- 旧 `M4 Workbench foundation` 文案已移除。

### 3. Panel 完全收起体验

- Panel collapsed 时 `PanelArea` 不再渲染底部占位行。
- 恢复入口移动到 Workbench header 右侧，避免关闭 Panel 后仍占用内容空间。

### 4. Hex Editor（二进制编辑器）只读基础

- Binary preview 由简单安全提示升级为 Hex Editor 只读基础。
- 通过 `/api/files/download` 的 HTTP Range 读取前 512 KiB，避免大文件一次性进入前端内存。
- 展示 offset / hex bytes / ASCII 三列。
- 支持 Hex/Text 搜索、复制已加载 Hex、下载原文件。
- 明确标记 `data-file-surface-hex-readonly="true"`，当前不做写回。

## 为什么 Hex Editor 当前只读

现有安全写入接口 `/api/files/content` 是 UTF-8 文本写入语义，并且 Monaco/editor-core 当前 dirty/save/conflict 规则围绕文本内容设计。二进制可编辑保存不能把未知 bytes 通过文本 API 写回，否则会有编码损坏、截断保存、冲突校验缺失等风险。

后续若要做真正可编辑 Hex 保存，必须先补齐：

- Files API binary read/write contract（bytes/base64 或分段协议）。
- mtime/version/hash/size 冲突校验。
- 最大文件、分段读取、分段写入和 dirty buffer 边界。
- 保存失败/compare/reload/overwrite 与现有 editor-core 冲突流程对齐。

## 明确没有做

- M6 watcher/search/problems/output。
- M7 LSP/Git/Debug。
- 可写 Hex Editor 保存。
- 大文件完整二进制加载。
- 二进制 diff/compare。
- Panel right/secondary side bar 完整 View Movement。

## 验收命令

本轮应运行：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:online-editor
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:workbench-layout
git diff --check
```

并对本文件、`00-README.md`、`05-前端实现方案.md`、`08-实施阶段验收与风险.md`、`.codex/project-context.md` 做相对链接检查。
