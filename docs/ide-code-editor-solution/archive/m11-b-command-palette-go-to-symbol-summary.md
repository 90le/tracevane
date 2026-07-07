# M11-B IDE Command Palette / Go to Symbol Shell Foundation Summary

## 状态

已完成。M11-B 将 post-M10 语言智能的第一个用户入口落地到独立 IDE Workbench：新增 IDE Command Palette 壳层，并把 Go to Symbol 接入既有 M10-C workspace symbols 与 editor reveal 链路。

## 完成内容

- 新增 `apps/web/src/features/ide-workbench/command-palette/`：
  - `IdeCommandPalette.tsx` 提供命令面板 overlay、输入过滤、键盘导航、点击/回车执行和 ESC 关闭。
  - `index.ts` 暴露 Workbench 局部入口。
- Workbench header 新增移动端/触摸可用的“命令”按钮，并支持 `F1` / `Ctrl+Shift+P` 打开。
- 首批命令只接安全既有 action：
  - 打开 Explorer。
  - 打开 Search。
  - 打开 Source Control。
  - 打开 Run and Debug。
  - 保存当前文件。
  - 关闭当前编辑器。
  - 转到工作区符号。
- Go to Symbol 首版复用 `requestLspWorkspaceSymbols` / `/api/lsp/workspace-symbols`，不新增第二套 LSP API 或 symbol index。
- 符号结果点击后复用 `openFilePath(..., { pinned: true, reveal })`，打开 IDE Editor tab 并定位到行列。
- 新增 `smoke:ide:command-palette`，覆盖 palette 打开、命令执行、workspace symbol 搜索与 editor reveal 主路径。

## 边界

M11-B 没做：

- 第二套 command registry。
- watcher-backed symbol index。
- 持久化 symbol DB。
- 多语言 LSP 扩展。
- AI semantic search。
- Git force push / merge / rebase / checkout conflict flows。
- 更完整 Debug Adapter parity。
- Terminal 新能力。
- File Manager Online Editor 产品壳变更。

## 复用关系

- Command Palette 是 IDE Workbench shell 局部 UI，不是全局产品壳合并。
- Go to Symbol 复用 M10-C workspace symbols contract 与 frontend LSP client。
- 文件打开、tab identity、Monaco reveal 继续由既有 IDE Editor / shared editor-core 链路负责。
- Search View 的 workspace symbols 能力保持原状；Command Palette 只是新增一个更快入口。

## 验证

- `npm run typecheck:web -- --pretty false`
- `npm run smoke:ide:command-palette`
- `npm run smoke:ide:lsp-workspace-symbols`
- `git diff --check`

## 下一步

进入 M11-C：watcher-backed symbol index 研究与最小计划。M11-C 只有在明确需要提升真实项目符号搜索性能时才推进，且必须复用 M6 watcher/search 基础，不新增独立后台 index daemon。
