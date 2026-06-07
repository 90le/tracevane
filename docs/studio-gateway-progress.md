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

- Feishu 过程展示保持“一张 Progress card 持续 patch 追加/更新进度”，卡片内部改为分段 element + `hr`，状态、思考、工具调用、工具结果、错误使用统一符号和 `text_tag`。
- Feishu 最终回复参考 CC 的 Markdown card 路线，改用 schema 2.0 `body.markdown` 承载模型正文，不添加 header/note/“最终回复”等包装标题；远程图片 Markdown 会降级成普通链接，避免 Feishu card `image_key` 错误。
- Feishu final fallback 从 card -> text 改为 card -> post(md) -> text；interactive card 因平台限制失败时，优先用 `msg_type=post` 继续保留 Markdown 富文本渲染。
- Feishu 长连接对照 CC Go 后确认根因：此前 Studio watchdog 会在 connected 但 90s 无入站时主动 `close(force)` 并重建，导致静默期反复断连；现已把 zero-inbound renewal 和 connected-idle renewal 默认改为 0，仅保留长期非 connected watchdog。
- Octo 已确认支持 Markdown 文本渲染；最终回复保持模型原始 Markdown 文本，不添加 `Studio Reply` 包装。
- Octo 不能 patch 气泡消息，过程流不再发送 start/running/completed/event 这类低信息气泡；私聊只显示思考、工具调用、工具结果和错误，完成态由最终回复承担。
- Octo/非富卡片渠道过程消息去掉 `Studio Progress` 大标题，仅保留短状态行和正文；工具名、exit/status 使用 Markdown inline code，工具输入/结果、TodoWrite 和失败回执复用同一套代码块格式化。
- OpenClaw Octo 插件 RichText=14 仍作为后续图文混排参考，不用于纯文本 Markdown 回复包装。
- 完成态不再给 Octo 私聊单独刷一条 `completed` 过程消息；最终回复本身承担完成态，群聊仍默认隐藏中间过程。
- Channel daemon 事件日志补齐 `replyRequestCount`、卡片/文本发送次数、ingress->agent start、首个进度延迟、进度间隔和 agent elapsed，便于区分平台 API、Agent 和模型耗时。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Feishu long-connection|Feishu transport|Octo long connection|daemon entry|routes are registered"`，38 个 Channel Connectors 子测试通过。
- 通过：`git diff --check`。
- 通过：`systemctl --user restart openclaw-studio-channel-connectors.service`，随后 `is-active/is-enabled` 为 `active/enabled`。
- 通过：重启 Channel daemon 后静默观察 105 秒，Feishu `connected=true`、`reconnects=0`、`zeroInboundRenewAfterMs=0`、`connectedIdleRenewAfterMs=0`，`lastConnectedAt=2026-06-07T05:25:47.041Z` 保持不变；日志无新的 `watchdog_zero_inbound` / `watchdog_connected_idle` 主动断连。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3762`。
- 通过：`curl http://127.0.0.1:18797/status`，Octo `octo-studio-cc` connected，Feishu shared WS connected，`activeRuns=[]`。
- 通过：`curl http://127.0.0.1:3762/api/channel-connectors/status`，`service.ok=true`，template/config current，systemd service installed。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略不再由 Studio 默认 ping timeout 主动 terminate，且消息 ACK 不再等待 Agent/附件 IO。
- Codex Agent 图片已走原生 `--image`；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 和 Octo 大文件 COS STS 直传仍待迁移。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 用 Feishu 私聊连续发两条新消息，观察 3 分钟内不再出现 `watchdog_zero_inbound_*` 主动断连，并确认长连接回复稳定；再用 Feishu/Octo 各发一条带工具调用的问题确认显示样式。
2. 继续按 CC Go 补 Feishu 更多设置型子卡、下拉/按钮动作和 command-router 细节，并同步到 Octo 文本命令体验。
3. 继续迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、大文件 COS STS 和更多平台 adapter。
