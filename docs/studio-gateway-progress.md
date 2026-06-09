# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-09
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算；模型预算是 App Connections 与 Channel Connectors 的默认上下文来源。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认不启用 SDK 额外 `pingTimeout`、SDK reconnecting 超 10s 回收、启动期 60s/最多 3 次真实 ingress 验证回收、快速 ACK、messageId 去重和 runtime 入站观测。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；Codex app-server persistent driver 仅作为 metadata beta，已覆盖 `turn/start`、原生 compact、interrupt、idle reaper、fallback 和 session 管理。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- 对照 OpenClaw 最新 `origin/main=f57c3b55fdc4b714300480ed8240c988e85a83c7`：Feishu WS lifecycle 文件未变，成熟答案仍是单 `WSClient` + `EventDispatcher`、terminal error 后外层 `1s..30s` 重建，而不是业务 idle 轮询重启。
- 定位 Feishu/Octo 重启后顺序相关延迟：Octo-first 后 Feishu 可处于 `connected=true` 但 `dispatcherCallbacks=0` / `receivedMessages=0` / `lastReceivedAt=null`，旧 smoke 因只看 connected/no-log 漏掉了“启动期未验证真实 ingress”。
- 对照本地 Lark SDK：OpenClaw 的 upper-case `PingTimeout:3` 不等价于当前 SDK lower-case `pingTimeout`；Studio 不再默认把它翻译为生效 watchdog，`pingTimeoutSeconds` 改为 `0`。
- 补 Studio 特有启动期 ingress 验证：当前 lifecycle 尚无 dispatcher callback 时，60s 后回收当前 client，指数退避最多 3 次；任何真实 dispatcher callback 会重置计数。smoke 脚本允许该 bounded startup 事件，但继续拒绝旧 watchdog/zero-inbound/ping-timeout churn。
- 复核官方 Node SDK：`EventDispatcher.invoke()` 会在 ACK 前等待 handler，且 `wsClient.start()` 没有默认握手超时；已把 Feishu WS 的 card action 也改为快速 ACK + 后台业务派发，并给 WS handshake 加 15s timeout。

## 最近验证

- 通过：`npm run typecheck -- --pretty false`。
- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-feishu-long-connection-script.test.mjs`，13 个 Feishu smoke 脚本合同测试通过。
- 通过：`node --test --test-name-pattern "Feishu long-connection ingress|Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`。
- 通过：重启 `openclaw-studio-channel-connectors.service` 后，runtime 显示 `pingTimeoutSeconds=0`、`ingressUnverifiedAfterMs=60000`、`ingressUnverifiedRenewMax=3`；60s 无 dispatcher callback 时触发 `startup_ingress_unverified_60000ms` 回收并重新连接。
- 通过：`node scripts/smoke-channel-connectors-feishu-long-connection.mjs --since 2026-06-09T07:12:36.000Z --duration-ms 0 --json`，`violations=0`；已观察到多轮 bounded startup ingress validation，没有旧 ping-timeout / zero-inbound / connected-idle / generic watchdog 违规。
- 通过：`node --test --test-name-pattern "agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`，确认 Claude/OpenCode one-shot compact 不再误启动真实 CLI。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，61 个 Channel Connectors 子测试通过。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，9 个 Codex app-server driver 子测试通过。
- 通过：`git diff --check`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。启动期 ingress 验证只能证明“SDK connected 后至少有真实 dispatcher callback”，仍需要用户真实 Feishu 消息复验进入 `receiving`。Feishu 尚不能宣称达到 Octo 级稳定；下一步需做 ping/pong 级健康证明或评估 webhook/hybrid ingress。
- Claude Code/OpenCode 原生 compact 需要先迁移类似 CC Go 的 live interactive session driver；当前不能用 one-shot `--resume` / `run` 假装完成原生压缩。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 迁移 Claude Code / OpenCode live interactive session driver，复刻 CC Go `AgentSession.Send(CompressCommand())`、event loop、权限和文件流。
2. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode runner 文件/权限/流式能力。
3. 设计 durable queue，避免 Channel daemon 重启时丢失尚未开始的同 session 排队消息。
4. 继续优化 Gateway provider 检测结果弹层，把支持多协议时的选择结果和模型预算差异展示得更清楚。
