# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移
> 更新：2026-06-07
> 文档规则：只保留当前状态、最新完成、验证、边界和下一步；不追加流水日志。

## 当前状态

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池和能力标记。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；本地 Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer 和基础治理。
- IM Agent runner 策略固定为混合架构：默认 one-shot `exec/resume` 保稳定；后续持久 TUI/session driver 只作为可观测、可回收、可降级的高级能力接入。

## 本次完成

- `/compact` / `/compress` 已成为 Studio-managed IM compact contract：不再透传给 Codex `exec`，而是调用当前 Agent Profile 的 Studio Gateway `/responses/compact` 生成 summary。
- compact 成功后，当前 binding + IM session 的 history 会被替换为一条 `compact-summary`，旧 Agent session / Codex thread 续接会被清理，下一轮用 summary 作为上下文重新开始。
- compact 失败会返回明确错误，不做本地伪摘要；这避免把“压缩成功”伪装成真实 Gateway compact。
- Feishu Session/History 菜单补了 Compact Context 操作；Octo/纯文本可直接用 `/compact`。
- 已固化持久 session 方向：不替换当前稳定链路；后续按 binding + IM session + Agent Profile 建 session pool，支持多 Agent 隔离、idle TTL、健康检查、stop/kill 和 one-shot fallback。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "conversation history|IM commands switch agent|model menus can read|command surface"`，39 个 Channel Connectors 子测试通过。
- 通过：`git diff --check`。
- 通过：本地 Gateway key 调 `GET http://127.0.0.1:18796/v1/models`，返回 13 个模型。
- 通过：`systemctl --user restart openclaw-studio-channel-connectors.service`，随后 `is-active/is-enabled` 为 `active/enabled`。
- 通过：`curl http://127.0.0.1:18797/status`，Octo `octo-studio-cc` connected，Feishu shared WS connected，`activeRuns=[]`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3762`。
- 未计入通过：本地 Gateway `/v1/responses/compact` 已路由到 GMN provider，但上游返回 `502 model_gateway_upstream_failed: fetch failed`；这是 live provider 可达性问题，不影响本次 command/store contract 测试结论。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略只用 SDK `pingTimeout=10s` 终止无 inbound/pong 的死 socket，消息 ACK 不等待 Agent/附件 IO。长连接 cluster 模式下，安静期无法证明“无用户消息”还是“平台未投递”，因此 idle refresh 后不做无限 no-inbound 轮换；真实入站会解除抑制。SDK `createLarkChannel` 是后续更大重构参考，但当前不直接替换，避免丢失 Studio session/Gateway/进度卡片控制面。
- Codex Agent 图片已走原生 `--image`；Studio `/compact` 已覆盖 IM history 压缩，但 Codex 原生交互式 `/compact`、`/clear` 仍需要持久 Codex session，不能通过一次性 `codex exec` 伪实现；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 和 Octo 大文件 COS STS 直传仍待迁移。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 设计并测试持久 session driver 最小合同：session pool、事件流、stop/kill、idle 回收、crash recovery、one-shot fallback。
2. 继续按 CC Go 补 `/usage`：需要先接真实 token/usage 账本，不能只显示占位。
3. 继续按 CC Go 补 `/reasoning`、`/name`、`/search`、session list 细节，并迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、大文件 COS STS 和更多平台 adapter。
