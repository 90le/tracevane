# Studio Gateway 进度

> 状态：Studio Gateway core completed; Provider Center/App Connections completed; CLI/Gateway/live smoke harness completed; Channel Connectors F3f Feishu transport live credential proof completed; OpenAI Platform vendor proof optional
> 更新：2026-06-06
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect；F3f 已完成文本命令、原生 Agent slash 透传、平台无关 command surface、Feishu action callback、webhook ingress 和 outbound transport contract。
- Phase B2 已按 `/tmp/cc-switch-src` 覆盖核心协议成熟度：CLI 启动、Claude tool/summary、OpenClaw agent provider/model/usage、Gateway HTTP compact/tool-history/error envelope、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix，以及 GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof。

## 本轮完成

- Channel Connectors F2 已完成：`/api/channel-connectors/config` typed store、Agent Profile、workDir、Agent、model、permission、Gateway endpoint/key ref、platform/bot binding、allowlist/admin。
- daemon runtime config 改为从 native config 派生；个人微信账号不能绑定不同 Agent Profile。
- 前端 `/channel-connectors` 的 Projects / Platforms tab 已从只读 skeleton 改为真实编辑保存。
- 新增 `docs/channel-connectors-native-feature-map.md`，压缩记录 CC/OpenClaw -> Studio 原生能力映射。
- 新增 Octo(dmwork) adapter contract 与 `/api/channel-connectors/adapters/octo/incoming`：支持 DM/群聊 session key、群聊 directed 规则、bot->Agent 绑定解析、文本 inbound dry-run、reply payload 分片和 mention 渲染。
- 新增 Octo REST transport：binding metadata `apiUrl/botToken/wsUrl`、register、typing、sendMessage、`/api/channel-connectors/adapters/octo/transport-smoke`；incoming `sendReply:true` 可按 replyPlan 真实发送文本。
- Channel daemon 已接 Octo register credential cache、WuKongIM WebSocket CONNECT/CONNACK/heartbeat/RECVACK/AES 解密、runtime status、Codex/Claude Code/OpenCode 一次性 CLI runner 合同；入站消息可进入 runner 并通过 REST sendMessage 回复。
- Channel daemon 已接 runner JSONL progress、`activeRuns` status、Octo event start/progress/finish、typing pulse 和失败短回执。
- Channel daemon 已接 IM slash command control core：`/help`、`/status`、`/agent`、`/model`、`/mode`、`/dir`、`/cd`、`/new`、`/reset`；未知 `/xxx` 默认透传给当前 Agent，冲突命令可用 `/native <命令>` 强制透传。
- Session override 按 IM session 持久化，不污染全局 Studio Provider/App config；`/model` 保持 Codex thread 续接，`/cd` 和 `/new` 会断开旧 Agent 续接。
- 新增 `/api/channel-connectors/commands/surface`：输出平台无关 command surface、text fallback 和 Feishu interactive card 结构；普通 IM、Feishu 卡片、未来自研 IM 客户端都复用同一 command contract。
- 新增 `/api/channel-connectors/commands/action` 与 Feishu `card-action` / `bot-menu` aliases：从 action value / event key 解析命令并回到 command-router；Agent 原生命令仍只标记 passthrough，不在 Studio API 内直接启动 CLI。
- 新增 Feishu live webhook ingress：`/api/channel-connectors/adapters/feishu/webhook` 支持 URL verification、`card.action.trigger`、bot menu、`im.message.receive_v1`，按 binding metadata `verificationToken` 校验后复用 command-router，并返回 Feishu 兼容 `challenge` / toast / card 响应。
- 新增 Feishu outbound transport：binding metadata `apiUrl/appSecret/verificationToken`、tenant access token file cache、send text message、patch card message、`/api/channel-connectors/adapters/feishu/transport-smoke`；message webhook `sendReply:true` 可把 command-router 回复通过 Feishu API 发回。

## 验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs`。
- 通过：`npm run build:web`。
- 通过：Feishu live credential proof（secret redacted）：tenant access token HTTP 200、token cache hit、bot info HTTP 200 / code 0。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Channel Connectors 已用真实 Octo 凭据验证 register、WuKongIM WebSocket、用户消息入站、Codex CLI Agent、Studio Gateway、Octo sendMessage 和同一 IM session 的 Codex thread 续接。Feishu app 凭据已完成 tenant-token / bot-info live proof；尚未用真实 verification token、callback URL、chat message 联调 webhook/回复闭环、审批回传、图片/文件/历史上下文；高风险全局配置/系统服务命令暂不通过 IM 直接开放。

## 下一步

1. 完成 F3f 真实 Feishu webhook/message 联调：还需要 verification token、公开 callback URL 或隧道；如需主动发消息 smoke，还需要 chat_id 或先让机器人收到一条真实消息。
2. 进入 F3g：补 CLI Agent 权限审批回传。
3. 进入 F4：补图片/文件、群聊成员/history context、长回复 group buffer 和治理策略。
