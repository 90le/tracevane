# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B adapter matrix mostly completed
> 更新：2026-06-04
> 文档规则：只保留当前状态、验证、下一步；过期细节直接替换。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标。
- Codex Stack / CPA / Compact 旧功能面已停止演进。
- 新 UI / API 需要重新以 Studio Gateway、Provider Center、App Connections、Runtime、Diagnostics 命名建设。
- 协议矩阵目标已固定：Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions 任意原生 provider 都必须对外暴露三类客户端协议。
- 本地参考源码固定为 `/tmp/cc-switch-src`；只参考代理转换、SSE、tool/history、usage 映射。
- OpenAI 官方 API smoke 需要真实 OpenAI Platform key；本机 Codex 登录态当前是 `PROXY_MANAGED` 占位符，不可直接用于官方 API。

## 本轮完成

- 删除旧后端：`apps/api/modules/codex-stack/**` 和 `/api/codex-stack/*` 注册入口。
- 删除旧前端：`apps/web-vue/src/features/codex-stack/**`、`CodexStackView.vue`、导航和首页入口。
- 删除旧资源：`resources/codex-stack/**`。
- 删除旧测试/设计保护面：`codex-stack-*`、`studio-web-codex-stack-*`、旧 release/design/page-density 合约测试。
- 刷新 `studio-domain-inventory.json`，基线不再包含 `/codex-stack`、`codex-stack` API module 或 web feature。
- 保留并验证 Studio Gateway daemon/service contract；修复 systemd service template 的 `WorkingDirectory` 引号问题。
- 补齐核心协议 adapter：Anthropic Messages ↔ OpenAI Chat、Anthropic Messages ↔ OpenAI Responses、OpenAI Chat ↔ OpenAI Responses 的非流式与文本 streaming 路径。
- 新增 SSE 重建模块，覆盖 Chat/Responses/Anthropic 之间的 `message_start`、`content_block_delta`、`message_delta`、Chat chunk、Responses output_text 事件转换。
- 新增 provider `network.proxyUrl` upstream 支持；OpenAI 这类需代理的 provider 可显式走 HTTP/SOCKS proxy。
- 新增 `PROXY_MANAGED` placeholder guard，避免把本地 managed-account 占位符作为真实 upstream key 发出。

## 验证

- 通过：`npm run build:api`
- 通过：`node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs`
- 通过：`node --test --test-reporter=dot tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/model-gateway-service.test.mjs`
- 通过：`git diff --check`
- 未全量重跑：前端未改；上轮 `npm run test:system` 仍有 9 个非本轮相关旧 UI 形态断言失败，集中在 Agents / Channels / Chat / Config 测试。
- BigModel live smoke：
  - Anthropic-compatible base `https://open.bigmodel.cn/api/anthropic`，model `glm-4.6`：`/v1/messages`、`/v1/chat/completions`、`/v1/responses/compact`、Chat streaming 均通过。
  - Chat-compatible base `https://open.bigmodel.cn/api/coding/paas/v4`，model `glm-4.6`：需 endpoint override 到 `/chat/completions`；`/v1/chat/completions`、`/v1/messages`、`/v1/responses/compact`、Anthropic streaming 均通过。
  - 测试 key 只用于临时 smoke，未写入仓库。
- OpenAI official smoke：代理链路可达，但本机可读 key 是 `PROXY_MANAGED` placeholder；Gateway 已本地拒绝该 placeholder，需真实 OpenAI Platform key 后重测。

## 下一步

1. 跑真实 Claude Code / Claude CLI 与 Codex CLI：对话、流式、compact/summary；需要先新增 App Connections preview/apply 或手动临时配置。
2. 继续对齐 `/tmp/cc-switch-src`：reasoning/custom-tool streaming、tool_call argument 增量、usage/cache 字段容错。
3. 新建 Studio Gateway 管理入口和 App Connections，不复用旧 Codex Stack 代码。
4. 处理剩余非相关旧 UI 测试，决定删除还是按当前页面真实结构重建。
