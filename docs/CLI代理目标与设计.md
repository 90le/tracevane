# CLI Agents 目标与设计

> 状态：Active boundary doc
> 更新：2026-06-25

## 1. 定位

CLI Agents 是 Codex / Claude Code / OpenCode 等 **CLI Agent runtime** 的管理与运行观察面。

它不是终端页，不管理普通 shell session，不承担文件编辑和本地项目工作面。

## 2. 主对象

```text
CLI Agent runtime / Agent profile / Agent Run / Agent result evidence
```

## 3. Owns

- Codex / Claude Code / OpenCode 安装和版本状态。
- Agent CLI 配置状态。
- 与 Model Gateway 的路由/readiness 关系。
- Agent Run 生命周期：queued/running/waiting/failed/completed/delivered。
- Agent Run 来源：Workspace / Chat / IM。
- Agent 输出证据：patch、日志、工具调用、验证结果链接。
- stop/resume/retry 等 Agent-run 级动作，前提是后端合同真实存在。

## 4. Does not own

- 普通 terminal session。
- shell tabs。
- terminal input/output/resize。
- terminal split/fullscreen。
- terminal delete/rename。
- Workspace 文件树、编辑器、预览、Git。
- Provider secret 和 IM bot token。

## 5. 与 Workspace 的关系

Workspace 可以发起 Agent task：

```text
Workspace context bundle → CLI Agent Run → result evidence → Workspace review
```

CLI Agents 展示这个 run 的 runtime 状态；Workspace 审查该 run 产生的 diff、命令、验证和 evidence。

## 6. 页面形态

CLI Agents 页面应使用 list-detail / runtime console：

- Runtime readiness strip。
- Agent runtime rows。
- Agent Runs table。
- Selected run detail/evidence drawer。
- Gateway readiness links。
- Source links back to Workspace/Chat/IM。

不显示 terminal tabs 或普通 PTY 控件。
