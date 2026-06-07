# Channel Connectors Native Feature Map

> 更新：2026-06-07
> 目的：把 CC/OpenClaw 参考能力映射到 Studio 原生实现，避免后续回到托管 cc-connect 或旧 Codex Stack。

## 参考范围

- CC 二开源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`
- Octo(dmwork)：`platform/dmwork`
- 平台集合：`platform/{dmwork,feishu,weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}`
- Agent 集合：`agent/{codex,claudecode,opencode,gemini,kimi,cursor,qoder,iflow,devin,acp}`
- 守护/配置参考：`daemon/*`、`config/config.go`
- OpenClaw 参考：频道账号、bot 绑定、运行态和事件抽象；不作为运行期依赖。
- OpenClaw Octo 插件参考：`~/.openclaw/extensions/octo`（当前 1.0.14）。遇到 Octo 专属问题时优先看插件的 `dist/src/{socket,inbound,channel,actions,api-fetch}.js` 和 `skills/octo-bot-api/SKILL.md`，再回看 CC Go 通用平台抽象。

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
- 已完成：F3d 真实 Octo DM 文本往返、Codex session resume、runner progress/failure observability：用户消息入站 -> Codex CLI Agent -> Studio Gateway -> Octo sendMessage；同一 IM session 续接同一 Codex thread；daemon `/status` 暴露 `activeRuns`，事件日志记录 start/progress/finish，失败会发短回执。2026-06-06 本机 `studio-cc` live smoke 复验通过，最近 4 条 Octo inbound run 均 `agentOk=true` / `replySent=true`。
- 已完成：F3e IM command control + native passthrough：`/help`、`/command`、`/cmd`、`/status`、`/agent`、`/model`、`/mode`、`/dir`、`/cd`、`/new`、`/reset`、`/display`、`/stream`、`/tools`；session override 独立存储，`/mode yolo` 等只作用于当前 IM session；未知 `/xxx` 默认透传给当前 Agent，冲突命令用 `/native <命令>`；`/model` 后继续复用同一 Codex thread，`/cd` 和 `/new` 会断开旧续接；`/stream` 与 `/tools` 分别控制 IM 中间态和工具/思考消息。
- 已完成：F3f Feishu ingress + outbound contract：`/api/channel-connectors/adapters/feishu/webhook` 支持 URL verification、card action、bot menu、message receive，`transport-smoke` 支持 tenant token cache、send message、patch card；message webhook 默认可把 command-router 回复发回 Feishu。
- 已完成：F3f Feishu daemon 长连接：使用官方 SDK `WSClient` / `EventDispatcher` 接 `im.message.receive_v1`、`card.action.trigger`、`application.bot.menu_v6`；按 CC 约束同一 Feishu App 多 binding 共享单条 WS；支持 chatId 过滤、thread/root 字段保留、command-router 回复和 Agent runner 回包；默认不主动断开 connected 静默连接，watchdog 只重建长期非 connected client。
- 已完成：F3f live 闭环：本地用户配置写入 Feishu binding、tenant token cache 验证通过、callback verification 通过、错误 verification token 不回显 challenge、systemd `WorkingDirectory` 模板修复、daemon active/enabled、真实 `/status`/`/help` 入站并 `replySent=true`；CLI runner 补用户级 PATH fallback，覆盖 systemd 下找不到 `codex`；仓库只记录脱敏状态。
- 已完成：Feishu card/menu/progress loop：参考 CC `renderHelpGroupCard` / `renderCurrentCard` / `renderHistoryCard` / `renderListCard` / `ListItem` / `ButtonsEqual` 结构，`/help` 为主菜单 Dashboard，`/help <section>` 为分组菜单，`/current`/`/history`/`/list` 为真实信息子卡，`/switch <序号|sessionId前缀>` 可切换当前 IM session 已知 Agent session，`/model`/`/agent`/`/mode` 等为可操作子卡；文本 slash、`%help` 兼容命令与卡片点击共用 command-router，导航动作刷新卡片，help 菜单不再附带长文本 notice。
- 已完成：Feishu/Octo 过程显示策略：参考 CC `platform/dmwork` group buffer 和 Feishu rich card 流程；Feishu 私聊默认用单张可 patch Progress card 显示运行/思考/工具过程，Octo 私聊只发送思考、工具和错误气泡，不发送 start/running/completed/event 噪音；群聊默认隐藏中间过程，只保留最终回复；`/stream` / `/tools` 仍可按当前 IM session 覆盖；工具输入/结果格式化已覆盖命令代码块、exit/status、长输出和 TodoWrite 列表。
- 已完成：Feishu/Octo 回复展示精修：Feishu 保持单张 Progress card patch 更新，最终回复使用无标题 schema 2.0 Markdown card，card 失败后先用 post(md) 富文本兜底再退 text；Octo 最终回复保留原始 Markdown 文本，过程消息只保留短状态行，并用 inline code / code block 承载工具名、参数和结果；RichText=14 仅作为后续图文混排方向。
- 已完成：Feishu outbound 稳定性：文本、卡片、patch、reaction、成员列表等 JSON API 对短暂 503/网络错误执行 CC 风格 transient retry，并把实际 requestCount 写入诊断。
- 已完成：Codex 工具调用链路按 CC/cc-switch 对齐：resume 参数顺序、Responses -> Chat 工具历史、reasoning/tool placeholder、JSON canonical；隔离 `CODEX_HOME` 真实 smoke 验证 `glm-5` 工具调用返回 200，不再触发 BigModel 1213。
- 已完成：真实 Feishu 客户端三工具调用复测：长连接入站、reaction、Progress card send/patch、工具步骤和最终回复成功；Gateway 最新 `/v1/responses` 请求无 1213。
- 已完成：F4 长回复拆分基础能力：共享 Unicode-safe text chunk helper，Feishu text 自动多条发送并记录 `chunkCount/messageIds`，Octo 回复复用同一拆分规则。
- 已完成：F4 Feishu thread/reply session：daemon/service 共用 CC 风格 session key，群线程默认 root 隔离、私聊仍按用户隔离，日志和 webhook 返回保留 root/parent/thread。
- 已完成：F4 attachment metadata：Feishu `image/file/audio/media/sticker` 与 Octo 图片/文件/语音/视频映射到统一 attachment contract；Agent 只收到脱敏摘要，平台 key 留在本地结构化数据中。
- 已完成：F4 Feishu attachment staging：Feishu resource streaming 下载到 `agent-runtime/attachments`，路径清洗；daemon 默认 128MB 安全阀，binding metadata 可覆盖或关闭上限；失败降级为 `stagingError`，Agent prompt 使用本地路径。
- 已完成：F4 Octo URL attachment staging：Octo URL 型图片/文件/语音/视频在进入 Agent 前 streaming 落盘，默认拒绝私网 URL，大小上限复用 attachment metadata；失败只写 `stagingError`。
- 已完成：F4 Octo 入站 URL 字段兼容：除 `url` 外，识别 `file_url/fileUrl/media_url/mediaUrl/download_url/downloadUrl/cdn_url/cdnUrl/origin_url/originUrl/src/href`，减少平台字段差异导致的 `[image]` 无本地路径。
- 已完成：F4 Octo payload-only 附件补回与插件协议对齐：daemon 进入 Agent 前把 payload 推断附件写回 `attachments`；支持 GIF=3、RichText=14 图文混排、有序 image blocks 和多图 `mediaUrls`。
- 已完成：F4 图片非视觉模型保护：Feishu/Octo 图片附件可 staging；`glm-5` 等未标记 vision 的模型仍启动受控 Agent turn，但 prompt 禁止视觉推断并要求询问下一步，普通文件仍进入 Agent，避免路径诱导的看图幻觉。
- 已完成：F4 Octo 出站媒体基础合同：参考 CC dmwork `upload -> send media`，支持小文件 `/v1/bot/file/upload` multipart 上传与 `/v1/bot/sendMessage` image/file payload；runtime 暴露 REST heartbeat 成功/失败指标，便于识别“WS 在线但 REST 通讯异常”；本机 `studio-cc` 小文本文件真实 smoke 已通过；大文件 COS STS 仍留后续。
- 已完成：F4 IM history context：按 session 保存最近 user/assistant 脱敏摘要，Agent prompt 注入短上下文，`/new` / `/reset` 清理 history。
- 已完成：F4 群聊 context：Agent prompt 注入 channel/sender/bot/reply/mention/成员摘要，飞书完整群成员列表后续再接平台 API。
- 已完成：F4 长回复 group buffer：群聊长回复保存到本地 buffer，只发送短预览和 buffer id；私聊保持原拆分。
- 已完成：F4 reply buffer 查看：`/buffer` / `/buffer <id|前缀|latest>` 和 Feishu Reply Buffer 子卡片，按当前 binding + session 隔离读取。
- 已完成：F5 基础治理：allowlist/admin、banned words、rate limit 覆盖 Octo/Feishu daemon 与 HTTP dispatch/action。
- 已完成：F4 飞书群成员拉取：群聊 Agent 分支分页拉取 chat members 并注入 group context，失败只记日志不阻断。
- 已完成：平台配置 UI：Octo/Feishu binding 凭证 metadata 可在 Channel Connectors 页面编辑并直接执行连接测试。
- 下一步：先做 Feishu/Octo 私聊与群聊 live 复验；继续迁移 CC/OpenClaw 视觉输入/OCR、语音/STT/TTS、文件出站和多平台 adapter；Feishu 菜单继续补更多设置型子卡和 Studio 化精修。
