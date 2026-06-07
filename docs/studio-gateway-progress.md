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
- Feishu 共享长连接保持现有实现，继续使用 60s SDK ping timeout 和 180s watchdog，避免平台抖动时频繁重启。
- Channel daemon 新增 `agent.visual.input` 事件：当 Codex turn 真实收到本地 `--image` 参数时，事件日志记录模型、输入模式、图片数量和本地 staged 路径，后续排查图片链路不再靠推断。
- Octo daemon 级图片入站回归已锁定：WuKongIM 图片 URL -> 本地 staging -> Gateway `/v1/models` 自动选择 vision 模型 -> Codex CLI `--image`。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Octo long connection|registers Octo"`，实际执行 36 个 Channel Connectors 子测试，覆盖 Octo/Feishu 长连接入口、命令、附件 staging、视觉模型选择、Codex `--image` 和进度事件。
- 通过：`systemctl --user restart openclaw-studio-channel-connectors.service` 与 `./scripts/restart-dev.sh`。
- 通过：`systemctl --user is-active/is-enabled openclaw-studio-channel-connectors.service` -> `active/enabled`。
- 通过：`curl http://127.0.0.1:18797/status`，Octo `octo-studio-cc` connected，Feishu shared WS connected，`activeRuns=[]`。
- 通过：前端 `http://127.0.0.1:5176` 与后端 `http://127.0.0.1:3762/api/channel-connectors/status` 可访问。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台 pong 延迟自行 reconnect；当前策略降低误判和 daemon 强制重启频率，不承诺消除平台级重连日志。
- Codex Agent 图片已走原生 `--image`；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 和 Octo 大文件 COS STS 直传仍待迁移。
- 本次真实外部 Feishu/Octo 图片是在补 `agent.visual.input` 前发送的；需要用户再发一张图，用新事件复验 live 链路。

## 下一步

1. 用户在 Feishu/Octo 再发一张图片后，复验 live 事件中是否出现 `agent.visual.input`，并确认视觉模型回复。
2. 继续按 CC Go 迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、大文件 COS STS 和更多平台 adapter。
3. 继续精修 Feishu card/menu 与 Octo 弱富交互，保持 IM 命令和 Studio UI 共用同一 typed 状态。
