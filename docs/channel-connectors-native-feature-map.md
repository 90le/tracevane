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
| Sessions | session key、续接、重置、workdir 切换、cron reply target、跨 channel context、IM 内切 Agent/model/mode | Studio session store、bot/account -> Agent context、session override、观测和审计 | F3-F7 |
| Governance | allow_from、admin、rate limit、outgoing limit、banned words、run_as_user | allowlist/admin/rate/banned/permission/run-as/audit policy | F5 |
| Automation | slash command、Agent 原生命令透传、菜单、Feishu card、cron、hook、relay、management API | Studio native command contract；普通平台文本命令，未知 slash 透传，rich 平台消费 command surface | F3-F5 |

## 当前落点

- 已完成：F2 typed config store 和 API。
- 已完成：daemon runtime config 从 native config 派生，不再硬编码 default project。
- 已完成：个人微信账号不能绑定不同 Agent Profile 的保存约束。
- 已完成：F3a Octo(dmwork) adapter contract：DM/群聊 session key、群聊 directed 规则、bot->Agent 绑定解析、文本 inbound dry-run、reply payload 分片和 mention 渲染。
- 已完成：F3b transport slice：Octo binding metadata `apiUrl/botToken/wsUrl`、register、typing、sendMessage REST client、transport-smoke API、incoming `sendReply` opt-in 真实发送。
- 已完成：F3c daemon slice：Octo register credential cache、WuKongIM WebSocket CONNECT/CONNACK/heartbeat/RECVACK/AES 解密、runtime status、Codex/Claude Code/OpenCode 一次性 CLI runner 合同。
- 已完成：F3d 真实 Octo DM 文本往返、Codex session resume、runner progress/failure observability：用户消息入站 -> Codex CLI Agent -> Studio Gateway -> Octo sendMessage；同一 IM session 续接同一 Codex thread；daemon `/status` 暴露 `activeRuns`，事件日志记录 start/progress/finish，失败会发短回执。
- 已完成：F3e IM command control + native passthrough：`/help`、`/command`、`/cmd`、`/status`、`/agent`、`/model`、`/mode`、`/dir`、`/cd`、`/new`、`/reset`、`/display`、`/stream`、`/tools`；session override 独立存储，`/mode yolo` 等只作用于当前 IM session；未知 `/xxx` 默认透传给当前 Agent，冲突命令用 `/native <命令>`；`/model` 后继续复用同一 Codex thread，`/cd` 和 `/new` 会断开旧续接；`/stream` 与 `/tools` 分别控制 IM 中间态和工具/思考消息。
- 已完成：F3f Feishu ingress + outbound contract：`/api/channel-connectors/adapters/feishu/webhook` 支持 URL verification、card action、bot menu、message receive，`transport-smoke` 支持 tenant token cache、send message、patch card；message webhook 默认可把 command-router 回复发回 Feishu。
- 已完成：F3f Feishu daemon 长连接：使用官方 SDK `WSClient` / `EventDispatcher` 接 `im.message.receive_v1`、`card.action.trigger`、`application.bot.menu_v6`；按 CC 约束同一 Feishu App 多 binding 共享单条 WS；支持 chatId 过滤、thread/root 字段保留、command-router 回复和 Agent runner 回包。
- 已完成：F3f live 闭环：本地用户配置写入 Feishu binding、tenant token cache 验证通过、callback verification 通过、错误 verification token 不回显 challenge、systemd `WorkingDirectory` 模板修复、daemon active/enabled、真实 `/status`/`/help` 入站并 `replySent=true`；CLI runner 补用户级 PATH fallback，覆盖 systemd 下找不到 `codex`；仓库只记录脱敏状态。
- 已完成：Feishu card/menu session loop：Session、Agent、Model、Permission、WorkDir、Display 子卡片，文本 slash 与卡片点击共用 command-router；普通 slash 可直接返回 interactive card；Agent 运行保留 processing reaction，支持节流文本进度回发和 upstream JSON error envelope 清洗。
- 下一步：Feishu compact progress card；F4 图片/文件、history context、长回复 buffer、治理策略。
