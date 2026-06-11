# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-11
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算；模型预算是 App Connections 与 Channel Connectors 的默认上下文来源。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理；Octo daemon 已接入 Bot API 群成员、最近 timeline 历史、文件下载 URL、GROUP.md/THREAD.md、voice context、平台 skill 自动上下文、`/octo` 群/成员/Space/thread 管理命令和出站消息 manifest。
- Channel Connectors API/前端只暴露当前已有 runner 的 live Agent：Codex、Claude Code、OpenCode；Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP 保留为迁移路线图，未实现前不进入可选 `supportedAgents`。
- 自动 channel skill 支持分两层：普通 IM turn 会给 Codex/Claude Code/OpenCode 注入 Studio runtime skill 摘要；同时 Codex `CODEX_HOME/skills` 与 Claude `CLAUDE_CONFIG_DIR/skills` 会收到当前渠道 platform skill 的 Studio runtime 投影，过滤安装/凭证/setup 章节，供原生 skills 机制发现。OpenCode 当前用 prompt/manifest 映射。
- OpenCode Agent runner 走 Gateway-first：Channel 配置保存 Gateway 模型短名或模型 ID，runner 转换为 OpenCode 需要的 `studio-gateway/<model>`；每轮生成隔离 OpenCode config，session 数据写入 Channel runtime dataHome；旧全局 sessionId 在当前 dataHome 不存在时自动新建，避免 IM 切换 OpenCode 后被 stale session 卡死。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认启用 SDK lower-case `pingTimeout=3`、包装 SDK `pingLoop()` 将有效心跳调度 clamp 到 `pingIntervalMs=10000`、SDK reconnecting 超 5s 回收、应用层 ping/pong runtime proof、`pongTimeoutMs=8000` 外层兜底回收、23s control-frame stale 判死、快速 ACK、messageId 去重、会话水位线防旧消息插队和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件/消息收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` 或 `studio-channel-messages` manifest，daemon 按平台上传文件或发送 Octo human DM/group/thread 文本消息、Octo `on_behalf_of` persona 消息、Feishu chat/open_id/user_id 文本/Markdown(post) 消息；Octo 机器人协作走群/thread @，不走 bot DM；Agent 不应调用 `cc-connect` 或平台 CLI。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback、session 管理合同和真实 CLI mock-Gateway smoke；IM 进度里的“过程回复”只接受 `assistant/intermediate`，最终回复 `assistant/final` 只走最终结果渲染。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- 对照 Octo 插件固定群协作 @ 合同：`@[uid:显示名]`、bot DM 重写和 transport mention metadata 兜底都会发送可见 `@显示名`/`@uid` + Octo `mention.entities/uids`，避免隐藏 @。
- 修复 Octo 群聊 `/process on` 下过程回复延迟：`step_finish: tool-calls` 仍是继续边界；Octo progress 气泡改为 5s best-effort 发送并带 `client_msg_no`，慢 REST 不再把旧过程回复拖到最终阶段补发；新增 daemon 级回归证明群聊开启 process 后中间回复先于最终回复发送。
- 平台 skill 自动映射增强：普通 IM turn 会给 Codex、Claude Code、OpenCode 注入当前 binding/platform skill 的自动激活规则和运行时短指令片段；Octo/Feishu 平台 skill 摘要会优先抽取消息发送、历史、群协作、文件、权限等章节，并过滤注册、安装 OpenClaw 插件、保存凭证等 setup 章节，避免 Agent 误走外部桥接。
- Feishu 出站消息按 OpenClaw target 合同迁移：`studio-channel-messages` 现在支持 `chat:oc_xxx`、`open_id:ou_xxx`、`user_id:u_xxx`、`dm:ou_xxx/u_xxx`，并支持 `format:"markdown"` 走 Feishu post(md)，发送时会选择对应 `receive_id_type`。
- Octo persona/OBO 出站身份合同已接入：`studio-channel-messages` 可声明 `onBehalfOf` / `on_behalf_of` / `respondAs`，daemon 会按 Octo 插件 `sendMessage` 合同把它转为 Bot API 顶层 `on_behalf_of`。
- Octo persona/OBO 入站路由已接入：binding metadata `onBehalfOf/on_behalf_of/respondAs/grantorUid` 会启用 grantor persona；普通 bot 仍不响应 `mention.all/humans` 广播，persona bot 会响应 @grantor / @所有人，并按 Octo 插件合同把文字、typing、文件/媒体和 manifest 消息发到源群/源私聊且携带顶层 `on_behalf_of`。可信 OBO v2 只接受配置 grantor 发来的 payload，`obo_system_hint` 会注入 Agent prompt，AI-only fan-out 会跳过，payload `respond_as` 不作为真实身份。
- 本地 IM history 默认保留并注入最多 20 条；prompt 渲染每条最多 360 字符、整段最多 8000 字符，超长消息截断并在必要时丢弃更早历史，避免大段文本撑爆上下文。
- Octo 群历史同步改为协作 timeline：默认窗口从 6 条提高到 20 条，prompt 按时间顺序保留 human、Studio self-bot 和其它 bot 回复，并标注 `senderType`；每条默认最多 1200 字符、整段 timeline 默认最多 8000 字符，超出会标 `truncated/originalRunes` 并优先保留最近消息，避免 Agent 看不到协作者回复或被超长历史撑爆上下文。
- Octo daemon 对齐 OpenClaw 插件实时历史语义：未 @bot 的群/thread 消息也会进入 daemon 内存短 timeline，但不会触发 Agent；后续被 @ 时，prompt 会合并 Bot API timeline 与 realtime local timeline，避免刚发生的协作者回复因为 Bot API sync 延迟而不可见。
- `/octo history [条数]` 已接入 service/daemon，默认读取当前群/thread 前文，供用户和 Agent 直接查看 Bot API 群历史。
- Codex stale resume 自愈：`thread/resume failed` / `no rollout found` 会自动 fresh turn 重试；fallback compact 成功时不再暴露 “No live persistent session” 作为错误。
- Feishu transport-smoke 支持 `receiveId/receiveIdType`，可直接验证 `chat_id/open_id/user_id` 目标；真实 open_id 文本与 Markdown(post) 发送已通过，user_id 真实目标仍待平台可用 ID 验收。
- supportedAgents 收敛为 runtime subset：Channel 配置保存、status 和 native config 只暴露 Codex/Claude Code/OpenCode；未实现 runner 的 roadmap Agent 会在保存时拒绝，避免用户选择后运行时才 `unsupported-agent`。
- Codex/Claude 原生 skill 投影已接入：当前 binding/platform skills 会写入隔离 Agent 配置目录的 `skills/<skill>/SKILL.md`，内容为 Studio runtime 版说明，不包含 OpenClaw 插件安装、注册、凭证配置等 setup 段落。

## 最近验证

- 通过：`npm run typecheck:api`。
- 通过：`npm run build:api`。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session" tests/system/channel-connectors-service.test.mjs`，覆盖 Octo/Feishu platform skill 运行时章节抽取与 setup/bridge/config 章节过滤。
- 通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，覆盖 channel skill context 注入 Codex、Claude Code、OpenCode 三个当前 runner。
- 通过：同一测试覆盖 Codex `CODEX_HOME/skills` 与 Claude `CLAUDE_CONFIG_DIR/skills` 的 channel skill 原生投影，且投影内容过滤 setup/bridge 章节。
- 通过：`node --test --test-name-pattern "native Channel Connectors status keeps daemon and binding policy separate from Model Gateway|native Channel Connectors store persists agent profiles and derives daemon runtime" tests/system/channel-connectors-service.test.mjs`，覆盖 live `supportedAgents` 只返回当前三个 runtime runner，未实现 Agent 保存被拒绝。
- 通过：`node --test --test-name-pattern "native Channel Connectors extracts outbound IM message manifests|native Channel Connectors Feishu transport sends text to open_id and user_id targets|native Channel Connectors Feishu transport sends markdown post to open_id targets|native Channel Connectors Feishu transport splits long text replies|native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，5/5 全部通过。
- 通过：`node --test --test-name-pattern "native Channel Connectors conversation history stores sanitized session context|native Channel Connectors conversation history keeps twenty prompt entries within budget|native Channel Connectors IM commands switch agent, model, and permission per session" tests/system/channel-connectors-service.test.mjs`，3/3 全部通过。
- 通过：`node --test --test-name-pattern "daemon sends Octo group process replies before final reply" tests/system/channel-connectors-service.test.mjs`，1/1 全部通过。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session|native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，2/2 全部通过。
- 通过：`node --test --test-name-pattern "Octo transport keeps group mentions visible|native Channel Connectors process runner maps Codex agent messages before later tools|native Channel Connectors process runner maps Claude text before later tools|native Channel Connectors process runner maps OpenCode JSON progress|native Channel Connectors process runner treats OpenCode tool-calls" tests/system/channel-connectors-service.test.mjs`，5/5 全部通过。
- 通过：`node --test --test-name-pattern "Octo transport keeps group mentions visible|Octo transport times out slow text replies|native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`，3/3 全部通过。
- 通过：`node --test --test-name-pattern "extracts outbound IM message manifests|Octo transport carries on_behalf_of|Octo transport keeps group mentions visible|Octo transport times out slow text replies" tests/system/channel-connectors-service.test.mjs`，4/4 全部通过。
- 通过：`node --test --test-name-pattern "daemon enriches Octo group turns with Bot API context and file download URLs|Octo adapter follows group direction and mention rendering rules|native Channel Connectors extracts outbound IM message manifests" tests/system/channel-connectors-service.test.mjs`，3/3 全部通过。
- 通过：`node --test --test-name-pattern "Octo adapter follows group direction and mention rendering rules|Octo transport carries on_behalf_of|Octo transport carries on_behalf_of for typing and media|daemon enriches Octo group turns with Bot API context and file download URLs" tests/system/channel-connectors-service.test.mjs`，4/4 全部通过。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon enriches Octo group turns with Bot API context and file download URLs" tests/system/channel-connectors-service.test.mjs`，覆盖 Octo Bot API timeline、realtime local timeline、成员上下文和文件下载 URL。
- 通过：`node --test tests/system/channel-connectors-agent-run-live-script.test.mjs`，5/5 全部通过；`scripts/smoke-channel-connectors-agent-run-live.mjs` 新增 `--require-outbound-message`，可验证 `studio-channel-messages` 的 declared/sent 真实日志证据。
- 通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 1440 --bindings octo-studio-cc,feishu-live --require-ok --require-outbound-message --json`，真实日志中命中 8 条 Octo `outboundMessagesDeclared/Sent` 成功 run；Feishu 单独执行同一检查尚无匹配 run，Feishu open_id/user_id/Markdown 出站 live smoke 仍待触发。
- 通过：本机 Feishu `transport-smoke` 使用真实 open_id 发送文本与 Markdown(post)，Feishu API 均返回 200 并产生消息 ID；输出已脱敏，未记录 app secret/token。
- 通过：`node --test --test-name-pattern "native Channel Connectors extracts outbound IM message manifests|Octo adapter follows group direction and mention rendering rules|Octo transport smoke covers Bot API groups|Octo native management commands|native Channel Connectors agent runner builds gateway-backed Codex turns|native Channel Connectors service slash compact works" tests/system/channel-connectors-service.test.mjs`，6/6 全部通过。
- 通过：真实 Octo 配置非发送 smoke：`/octo groups` 返回 1 个群，`/octo members` 返回“小丘测试群”6 个成员，`/octo search 小维` 返回 2 个成员，`/octo info` 返回“小丘测试群”群信息，`/octo threads` 返回当前群 thread 列表（0）。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong/control-frame proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code 普通 turn、Bash tool-use、文件 manifest、视觉附件、`/compact`、`/stop` 和 OpenCode 普通 turn、文件 manifest、视觉附件、`/compact`、`/stop` 已有真实 CLI mock-Gateway smoke；Claude 审批已由用户 live 测试通过，Codex app-server requestApproval 已有 driver 合同回归；assistant 过程回复已接入 IM progress。Octo progress 气泡为 best-effort，单次发送超过 5s 会丢弃以避免旧过程消息延迟补发；真实 Feishu/Octo live 视觉效果、Codex/OpenCode live approval 和 IM live 文件上传链路仍需逐项验收。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。
- `studio-channel-messages` 已有 parser 与 daemon send path，并支持 Octo 结构化 `@[uid:显示名]` mention、Octo `on_behalf_of` 出站身份、Feishu chat/open_id/user_id 文本/Markdown(post) 发送；Octo 群 outbound-message 已有真实日志证据，Feishu open_id 文本/Markdown transport-smoke 已通过，human DM、thread、@其它 Studio/外部 bot 和 Feishu user_id 真实发送仍需 live smoke。外部产品 bot 只能通过平台群/thread 消息协作；等待多 bot 异步回复并自动汇总需要后续 Studio 内部协作调度。Octo 建群/改群/thread 管理 live smoke 还未执行。

## 下一步

1. 用户在真实 Octo 群聊让 Agent 私聊 human 或 @其它 Studio/外部 bot，验证 `studio-channel-messages` 的 human DM、group/thread mention 能真实发送。
2. 对照 Octo 插件继续迁移更完整菜单、技能说明和多 bot 协作 live smoke；platform skill 普通注入已只保留运行时能力，显式 `/skill` 仍保留完整文档。
3. 用户发送一条新的 Feishu 消息，做业务入站复验：runtime 应出现 dispatcher callback / receivedMessages，且无 reconnect/stale。
4. 做真实 IM live command/progress smoke：Feishu 验证 card patch、权限审批、三次顺序工具调用和 open_id/user_id 文本/Markdown 出站消息；Octo 验证文本进度、工具输出、文件/消息 manifest；随后补 Feishu 文档/云盘 skills。
