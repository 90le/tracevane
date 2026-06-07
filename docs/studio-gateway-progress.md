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

## 本次完成

- 对照 CC Go 源码确认长连接基线：Octo(dmwork) WuKongIM 使用 30s 心跳、10s PONG 超时、RECV 后立即 ACK、5 分钟消息去重、断线后 `3s + 0..3s` 抖动重连；Feishu 多 binding 共享同一 App 长连接再扇出事件。
- Studio Octo WebSocket 已补齐 CC Go 同款默认重连抖动，并支持 binding metadata 覆盖 `heartbeat/pongTimeout/reconnect/reconnectJitter`；默认行为无需用户配置。
- 核心约束已更新：任何渠道/Agent 功能必须先参考 CC Go 现成实现，按 contract 1:1 迁移，再做 Studio 化精修，禁止已有成熟设计时重新造轮子。
- Feishu 共享长连接改回 CC 风格默认：禁用 SDK `pingTimeout` 额外 liveness terminate，仅保留官方 SDK 自动重连和 daemon 180s 非 connected watchdog；metadata 仍可显式开启 ping timeout。
- Channel daemon 新增 `agent.visual.input` 事件：当 Codex turn 真实收到本地 `--image` 参数时，事件日志记录模型、输入模式、图片数量和本地 staged 路径，后续排查图片链路不再靠推断。
- 用户新发 Octo 图片已确认进入 `agent.visual.input`；失败根因不是附件链路，而是自动视觉路由选到过期 `gpt-5.2` 且 provider open circuit。
- Gateway `/v1/models` 新增非标准健康元数据 `healthyProviderIds/openCircuitProviderIds`；Channel 自动视觉路由会跳过只有 open-circuit provider 的 vision 模型。
- 本机 GMN provider 已删除过期 `gpt-5.2`，`gpt-5.4-mini` 真实 Gateway smoke 200，并把 GMN health 恢复为 closed。
- Feishu 新消息未回复的最新根因已定位：SDK 状态仍显示 `connected`，但重启后 `receivedMessages: 0` 且新消息未进入 `feishu-events.jsonl`，属于 connected 假阳性/僵尸连接而非 Agent 回复失败。
- Studio Feishu watchdog 已补 `lastReceivedAt` 和默认 300s connected-idle renewal；超过阈值无真实事件入站会主动重建 WS，metadata 可用 `feishuConnectedIdleRenewMs` / `feishu_connected_idle_renew_ms` 覆盖，`0` 可关闭。
- 本机仍有旧 `cc-connect.service` 在运行，但其 Feishu App ID 与 Studio 当前 App 不同；当前修复不依赖停止旧 CC。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`gpt-5.4-mini` 经 Studio Gateway `/v1/responses` 真实 smoke 返回 200。
- 通过：`node --test tests/system/model-gateway-service.test.mjs --test-name-pattern "model gateway exposes enabled provider model pool"`，实际执行 51 个 Model Gateway 子测试。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Octo long connection|registers Octo"`，实际执行 36 个 Channel Connectors 子测试，覆盖 Octo/Feishu 长连接入口、命令、附件 staging、视觉模型选择、Codex `--image` 和进度事件。
- 通过：`systemctl --user restart openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service` 与 `./scripts/restart-dev.sh`。
- 通过：`systemctl --user is-active/is-enabled openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service` -> `active/enabled`。
- 通过：重启后超过 4 分钟观察，Feishu/Octo 仍为 `connected` 且 `reconnects: 0`，未再出现旧的 `no pong/inbound within 60s` 主动 terminate。
- 通过：live 观察到 Feishu connected 假阳性自愈触发，日志出现 `watchdog_connected_idle_300933`，随后重新 `Feishu WebSocket connected`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "visual turns|Feishu long-connection|Octo long connection|registers Octo"`，36 个 Channel Connectors 子测试通过。
- 通过：`curl http://127.0.0.1:18797/status`，Octo `octo-studio-cc` connected，Feishu shared WS connected，`activeRuns=[]`。
- 通过：前端 `http://127.0.0.1:5176` 与后端 `http://127.0.0.1:3762/api/channel-connectors/status` 可访问。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略不再由 Studio 默认 ping timeout 主动 terminate。
- Codex Agent 图片已走原生 `--image`；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 和 Octo 大文件 COS STS 直传仍待迁移。
- Feishu 新图片在 connected 假阳性期间未进入 daemon；需要重启后等待 connected-idle renewal 生效并让用户再发消息复验。

## 下一步

1. 用户在 Feishu 再发一张图片后，复验 live 事件中是否出现 `agent.visual.input`，并确认视觉模型回复。
2. 继续按 CC Go 迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、大文件 COS STS 和更多平台 adapter。
3. 继续精修 Feishu card/menu 与 Octo 弱富交互，保持 IM 命令和 Studio UI 共用同一 typed 状态。
