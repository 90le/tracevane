# Channel Connectors / CLI Agent Bot 原生方案

> 状态：已切换为 Studio 原生实现路线；F4 attachment staging slice completed
> 更新：2026-06-06
> 参考源：CC 二开全量源码 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`；OpenClaw 频道与运行时实现；压缩映射见 `channel-connectors-native-feature-map.md`

## 1. 新结论

管理层要求完善后再上线，因此不再走“短期托管 cc-connect / 后续 native 化”的路线。Studio 直接实现原生 **Channel Connectors / CLI Agent Bot**：

```text
Octo(dmwork) / 飞书 / 微信 / IM
  -> Studio native Channel daemon
  -> local CLI Agent bot (Codex / Claude Code / OpenCode)
  -> Studio Gateway daemon
  -> upstream provider
```

全量目标不是“接几个渠道”，而是把 CC 二开源码里的能力全部原生纳入 Studio，并结合 Studio Gateway / App Connections / Studio UI 做得更完整。

CC 和 OpenClaw 只作为参考：

- 参考 CC 的平台协议、session key、mention、文件/图片、allowlist、rate limit、CLI Agent 调用方式、slash command、菜单和 Feishu card。
- 参考 OpenClaw 的频道配置、账号/机器人绑定、运行态管理和事件抽象。
- 生产实现不依赖 cc-connect binary，也不恢复旧 `resources/codex-stack` 生产路径。

## 2. 守护与边界

- Channel daemon 是 Studio 原生独立进程，由 OS/user supervisor 守护。
- Studio / OpenClaw 崩溃时，Channel daemon 仍保持在线。
- Channel daemon 运行期不依赖 Studio API；它直接调用本地 CLI Agent，CLI Agent 再走 Studio Gateway daemon。
- Studio 负责配置、安装、启停、日志、会话可视化和平台账号管理。

默认路径：

- service: `openclaw-studio-channel-connectors.service`
- native config: `~/.config/openclaw-studio/channel-connectors/config.json`
- daemon config: `~/.config/openclaw-studio/channel-connectors/daemon/config.json`
- state: `~/.config/openclaw-studio/channel-connectors/daemon/state`
- logs: `~/.config/openclaw-studio/channel-connectors/daemon/logs/channel-connectors.log`
- runtime: `~/.config/openclaw-studio/channel-connectors/daemon/runtime.json`
- override: `OPENCLAW_STUDIO_CHANNEL_CONNECTORS_DIR` or `OPENCLAW_STUDIO_DATA_DIR`

测试策略：Codex 真实 smoke 使用隔离 `CODEX_HOME`，不改用户正式配置；Claude Code / OpenCode 后续真实 smoke 可按用户许可直接修改本地配置。

## 3. 产品范围

独立 Channel Connectors 页面，不放进 Studio Gateway / Model Gateway：

- Runtime：native daemon 安装、启停、重启、状态、日志。
- Projects：工作目录、默认 Agent、默认模型、权限模式、上下文配置。
- Platforms：Octo(dmwork)、飞书、微信/企业微信账号和 bot 配置。
- Sessions：IM 会话、session key、绑定 Agent、最近消息、手动测试。

必须原生化的 CC 能力范围：

- 平台：Octo(dmwork)、飞书、微信个人号、企业微信、钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE 等 CC 已有平台能力。
- Agent：Codex、Claude Code、OpenCode 为首批；后续覆盖 CC 已有 CLI/ACP Agent，包括 Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP 等。
- 消息：文本、图片、文件、语音/STT/TTS、群聊 mention、thread/reply、流式预览、长回复拆分。
- 会话：session key、session 续接/切换/重置、workdir 切换、历史恢复、不同 bot/account 独立上下文、跨平台会话观测。
- 治理：allowlist、admin、rate limit、banned words、权限模式、run-as/user isolation、审计日志。
- 自动化：slash command、平台菜单、Feishu card、cron、hooks、relay、management API、health/status/logs。

Studio 增强点：

- 所有 Agent 默认走 Studio Gateway daemon，统一 provider、模型池、Gateway key、secret store 和协议转换。
- 复用 App Connections 的模型、上下文窗口、reasoning、权限和工作目录 profile。
- 使用 Studio 自己的 typed config、preview/apply、backup/rollback、运行态日志和页面，不让用户手写大段 TOML。
- 使用 OpenClaw channel/account/bot 经验做账号绑定和状态显示，但运行期不依赖 OpenClaw。
- IM 内命令和 Studio UI 共用同一个 typed 状态：普通平台走文本命令，Feishu 等 rich 平台走卡片/菜单，最终都落到 session override 或受控全局配置。
- 用户应能通过 IM 使用当前 Agent 的大部分原生 slash 功能：Studio 只拦截少量跨 Agent 控制命令，未知 `/xxx` 默认透传；与 Studio 命令冲突时用 `/native <命令>`。
- Agent skills/native slash 不在 Studio 里重复实现；Studio 只提供透传入口和少量会话控制，避免把 IM 控制面做臃肿。
- Agent Profile 后续借鉴 OpenClaw 的角色配置，但保持 CLI Agent Bot 定位：增加可选 Persona/Context/Tool Policy，注入到 Codex/Claude/OpenCode 的原生配置或首轮上下文，不复制 OpenClaw runtime。
- 暂不通过 IM 直接开放高风险全局配置、系统服务启停、Provider secret 修改；这些留在 Studio UI 或后续受审批的 admin 命令。

核心绑定规则：

- 一个项目可有多个平台账号 / bot。
- 每个平台账号 / bot 绑定一个 Agent profile，例如 Codex、Claude Code、OpenCode。
- 同平台多个 bot 可绑定不同 Agent。
- 微信个人号按账号粒度绑定，单账号只能绑定一个 Agent。
- Agent profile 复用 Studio Gateway App Connections 的模型、上下文、reasoning、权限和工作目录配置。

## 4. 分阶段计划

| 阶段 | 目标 |
| --- | --- |
| F1 | 已完成：native daemon skeleton、service/config/status/logs、独立页面、守护边界测试 |
| F2 | 已完成：CC/OpenClaw 能力映射、typed config store、Agent Profile、工作目录、模型、权限、Gateway key ref、platform/bot binding |
| F3 | 已完成核心合同：Octo(dmwork) adapter、REST transport、daemon register/cache/WuKongIM WebSocket、Codex CLI Agent runner、真实 Octo DM 文本往返、Codex session resume、IM command control、native passthrough、command surface、Feishu webhook/outbound/long-connection、Feishu card/menu/session/model/display/progress loop |
| F4 | 进行中：长回复拆分、Feishu thread/reply session、附件 metadata/staging、轻量 history context、群聊 context、长回复 group buffer、reply buffer 查看命令/菜单已完成；继续补语音 STT/TTS、长回复预览冻结、流式预览 |
| F5 | 治理与自动化：allowlist/admin/rate limit/banned words 已完成；继续补 cron、hooks、relay、management API |
| F6 | 飞书、微信/企业微信；继续迁移钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE 等 CC 平台 |
| F7 | 补齐剩余 CC Agent、跨平台会话观测、消息审计、迁移工具和发布验收 |

## 5. 当前结果

- 新增 `/channel-connectors` 独立页面。
- 新增 `/api/channel-connectors/status`、`/api/channel-connectors/config` 与 `/api/channel-connectors/daemon/*` 后端 API。
- 新增 Studio 原生 daemon entry：`apps/api/modules/channel-connectors/daemon.ts`。
- service template 启动的是 Studio 构建产物：`node dist/apps/api/modules/channel-connectors/daemon.js --config config.json`。
- daemon skeleton 可写 runtime/log，并暴露本地 health/status。
- 原生 config store 已支持 Agent Profile、workDir、Agent、model、permission、App profile ref、Gateway endpoint/key ref、platform/bot binding、allowlist/admin。
- daemon runtime config 已从原生 config 派生；同一微信个人账号不能绑定不同 Agent Profile。
- Octo(dmwork) adapter contract 已支持 DM/群聊 session key、群聊 directed 规则、bot->Agent 绑定解析、文本 inbound dry-run、reply payload 分片和 mention 渲染。
- Octo REST transport 已支持 binding metadata `apiUrl/botToken/wsUrl`、register、typing、sendMessage、transport-smoke API；incoming `sendReply:true` 可按 replyPlan 真实发送文本。
- Channel daemon 已支持 Octo register 后凭证缓存、WuKongIM WebSocket CONNECT/CONNACK/heartbeat/RECVACK/AES 解密、runtime status、Codex/Claude Code/OpenCode 一次性 CLI runner 合同。
- Channel daemon 已支持 runner JSONL progress、`activeRuns` status、Octo event start/progress/finish、typing pulse 和失败短回执。
- Channel daemon 已支持 `/help`、`/command`、`/cmd`、`/status`、`/agent`、`/model`、`/mode`、`/dir`、`/cd`、`/new`、`/reset`、`/display`、`/stream`、`/tools`；override 按 IM session 存储，模型切换不切断 Codex thread，workdir/new session 会断开旧续接，流式/工具消息开关只作用于当前 IM session。
- Channel daemon 已支持 Agent 原生命令透传：未知 `/xxx` 直接转给当前 Agent，`/native <命令>` 用于透传与 Studio 命令同名的原生命令。
- Channel Connectors 已支持 command surface preview：text fallback、平台无关 action sections、Feishu card JSON、action payload -> command 解析。
- Channel Connectors 已支持 command action callback：通用 `/commands/action` 和 Feishu `card-action` / `bot-menu` aliases 可把 action value / event key 转回 command-router。
- Channel Connectors 已支持 Feishu webhook ingress：URL verification、card action、bot menu、message receive 进入同一 command-router；`verificationToken` 放在 binding metadata，不写入文档或源码。
- Channel daemon 已支持 Feishu 官方 WebSocket 长连接：`im.message.receive_v1`、`card.action.trigger`、`application.bot.menu_v6` 进入同一 command-router/Agent runner；同一 Feishu App 多 binding 共享单条 WS，支持 chatId 过滤并保留 thread/root 字段。
- Channel Connectors 已支持 Feishu outbound contract：tenant access token file cache、send text message、patch card message、transport-smoke；message webhook 默认可把 command-router 回复真实出站。
- 已完成脱敏 live 闭环：本地用户配置写入 Feishu binding、tenant token cache 验证通过、callback URL verification 通过；错误 verification token 不再回显 challenge；daemon active/enabled，真实飞书 `/status`/`/help` 入站并回复成功；CLI runner 已补用户级 PATH fallback，避免 systemd 下找不到 Codex/Claude/OpenCode；凭据和 token 不进入仓库。
- Feishu card/menu 已具备 Session、Agent、Model、Permission、WorkDir、Display 子卡片；普通 slash 与卡片点击共用同一 command-router。Agent 运行已支持 processing reaction、单张 Progress card send/patch、`command_execution` 工具过程展示、`/stream` 与 `/tools` 开关，以及 upstream JSON error envelope 清洗和失败去重。
- Codex 工具调用链路已按 CC/cc-switch 对齐：resume 参数顺序、Responses -> Chat 工具历史、reasoning/tool placeholder、JSON canonical 均有回归覆盖；隔离 `CODEX_HOME` 真实 smoke 已验证 `glm-5` 工具调用不再触发 BigModel 1213。
- 真实飞书客户端已复测三次工具调用：长连接入站、reaction、Progress card send/patch、工具步骤和最终 `ok` 均成功；Gateway 对应 `/v1/responses` 最新请求为 200。
- F4 长回复拆分已落地：按 CC `splitMessage` 规则做 Unicode 安全切分，Feishu text 自动分多条发送，Octo 回复拆分复用同一 helper。
- F4 Feishu thread/reply 会话隔离已落地：daemon/service 共用 CC 风格 session key，群线程默认按 root 隔离，私聊保持每用户 session，事件日志保留 root/parent/thread 便于排查。
- F4 附件 metadata 已落地：Feishu `image/file/audio/media/sticker` 和 Octo 图片/文件/语音/视频进入统一 attachment contract；Agent prompt 只收到脱敏摘要，平台 key 留在本地 API/日志用于后续下载/staging。
- F4 Feishu 附件下载/staging 已落地：长连接入站进入 Agent 前以 streaming 方式下载资源到受控本地目录，路径和文件名清洗；daemon 默认 128MB 安全阀，binding metadata 可用 `attachmentMaxBytes` / `attachment_max_bytes` 覆盖，`0` / `unlimited` 可关闭 daemon 侧上限；失败不阻断会话，Agent 使用本地路径读取文件。
- F4 IM history context 已落地：按 IM session 保存最近 user/assistant 摘要，注入 Agent prompt；`/new` / `/reset` 同步清理 history。
- F4 群聊 context 已落地：Agent prompt 注入当前群聊 channel/sender/bot/reply/mention/成员摘要；飞书完整群成员列表后续再接平台 API。
- F4 长回复 group buffer 已落地：群聊长回复保存完整内容到本地 buffer，群内只发送短预览和 buffer id，避免刷屏；私聊不变。
- F4 reply buffer 查看已落地：`/buffer` 列表和 `/buffer <id|前缀|latest>` 读取完整内容；Feishu 菜单提供 Reply Buffer 子卡片；读取范围限制在当前 binding + IM session。
- F5 基础治理已落地：入站执行前统一检查 allowlist/admin、`metadata.bannedWords`、`metadata.rateLimitPerMinute` / `rateLimitWindowSeconds`；命中只写审计事件，不触发 CLI Agent。

## 6. 下一步

1. F4：补飞书完整群成员拉取和群上下文增强。
2. 继续迁移 CC/OpenClaw 的文件/图片和多平台 adapter。
3. Feishu card/menu 后续 UI 精修继续复刻 CC 成熟结构，再做 Studio 化整理。
