# Workspace 设计文档（旧设计参考）

> 状态：Superseded design reference
> 更新：2026-06-29
> 当前权威蓝图：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> 当前 UI/UX 验收合同：`WorkspaceIDE-UIUX重设计验收.md`

本文保留为历史设计参考，不再作为当前 Workspace 实现或验收合同。当前设计执行必须以 IDE-first 蓝图和 UI/UX 验收合同为准：先完成真实 AI 编程 IDE 工作区的基础布局、文件/编辑器、终端、Git、搜索、命令、证据与 Agent handoff；写作、渲染、预览增强只作为未来扩展边界。

## 1. 仍然有效的设计原则

Workspace 采用 **Industrial Studio / Local Ops IDE** 方向：专业、克制、高密度、长时间使用舒适。IDE 信息密集区应使用实色、清晰边界、低阴影和可审查状态，而不是装饰性卡片墙。

关键词：

- 本地作战室
- 清晰层级
- 工具优先
- 证据优先
- 高风险可审查
- 手机端任务流

禁止：

- 卡片墙；
- 大段解释文案；
- 用户可见“P1 占位”；
- 固定无意义右侧面板；
- hover-only 操作；
- 为了像 VS Code 而复制 VS Code；
- 说明页式、第一季展示页式或概念海报式 Workspace。

## 2. 当前 Desktop 目标布局

```text
┌──────────┬─────────────┬──────────────────────────────┬──────────────┐
│ Activity │ Explorer    │ Editor Stage                  │ Inspector    │
│ Rail     │             │ Tabs / Code / Diff / Review   │ Evidence     │
│          │ Files       │                              │ Agent Plan   │
│          │ Search      │                              │ File Info    │
│          │ Git         │                              │ Diagnostics  │
├──────────┴─────────────┴──────────────────────────────┴──────────────┤
│ Bottom Panel: Terminal / Tasks / Problems / Output / Ports / Logs      │
└────────────────────────────────────────────────────────────────────────┘
```

当前主线：

- Activity Rail：Files / Search / Git / Run-Terminal / Agent / Evidence。
- Explorer：Files tree、Search results、Git changes、Evidence basket、Recent / pinned。
- Editor Stage：Code editor、Diff editor、Config safe editor、Image/binary viewer、Empty state。
- Inspector：File Info、Outline、Agent Plan、Diff Review、Evidence、Console/Diagnostics。
- Bottom Panel：Terminal、Tasks、Problems、Output、Ports、Logs、Tool Calls / Agent output evidence。

规则：未实现的模式不显示；不可用动作必须禁用并说明原因；不显示“规划中”“预留能力”等半成品文案。

## 3. 当前 Mobile 目标布局

```text
Top Bar: workspace / active object / search
Main Stage: 当前模式
Bottom Nav: Files / Edit / Terminal / Git / Search / Evidence
Action Sheet: 当前对象操作
```

规则：

- 手机端不是压缩 PC 多栏。
- 文件树、编辑器、终端、diff、Git 审查都可全屏。
- 右键菜单必须有触摸替代 action sheet。
- Terminal 必须有移动输入增强栏。
- 危险动作必须 Dialog/Sheet 二次确认。

## 4. Owner 分区设计

设计上必须避免“文件管理、终端、CLI Agents 混在一个面板里”的旧问题：

- 文件管理是 Files/File Manager 的主任务，终端只可接收当前路径或保存输出证据。
- 终端是 Bottom Panel/Terminal fullscreen 的运行任务，不能成为文件树、上传下载或批量删除的 UI。
- CLI Agents 只作为 Agent runtime/run owner；Workspace 可以链接 run、审查结果、采集证据，但不把 CLI Agents 页面塞进终端或文件管理。
- Editor Stage 只处理打开对象、dirty buffer、code/diff/review，不承担批量文件操作。

## 5. 当前非主线

以下能力不进入当前 Phase 0/1/2 验收：

- 独立写作工作区；
- 渲染增强、预览主题、富媒体阅读体验；
- Markdown 实时预览或所见即所得作为主线验收；
- 固定 Preview inspector 抢占 IDE 主舞台；
- 视觉概念原型、卡片墙、说明页式 Workspace。
