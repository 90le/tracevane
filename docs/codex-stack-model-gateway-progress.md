# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback/isolated apply acceptance completed; Phase B2 maturity hardening remains open
> 更新：2026-06-05
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors / CC Bridge / Octo(dmwork) 后置；不放进 Studio Gateway App Connections。
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐 SSE、tool/history、usage/cache、error envelope、reasoning/thinking，并保留真实 provider/CLI smoke。

## 本轮完成

- `createStudioContext` 支持传入 `modelGatewayOptions`，测试/嵌入场景可把 Studio Gateway 的 app config 写入临时 HOME，生产默认行为不变。
- 新增 HTTP route 级隔离验收：通过 `/api/model-gateway/providers`、`client-auth`、`app-connections/profile`、`app-connections/apply` 和逐 app `rollback` 完成闭环。
- 验收覆盖 Codex、Claude Code、OpenCode、OpenClaw 四类配置目标：确认 target path 都在临时目录，apply-all 写入 endpoint/key/model/profile，preview 不泄露本地 key、upstream key 或旧配置 secret。
- Rollback 验证恢复原配置核心字段，并确认 OpenClaw 的 `studio-gateway` provider 被移除；OpenClaw request handler 自动补充的基础 gateway/plugin 字段被视为现有行为。

## 验证

- 通过：`npm run build:api`
- 通过：`npm run typecheck:web`
- 通过：`npm run build:web`
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，44/44。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3/3。
- Dev 重启通过：`npm run dev:restart`，frontend `http://127.0.0.1:5176`，backend `http://127.0.0.1:3762`。
- Live API 通过：`GET /api/model-gateway/app-connections` 返回 4 个连接和当前 profile；本轮未执行真实 apply 到用户 HOME。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 继续 Phase B2 成熟度：补真实 provider/CLI smoke 的 tool、history、summary/compact 和 error envelope 回归脚本。
2. 做真实 CLI 启动 smoke：用临时 HOME 配置调用 Codex、Claude Code、OpenCode、OpenClaw 的最小请求，不污染正式配置。
3. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
