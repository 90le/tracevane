# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-10
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算；模型预算是 App Connections 与 Channel Connectors 的默认上下文来源。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理。
- OpenCode Agent runner 走 Gateway-first：Channel 配置保存 Gateway 模型短名或模型 ID，runner 转换为 OpenCode 需要的 `studio-gateway/<model>`；每轮生成隔离 OpenCode config，session 数据写入 Channel runtime dataHome；旧全局 sessionId 在当前 dataHome 不存在时自动新建，避免 IM 切换 OpenCode 后被 stale session 卡死。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认启用 SDK lower-case `pingTimeout=3`、包装 SDK `pingLoop()` 将有效心跳调度 clamp 到 `pingIntervalMs=10000`、SDK reconnecting 超 5s 回收、应用层 ping/pong runtime proof、`pongTimeoutMs=8000` 外层兜底回收、23s control-frame stale 判死、快速 ACK、messageId 去重、会话水位线防旧消息插队和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback、session 管理合同和真实 CLI mock-Gateway smoke；IM 进度里的“过程回复”只接受 `assistant/intermediate`，最终回复 `assistant/final` 只走最终结果渲染。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- 修复 Feishu 长连接“重启后恢复但运行一段时间假在线”的核心窗口：SDK 收到 Feishu pong 后会把内部 `pingInterval` 覆盖回 90s，Studio 现在包装 `WSClient.pingLoop()`，每次调度前 re-clamp 到 10s。
- 修复 Feishu 重连后补投旧消息插队：parser 读取 Feishu event/message `create_time`；daemon 按默认 2 分钟陈旧阈值跳过过期事件，并按 binding + session 持久化最新消息时间水位线，后到达的更旧事件记录 `feishu_event_out_of_order`，不再进入 Agent 队列。
- Feishu runtime 新增 `sdkConnected`、`transportStaleForMs`、`transportStaleAfterMs`、`transportStale`；`connected` 不再等同 SDK 原始 connected，而是 SDK connected 且无 pong overdue、无 transport stale。
- `/health`、Channel 管理页会把 transport stale 视为不健康；会话行可直接显示“飞书长连接控制帧超时”，避免把 Agent session idle 误判为平台连接正常。
- OpenCode 1.16/1.17 `run --format json` 在本机可能 exit 0 但 stdout 为空；已补本地 `opencode.db` fallback，恢复 session id、assistant text、step/tool progress，并保留 stdout JSONL 路径优先；fallback 只接受本轮启动后的 assistant part 并短轮询等待异步写入，避免读到上一轮旧回复。
- 修复 OpenCode IM 切换失败：短模型名（例如 `glm-5`）和带斜杠的 Gateway 模型 ID 都会传给 OpenCode 为 `studio-gateway/<model>`；OpenCode JSON error envelope 会显示真实 `data.message/name/ref`，不再只显示 `error`。
- 扩展 `smoke:channel-connectors:native-cli-sessions`：隔离 HOME + mock Studio Gateway，直接调用 daemon 同款 native persistent driver，覆盖 Claude Code 普通 turn、Bash tool-use、`studio-channel-files` manifest、`/compact`、`/stop`，以及 OpenCode 普通 turn、`studio-channel-files` manifest、`/compact`、`/stop`。
- 修复 OpenCode 取消路径误读旧 `opencode.db` 状态的问题：DB fallback 只在 exit 0、未取消、无错误且 stdout 为空时启用。
- 修复 Claude Code persistent stop：用户停止当前 turn 时直接返回 `cancelled` 结果，不再把被取消的 resident process 当成 driver crash 或 one-shot fallback。
- 按 CC Go `agent/opencode/session.go` 迁移 OpenCode 视觉输入合同：视觉模型 + 已 staging 图片时，`opencode run` 会在 `--` prompt 分隔符前追加 `--file <imagePath>`，非视觉模型仍走 Studio 视觉保护提示。
- 修复 Claude 工具流渲染：Claude `user/tool_result` 的纯输出文本不再被进度卡片解析器吞掉首行，单行工具结果不会再显示为“无输出”。
- 按 CC Go 迁移 Codex app-server 运行中权限批准合同：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval` 和 `item/permissions/requestApproval` 进入现有 IM permission resolver，分别回写 `{decision:"accept|decline"}` 与 turn-scoped `permissions` 结果。
- Feishu 运行中权限审批优先并入当前进度卡片：审批条目展示工具、请求、输入和状态，卡片内提供允许/拒绝/本轮全部允许按钮；点击后同一进度卡更新为已允许/已拒绝，不再默认刷独立审批卡。若进度卡尚未创建或 AskUserQuestion 需要独立交互，则保留原独立提示回退。
- 修复 IM 过程回复相位：Codex one-shot、Codex app-server、Claude Code stream-json 和 OpenCode 都先暂存 assistant 正文；后面仍有工具/思考/运行事件时转为 `phase=intermediate` 过程回复，后面只剩 terminal 时保留 `phase=final`，渠道发送层仍只允许 intermediate 进入“过程回复”。
- 修复 Feishu 进度卡状态误判：Agent 可恢复的 `user/tool_result` error/failed 现在渲染为失败的工具结果，不再把整轮运行卡锁死为 failed；最终 `agent.ok=true` 时进度卡会收尾为 completed。
- 增强 `smoke-channel-connectors-agent-run-live.mjs`：新增 `--require-no-final-progress-reply` 和 `--require-feishu-progress-card-completed`，并把这两项做成窗口级硬保护；用户发真实 IM 消息后，脚本会验收最终回复未被当过程消息发送，且任何成功 Feishu run 的最终进度卡都不能停在 failed。
- 保留 Codex delta 防刷屏保护：Codex app-server `item/agentMessage/delta` 仍只用于拼最终 reply，不会逐 token 推送过程回复。
- 清理 Channel Connectors 回归测试债：OpenCode persistent fake session 测试显式模拟当前 runtime dataHome session 存在性；OpenCode stop 测试区分启动前合法 session 验证与取消后禁止 DB fallback；daemon runtime / Octo JSONL 测试改为等待 async debounce/buffer flush，不再误报。
- 对照 CC Go 修复 Claude/OpenCode 工具流：Claude live/session 递归提取 tool input/result，并通过 `tool_use_id` 把工具结果回填到对应工具名；OpenCode NDJSON 按 completed `tool_use` 拆出工具调用和工具输出；assistant 正文统一由后续事件判定 intermediate/final；进度渲染层改为按 `rawType/itemType` 区分 `tool_use/tool_result`，Feishu 卡片和 Octo/纯文本不再把 Claude/OpenCode 工具调用误显示成“工具结果”，并按工具名显示“命令输出 / 读取结果 / 检索结果”等语义标签。
- 明确思考流边界：OpenCode 已带 `--thinking`，Claude Code 已解析 stream-json `thinking` block；渠道只展示上游真实 `reasoning/thinking` 事件，不合成伪思考。

## 最近验证

- 通过：`npm run typecheck:api`。
- 通过：`npm run typecheck:web`。
- 通过：`npm run build:api`。
- 通过：`npm run typecheck:api && npm run build:api`。
- 通过：`node --test --test-name-pattern "native Channel Connectors process runner maps Claude Code stream-json progress|native Channel Connectors process runner maps OpenCode JSON progress without leaking final text|native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors process runner maps Codex command execution progress|native Channel Connectors process runner maps Codex agent messages before later tools as process progress|native Channel Connectors process runner keeps Claude Code final text out of process progress" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，66/66 全部通过。
- 通过：`node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`，覆盖 SDK connected 但 transport stale 时 smoke 失败。
- 通过：`node --test --test-name-pattern "native Channel Connectors Feishu webhook parses live envelopes|Feishu long-connection|native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs tests/system/channel-connectors-feishu-long-connection-script.test.mjs`，覆盖 Feishu create_time 解析、过期消息跳过、10s ping / 8s pong / 23s stale 默认和 daemon 结构合同。
- 通过：`node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 35000 --bindings feishu-live --json`，最新重启后现场结果 `violations=0`、`pingIntervalMs=10000`、`pongTimeoutMs=8000`、`transportStaleAfterMs=23000`、`transportStale=false`、`logEvents=0`。
- 通过：`curl http://127.0.0.1:18797/health` 返回 `ok=true`、`connected=1`、`pongOverdue=0`、`transportStale=0`。
- 通过：`npm run typecheck -- --pretty false`。
- 通过：`node --test tests/system/channel-connectors-agent-session-driver.test.mjs`，11/11 全部通过；覆盖 persistent session pool、OpenCode `--session` compact/tool-result、OpenCode SQLite fallback、Claude stream-json compact/tool-result、Claude persistent stop cancel 和 OpenCode persistent stop abort。
- 通过：`node --test --test-name-pattern "agent runner builds gateway-backed" tests/system/channel-connectors-service.test.mjs`，覆盖 Codex `--image`、Claude image content block、OpenCode `--file` 图片传入和非视觉模型保护。
- 通过：`node --test --test-name-pattern "native Channel Connectors process runner streams progress events from agent JSONL|native Channel Connectors process progress only includes intermediate assistant text|native Channel Connectors process runner maps Claude Code stream-json progress|native Channel Connectors process runner keeps Claude Code final text out of process progress|native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "process progress only includes intermediate assistant text|daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`，覆盖 Codex delta 非过程回复和 Feishu 可恢复工具错误不锁死整轮卡片失败的结构合同。
- 通过：`node --test --test-name-pattern "maps Claude Code stream-json progress|maps OpenCode JSON progress|keeps Claude Code final text out of process progress" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "maps OpenCode JSON progress|process progress only includes intermediate assistant text|maps Claude Code stream-json progress|keeps Claude Code final text out of process progress" tests/system/channel-connectors-service.test.mjs`，覆盖 OpenCode 工具间 text 转过程回复、最终 text 不进过程回复。
- 通过：`node --test --test-name-pattern "maps Codex agent messages before later tools|maps Claude text before later tools|maps OpenCode JSON progress|keeps Claude Code final text out|streams progress events from agent JSONL|process progress only includes intermediate" tests/system/channel-connectors-service.test.mjs`，覆盖 Codex/Claude text-only 正文在后续工具前转 intermediate，最终正文不进过程回复。
- 通过：`node --test --test-name-pattern "maps agent messages before later tools|preserves completed markdown|preserves tool command output|starts one thread" tests/system/channel-connectors-codex-app-server-driver.test.mjs`，覆盖 Codex app-server assistant 正文在后续工具前转 intermediate，delta 仍不刷过程。
- 通过：`node --test --test-name-pattern "Claude stream-json process alive|OpenCode compact" tests/system/channel-connectors-agent-session-driver.test.mjs`，覆盖 Claude persistent text-before-tool 过程回复与 final 分离。
- 通过：`node scripts/smoke-channel-connectors-feishu-long-connection.mjs --duration-ms 15000 --bindings feishu-live --json`，重启后 15s 窗口 `violations=0`、`reconnects=0`、`transportStale=false`。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，覆盖 Codex app-server delta 不再生成 assistant 过程进度、最终 reply/manifest 保真、compact、stop、tool output 和 requestApproval。
- 通过：`node --test --test-name-pattern "Channel Connectors native CLI session driver keeps Claude stream-json process alive for native compact" tests/system/channel-connectors-agent-session-driver.test.mjs`。
- 通过：`node --test --test-name-pattern "OpenCode compact|Claude stream-json process alive" tests/system/channel-connectors-agent-session-driver.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session|native Channel Connectors command surface renders text and Feishu card actions|native Channel Connectors command surface loads Gateway models when request omits models|native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`，覆盖 `/thinking`、`/process`、`/tools` 三路显示控制、Feishu 菜单和 daemon 发送合同。
- 通过：`node --test --test-name-pattern "IM commands switch agent|daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`，覆盖权限审批 reply 抑制、Feishu 进度卡 permission entry/action 合同和 daemon 发送层不重复刷文本回复。
- 通过：`node scripts/smoke-channel-connectors-native-cli-sessions.mjs --apps opencode --strict --json`，本机真实 OpenCode 通过普通 turn、文件 manifest、原生 compact 和 stop cancel；取消结果不再混入旧 DB 输出。
- 通过：`npm run smoke:channel-connectors:native-cli-sessions:strict -- --json`，本机真实 Claude Code / OpenCode 均通过普通 turn、文件 manifest、原生 compact 和 stop cancel；Claude Code 额外通过 Bash tool-use，OpenCode 命中 `opencode.db` fallback 或 stdout JSONL 路径。
- 通过：本机真实 Studio Gateway + OpenCode + `glm-5` 短模型 smoke，`runChannelConnectorAgentTurn` 返回 `ok=true`、`status=completed` 和 OpenCode native session id。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon runs Codex app-server when persistent session metadata is enabled" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-agent-sessions-live-script.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，64/64 全部通过。
- 通过：`node --test tests/system/channel-connectors-agent-run-live-script.test.mjs`，覆盖真实日志 smoke 的工具、附件、视觉、Markdown、最终回复不进过程消息、Feishu 成功进度卡必须 completed 等验收项。
- 验证：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 90 --bindings feishu-live --require-ok --require-reply --require-feishu-card --require-feishu-progress-card-completed --require-no-final-progress-reply --json` 现在按预期失败，抓到 2 条旧 `feishu-progress-card-not-completed` 历史违规；真实验收应使用 `--wait` 从脚本启动后的干净窗口采样。
- 通过：`node scripts/smoke-channel-connectors-agent-run-live.mjs --since-minutes 360 --bindings octo-studio-cc --require-ok --require-reply --require-no-final-progress-reply --json`，当前真实 Octo 日志窗口 `finalProgressReplyCount=0`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong/control-frame proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code 普通 turn、Bash tool-use、文件 manifest、`/compact`、`/stop` 和 OpenCode 普通 turn、文件 manifest、`/compact`、`/stop` 已有真实 CLI mock-Gateway smoke；OpenCode 已按 CC Go 补原生图片 `--file` 参数构建测试；Claude 权限批准已有 runner/IM 基础闭环；Codex app-server requestApproval 已有 driver 合同回归；assistant 过程回复已接入 IM progress，但真实 Feishu/Octo live 视觉效果、真实 IM live approval、真实视觉 CLI smoke 和 IM live 文件上传链路仍需逐项验收。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 用户发送一条新的 Feishu 消息，做业务入站复验：runtime 应出现 dispatcher callback / receivedMessages，且无 reconnect/stale。
2. 做真实 IM live approval smoke：先运行 `node scripts/smoke-channel-connectors-agent-run-live.mjs --wait --bindings feishu-live --require-ok --require-reply --require-progress --require-tool --require-feishu-card --require-feishu-progress-card-completed --require-no-final-progress-reply --json`，再用三次顺序 `exec_command` 的提示词验证思考、过程回复、工具输入、工具输出和最终回复；同时确认 Feishu 进度卡内允许/拒绝按钮、文本 `/approve`/`/deny`、Codex app-server Bash/Patch/Permissions、Claude AskUserQuestion/permission、OpenCode permission 都能闭环。
3. 继续扩展真实 Claude Code / OpenCode persistent smoke：视觉输入、权限和 IM live 文件上传链路，并确认 one-shot 默认路径不受影响。
4. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode 文件/权限/流式能力。
