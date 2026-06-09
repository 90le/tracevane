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
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认不启用 SDK 额外 `pingTimeout`、SDK reconnecting 超 10s 回收、应用层 ping/pong runtime proof、pong timeout 回收、快速 ACK、messageId 去重和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback 和 session 管理合同。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- 对照 CC Go `ContextCompressor` / `AgentSession.Send()`：Claude Code 使用常驻 `stream-json` stdin 会话发送 `/compact`；OpenCode 使用 `opencode run --session <id>` 续接会话发送 `/compact`。
- 新增 `native-cli-session-drivers` factory：Codex 仍委托 app-server beta，Claude/OpenCode 仅在 persistent driver 内允许原生 compact；one-shot runner 继续拒绝 Claude/OpenCode `/compact` 伪透传。
- OpenCode runner 补 `--session` 续接、sessionID 提取、OpenCode JSON progress/text 解析；Claude stream-json driver 补 session id、tool/thinking/result、权限请求基础回包和 compact 完成文本。
- daemon `/status` 的 session driver implementation 改为 `native-cli-session-drivers`，binding reason 区分 `codex-app-server-experimental`、`claude-code-stream-json`、`opencode-run-session`。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck -- --pretty false`。
- 通过：`node --test tests/system/channel-connectors-agent-session-driver.test.mjs`，覆盖 OpenCode `--session` compact、Claude stream-json compact 和 OpenCode persistent stop abort。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon entry exposes health" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon runs Codex app-server when persistent session metadata is enabled" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-agent-sessions-live-script.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code/OpenCode 原生 compact 已有 fake CLI contract 回归；仍需真实 Claude Code / OpenCode live smoke 验证对话、工具、文件、权限和 `/compact` 在用户环境下稳定。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 跑真实 Claude Code / OpenCode persistent smoke：普通对话、工具/权限、文件输入输出、`/compact`、`/stop`，并确认 one-shot 默认路径不受影响。
2. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode 文件/权限/流式能力。
3. 设计 durable queue，避免 Channel daemon 重启时丢失尚未开始的同 session 排队消息。
4. 继续优化 Gateway provider 检测结果弹层，把支持多协议时的选择结果和模型预算差异展示得更清楚。
