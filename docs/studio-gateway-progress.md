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
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理；Octo daemon 已接入 Bot API 群成员、最近历史、文件下载 URL、平台 skill、`/octo` 群/成员/Space 查询命令和出站消息 manifest。
- OpenCode Agent runner 走 Gateway-first：Channel 配置保存 Gateway 模型短名或模型 ID，runner 转换为 OpenCode 需要的 `studio-gateway/<model>`；每轮生成隔离 OpenCode config，session 数据写入 Channel runtime dataHome；旧全局 sessionId 在当前 dataHome 不存在时自动新建，避免 IM 切换 OpenCode 后被 stale session 卡死。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认启用 SDK lower-case `pingTimeout=3`、包装 SDK `pingLoop()` 将有效心跳调度 clamp 到 `pingIntervalMs=10000`、SDK reconnecting 超 5s 回收、应用层 ping/pong runtime proof、`pongTimeoutMs=8000` 外层兜底回收、23s control-frame stale 判死、快速 ACK、messageId 去重、会话水位线防旧消息插队和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件/消息收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` 或 `studio-channel-messages` manifest，daemon 按平台上传文件或发送 Octo DM/group/thread 文本消息；Agent 不应调用 `cc-connect` 或平台 CLI。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback、session 管理合同和真实 CLI mock-Gateway smoke；IM 进度里的“过程回复”只接受 `assistant/intermediate`，最终回复 `assistant/final` 只走最终结果渲染。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- 新增 Studio 原生 `/octo` 平台命令：`/octo groups`、`/octo members [group_no]`、`/octo search <keyword>`，复用 Octo Bot API 群列表、群成员和 Space 成员搜索；Octo 群内 `/octo members` 可自动取当前 group_no。
- daemon 与 service/dry-run 两条路径都接入同一 Octo management contract，前端/API、真实 daemon 和系统测试行为一致。
- Agent 群上下文改为结构化成员列表，明确 Octo `@[uid:显示名]` @ 写法和 `studio-channel-messages` 私聊/group/thread/mention 发送能力，避免模型误称没有 Feishu/Octo API 权限。
- Channel skill context 增补 Octo 原生命令和出站消息 manifest 提示，但提示词仍禁止出现旧 `cc-connect` 链路名称。

## 最近验证

- 通过：`npm run typecheck:api`。
- 通过：`npm run build:api`。
- 通过：`node --test --test-name-pattern "Octo native management commands|Octo transport smoke covers Bot API groups|agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，3/3 全部通过。
- 通过：真实 Octo 配置非发送 smoke：`/octo groups` 返回 1 个群，`/octo members` 返回“小丘测试群”6 个成员，`/octo search 小维` 返回 2 个成员。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong/control-frame proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code 普通 turn、Bash tool-use、文件 manifest、视觉附件、`/compact`、`/stop` 和 OpenCode 普通 turn、文件 manifest、视觉附件、`/compact`、`/stop` 已有真实 CLI mock-Gateway smoke；Claude 审批已由用户 live 测试通过，Codex app-server requestApproval 已有 driver 合同回归；assistant 过程回复已接入 IM progress，但真实 Feishu/Octo live 视觉效果、Codex/OpenCode live approval 和 IM live 文件上传链路仍需逐项验收。Octo 出站文件已改为默认 STS/COS，仍需用户在真实 Octo 会话里重试 `hello.txt`。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。
- `studio-channel-messages` 已有 parser 与 daemon send path；`/octo` 群/成员/Space 查询已有 Bot API 与真实配置非发送 smoke，真实 Octo 私聊/@群成员 live smoke 还未执行，Feishu open_id/user_id 私聊解析后续补。

## 下一步

1. 用户在真实 Octo 群聊让 Agent 私聊或 @ 某个成员，验证 `studio-channel-messages` 的 DM/group/thread 与 mention 能真实发送。
2. 用户发送一条新的 Feishu 消息，做业务入站复验：runtime 应出现 dispatcher callback / receivedMessages，且无 reconnect/stale。
3. 做真实 IM live command/progress smoke：Feishu 验证 card patch、权限审批和三次顺序工具调用；Octo 验证文本进度、工具输出、文件/消息 manifest。
4. 继续按 Octo 插件迁移剩余 `octo_management`：建群/改群/加减成员、thread 管理、GROUP.md/thread MD/persona context；随后补 Feishu open_id/user_id 私聊、富文本和文档/云盘 skills。
