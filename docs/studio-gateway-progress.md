# Studio Gateway 进度

> 状态：Studio Gateway core completed; Provider Center/App Connections completed; CLI/Gateway/live smoke harness completed; Channel Connectors F3f Feishu long-connection/menu/reaction loop completed; OpenAI Platform vendor proof optional
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
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect；F3f 已完成文本命令、原生 Agent slash 透传、平台无关 command surface、Feishu webhook/long-connection ingress、action callback、CC 风格 command/menu card/子卡片/dropdown 和 outbound transport contract；Codex 通过 Studio Gateway client key 启动，不再依赖用户全局 Codex provider。
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
- 新增 Feishu live ingress：HTTP webhook 支持 URL verification、`card.action.trigger`、bot menu、`im.message.receive_v1`；Channel daemon 也支持官方 WebSocket 长连接 `im.message.receive_v1` / `card.action.trigger` / `application.bot.menu_v6`，同一 Feishu App 多 binding 共享一条 WS，避免飞书侧负载均衡丢事件。
- 新增 Feishu outbound transport：binding metadata `apiUrl/appSecret/verificationToken`、tenant access token file cache、send text message、send interactive card、patch card message、`/api/channel-connectors/adapters/feishu/transport-smoke`；message webhook 默认可把 command-router 回复通过 Feishu API 发回。
- Feishu live 长连接闭环完成：本地用户配置已写入 Feishu binding，tenant token cache 验证通过，daemon systemd 模板修复并 active/enabled，真实飞书 `/status` 入站到 `im.message.receive_v1` 并文本回复，真实 `/help` 入站后走 command surface interactive card `send-card`；systemd-like 最小环境下 CLI PATH fallback 可找到 `codex`；错误 verification token 不再回显 challenge；凭据和 token 只保存在本机或运行态，不写入仓库。
- Feishu command/menu card 已按 CC 结构改为单页分组 + 子卡片：`nav:/help <section>` 切分组，`nav:/agent` / `nav:/model` / `nav:/mode` / `nav:/dir` 进入 Agent/模型/权限/目录子卡片，`act:/...` 才执行命令；可切换项已用 Feishu `select_static` 下拉替代长列表。
- Feishu card-action 已补齐 WS normalized event、`select_static` `action.option`、同步 `{toast, card.raw}` 响应和同 messageId 多次点击去重策略；主菜单只暴露当前 router 已实现命令，未完成的审批、历史、文件、skills 管理不放占位按钮。
- Channel daemon 已修复 Gateway client key 查找：同时支持当前 `.config/openclaw-studio` runtime 布局和实际 `.openclaw/studio/model-gateway/secrets.json` 布局；缺 key 时 Codex runner 会提前返回明确错误，不再出现 `Model provider studio_gateway not found`。
- `/cd` 已支持 `/dir` 展示的子目录序号；WorkDir 子卡片下拉会真实写入当前 IM session 的目录 override，并清理旧 Agent 续接。
- Channel daemon config API 只返回脱敏 preview；完整 appSecret / verificationToken 仅保留在本地 daemon config 文件用于运行时。
- Feishu Agent 运行链路已补齐 CC 风格 processing reaction：普通消息进入 Agent 前给原消息加 `OnIt` reaction，结束后删除；reaction API 失败只写事件日志，不阻断 Agent。
- Agent 失败回执已优先使用 Codex/Agent JSONL 里的 `error` / `turn.failed` 文本，不再把网关 503、模型未启用等真实原因退化成 `Agent process exited with 1`。
- Feishu card action 解析已对飞书下拉/按钮混合 payload 做防御，只要 `action` / `command` / `value` / `option` 任一字段带 `nav:` / `act:` / `cmd:` 前缀，就按真实 Studio 命令处理，避免菜单动作误透传给 Agent。
- Feishu 菜单交互已区分 `nav:` 和 `act:`：导航动作只更新菜单；执行动作会把命令结果渲染到卡片顶部，并保留更新后的当前状态/子页面。`/status`、`/new`、`/reset`、`/agent`、`/model`、`/mode`、`/cd` 不再只 toast “菜单已更新”。

## 验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs`。
- 通过：`npm run build:web`。
- 通过：Feishu live credential proof（secret redacted）：tenant access token HTTP 200、token cache hit、bot info HTTP 200 / code 0。
- 通过：Feishu live callback verification proof（secret redacted）：本地 binding 保存、tenant token miss/hit、公网 callback URL verification HTTP 200 / challenge matched；错误 token HTTP 403 且不返回 challenge。
- 通过：Feishu live long-connection proof（secret redacted）：Channel daemon `/status` 显示 Feishu WS `connected`，真实用户 `/status` 消息进入 `im.message.receive_v1`，事件日志记录 `channel.command` 且 `replySent=true`。
- 通过：CLI PATH fallback proof：最小环境 `PATH=/usr/local/bin:/usr/bin:/bin` 下追加用户级 bin 后 `codex --version` 成功，覆盖 systemd 下 `spawn codex ENOENT` 根因。
- 通过：Feishu interactive card proof（secret redacted）：`send-card` transport-smoke HTTP 200 / messageId present；真实 `/help` 事件日志记录 `replyTransportAction=send-card`。
- 通过：Feishu command/menu card contract：`npm run build:api` + `node --test tests/system/channel-connectors-service.test.mjs` 覆盖 nav/act payload、WS normalized card-action、`select_static` option 回调、Agent/模型/权限/目录子卡片、HTTP card-action raw card response、daemon card-action 去重策略、Gateway key resolver 和 Codex 缺 key 失败提示。
- 通过：重启 dev backend/frontend 与 `openclaw-studio-channel-connectors.service`；daemon `/status` Feishu `connected`；本地 card-action replay 同一 messageId 可在会话页/模型页往返；`/api/channel-connectors/daemon/config` 返回 `[redacted]` 且未匹配本地 secret 值。
- 通过：真实 Feishu reaction proof（secret redacted）：对近期入站消息执行 `add-reaction OnIt` 与 `remove-reaction` 均 HTTP 200。
- 通过：本机 Codex/Studio Gateway live proof：Channel Connector 当前 Profile 切到 Gateway 已启用 `glm-5`，清理旧 Codex thread 后，隔离 Codex runner 经 `http://127.0.0.1:18796/v1` 返回 `studio-ok`。
- 通过：Feishu command result card contract：`node --test tests/system/channel-connectors-service.test.mjs` 覆盖 `act:/status` 卡片顶部展示 `Studio Channel Status`，且不再返回“菜单已更新”作为唯一反馈。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Channel Connectors 已用真实 Octo 凭据验证 register、WuKongIM WebSocket、用户消息入站、Codex CLI Agent、Studio Gateway、Octo sendMessage 和同一 IM session 的 Codex thread 续接。Feishu 已完成 tenant-token / bot-info、callback verification、WebSocket 长连接、真实用户 `/status` 入站/回复闭环；若飞书客户端仍提示“回调服务不在线”，优先核验开放平台「回调配置」是否使用长连接并已添加 `card.action.trigger`，以及应用版本是否已发布。尚未完成审批回传、图片/文件、历史上下文和 skills 管理卡。

## 下一步

1. 让用户在真实 Feishu 客户端再发普通消息和点击菜单，确认 reaction 可见、卡片能来回切换、失败时显示真实 provider/model 原因。
2. 进入 F4：补图片/文件、群聊成员/history context、长回复 group buffer 和治理策略。
3. 继续按 CC/OpenClaw 映射扩展 Feishu bot menu 配置、thread isolation 和多平台 adapter。
