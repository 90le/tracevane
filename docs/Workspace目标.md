# Workspace 目标

> 状态：Active target
> 更新：2026-06-25
> 替代：旧 `工作区IDE目标.md` 的方向性内容。旧文档保留为兼容入口，但以后以本文为准。

## 1. 定位

Workspace 是 Tracevane 的核心工作面：

```text
本地项目 + 文件管理 + 编辑器 + 预览 + 终端 + Git + 证据 + Agent handoff
```

Workspace 不是普通 IDE 复制品，也不是文件管理器、终端和聊天的拼盘。现有半成品设计必须推翻重建：文件管理、编辑/预览、终端、CLI Agents 各自拥有清晰 owner，只通过上下文和证据互通。它的中心是 **本地项目工作流 + Agent 审查闭环**。

**上位约束**：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md` 是当前 Workspace 的最高 Goal 合同。本文后续章节若仍带有旧拼盘式表达，必须按 Goal 蓝图重写后才能进入实现。

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
| Editor | 多 tab、dirty buffer、保存/撤销、diff editor、Markdown 编辑/预览/源码模式、JSON/config 安全编辑、大文件/二进制保护。 |
| Preview | Markdown、HTML/static、local web app iframe、console errors、截图证据。 |
| Terminal | 稳定 session、输出 replay、重连、stale cleanup、task runner、移动端增强输入。 |
| Git | changes、diff、stage/unstage、commit、revert、hunk evidence。 |
| Evidence | 文件、diff、截图、终端输出、日志、验证结果统一证据篮。 |
| Agent Handoff | 选择上下文，发起 Agent task，审查 Agent plan/diff/命令/验证结果。 |

## 4. Owner 分区

| Owner | 属于 Workspace 的部分 | 明确不属于 |
| --- | --- | --- |
| Files / File Manager | 项目树、路径栏、表格/树、批量文件动作、上传下载、归档、移动端 action sheet。 | Terminal session、CLI Agent run、Provider/IM 配置。 |
| Editor / Preview | 源码编辑、Markdown 编辑/预览/源码模式、diff、preview、保存/回滚。 | 批量文件生命周期、terminal lifecycle。 |
| Terminal | shell session、task、dev server、logs、ports、reconnect、replay、terminal evidence。 | 文件管理主流程、CLI Agent runtime/readiness/run。 |
| Agent Handoff | context basket、plan/diff/command/verification review、evidence bundle。 | CLI Agents 页面本身、普通终端 tab 管理。 |

## 5. 不做什么

- 不把 CLI Agents 页面搬进 Workspace。
- 不把普通 terminal session 当 CLI Agent Run。
- 不在 Workspace 管理 Provider secret 或 IM bot token。
- 不允许 Agent 高风险写入绕过 diff/approval。
- 不用浏览器 localStorage 作为文件源事实。
- 不为移动端缩水功能；移动端换交互模型，不删关键能力。

## 6. 响应式目标

### PC

```text
Activity Rail | Explorer | Editor Stage | Inspector
              |          | Bottom Panel
```

- 可 resize。
- Explorer / Inspector / Bottom Panel 可折叠、关闭、重新打开。
- Pane 尺寸、折叠状态和活动模式必须持久化记忆。
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


## 7. Dockable layout and Markdown editing

Workspace 的窗口/面板必须像专业 IDE 一样可控，但不复制 VS Code 视觉：

- Activity rail、Explorer、Inspector、Bottom Panel 都可以打开、收起、折叠。
- Explorer 宽度、Inspector 宽度、Bottom Panel 高度可拖拽调整。
- 布局偏好要记忆：pane 尺寸、折叠状态、最后活动 mode、最后 root。
- Preview、Diff、Terminal 可进入全屏或专注模式。
- Markdown 文件必须支持编辑器内模式切换：`编辑` / `预览` / `Markdown`。
- Markdown 实时预览是 P0；受控所见即所得编辑是 P1/P2，但必须保留源码 Markdown 入口。
- 历史前端实现不再作为设计门禁；新能力必须先进入当前原型设计。

## 8. 分期

### Phase 0：重设计归零

- 用 `Workspace全球顶级AI编程IDE工作区Goal蓝图.md` 重新审查目标、设计、前端架构、后端架构和阶段合同。
- 标记旧 `/files`、旧 IDE explorer、旧 terminal panel 的可复用片段与必须废弃部分。
- 明确 Files、Editor/Preview、Terminal、CLI Agents 四个 owner 的生命周期，不允许跨 owner 偷管。
- 通过设计审查后才进入 Phase 1。

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
