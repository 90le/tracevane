# Studio Gateway 进度

> 状态：Studio Gateway core completed；Provider Center/App Connections completed；Channel Connectors native F3 Feishu progress card completed；OpenAI Platform vendor proof optional
> 更新：2026-06-06
> 文档规则：本文件只保留当前状态、最近完成、验证、边界和下一步；流水细节不继续追加。

## 当前状态

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表/别名/默认模型、priority、App scope、active routing、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，且不会透传 upstream key。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect。
- Channel daemon 已支持 Octo(dmwork) 与 Feishu 的 native ingress/outbound、Codex/Claude Code/OpenCode runner、Studio Gateway client key、IM session override、slash command、Feishu card action、bot menu、长连接、processing reaction 和 Feishu progress card。

## 本轮完成

- Feishu Agent 运行进度从多条文本回发改为单张 `Studio Agent Progress` 卡片：首条 send，后续 patch，完成/失败时强制落最终状态，避免“运行中 / 错误 / 失败 / Agent 失败”重复刷屏。
- Codex JSONL progress 已识别 `item.started` / `item.completed` 的 `command_execution` 为工具调用/工具结果，卡片会展示命令、退出码和输出摘要；`/stream` 控制整体进度卡片，`/tools` 控制工具/思考项。
- Agent/upstream 错误在 runner 和 daemon 双层清洗，优先抽取 `message/type/code`；进度卡已发送时失败不再额外发送重复失败文本，只在卡片发送失败时兜底文本。
- 本轮参考的 CC 源码重点：`core/progress_compact.go`、`core/streaming.go`、`platform/feishu/feishu.go` 的 compact progress、tool step 和 card patch 思路。

## 验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。
- 待本轮重启后验证：`openclaw-studio-channel-connectors.service` 载入最新 dist，真实 Feishu 消息应显示单张进度卡片。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Feishu progress card 已替代文本进度；长回复预览冻结、图片/文件、语音、群聊成员/history context、长回复 buffer 和治理策略仍属于 F4/F5。

## 下一步

1. 重启 daemon 后用真实 Feishu 客户端发起一次工具调用任务，确认单张 Progress card 原地刷新、processing reaction 和失败去重。
2. 若仍出现 `未正常接收到prompt参数`，下一步查 Codex CLI -> Studio Gateway 的 prompt/body 转发，而不是 IM 展示层。
3. 进入 F4：图片/文件、群聊成员/history context、长回复 buffer 和治理策略。
