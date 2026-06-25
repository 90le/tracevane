# Workspace 目标

> 状态：Active target
> 更新：2026-06-25
> 替代：旧 `工作区IDE目标.md` 的方向性内容。旧文档保留为兼容入口，但以后以本文为准。

## 1. 定位

Workspace 是 Tracevane 的核心工作面：

```text
本地项目 + 文件管理 + 编辑器 + 预览 + 终端 + Git + 证据 + Agent handoff
```

Workspace 不是普通 IDE 复制品，也不是文件管理器、终端和聊天的拼盘。它的中心是 **本地 Agent 工作流闭环**。

## 2. 核心对象

Workspace 的主对象是：

```text
workspace root / project / current task / selected context / proposed change
```

不是：

- CLI Agent runtime 本身；
- Model Provider；
- IM 账号；
- OpenClaw 平台配置；
- 普通聊天历史。

这些对象可通过链接、handoff 或 evidence 关联，但不归 Workspace 直接管理。

## 3. 必须具备的一级能力

| 能力 | P0 目标 |
| --- | --- |
| Files | 项目树、路径栏、搜索、文件管理、批量操作、上传下载、压缩解压、移动端操作菜单。 |
| Editor | 多 tab、dirty buffer、保存/撤销、diff editor、Markdown、JSON/config 安全编辑、大文件/二进制保护。 |
| Preview | Markdown、HTML/static、local web app iframe、console errors、截图证据。 |
| Terminal | 稳定 session、输出 replay、重连、stale cleanup、task runner、移动端增强输入。 |
| Git | changes、diff、stage/unstage、commit、revert、hunk evidence。 |
| Evidence | 文件、diff、截图、终端输出、日志、验证结果统一证据篮。 |
| Agent Handoff | 选择上下文，发起 Agent task，审查 Agent plan/diff/命令/验证结果。 |

## 4. 不做什么

- 不把 CLI Agents 页面搬进 Workspace。
- 不把普通 terminal session 当 CLI Agent Run。
- 不在 Workspace 管理 Provider secret 或 IM bot token。
- 不允许 Agent 高风险写入绕过 diff/approval。
- 不用浏览器 localStorage 作为文件源事实。
- 不为移动端缩水功能；移动端换交互模型，不删关键能力。

## 5. 响应式目标

### PC

```text
Activity Rail | Explorer | Editor Stage | Inspector
              |          | Bottom Panel
```

- 可 resize。
- 可折叠 Explorer / Inspector / Bottom Panel。
- Terminal、Preview、Diff 可全屏。
- 支持快捷键、右键菜单、command palette。

### Tablet

```text
Drawer Explorer | Main Stage | Optional Inspector Sheet
Bottom Panel as collapsible sheet
```

- 保留文件和终端能力。
- Inspector 默认折叠。
- Bottom panel 半屏/全屏切换。

### Mobile

```text
Top Bar
Main Stage
Bottom Mode Nav: Files / Edit / Terminal / Agent / Evidence
```

- 单栏。
- 所有多栏内容变成模式切换或 bottom sheet。
- 文件操作走 action sheet。
- 终端全屏并提供移动输入增强栏。
- diff/approval 全屏审查。

## 6. 分期

### Phase 1：Workspace Shell 重建

- 新响应式骨架。
- 清除用户可见占位。
- Inspector 替代固定 Preview。
- Bottom Panel 可折叠/最大化。
- stale terminal 不再首屏红字。

### Phase 2：文件管理闭环

- 路径栏、表格/树双模式、批量选择、上传下载、移动复制、压缩解压。
- PC toolbar + context menu + command palette。
- Mobile action sheet。

### Phase 3：终端 runtime 升级

- session registry、output ledger、reconnect、replay、cleanup、mobile toolbar。
- task/ports/logs 一等能力。

### Phase 4：编辑器 / 预览 / Git 闭环

- diff editor、save all、revert、preview console、screenshot evidence、Git hunk 流程。

### Phase 5：Agent handoff 与审批

- context basket、plan、patch review、command review、verification checklist、evidence bundle。
