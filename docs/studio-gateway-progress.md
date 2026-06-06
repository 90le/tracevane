# Studio Gateway 进度

> 状态：Studio Gateway core completed；Provider Center/App Connections completed；Channel Connectors native F3 Feishu command/display loop completed；OpenAI Platform vendor proof optional
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
- Channel daemon 已支持 Octo(dmwork) 与 Feishu 的 native ingress/outbound、Codex/Claude Code/OpenCode runner、Studio Gateway client key、IM session override、slash command、Feishu card action、bot menu、长连接和基础运行可观测。

## 本轮完成

- Feishu slash command 与菜单入口统一到同一个 command-router：`/command`、`/cmd`、`/status`、`/agent`、`/model`、`/mode`、`/dir`、`/cd`、`/new`、`/reset`、`/native`、`/display`、`/stream`、`/tools` 均可通过文本或卡片触发。
- 新增当前 IM session 的显示开关：`/stream on|off|default` 控制中间态/进度消息，`/tools on|off|default` 控制工具/思考消息，`/display default` 恢复默认开启。
- Feishu command surface 新增 `Display` 分组和 `Studio Display` 子卡片；`Status / New Session / Reset / Model / Permission / WorkDir / Display` 都返回可操作结果卡，不再只 toast “已执行”。
- Feishu 普通 slash 消息在启用卡片时会发送 interactive card；`/status`、`/new`、`/reset` 等与菜单点击保持同一结果形态。
- Feishu Agent 运行链路按 CC 思路保留 processing reaction，并新增节流后的中间态文本回发；工具/思考事件受 `/tools` 控制，整体中间态受 `/stream` 控制。
- Agent/upstream 失败回执新增 JSON error envelope 清洗：优先抽取 `message/type/code`，避免把重复或半截 JSON 原样发给 IM 用户。
- 本轮参考的 CC 源码重点：`platform/feishu/card.go`、`platform/feishu/feishu.go`、`core/streaming.go`、`core/progress_compact.go`、`core/engine.go` 的 `DisplayCfg` / `thinking_messages` / `tool_messages` / command handling。

## 验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Feishu 当前进度回发是节流文本消息，尚未完全复刻 CC 的 compact/card 原地刷新和长回复预览冻结。
- F4 消息能力尚未完成：图片/文件、语音、群聊成员/history context、长回复 buffer、治理策略。

## 下一步

1. 用真实 Feishu 客户端验证普通消息、菜单点击、`/stream`、`/tools`、失败回执和 processing reaction 的可见效果。
2. 进入 Feishu compact progress card：用 `patch card` 替换当前文本进度，复刻 CC 的 progress compact/card 体验。
3. 进入 F4：图片/文件、群聊成员/history context、长回复 buffer 和治理策略。
