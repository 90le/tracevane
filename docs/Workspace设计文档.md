# Workspace 设计文档

> 状态：Active design contract
> 更新：2026-06-25

## 1. 设计方向

Workspace 采用 **Industrial Studio / Local Ops IDE** 方向：专业、克制、高密度、长时间使用舒适。它保留 Aurora 的浅/深主题和柔和材质，但 IDE 信息密集区以实色、清晰边界和低阴影为主。

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
- 固定无意义右侧预览；
- hover-only 操作；
- 为了像 VS Code 而复制 VS Code。

## 2. PC 端布局

```text
┌──────────┬─────────────┬──────────────────────────────┬──────────────┐
│ Activity │ Explorer    │ Editor Stage                  │ Inspector    │
│ Rail     │             │ Tabs / Code / Diff / Markdown │ Preview      │
│          │ Files       │                              │ Agent Plan   │
│          │ Search      │                              │ Evidence     │
│          │ Git         │                              │ File Info    │
├──────────┴─────────────┴──────────────────────────────┴──────────────┤
│ Bottom Panel: Terminal / Tasks / Problems / Output / Ports / Logs      │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Activity Rail

固定一级模式：

- Files
- Search
- Git
- Run / Terminal
- Agent
- Evidence

规则：

- PC 使用图标 + tooltip。
- Mobile 不使用窄 rail，改 bottom mode nav。
- 未实现的模式不显示，不显示“规划中”。

### 2.2 Explorer

Explorer 是 Workspace 的左手，不只是树：

- Files tree
- File Manager mode
- Search results
- Git changes
- Evidence basket
- Recent / pinned

### 2.3 Editor Stage

主舞台只承载当前编辑/审查对象：

- Code editor
- Diff editor
- Markdown split
- Config safe editor
- Image/binary viewer
- Empty state

Empty state 必须给出下一步动作，不展示装饰性空白。

### 2.4 Inspector

右侧 Inspector 是可切换上下文，不是固定 Preview：

- Preview
- File Info
- Outline
- Agent Plan
- Diff Review
- Evidence
- Console

没有可用 inspector 时默认隐藏，给 editor 空间。

### 2.5 Bottom Panel

Bottom Panel 是运行和诊断区：

- Terminal
- Tasks
- Problems
- Output
- Ports
- Logs
- Tool Calls / Agent output evidence

支持 collapse、height resize、maximize。

## 3. Mobile 端布局

手机端使用单栏任务流：

```text
Top Bar: workspace / active object / search
Main Stage: 当前模式
Bottom Nav: Files / Edit / Terminal / Agent / Evidence
Action Sheet: 当前对象操作
```

规则：

- 不显示 PC 多栏。
- 文件树、编辑器、终端、diff、preview 都可全屏。
- 右键菜单必须有触摸替代 action sheet。
- Terminal 必须有移动输入增强栏。
- 危险动作必须 Dialog/Sheet 二次确认。

## 4. 文件管理交互

PC：

- toolbar：新建、上传、刷新、路径、搜索、视图切换。
- context menu：rename/copy/move/delete/archive/download。
- multi-select：batch delete/move/archive/download。
- command palette：跳转路径、打开文件、运行命令。

Mobile：

- 顶部路径栏可编辑。
- 长按/更多按钮打开 action sheet。
- 批量选择进入 selection mode。
- 上传/新建在 bottom sheet。

## 5. 终端交互

PC：

- terminal tabs。
- rename/close/kill/reconnect/clear/copy/search。
- task launcher。
- ports detector。
- send output to evidence/Agent context。

Mobile：

- full-screen terminal。
- command input accessory bar：Esc、Ctrl、Tab、↑、↓、/、-、_、Enter、Ctrl+C、Paste。
- 输出搜索、复制、重连、清屏在 action sheet。

## 6. Agent 审查交互

Agent 不是聊天泡泡优先，而是工作流对象优先：

```text
Goal
Context included
Plan
Proposed file changes
Proposed commands
Risk / approval
Verification
Evidence bundle
```

用户必须能：

- 看懂 Agent 要改什么；
- 单文件/单 hunk approve；
- 拒绝命令；
- 应用后验证；
- 回滚。

## 7. 视觉验收

- PC 1440×900 首屏不出现横向滚动。
- Mobile 390×844 无横向溢出。
- 深浅两套主题文字、边界、hover/focus 均清晰。
- 空状态不像半成品。
- 未实现功能不占用户首屏。
- Terminal/error 状态不误导为系统崩坏。
