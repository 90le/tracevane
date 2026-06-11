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
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理；Octo daemon 已接入 Bot API 群成员、最近历史和文件下载 URL 到 Agent 入站上下文。
- OpenCode Agent runner 走 Gateway-first：Channel 配置保存 Gateway 模型短名或模型 ID，runner 转换为 OpenCode 需要的 `studio-gateway/<model>`；每轮生成隔离 OpenCode config，session 数据写入 Channel runtime dataHome；旧全局 sessionId 在当前 dataHome 不存在时自动新建，避免 IM 切换 OpenCode 后被 stale session 卡死。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认启用 SDK lower-case `pingTimeout=3`、包装 SDK `pingLoop()` 将有效心跳调度 clamp 到 `pingIntervalMs=10000`、SDK reconnecting 超 5s 回收、应用层 ping/pong runtime proof、`pongTimeoutMs=8000` 外层兜底回收、23s control-frame stale 判死、快速 ACK、messageId 去重、会话水位线防旧消息插队和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback、session 管理合同和真实 CLI mock-Gateway smoke；IM 进度里的“过程回复”只接受 `assistant/intermediate`，最终回复 `assistant/final` 只走最终结果渲染。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- Octo WuKongIM 入站消息保留 `messageSeq`，用于 Bot API `messages/sync` 拉取当前消息前的短历史窗口。
- Octo 群聊 Agent turn 会按 OpenClaw Octo Bot API 拉取群成员并合并进 group context；失败只写 Octo event，不阻断 Agent。
- Octo Agent prompt 现在会拼接 Bot API 最近频道历史和本地 IM history；默认只取小窗口，可用 binding metadata 关闭或调整。
- Octo 附件 staging 支持 `file_path/filePath/download_path/object_key/storage_key`：没有 HTTP URL 时先调用 `/v1/bot/file/download/*path` 拿重定向 URL，再走现有本地 staging。
- 新增 daemon 级回归，覆盖 Octo group 消息、成员上下文、历史同步、文件下载 URL、本地 staging 和 Agent stdin。

## 最近验证

- 通过：`npm run typecheck:api`。
- 通过：`npm run build:api`。
- 通过：`node --test --test-name-pattern "Octo adapter|Octo transport sends CC-compatible REST heartbeat|Octo transport sends read receipt|Octo transport smoke covers Bot API|Octo transport upload strategy|Octo transport direct uploads|Octo upload-and-send media auto routes|Octo transport preserves outbound upload file names|Octo auto upload falls back|Octo transport smoke uploads and sends media|Octo group turns with Bot API context|registers Octo and opens WuKongIM WebSocket|serializes same-session Octo Agent turns" tests/system/channel-connectors-service.test.mjs`，15/15 全部通过。
- 上轮通过：真实 Octo `octo-studio-cc` 只读 smoke：`list-groups` HTTP 200 / 1 个群；取第一个群执行 `group-members` HTTP 200 / 6 个成员。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong/control-frame proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code 普通 turn、Bash tool-use、文件 manifest、视觉附件、`/compact`、`/stop` 和 OpenCode 普通 turn、文件 manifest、视觉附件、`/compact`、`/stop` 已有真实 CLI mock-Gateway smoke；Claude 审批已由用户 live 测试通过，Codex app-server requestApproval 已有 driver 合同回归；assistant 过程回复已接入 IM progress，但真实 Feishu/Octo live 视觉效果、Codex/OpenCode live approval 和 IM live 文件上传链路仍需逐项验收。Octo 出站文件已改为默认 STS/COS，仍需用户在真实 Octo 会话里重试 `hello.txt`。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 用户发送一条新的 Feishu 消息，做业务入站复验：runtime 应出现 dispatcher callback / receivedMessages，且无 reconnect/stale。
2. 做真实 IM live smoke：先从 Feishu/Octo 真实发送 `/commands addexec slow node -e "setTimeout(()=>console.log('slow done'), 900)"` 和 `/slow`，再运行 `node scripts/smoke-channel-connectors-command-live.mjs --bindings feishu-live --recent-sessions --commands /slow --wait-command-progress --require-command-progress-terminal --require-command-progress-patch --json` 验证 Feishu daemon card patch，并运行 `node scripts/smoke-channel-connectors-command-live.mjs --bindings octo-studio-cc --recent-sessions --commands /slow --wait-command-progress --require-command-progress-terminal --require-command-progress-sent --json` 验证 Octo started-only 文本提示；再运行 `node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --bindings feishu-live --require-ok --require-reply --require-progress --require-tool --require-feishu-card --require-feishu-progress-card-completed --require-permission-prompt --require-permission-resolved --require-feishu-permission-progress-card --require-no-final-progress-reply --json`，用三次顺序 `exec_command` 和需要审批的提示词验证思考、过程回复、工具输入、工具输出、审批卡和最终回复。
3. 用户在 Octo 真实会话重试“让 Agent 发 `hello.txt`”，并发一条群文件/图片消息，验证 Bot API 群成员、最近历史和文件下载 URL 在真实平台中可用。
4. 继续迁移 Octo thread target、群/线程管理命令和后续菜单；Bot API event ack 只在后续 HTTP/sync 事件链路暴露真实 event_id 时接入，WuKongIM 已有 RECVACK。
