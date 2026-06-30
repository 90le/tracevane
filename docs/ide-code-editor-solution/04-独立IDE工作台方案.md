# 独立 IDE 工作台方案

## 1. 产品定位

独立 IDE 工作台是项目级开发入口。

它不是文件管理器弹窗的放大版，而是一个独立模块：

```txt
/ide/:workspaceId
```

目标是提供接近主流 IDE 的工作台骨架：

```txt
- 左侧 Activity Bar
- 左侧 Side Bar
- 中间 Editor Area
- 底部 Panel Area
- 可选右侧 Auxiliary Bar
- 底部 Status Bar
- 命令、快捷键、布局持久化
```

## 2. 为什么不能做固定布局

如果用固定结构：

```txt
左侧文件树固定宽度
中间编辑器 flex: 1
底部终端 fixed height
```

后期会遇到这些问题：

```txt
- 编辑器不能左右拆分。
- Tab 不能拖到第二个编辑组。
- Problems / Terminal / Output 不能自由切换位置。
- 布局不能持久化。
- 用户自定义布局很难恢复。
- 多面板焦点、尺寸、快捷键冲突越来越多。
```

因此独立 IDE 应该从第一版就引入 docking layout。

## 3. 推荐布局技术

推荐优先评估：

```bash
npm i dockview
```

理由：

```txt
- 更贴近 IDE-like docking layout。
- 支持 panel、group、tab、split、drag and drop。
- 支持布局序列化和恢复。
- 适合中大型工作台。
```

备选：

```txt
FlexLayout
- 适合 React docking layout。
- 成熟度可以。

react-mosaic
- 适合分屏布局。
- 更像 tiling window manager，IDE Tab 体系需要额外实现。

GoldenLayout
- 历史较久。
- 新项目需要评估 React 集成和维护情况。
```

不建议：

```txt
- 自己手写拖拽 docking。
- 只用普通 resizable panels 做完整 IDE。
- 先固定布局后面再改成 docking。
```

## 4. 工作台结构

```txt
IdeWorkbench
├─ MenuBar
├─ MainArea
│  ├─ ActivityBar
│  ├─ SideBar
│  │  ├─ ExplorerView
│  │  ├─ SearchView
│  │  ├─ SourceControlView
│  │  ├─ RunView
│  │  └─ ExtensionsView
│  ├─ EditorDock
│  │  ├─ EditorGroup
│  │  └─ EditorTab
│  └─ AuxiliaryBar
├─ PanelArea
│  ├─ TerminalView
│  ├─ ProblemsView
│  ├─ OutputView
│  └─ DebugConsoleView
└─ StatusBar
```

第一版可以只实现：

```txt
- ActivityBar: Explorer
- SideBar: ExplorerView
- EditorDock: 多 Tab + 可拆分编辑组
- PanelArea: Terminal / Problems / Output 框架
- StatusBar: 基础状态
```

## 5. Activity Bar

Activity Bar 是左侧功能入口。

建议预留：

```txt
- Explorer
- Search
- Source Control
- Run and Debug
- Extensions
- Settings
```

第一版只启用：

```txt
- Explorer
- Search 可后置
```

状态：

```ts
type ActivityId =
  | "explorer"
  | "search"
  | "git"
  | "run"
  | "extensions"
  | "settings";
```

## 6. Side Bar

Side Bar 根据 active activity 展示不同内容。

第一版 ExplorerView：

```txt
- workspace root
- 文件树
- 新建文件
- 新建目录
- 刷新
- 折叠全部
- 右键菜单
- 打开文件
- 重命名
- 删除
```

后续 SearchView：

```txt
- 全局搜索
- 文件过滤
- 正则
- 区分大小写
- 搜索结果跳转
```

后续 SourceControlView：

```txt
- Git status
- changed files
- stage/unstage
- commit
- branch
```

## 7. Editor Area

Editor Area 是独立 IDE 的核心。

能力要求：

```txt
- 多 Tab
- 多编辑组
- Tab 拖动排序
- Tab 拖到其他组
- 左右拆分
- 上下拆分
- 关闭当前
- 关闭其他
- 关闭右侧
- 关闭已保存
- 保存全部
- 预览 Tab
- 固定 Tab
```

### 编辑组模型

```ts
type IdeEditorGroup = {
  id: string;
  activeTabId?: string;
  tabIds: string[];
};
```

### Tab 模型

```ts
type IdeEditorTab = {
  id: string;
  groupId: string;
  path: string;
  title: string;
  dirty: boolean;
  pinned: boolean;
  preview: boolean;
  readonly: boolean;
  viewState?: unknown;
};
```

### 预览 Tab

建议支持 VS Code 类似逻辑：

```txt
- 单击文件打开 preview tab。
- 再单击另一个文件，复用 preview tab。
- 双击文件或编辑内容后，preview tab 变为 pinned。
- pinned tab 不会被后续单击替换。
```

这个能力能避免用户单击浏览文件时打开大量 Tab。

## 8. Panel Area

底部 Panel 第一版预留：

```txt
- Terminal
- Problems
- Output
- Debug Console
```

第一版可以只实现 Terminal UI 和 Output 占位。

Panel 能力：

```txt
- 显示/隐藏
- 调整高度
- 切换 active panel
- 最大化/恢复
- 关闭 panel
- 布局持久化
```

## 9. Terminal View

终端前端：

```txt
- xterm.js 渲染
- 多终端 Tab
- 新建终端
- 关闭终端
- 清屏
- 复制
- 粘贴
- 搜索输出
- resize
```

终端后端：

```txt
- WebSocket
- node-pty
- workspace cwd
- sessionId
- shell 类型
- kill
- heartbeat
```

终端不要在第一版伪造太多执行能力。如果没有后端 PTY，只能作为占位或输出面板。

## 10. Status Bar

建议状态项：

```txt
- workspace 名称
- Git 分支
- 当前文件语言
- 当前行列
- 编码
- 换行符
- 缩进
- 保存状态
- 终端连接状态
- LSP 状态
- Problems 数量
```

第一版可以实现：

```txt
- workspace
- path
- language
- line/column
- encoding
- eol
- dirty/saved
```

## 11. Command Palette

建议从架构上预留命令面板。

命令示例：

```txt
File: Save
File: Save All
File: Close Editor
File: Close Others
View: Toggle Sidebar
View: Toggle Terminal
Editor: Split Right
Editor: Split Down
Terminal: New Terminal
Terminal: Kill Terminal
Workbench: Reset Layout
```

第一版可以不做完整 UI，但命令注册机制要有。

## 12. 布局持久化

必须保存：

```txt
- SideBar 是否显示
- SideBar 宽度
- Panel 是否显示
- Panel 高度
- active activity
- active panel
- dockview layout
- 打开的 Tab
- active group
- active tab
```

保存级别：

```txt
用户级：
- 字体大小
- 主题
- 快捷键
- 通用布局偏好

workspace 级：
- 打开的文件
- 编辑组拆分
- 当前 active tab
- 终端 cwd
- Explorer 展开节点
```

布局恢复失败时：

```txt
- fallback 到默认布局。
- 提供重置布局命令。
```

## 13. 独立 IDE 第一版范围

建议第一版交付：

```txt
- /ide/:workspaceId 独立入口
- 左侧文件资源管理器
- Monaco 多 Tab 编辑
- Dockview 编辑区布局
- 编辑组左右拆分
- Tab 拖拽
- 底部 Panel 框架
- Status Bar
- 布局保存/恢复
```

不建议第一版交付：

```txt
- 完整 Git
- 完整 LSP
- Debug
- 插件市场
- 完整 VS Code 兼容扩展
- 复杂多窗口 popout
```

## 14. 验收标准

```txt
- IDE 是独立入口，不依赖文件管理器弹窗。
- 左侧 Explorer 可以打开文件。
- 中间可以多 Tab 编辑。
- 同一文件不会重复打开多个 Tab。
- Tab 可以拖动排序。
- Tab 可以拆到另一个编辑组。
- 关闭 dirty Tab 时有确认。
- Ctrl+S 保存当前文件。
- Ctrl+Shift+S 保存全部。
- 刷新页面后恢复布局和打开的 Tab。
- 布局异常时可以重置默认布局。
- 底部 Panel 可以展开、收起、调整高度。
```

