# Workspace IDE UI/UX 全面重设计验收合同

> 状态：Active Design Contract
> 创建：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> 前置审计：`WorkspaceIDE工作区现状审计与下一步清理计划.md`
> 当前主线：IDE 主体、Terminal 前端体验、Git、Search、Files、Editor、Command Palette、Status Bar、真实窗格编排系统、布局持久化、电脑端、平板端、手机端。
> 当前不做：写作产品线、渲染增强、预览增强、富媒体阅读体验。

---

## 1. 外部研究记录

本合同不是凭空设计。2026-06-29 已复核以下当前资料：

1. VS Code User Interface 官方文档：VS Code 的基础 UI 由 Editor、Primary Side Bar、Secondary Side Bar、Status Bar、Activity Bar、Panel 构成；Panel 默认承载 terminal/output/debug/problems；状态会恢复打开文件、布局和文件夹。来源：`https://code.visualstudio.com/docs/editing/userinterface`。
2. VS Code Custom Layout 官方文档：Workbench、side bars、views、panel、editor groups、tabs 等可按用户工作方式重排。来源：`https://code.visualstudio.com/docs/configure/custom-layout`。
3. xterm.js Using Addons 官方文档：terminal 前端可通过 addons 扩展，FitAddon 用于容器尺寸适配。来源：`https://xtermjs.org/docs/guides/using-addons/`。
4. xterm.js Link Handling 官方文档：terminal 输出链接可由 web-links addon 和 link handler 处理，终端交互必须避免误触打开。来源：`https://xtermjs.org/docs/guides/link-handling/`。
5. Eclipse Theia Widgets 官方文档：Theia 使用 widget manager 管理可贡献 UI，这证明 IDE 平台应通过可贡献面板/视图扩展，而不是把所有业务堆进一个大组件。来源：`https://theia-ide.org/docs/widgets/`。

这些资料只作为能力和交互原则参考，不代表 Tracevane 要复制 VS Code 或立刻切到 Theia。

---

## 2. 设计立场

Tracevane Workspace 必须成为一个 **严肃、高密度、可长期扩展的 AI 编程 IDE 工作区**。本阶段不是改几处样式，而是为后续全面重建规定主线：IDE 主体、Terminal、Git、Search、Files、Editor、Command/Status 和响应式工作流。

这份合同的判断标准不是“页面有没有变漂亮”，而是：用户能否在一个像 IDE 的界面里完成真实项目工作。当前旧前端壳已经被判定为不合格，后续应当重建 IDE shell，而不是继续修补旧说明页式结构。

视觉方向：

- 工业级 IDE，而不是营销页。
- 信息密度高，但不脏乱。
- 面板边界清楚，但不堆卡片。
- 终端、Git、搜索是工作能力，不是装饰模块。
- 手机端是 AI 时代的移动 IDE 控制台，不是桌面 IDE 缩小版。
- 所有视觉决策都要服务于 Terminal/Git/Search/Files/Editor 的真实效率，而不是把 AI 宣传文案放大。

一句话：

> 用户打开 `/workspace` 后，第一眼应该知道“我可以在这里真实工作”：找文件、改代码、跑命令、看 Git、搜项目、用 AI 审查，而不是阅读产品说明。

### 2.0 旧前端判废标准

以下旧方向一律视为当前阶段不合格：

- 工作区中心是一张设计海报、说明文档或大段愿景文案。
- 终端只是日志展示区，不能稳定输入、resize、复制、插入命令或适配手机键盘。
- Git/Search 只是统计卡或解释卡，不能完成审查、跳转和确认。
- 手机端只是桌面三栏压缩，底栏/键盘遮挡终端输入。
- AI/Evidence 默认压过编辑器、文件、终端、Git、Search。
- 顶栏被 Workspace 内部全屏模式误删，导致全局产品壳消失。

### 2.1 当前重设计总范围

必须整体重新设计并最终落地：

1. **IDE 主体框架**：全局顶栏必须保留，Workspace 内部再有项目栏、Activity Rail、Side Panel、Editor Stage、Bottom Terminal Panel、Status Bar；不能再出现没有顶栏或像说明文档页的工作区。
1a. **真实窗格编排系统**：不能只做像 IDE 的三栏截图；必须支持 pane registry、open/collapse、dock、左右上下拆分、组合为 tab group、跨区域拖放、tab reorder、resize、maximize/restore、layout preset、layout snapshot、empty dock、命令入口和本地恢复。
2. **Terminal 前端能力**：终端是第一优先级 IDE 面板，必须覆盖 session、cwd、stream/input/resize、错误、移动端键盘、copy/clear/insert-command、dock/fullscreen/sheet。
3. **Git 前端能力**：Git 是审查与提交工作流，不是统计卡片；必须覆盖 branch、changes、diff、stage、commit confirmation、mobile review。
4. **Search 前端能力**：Search 是项目级定位和可审查替换工作流；必须覆盖 file/content search、result grouping、open-to-editor、replace review plan、mobile jump flow。
5. **Files / Editor 前端能力**：文件树、tabs、dirty/save、code/diff/review modes、open/reveal/rename/delete/upload confirmation 是 IDE 基础，不得被 AI 或文档预览抢占。
6. **Command / Status 能力**：所有低频动作进入 Command Palette；Status Bar 必须表达 branch、dirty/save、active file、terminal status、workspace root、mobile mode。
7. **桌面/平板/手机响应式**：桌面高密度，平板双态，手机单任务流；不能简单隐藏面板或横向挤压。

---

## 3. 桌面端目标布局

### 3.1 桌面端主结构

目标结构：

```text
Global App Shell
└─ Workspace IDE Shell
   ├─ Top Command / Project Bar
   ├─ Activity Rail
   ├─ Primary Side Panel: Files / Search / Git
   ├─ Editor Stage: tabs / splits / dirty-save state
   ├─ Bottom Panel: Terminal first, future output/problems later
   ├─ Optional Right Inspector: AI/Evidence only when needed
   └─ Status Bar: branch / cwd / terminal / save / encoding / mode
```

### 3.2 桌面端必须满足

- 全局顶栏不得被删除；Workspace IDE Shell 必须嵌入全局产品壳，而不是替代整个应用顶栏。
- Editor 是主舞台，不被 AI/文案/卡片抢占。
- Files/Search/Git 在同一侧栏体系内切换，不能各自成为孤岛页面。
- Terminal 默认属于 Bottom Panel，支持聚焦、放大、全屏、关闭、恢复。
- Command Palette 是所有低频动作入口，避免顶栏按钮爆炸。
- Status Bar 显示当前工作状态，而不是装饰色条。
- Layout 可恢复：打开文件、活动侧栏、终端状态、面板尺寸必须持久。
- Pane Layout 可操作：用户能打开/收起任意 dock，把 Search/Git/AI/Terminal 等窗格移动到左/右/底部，调整左右宽度和底部高度，最大化编辑器或终端，并保存/恢复命名布局。
- 面板标题、空状态、按钮文案必须像工具，不像宣传页。

### 3.3 桌面端禁止

- 禁止卡片墙式首页。
- 禁止把终端放成独立营销模块。
- 禁止把 Git/Search 做成解释型说明页。
- 禁止在 IDE 主界面使用大段愿景文案。
- 禁止预览/渲染/写作入口抢占当前主线。

---

## 4. 手机端目标布局

### 4.1 手机端主结构

目标结构：

```text
Mobile Workspace
├─ Top Context Bar: project / active file / command
├─ Main Surface: one active mode only
│  ├─ Editor
│  ├─ Terminal
│  ├─ Files
│  ├─ Search
│  └─ Git
├─ Bottom Mode Nav
└─ Command / Context Sheet
```

### 4.2 手机端必须满足

- 一次只显示一个主任务：编辑、终端、文件、搜索、Git。
- Terminal 有一等入口，支持手机键盘、安全输入、粘贴、重跑、清屏、复制输出。
- Git 以审查流为主：看变更、看 diff、stage/unstage、提交前确认。
- Search 以跳转流为主：输入、结果、打开、返回。
- Files 以快速定位为主：目录、最近、打开、操作菜单。
- Bottom Nav 不遮挡终端输入。
- Sheet 高度有 snap 点：半屏、全屏、关闭。
- 手机端文案必须短，动作必须大拇指可达。

### 4.3 手机端禁止

- 禁止把桌面三栏直接缩小。
- 禁止横向滚动作为主交互。
- 禁止 terminal 输入被底栏或键盘遮挡。
- 禁止把 Git/Search/Files 都塞进同一个拥挤面板。
- 禁止把 AI 对话作为手机端默认首屏。
- 禁止桌面端支持的核心窗格在手机端变成不可达；手机必须提供明确 panel mode 或 sheet/fullscreen 入口。

---

## 5. Terminal UI/UX 合同

Terminal 是当前最重要的 IDE 能力之一。

### 5.1 Terminal 必须具备

- Session roster：运行中、detached、archived 状态清楚。
- Active session 明确：标题、cwd、状态、连接状态。
- 输入可靠：键盘、粘贴、命令插入、移动端虚拟键盘适配。
- 输出可靠：复制可见输出、清屏、错误提示、链接识别。
- Resize 可靠：容器变化、dock/fullscreen/mobile sheet 时同步 fit。
- CWD 可靠：新 session 默认当前 workspace directory。
- Handoff 可靠：搜索结果/文件路径可插入终端，但不自动执行高风险命令。
- Mobile 可靠：触摸滚动、pinch 字号、keyboard inset、bottom nav 避让。

### 5.2 Terminal 禁止

- 禁止把 CLI Agent readiness 混进普通 terminal session 管理。
- 禁止自动执行来自 AI/Search/File 的命令。
- 禁止吞掉 stream/input/resize 错误。
- 禁止 archived session 被展示成可恢复 session。
- 禁止 terminal 变成日志卡片，而不是可交互 shell。

---

## 6. Git UI/UX 合同

### 6.1 Git 必须具备

- 当前分支可见。
- 变更列表密度合理。
- 文件状态符号清楚。
- diff 入口快速。
- stage/unstage/commit 操作明确。
- 与 editor 打开文件关联。
- 手机端优先支持审查和确认。

### 6.2 Git 禁止

- 禁止把 Git 做成只读统计卡。
- 禁止 commit 操作没有确认边界。
- 禁止 diff 被 AI/证据面板遮挡。
- 禁止 Git 生命周期归 CLI Agent 管理。

---

## 7. Search UI/UX 合同

### 7.1 Search 必须具备

- 文件名搜索与内容搜索边界清楚。
- 结果分组：文件、路径、匹配片段。
- 键盘导航。
- 结果打开到 editor。
- 结果可插入 terminal 或进入上下文证据 / AI 扩展上下文，但必须显式动作。
- 手机端结果列表可快速返回和继续搜索。

### 7.2 Search 禁止

- 禁止搜索结果像普通表格后台。
- 禁止点击结果后丢失搜索上下文。
- 禁止默认把所有搜索结果塞进 AI。

---

## 8. Files / Editor UI/UX 合同

### 8.1 Files 必须具备

- 项目根清楚。
- 文件树可折叠、刷新、定位当前文件。
- 新建、重命名、删除、移动、上传下载等危险操作有确认边界。
- 文件操作不依赖 terminal。
- 手机端以快速定位和常用操作为主。

### 8.2 Editor 必须具备

- Tabs 清楚。
- dirty/save 状态清楚。
- split/move/reveal 行为清楚。
- 打开文件稳定恢复。
- 与 Git/Search/Terminal 联动但不被它们拥有。

### 8.3 Files / Editor 禁止

- 禁止文件管理和 terminal 生命周期混在一起。
- 禁止同时出现多个互相竞争的文件管理器。
- 禁止 editor 空状态变成大段产品说明。

---

## 9. Command / Status 合同

### 9.1 Command Palette

必须成为低频和高级动作入口：

- 切换面板。
- 打开/关闭/最大化 terminal。
- dock files/search/git。
- reset layout。
- reveal active file。
- run workspace-aware terminal actions。

禁止：

- 顶栏堆满所有命令。
- 命令没有 context 条件。
- 命令和按钮行为不一致。

### 9.2 Status Bar

必须表达当前工作状态：

- Git branch。
- save/dirty。
- active file。
- terminal status。
- workspace root。
- mobile mode。

禁止：

- 用 status bar 做装饰。
- 用状态文案替代真实状态。

---

## 10. UI 质量门禁

任何后续 IDE UI/UX 代码提交必须满足：

1. 不新增说明页式 Workspace。
2. 不新增写作/预览/渲染增强范围。
3. 不删除全局顶栏；Workspace 只能重建内部 IDE shell。
4. 桌面端主区域仍以 editor/terminal/work panels 为中心。
5. 手机端不出现桌面三栏压缩。
6. Terminal 输入不被 nav/keyboard 遮挡。
7. Git/Search/Files 都有清楚 owner，不混进 AI/Agent 生命周期。
8. 每次阶段性改动后 commit，且只提交本代理改动。

---

## 11. 第一批实现建议

等关键 dirty 文件可安全修改后，第一批代码应按顺序做：

1. **Workspace shell 分层**：保留全局顶栏，从 `WorkspaceWorkbench.tsx` 拆出 project bar、activity rail、side panel shell、editor stage shell、terminal dock shell、status bar、mobile mode shell。
1a. **Pane Layout System 分层**：抽出 pane registry、placement/order store、drag/drop docking、resize controller、maximize controller、layout preset/snapshot storage、mobile panel router；不要把窗格行为散落在 JSX 条件和临时 CSS 中。
2. **Terminal UX 第一轮**：session roster、active cwd、mobile keyboard/input、stream/input/resize error state、copy/clear/insert-command/fullscreen/sheet actions。
3. **Git 面板重建**：branch、changes、diff review、stage/unstage、commit confirmation、mobile review flow。
4. **Search 面板重建**：file/content search、result grouping、open-to-editor、replace review plan、mobile jump flow。
5. **Files/Editor 基础重建**：tree、tabs、dirty/save、code/diff/review mode、reveal active file、danger operation confirmation。
6. **Mobile single-task mode**：Editor/Terminal/Files/Search/Git 五个模式明确切换，Terminal 不被底栏/键盘遮挡。
7. **Status Bar 重建**：真实状态，不是装饰。

不从 preview/rendering/writing 开始。
