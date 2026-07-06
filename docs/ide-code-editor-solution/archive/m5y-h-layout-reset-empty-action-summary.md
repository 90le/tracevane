# M5.y-H：IDE Layout Reset / Empty State / Header Actions 收口

## 背景

M5.y-G 后 IDE Editor 已具备真实 Monaco 编辑、共享 File Surface 预览、Workbench StatusBar 文件信息和只读 Hex Editor 基础。继续进入 M6 之前，需要修正几个会影响日常使用和后续 watcher/search/problems/output 承载的 Workbench 交互边界：

- “重置布局”不应变成“重置工作区”，不能清空已打开文件或终端上下文。
- EditorDock 未打开文件时的空状态文案需要面向用户，而不是实现阶段说明。
- Panel 完全收起后的恢复入口应是顶部右上角的图标按钮，不再占据底部一行或暴露冗长文字。
- Dockview header 的“操作”按钮不能因 React inline component 重建而闪烁、失焦或不可点击。

## 已完成内容

### 1. Reset layout 语义收窄为“只重置布局”

`workbench.resetLayout` 现在只重置 Workbench 几何布局和 Dockview split/layout metadata：

- sidebar visible / width / active view 回到默认值。
- panel placement / visible / height / width / maximized 回到默认值。
- `dockviewLayout` 清空，让 Dockview 重新按默认组布局呈现。

但保留以下工作区上下文：

- `explorer` 当前目录、展开树状态与选中上下文。
- `editorGroups`、已打开 editor tabs、dirty/deleted/pinned/preview metadata。
- `activeEditorGroupId`。
- 终端 session / terminal layout persistence 不被 Workbench reset 直接清空。

因此 Reset layout 不再关闭文件、不再丢失已打开 tab，也不再把“布局恢复”误做成“会话清空”。

### 2. EditorDock empty state 用户化

未打开文件时显示：

```txt
未打开文件
从左侧资源管理器选择一个文件开始编辑或预览。已打开文件会保留在上方标签页，并随工作区布局一起恢复。
```

不再显示阶段实现文案，例如 `IDE Editor Dock`、`Dockview-backed placeholder` 或 M5.y-C 提示。

### 3. Panel 收起恢复入口图标化

Panel 完全关闭后不再保留底部占位行；顶部右侧 header 仅显示图标按钮作为恢复入口，不显示“展开面板 / 关闭面板”文字。Panel 的显示/隐藏是一个共享 toggle 关系，文案留给 tooltip / aria-label。

### 4. Dockview header action 稳定化

EditorDock 的右上角“操作”菜单通过稳定 adapter/context 注入 Dockview header，不再把 inline render function 作为 `rightHeaderActionsComponent` 每次重建：

- 避免 Dockview header action 闪烁。
- 避免按钮刚打开就失焦或无法点击。
- 继续保留 tab 右键菜单与右侧操作菜单两种入口，满足桌面和触屏场景。

## 验证

本次收口需要继续通过 M5.y/M4 Workbench 关键 smoke：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
git diff --check
```

`smoke:ide:workbench-layout` 已补充 Reset layout 断言：重置后 Workbench 不白屏，布局回到底部 Panel，但已打开/重命名的 editor tab 仍保留。

## 明确未做

M5.y-H 只修正 M6 前的 IDE Editor / Workbench 交互收口，不实现：

- M6 watcher/search/problems/output。
- LSP/Git/Debug。
- Terminal split/group 新能力。
- 二进制 Hex 写回。
- 完整 VS Code layout/view movement。

下一步进入 M6-A：Watcher / Search / Problems / Output 研究与最小实现计划。
