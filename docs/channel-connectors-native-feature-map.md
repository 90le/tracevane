# Channel Connectors Native Feature Map

> 更新：2026-06-06
> 目的：把 CC/OpenClaw 参考能力映射到 Studio 原生实现，避免后续回到托管 cc-connect 或旧 Codex Stack。

## 参考范围

- CC 二开源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`
- Octo(dmwork)：`platform/dmwork`
- 平台集合：`platform/{dmwork,feishu,weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}`
- Agent 集合：`agent/{codex,claudecode,opencode,gemini,kimi,cursor,qoder,iflow,devin,acp}`
- 守护/配置参考：`daemon/*`、`config/config.go`
- OpenClaw 参考：频道账号、bot 绑定、运行态和事件抽象；不作为运行期依赖。

## 原生映射

| 域 | CC/OpenClaw 能力 | Studio 原生目标 | 阶段 |
| --- | --- | --- | --- |
| Runtime | systemd/launchd/windows daemon、日志、health/status | `openclaw-studio-channel-connectors.service`，Studio/OpenClaw 崩溃后继续在线 | F1-F2 |
| Config | TOML project/platform/agent options | typed JSON store：Agent Profile、workDir、model、permission、Gateway key ref、platform binding | F2 |
| Platforms | dmwork/feishu/weixin/wecom/dingtalk/telegram/slack/discord/qq/qqbot/line | Studio native adapter registry；Octo(dmwork) 先落地，其余按 adapter 迁移 | F3-F6 |
| Agents | Codex、Claude Code、OpenCode、Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP | local CLI Agent runner；统一走 Studio Gateway endpoint/key/model | F3-F7 |
| Messages | text、image、file、voice、reply、thread、mention、stream preview、long split | incoming/reply/attachment/voice/thread contract + renderer | F4 |
| Sessions | session key、续接、重置、cron reply target、跨 channel context | Studio session store、bot/account -> Agent context、观测和审计 | F3-F7 |
| Governance | allow_from、admin、rate limit、outgoing limit、banned words、run_as_user | allowlist/admin/rate/banned/permission/run-as/audit policy | F5 |
| Automation | slash command、cron、hook、relay、management API | Studio native commands/cron/hooks/relay/management API | F5 |

## 当前落点

- 已完成：F2 typed config store 和 API。
- 已完成：daemon runtime config 从 native config 派生，不再硬编码 default project。
- 已完成：个人微信账号不能绑定不同 Agent Profile 的保存约束。
- 已完成：F3a Octo(dmwork) adapter contract：DM/群聊 session key、群聊 directed 规则、bot->Agent 绑定解析、文本 inbound dry-run、reply payload 分片和 mention 渲染。
- 已完成：F3b transport slice：Octo binding metadata `apiUrl/botToken/wsUrl`、register、typing、sendMessage REST client、transport-smoke API、incoming `sendReply` opt-in 真实发送。
- 已完成：F3c daemon slice：Octo register credential cache、WuKongIM WebSocket CONNECT/CONNACK/heartbeat/RECVACK/AES 解密、runtime status、Codex/Claude Code/OpenCode 一次性 CLI runner 合同。
- 已完成：F3d 真实 Octo DM 文本往返：用户消息入站 -> Codex CLI Agent -> Studio Gateway -> Octo sendMessage；Channel Connectors 配置独立于 `openclaw.json` 和 OpenClaw runtime。
- 下一步：F3d session resume、流式进度和权限审批回传。
