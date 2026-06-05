# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback/isolated apply acceptance completed; Phase B2 CLI/Gateway/live smoke harness completed; Phase B2 protocol maturity remains open
> 更新：2026-06-05
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
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐 SSE、usage/cache、reasoning/thinking、summary/compact；strict smoke 已覆盖 CLI 启动、Gateway HTTP compact/tool-history/error envelope 和 BigModel live provider harness。

## 本轮完成

- 新增 `scripts/smoke-model-gateway-live.mjs` 和 npm scripts：`smoke:model-gateway:live`、`smoke:model-gateway:live:strict`。
- Live smoke 只从环境变量读取真实 provider key，不写入 config、docs 或 git；无 key 时非 strict 返回 skipped。
- BigModel Anthropic live 通过 `https://open.bigmodel.cn/api/anthropic` + `/v1/messages` override 验证 messages basic、messages stream、tool-use、error envelope。
- BigModel Chat live 在 `https://open.bigmodel.cn/api/coding/paas/v4` 上验证 responses basic、responses stream、tool-call、error envelope；tool-history follow-up 被上游 400 `1214 messages 参数非法` 拒绝，暂不作为完整成熟度通过。

## 验证

- 通过：`node --test tests/system/model-gateway-service.test.mjs`，44/44。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3/3。
- 通过：`npm run smoke:model-gateway:cli:strict`，4 个 CLI smoke passed，Gateway probes passed。
- 通过：`npm run smoke:model-gateway:live`，无 key 路径 skipped。
- 通过：`BIGMODEL_API_KEY=... npm run smoke:model-gateway:live:strict -- --providers bigmodel-anthropic`。
- 已执行但未通过成熟度：`BIGMODEL_API_KEY=... npm run smoke:model-gateway:live:strict -- --providers bigmodel-chat`，失败点为 tool-history follow-up 上游 400/1214；basic、stream、tool-call、error-envelope 已通过。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- BigModel Chat coding paas 当前不能证明完整 tool/history maturity；需要 endpoint/provider 方言适配或换支持标准 tool-result history 的 Chat-compatible provider。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 继续 Phase B2：补 Claude summary/compact 类请求、Codex `/v1/responses/compact` 客户端触发、OpenClaw agent `--local` 可选 live 路径。
2. 处理 BigModel Chat tool-history 方言或增加另一个标准 Chat-compatible live provider；OpenAI Responses-native 等待可用 base/key。
3. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
