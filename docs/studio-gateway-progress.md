# Studio Gateway 进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback/isolated apply acceptance completed; Phase B2 CLI/Gateway/live smoke harness completed; Phase G docs renamed; Claude tool/summary and OpenClaw agent CLI smoke passed; Responses->Chat streaming usage、provider-declared reasoning/thinking、parallel tool-call、SSE failed 和 started-stream error envelope behavior aligned; BigModel Chat/Anthropic live maturity passed; GMN Responses-native substitute live proof passed; OpenAI Platform vendor proof optional
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
- Phase B2 已按 `/tmp/cc-switch-src` 覆盖核心协议成熟度：CLI 启动、Claude tool/summary、OpenClaw agent provider/model/usage、Gateway HTTP compact/tool-history/error envelope、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix，以及 GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof。

## 本轮完成

- Gateway 目标和进度文档已从迁移名 `codex-stack-model-gateway-*` 改为正式入口 `studio-gateway-*`。
- README / PRD / 架构 / 当前进展 / 设计守则中旧 `Codex Stack` 管理域描述已改为 Studio Gateway，避免继续把 Gateway 归到旧功能面。
- CC / Channel Connectors 明确后置；进入实现前必须先确认方案。

## 验证

- 通过：`node --test tests/system/model-gateway-service.test.mjs`，49/49。
- 通过：`npm run build:api`。
- 通过：`npm run smoke:model-gateway:cli:strict -- --apps openclaw --include-openclaw-agent`，OpenClaw agent 命中 Gateway 并保留 provider/model/usage/cache。
- 通过：`npm run smoke:model-gateway:cli:strict -- --include-openclaw-agent`，6 个 CLI smoke passed，Gateway probes passed。
- 通过：`BIGMODEL_API_KEY=... npm run smoke:model-gateway:live:strict -- --providers bigmodel-chat,bigmodel-anthropic`。
- 通过：`STUDIO_GATEWAY_LIVE_GMN_API_KEY=... npm run smoke:model-gateway:live:strict -- --providers gmn-responses --request-timeout-ms 120000 --timeout-ms 300000`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。

## 下一步

1. 进入 CC / Channel Connectors 前，先确认方案、边界、进程守护、复用 cc-connect 的范围和验收点；确认前不实现 CC。
2. 如仍需要官方品牌证明，再单独跑 OpenAI Platform official smoke。
