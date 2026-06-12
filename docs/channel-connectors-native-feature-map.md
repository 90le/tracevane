# Channel Connectors Native Feature Map

> 更新：2026-06-12
> 目的：把 CC/OpenClaw 参考能力映射到 Studio 原生实现，避免回到托管 cc-connect 或旧 Codex Stack。

## 参考范围

- CC 二开源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`
- Feishu 最新 OpenClaw 参考：`/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`
- Octo 插件参考：`~/.openclaw/extensions/octo`
- Octo Bot API skill：`~/.openclaw/extensions/octo/skills/octo-bot-api/SKILL.md`
- Feishu 长连接专项：`docs/feishu-long-connection-issue-tracker.md`
- Gateway 协议转换参考：`/tmp/cc-switch-src`

## 当前产品边界

- 当前只继续推进 Feishu/Octo 私聊完整性。
- 当前 live Agent 只暴露 Codex、Claude Code、OpenCode。
- 私聊保留：文本、文件、图片、Agent CLI 原生能力、工具流、过程回复、compact、stop、session/model/permission/workdir 切换。
- 不再继续扩展：`studio-channel-skill`、platform runtime action index、`studio-octo-actions`、`studio-feishu-actions`、文档/群/管理类 platform action。
- 已实现的群聊、thread、多 bot、GROUP.md/THREAD.md、群上下文和低频管理命令只保留 best-effort。

## 原生映射

| 域 | CC/OpenClaw 能力 | Studio 原生目标 | 状态 |
| --- | --- | --- | --- |
| Runtime | daemon、日志、health/status | `openclaw-studio-channel-connectors.service`，Studio/OpenClaw 崩溃后继续在线 | 已接入，继续 live 验证 |
| Config | project/platform/agent options | Agent Profile、workDir、model、permission、Gateway key ref、platform binding | 已完成 |
| Platforms | dmwork/feishu/更多 IM | 当前只做 Octo/Feishu 私聊；更多平台按私聊能力迁移 | 进行中 |
| Agents | Codex、Claude Code、OpenCode、更多 Agent | 当前只做三个已有 runner；更多 Agent 路线图 | 进行中 |
| Messages | text/image/file/voice/progress/reply | 私聊 incoming/reply/attachment/file/image/Markdown renderer | 进行中 |
| Sessions | session key、续接、重置、workdir、切 Agent/model/mode | Studio session store、override、queue、stop、compact | 进行中 |
| Governance | allowlist/admin/rate/banned/run_as | policy + audit | 基础完成 |
| Commands | slash/native/menu/card | 私聊命令、未知 slash 透传、Feishu 卡片、Octo Markdown fallback | 进行中 |

## 已完成摘要

- Octo/Feishu daemon、binding、credential metadata、status、health 和基础治理已接入。
- Codex、Claude Code、OpenCode runner 已接入 Gateway-first 配置和 IM session override。
- Feishu 长连接按官方 SDK、同 App owner lock、fast ACK、ping/pong proof、transport stale 和水位线策略推进；2026-06-12 用户 live 验证稳定。
- Octo 长连接按 CC/OpenClaw heartbeat、ACK、reconnect、read receipt 和 COS/STS 文件上传策略推进；2026-06-12 用户 live 验证稳定。
- `studio-channel-files` 已覆盖出站文件声明、路径校验、原始文件名、Feishu/Octo 上传和发送。
- `studio-channel-messages` 已覆盖私聊出站消息声明，Feishu 支持 open_id/user_id/dm markdown，Octo 支持 human DM 和 best-effort group/thread。
- 图片附件可 staging；非视觉模型会被提示不能做视觉推断，存在视觉模型时可按模型能力切换。
- 同 session FIFO queue、`/stop`、`/new`、`/reset`、`/compact`、`/thinking`、`/process`、`/tools` 已接入。
- Claude Code / OpenCode persistent native compact 已有真实子进程 driver 回归：Claude 复用同一个 stream-json 常驻进程，OpenCode 通过 `run --session` 续接。
- Claude Code persistent driver 已修复过程回复污染最终回复，并补进度回调兼容回归。
- Octo daemon 私聊 `/compact` 已有回归证明会进入 Claude/OpenCode persistent session，不走 Gateway fallback。
- Feishu daemon 已有 native-first wiring 回归，真实长连接 live smoke 仍待复验。
- OpenCode 结构化工具输出已保留 `stdout`、`stderr` 和 `exitCode`，避免 IM 进度显示成空工具结果。
- Codex 结构化命令输出已保留嵌套或直接 `stdout` / `stderr`，避免命令执行结果被压成单行或空结果。
- Claude Code one-shot 与 persistent driver 已保留结构化 `tool_result` 的 `stdout`、`stderr` 和 `exit_code`。
- 非飞书气泡式进度流的 assistant 过程回复已改为正文直出，不再携带“过程回复”标题。
- Feishu 卡片进度和 Octo 文本/Markdown 进度已有基础渲染；Markdown 已由用户验证。
- 已删除 active platform action layer：runner/env/prompt/daemon endpoint/UI chips 不再暴露 `studio-channel-skill` 或 runtime action。
- OpenCode realtime JSONL 与 SQLite fallback 已共用进度 parser；DB fallback 会保留本轮工具调用/工具结果，并只把最新 assistant message 作为最终回复。

## 保留边界

- Feishu transport 仍有低层 legacy action helper，仅作为未暴露的旧 helper 存在；后续瘦身需单独处理，避免误删私聊文件/图片 transport。
- 群聊、thread、多 bot、Octo Bot API 管理和 Feishu 文档/群管理能力不再作为当前目标。
- App-server / persistent session 是 beta；默认 live 仍优先稳定 one-shot runner。

## 下一步

1. 工具流和回复解析：继续复核 Claude/Codex live 差异，修复空工具结果、工具输出丢失、过程回复/最终回复分类错误。
2. 思考流支持矩阵：确认 Codex、Claude Code、OpenCode 是否原生返回 thinking/reasoning，并补齐解析和 `/thinking` 开关验收。
3. Feishu live `/compact` smoke。
4. Feishu/Octo 私聊 live smoke：文件、图片、权限审批、compact；Markdown 做抽查回归。
5. durable queue 设计与实现。
