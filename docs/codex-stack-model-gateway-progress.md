# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback/isolated apply acceptance completed; Phase B2 CLI/Gateway/live smoke harness completed; Claude tool/summary and OpenClaw agent CLI smoke passed; Responses->Chat streaming usage、provider-declared reasoning/thinking、parallel tool-call 和 SSE failed behavior aligned; BigModel Chat/Anthropic live maturity passed; OpenAI Responses-native live proof remains open
> 更新：2026-06-06
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors / CC Bridge / Octo(dmwork) 后置；不放进 Studio Gateway App Connections。
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐剩余 error envelope 边缘行为和 OpenAI Responses-native compact；strict smoke 已覆盖 CLI 启动、Claude tool/summary、OpenClaw agent provider/model/usage、Gateway HTTP compact/tool-history/error envelope、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`，以及 BigModel Chat/Anthropic live provider matrix。

## 本轮完成

- Responses->Chat streaming adapter 已按 cc-switch 对齐 Chat SSE error handling：上游 `event:error` 或 `data.error` 会输出 Responses `response.failed` + `[DONE]`，不会再伪造 `response.completed`。
- Streaming Chat tool-call adapter 新增并发同名 tool-call 回归覆盖：按 `tool_calls[index]` 独立累计，保留两条 function_call 输出和 usage。

## 验证

- 通过：`node --test tests/system/model-gateway-service.test.mjs`，47/47。
- 通过：`npm run build:api`。
- 通过：`npm run smoke:model-gateway:cli:strict -- --apps openclaw --include-openclaw-agent`，OpenClaw agent 命中 Gateway 并保留 provider/model/usage/cache。
- 通过：`npm run smoke:model-gateway:cli:strict -- --include-openclaw-agent`，6 个 CLI smoke passed，Gateway probes passed。
- 通过：`BIGMODEL_API_KEY=... npm run smoke:model-gateway:live:strict -- --providers bigmodel-chat,bigmodel-anthropic`。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 等待 OpenAI Responses-native base/key 后，验收 `/v1/responses` 与原生 `/v1/responses/compact`。
2. 继续按 `/tmp/cc-switch-src` 做剩余 error envelope 边缘行为对齐。
3. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
