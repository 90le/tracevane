# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback MVP completed; Phase B2 maturity hardening remains open
> 更新：2026-06-05
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback 和 profile 切换。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors / CC Bridge / Octo(dmwork) 后置；不放进 Studio Gateway App Connections。
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐 SSE、tool/history、usage/cache、error envelope、reasoning/thinking，并保留真实 provider/CLI smoke。

## 本轮完成

- Provider list API 返回每个 App scope 的 active route 状态：selected provider、resolved provider、resolved model、route id、fixed/auto/fallback/missing 状态和告警。
- 新增 `POST /api/model-gateway/active-route-smoke`，验证实际 Gateway 客户端协议入口；它不同于 provider-native smoke，会经过 daemon endpoint、Gateway key、active routing 和协议 adapter。
- Active routing UI 显示 resolved provider/model 和路由状态；选择 active provider 后自动跑一次 route smoke，用户也可以手动点 Smoke。
- 停用当前 fixed active provider 时，保存后自动清理对应 fixed route，并提示回到 Auto，避免 UI 继续显示不可用 provider。
- 系统测试补齐 active route fallback、停用清理、client-protocol smoke 和页面契约断言。

## 验证

- 通过：`npm run build:api`
- 通过：`npm run build:web`
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，43/43。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3/3。
- Dev 重启通过：`npm run dev:restart`，frontend `http://127.0.0.1:5176`，backend `http://127.0.0.1:3762`。
- Live API 通过：`GET /api/model-gateway/providers` 返回 active routes 和无 route alert；Codex、Claude Code、OpenCode、OpenClaw 四个 scope 的 active-route smoke 均通过。
- Daemon restart 通过：`POST /api/model-gateway/daemon-service` action `restart` 返回 `active=true/enabled=true/started=true`，endpoint `http://127.0.0.1:18796/v1`。
- Playwright UI 检查通过：`/model-gateway` 可见 Active routing 状态和 Smoke 结果，无 console error；截图 `/tmp/model-gateway-active-routing-smoke.png`。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 做真实客户端配置 apply 的隔离验收：用测试 HOME / 临时配置跑 Codex、Claude Code、OpenCode、OpenClaw，不污染用户正式配置。
2. 继续 Phase B2 成熟度：补真实 provider/CLI smoke 的 tool、history、summary/compact 和 error envelope 回归脚本。
3. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
