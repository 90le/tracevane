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

- 参考 CC Go `platform/dmwork` 的 group buffer 语义，Channel daemon 统一了 Feishu/Octo 进度显示默认值：私聊默认显示运行/思考/工具过程，群聊默认只显示最终回复；用户仍可在当前 IM session 里用 `/stream` / `/tools` 显式覆盖。
- Feishu 进度卡接入共享策略：群聊默认不再自动创建/patch Progress card；菜单 `Display` 子卡也会按群聊默认显示关闭，避免 UI 状态和运行行为不一致。
- Octo 私聊新增 CC-style 进度文本：运行中、思考、工具调用、工具结果、完成/失败会按节流策略发送；Octo 群聊默认保持安静，只保留最终回复或最终错误。
- 事件日志补充 `progressDefaultGroup`、`progressStreamEnabled`、`progressToolsEnabled` 和 Octo `agent.progress.reply`，后续排查可以区分“被默认策略隐藏”和“发送失败”。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "command surface|Feishu long-connection|Octo long connection|Octo heartbeat|routes are registered"`，38 个 Channel Connectors 子测试通过。
- 通过：`git diff --check`。
- 通过：`systemctl --user restart openclaw-studio-channel-connectors.service`，随后 `is-active/is-enabled` 为 `active/enabled`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3762`。
- 通过：`curl http://127.0.0.1:18797/status`，Octo `octo-studio-cc` connected，Feishu shared WS connected，`activeRuns=[]`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略不再由 Studio 默认 ping timeout 主动 terminate，且消息 ACK 不再等待 Agent/附件 IO。
- Codex Agent 图片已走原生 `--image`；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 和 Octo 大文件 COS STS 直传仍待迁移。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 重启 Channel daemon 和 dev 服务后，用 Feishu/Octo 私聊各发一条带工具调用的问题，确认私聊进度展示；群聊各发一条，确认默认只出最终回复。
2. 继续按 CC Go 补 Feishu 更多设置型子卡、下拉/按钮动作和 command-router 细节，并同步到 Octo 文本命令体验。
3. 继续迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、大文件 COS STS 和更多平台 adapter。
