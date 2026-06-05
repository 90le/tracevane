# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP completed; Phase E App Connections profile/rollback/isolated apply acceptance completed; Phase B2 CLI startup smoke harness completed; Phase B2 protocol maturity remains open
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
- Phase B2 仍需持续按 `/tmp/cc-switch-src` 对齐 SSE、tool/history、usage/cache、error envelope、reasoning/thinking；CLI 启动 smoke 已有 strict harness。

## 本轮完成

- 新增 `scripts/smoke-model-gateway-cli.mjs` 和 npm scripts：`smoke:model-gateway:cli`、`smoke:model-gateway:cli:strict`。
- 脚本用临时 HOME + mock Gateway + App Connections apply-all 生成隔离配置，不读取或写入用户正式 Codex/Claude/OpenCode/OpenClaw 配置。
- Strict smoke 当前覆盖：Codex `codex exec` -> `/v1/responses`，Claude Code `claude --bare --print` -> `/v1/messages`，OpenCode `opencode run` -> `/v1/chat/completions`，OpenClaw `models status --json` -> 隔离配置加载。
- 修正真实客户端兼容：外部 JSON 配置不再写根级 `studioGateway` 元数据；OpenCode provider 改为 `@ai-sdk/openai-compatible`，并把当前 alias 模型写入 provider model catalog。

## 验证

- 通过：`node --test tests/system/model-gateway-service.test.mjs`，44/44。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3/3。
- 通过：`npm run smoke:model-gateway:cli:strict`，4 个 CLI smoke 均 passed。

## 已知边界

- OpenAI Platform official smoke 仍需真实 OpenAI Platform key；本机 Codex 登录态 `PROXY_MANAGED` 不能当官方 API key。
- Channel Connectors / CC Bridge / Octo(dmwork) 还未开始实现。
- 工作树中存在并行任务的 system/recovery 改动；本轮未触碰。

## 下一步

1. 继续 Phase B2 成熟度：补真实 provider/CLI smoke 的 tool、history、summary/compact 和 error envelope 回归脚本。
2. 扩展 CLI smoke：加入 Codex `/v1/responses/compact`、Claude summary/compact 类请求、OpenClaw agent `--local` 可选 live 路径。
3. Gateway 稳定后再启动 Channel Connectors / CC Bridge / Octo(dmwork)。
