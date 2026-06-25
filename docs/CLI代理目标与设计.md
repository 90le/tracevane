# CLI Agents Target Design

> Status: active target
> Updated: 2026-06-24

## 1. Current assessment

CLI Agents must be refocused. It is a Codex / Claude Code / OpenCode runtime workbench, not a generic OpenClaw agent/profile/persona management UI and not a terminal manager.

## 2. Product goal

CLI Agents should answer:

- Is Codex / Claude Code / OpenCode installed and usable?
- Which gateway/model config will each CLI use?
- Which Agent run should the user inspect, stop or resume through its owning runtime?
- What Agent Runs are active or failed?
- Which terminal/chat/IM source created each run?
- What evidence proves what happened?

## 3. Owned objects

### CLI runtime

Per CLI:

- id: codex / claude-code / opencode
- binary path and version
- install status
- config path and selected model/provider when detectable
- gateway endpoint readiness
- context/compaction capability if detectable from official config or local state

### Agent terminal reference

Terminal is owned by IDE / terminal backend. CLI Agents may only show terminal-sourced Agent Runs and evidence links:

- source terminal session id
- CLI type when inferred
- cwd/workspace
- status
- recent output/error summary
- link to IDE terminal for generic terminal operations

### Agent Run

Read-only projection from terminal, IM and Chat:

- source: terminal / im-channel / chat
- source session id
- CLI/agent id
- model/provider/route scope when known
- workspace
- lifecycle status
- error
- evidence links

Agent Runs should not include ordinary idle Chat history rows.

## 4. OpenClaw boundary

OpenClaw is a substrate and compatibility target. In CLI Agents it may appear only as:

- dependency/runtime status
- config compatibility indicator
- link to Recovery or Platforms
- one supported client app connection if routed through Model Gateway

It should not dominate the page as Persona/OpenClaw Agent administration.

## 5. Required frontend flows

P0:

1. CLI readiness overview for Codex / Claude Code / OpenCode.
2. Gateway readiness per CLI.
3. Launch command/session flow per CLI.
4. Agent Runs list as primary runtime table.
5. Terminal sessions list and controls.
6. Evidence links back to terminal, IM and Chat.
7. Clear separation from OpenClaw platform/recovery support.

P1:

- Detect CLI config file paths.
- Show context/compaction settings when known.
- Model switch handoff to Model Gateway App Connections.
- Stop/retry run boundary where backend can prove ownership.

## 6. Non-goals

- Do not edit IM accounts or bindings here.
- Do not edit provider secrets here.
- Do not recreate OpenClaw generic agents/channels UI.
- Do not manage generic terminal tabs, shell sessions, resize/input, or terminal deletion here; those belong to IDE / terminal.
- Do not infer unsupported CLI context behavior from guesswork.

## 7. 2026-06-24 收敛决策

CLI Agents 的最新设计不是“第三个配置中心”，而是运行管理台：

1. **保留**
   - CLI readiness：Codex / Claude Code / OpenCode 是否安装、版本、路径、启动可用性。
   - Launch handoff：解析启动命令、复制、跳转 IDE 终端执行。
   - Agent Runs：终端、IM、Chat 产生的 Agent run 聚合、状态、错误、证据入口。
   - Proven controls：只对后端能证明属于 Agent CLI 的 terminal session 提供 stop/delete。

2. **移出**
   - Provider、模型、endpoint、协议、上下文和路由编辑 → Model Gateway。
   - IM 账号、bot token、绑定路由、队列策略、投递和平台日志 → IM Channels。
   - 通用 shell PTY 输入、resize、split、terminal tab 管理 → IDE。
   - OpenClaw persona / generic agent CRUD → 不属于 CLI Agents 主线。

3. **布局规则**
   - 页面采用 viewbar + table/list + Dialog 确认。
   - 不使用卡片墙，不用重复状态卡堆满首屏。
   - Gateway/IM 只作为依赖引用和跳转，不显示可编辑副本。

## 8. 2026-06-25 页面减法与安装修复

CLI Agents 页面继续收敛为两个入口：

1. **运行台**
   - 默认入口。
   - 聚合 Agent Runs。
   - 支持搜索、筛选、stop/delete 已证明属于 Agent CLI 的 terminal session。
   - IM/Chat/Gateway 只跳 owner 页面，不重复管理。

2. **启动 / 修复**
   - Codex / Claude Code / OpenCode readiness。
   - 未安装时提供安装确认、复制安装提示、安装结果回显、重新检测。
   - 已安装时提供启动命令解析、复制、跳 IDE。
   - 安装 CLI 不等于登录账号；登录/授权仍需用户在 IDE 终端或官方流程里完成。

删除独立导航入口：

- `概览`：信息重复，无法提供关键管理价值。
- `证据索引`：证据应跟随 Run 行和 owner link，而不是形成另一个只读列表页。

## 9. 2026-06-25 操作台化约束

CLI Agents 不再放介绍型面板。页面必须直接呈现可操作对象：

- 运行台底部是 **待处理操作**，只列失败、可停止、可删除的 Run。
- 启动 / 修复底部是 **修复队列**，只列缺失 CLI、网关不可用、PTY 不可用这类阻断项。
- 域边界说明只保留在文档和测试里，不占用户首屏。
- 正常状态保持安静，异常状态给出按钮：安装、复制提示、打开网关、打开 IDE、停止、删除、打开 owner。
