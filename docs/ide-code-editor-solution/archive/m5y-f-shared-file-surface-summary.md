# M5.y-F Shared File Surface + IDE Editor Preferences 执行总结

## 完成状态

M5.y-F 已完成。该阶段是 M5.y IDE Editor Foundation 之后、M6 watcher/search/problems/output 之前的共享能力补齐：把文件管理器在线编辑器内联的 File Surface 预览能力抽到共享层，并让 IDE Editor 复用同一套预览器；同时补齐 IDE Monaco 小地图偏好开关。

## 已完成内容

- 新增 `apps/web/src/shared/file-surface` 共享层：
  - `FileSurfacePreviewPanel`：统一 image/video/audio/pdf/binary 预览 shell。
  - `classifyFileSurfacePreview`：基于 MIME、扩展名、`imageLike` 的预览类型识别。
  - 共享下载 URL、状态栏、图片缩放/拖动/旋转、视频/音频控制、PDF object/iframe fallback、binary 安全面板。
- 文件管理器在线编辑器继续使用原 File Surface 行为，但预览组件改为复用 `shared/file-surface`，不再把预览器实现私有地塞在 `FileOnlineEditorDialog` 内。
- IDE Editor 对非文本/code 文件不再只显示“暂不编辑”占位：
  - image/video/audio/pdf/binary 走共享 File Surface 只读预览。
  - 文本截断、后端未返回可编辑文本等安全边界仍显示 unsupported 状态，避免误保存不完整内容。
- 新增 IDE editor preferences：
  - `tracevane:ide-workbench:editor-preferences:v1` localStorage 持久化。
  - 支持 Monaco 小地图开关。
  - IDE Editor 操作菜单增加“小地图” menuitemcheckbox。
  - Dockview primary/split file panel 通过 context 共享同一偏好。

## 架构边界

M5.y-F 共享的是低层 File Surface renderer 和 Monaco option preference，不共享产品壳：

- File Manager Online Editor 仍保留自己的窗口、Tab、Mini Explorer、保存/关闭/状态栏产品壳。
- IDE Editor 仍保留自己的 Workbench Dockview editor shell、tab/group/split/dirty/save 行为。
- `shared/file-surface` 不拥有文件操作、Dockview layout、Monaco model lifecycle、dirty/save/conflict 或 IDE Explorer 行为。
- 本阶段不新增依赖；PDF 仍使用浏览器原生 object/iframe fallback。后续若需要 PDF 搜索、缩略图、文本层，再单独评估 PDF.js / `pdfjs-dist` 的 worker、bundle、license 和维护成本。

## 验收证据

目标验证：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:online-editor
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:workbench-layout
npm run git diff --check # 实际命令为 git diff --check
```

`smoke:ide:editor-foundation` 已扩展覆盖：

- IDE Monaco 默认小地图关闭。
- 通过 IDE Editor 操作菜单开启小地图后，CodeEditor data 状态变为 enabled。
- IDE 打开二进制文件时进入 shared File Surface binary preview，而不是旧 unsupported 占位。

## 未做事项

- 不做 M6 watcher/search/problems/output。
- 不做 M7 LSP/Git/Debug。
- 不做 PDF.js 高级 PDF viewer。
- 不做 Office/压缩包/三维模型等复杂文件格式预览。
- 不把 File Manager Online Editor 壳复用到 IDE。
- 不创建第二套 Files API。
