# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog MVP completed; Phase E App Connections profile/rollback MVP completed; Phase B2 maturity hardening remains open
> 更新：2026-06-05
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback 和 profile 切换。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors / CC Bridge / Octo(dmwork) 后置；不放进 Studio Gateway App Connections。
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐 SSE、tool/history、usage/cache、error envelope、reasoning/thinking，并保留真实 provider/CLI smoke。

## 本轮完成

- 后端新增 App Connections profile API：
  - `POST /api/model-gateway/app-connections/profile`
  - `POST /api/model-gateway/app-connections/apply`
  - `POST /api/model-gateway/app-connections/:appId/rollback`
- Registry 增加 `appConnectionProfile`，支持默认模型、App 级模型覆盖、上下文窗口、compact 阈值、max output、reasoning/effort 和 Codex 兼容参数。
- Codex 配置生成写入 `model_context_window`、`model_auto_compact_token_limit`、`model_reasoning_effort`、request compression 和 provider block。
- Claude Code、OpenCode、OpenClaw 配置生成保留原配置并写入 Studio Gateway endpoint/key/model；JSON 类配置写入 `studioGateway.profile` 元数据。
- Apply 前继续备份目标文件；rollback 恢复最近备份，并先备份当前文件。
- 前端 App Connections tab 新增 `Connection profile` 区块、默认模型输入、每个 App 的 `App model` 覆盖输入、保存 profile、应用全部、回滚按钮和 Codex advanced 折叠。
- 修复 profile patch 语义：字段不存在才继承旧值，空字符串/null 会清空字段，避免用户无法删除上下文或输出上限。
- 页面契约测试补充 App Connections profile/apply-all/rollback API 和 UI 关键元素，防止退回旧单模型或按钮堆叠形态。

## 验证

- 通过：`npm run build:api`
- 通过：`npm run build:web`
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，41/41。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3/3。
- Dev 重启通过：`npm run dev:restart`，frontend `http://127.0.0.1:5176`，backend `http://127.0.0.1:3762`。
- Live API 通过：`GET http://127.0.0.1:5176/model-gateway` 返回 200；`GET /api/model-gateway/app-connections` 返回 4 个连接、profile 和可用模型列表。
- Live profile smoke 通过：保存默认模型 + Codex/Claude 单独模型覆盖成功；清空 `contextWindow/maxOutputTokens` 生效；测试后已恢复原 profile。
- Daemon restart 通过：`POST /api/model-gateway/daemon-service` action `restart` 返回 `active=true/enabled=true/started=true`，endpoint `http://127.0.0.1:18796/v1`。
- Playwright UI 检查通过：`/model-gateway` 可见三个 tab、Connection profile、Default model、4 个 App model、Codex advanced；折叠展开后可见 WebSocket v2；截图 `/tmp/model-gateway-app-connections-profile.png`。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 补 Provider Center 可用性闭环：Active routing 选择后即时 smoke 验证；停用当前 active provider 时明确提示回退或阻断。
2. 做真实客户端配置 apply 的隔离验收：用测试 HOME / 临时配置跑 Codex、Claude Code、OpenCode、OpenClaw，不污染用户正式配置。
3. 继续 Phase B2 成熟度：补真实 provider/CLI smoke 的 tool、history、summary/compact 和 error envelope 回归脚本。
4. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
