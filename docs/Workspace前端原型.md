# Workspace 前端原型先行稿

更新时间：2026-06-25

## 设计判断

当前截图不合理：文件管理同时出现在左侧 Explorer、中间 Files tab、以及 split 后的文件管理表格，导致 Workspace 的主心智从“高级 Web Workbench”退化成“多个文件管理器拼接”。

本原型先行稿的目标不是补按钮，而是先删除重复入口，锁定信息架构。

## 原型原则

1. **单一主入口**：左侧 Activity Rail 是 Files/Search/Git 的唯一常驻入口。
2. **Center 优先编辑**：中心区默认只承载 Editor/Preview；没有文件时展示 editor empty state，不自动切到文件管理器。
3. **文件管理降级为命令 surface**：完整 File Manager 只通过 Command Palette 或 FileOps 模式打开，不作为默认 tab。
4. **Terminal 独立底栏**：终端永远属于 Bottom Dock，不和文件管理混排。
5. **高级能力先命令化**：布局预设、切换 surface、split/reset 先进 Command Palette，避免顶栏堆按钮。

## 三个原型模式

### 1. Coding Mode（默认）

```text
Activity Rail | Explorer/Search/Git | Editor / Preview | Bottom Terminal
```

- 默认中心 surface：Editor
- 无文件：Editor empty state
- 打开文件：Editor 显示文件，Preview 可作为相邻 tab 或 split surface

### 2. FileOps Mode（待重新设计）

当前已删除独立 File Manager surface。后续如果恢复 FileOps，必须先完成原型设计，且与 Explorer 互斥，不允许再次出现两套文件管理同屏。

### 3. Review Mode（后续）

```text
Activity Rail | Git/Search | Editor + Preview/Evidence split | Terminal
```

- 面向 diff、验证、Agent handoff
- Review/验证进入显式 split，不污染默认编码布局

## 本轮已删/收敛

- 删除默认 Center `Files` tab。
- 删除“无文件 + Files 活动时自动切到独立文件管理器”的逻辑。
- 删除独立 `WorkspaceFileManager` surface。
- 重置 dock localStorage key 到 `tracevane.workspace.dock.v2`，避免旧原型布局继续污染新设计。
- Center pane group 删除 `CENTER` 标题噪音。

## 参考依据

- VS Code User Interface：Explorer 在左，Editor 在右是基础工作台心智。
- VS Code Custom Layout：布局可定制，但不要求所有布局动作常驻可见。
- Theia Application Shell：标准 shell 由 main、left/right、bottom 面板组成。
- Zed：Command Palette 是主要动作入口，terminal/pane 行为通过命令触发。

## 下一步

1. 设计 `WorkspacePrototypeShell` 的静态视觉稿组件，用真实 token 表达三种模式。
2. 先画 FileOps Mode，再决定是否恢复完整文件管理 surface。
3. 补 command registry 单测，锁住“默认中心只有 Editor/Preview”。

## 2026-06-25 侧边资源管理 P0

当前阶段先实现左侧资源管理，而不是恢复完整中心 FileManager 表格。

已落地能力：

- root 选择；
- 新建文件/目录入口；
- 上传文件到当前 root；
- 刷新文件查询缓存；
- 折叠全部；
- 显示/隐藏隐藏文件；
- 文件树键盘导航；
- 右键菜单：新建、重命名、复制、移动、归档、解归档、下载、删除；
- 点击文件打开 Monaco editor。

设计边界：

- Explorer 是侧边资源管理入口；
- 不恢复中心 FileManager 表格；
- Terminal 不参与文件生命周期；
- 后续批量选择/拖拽移动需要单独原型，不直接塞进当前树。
