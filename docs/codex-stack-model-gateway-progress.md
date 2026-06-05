# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase B2 maturity hardening in progress
> 更新：2026-06-05
> 文档规则：只保留当前状态、验证、下一步；过期细节直接替换。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标。
- Codex Stack / CPA / Compact 旧功能面已停止演进。
- 新 UI / API 需要重新以 Studio Gateway、Provider Center、App Connections、Runtime、Diagnostics 命名建设。
- CC / cc-connect / Octo(dmwork) 已从 App Connections 拆出，归入独立 Channel Connectors；短期用 CC Bridge，长期逐步 native 化。
- Gateway daemon 与 Channel daemon / CC Bridge 都必须独立守护；Studio / OpenClaw 挂掉后，CLI 模型请求和 IM 到 Codex/Gateway 的对话链路仍应保持运行。
- 协议矩阵目标已固定：Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions 任意原生 provider 都必须对外暴露三类客户端协议。
- 本地参考源码固定为 `/tmp/cc-switch-src`；只参考代理转换、SSE、tool/history、usage 映射。
- Channel Connectors 参考源为 release 副本 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`；其中 `platform/dmwork` 即 Octo，不恢复旧 `resources/codex-stack` 生产路径。
- OpenAI 官方 API smoke 需要真实 OpenAI Platform key；本机 Codex 登录态当前是 `PROXY_MANAGED` 占位符，不可直接用于官方 API。
- 当前 Phase B2：BigModel Anthropic/Chat、GMN Responses-native、Claude/Codex takeover smoke 已通过；OpenAI Platform official smoke 仅作为后续额外 vendor proof。

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
- 更新目标与进度文档：把“绝对成熟度”写为 Phase B2 验收门槛，要求参考 cc-switch 并用真实 provider/CLI smoke 证明。
- Phase B2 成熟度切片：
  - Chat/Anthropic → Responses 请求改为 typed content（`input_text` / `output_text`），对齐 cc-switch，避免部分 Responses provider 200 但无最终文本。
  - Chat streaming `tool_calls` 转 Responses `function_call` SSE：`output_item.added`、`function_call_arguments.delta/done`、`output_item.done`、completed usage。
  - Responses streaming `function_call` 转 Chat `tool_calls` delta 和 Anthropic `tool_use` / `input_json_delta`。
  - Chat reasoning / `reasoning_content` 转 Responses reasoning item 与 reasoning summary SSE；`<think>` 前缀流拆分为 reasoning，不泄露标签。
  - Codex streamed tool call 写入 history，后续 `previous_response_id + function_call_output` 可恢复原 function call。
  - Anthropic streaming `tool_use` 转 Responses `function_call` SSE，并写入 Codex history。
  - Responses `response.failed` SSE 转 adapter error；Chat upstream 非 2xx 转 Responses error envelope，不裸透传 `base_resp` 等上游私有结构。
  - Claude Code `metadata` 不再透传到 OpenAI Chat provider，避免 MLAMP/OpenAI Chat 报 `metadata`/`store` 不兼容。
  - Provider 上游 endpoint 默认不再隐式追加 `/v1`；`baseUrl` 作为 API 前缀，版本号由 `baseUrl` 或 `endpoints` 明确表达。

## 验证

- 通过：`npm run build:api`
- 通过：`node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs`
- 通过：`node --test --test-reporter=dot tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/model-gateway-service.test.mjs`
- 通过：`git diff --check`
- 本轮补测通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "protocol matrix forwards native openai responses|anthropic messages through openai chat providers|codex compact|chat reasoning|streamed codex tool-call history|upstream responses stream fails|normalizes upstream chat errors" tests/system/model-gateway-service.test.mjs`，8/8 通过。
- 本轮补测通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "routing contract selects|records streamed codex tool-call history|adapts streaming chat tool calls|adapts codex responses through native anthropic|protocol matrix forwards" tests/system/model-gateway-service.test.mjs`，7/7 通过。
- Dev 进程已重启：frontend `http://127.0.0.1:5176` 返回 200；backend `http://127.0.0.1:3762/api/system/health` 返回 `gateway: online`。
- 工作树中存在其它 AI 进程处理中的 system/recovery 改动；本轮只验证 Studio Gateway 范围，不处理该并行任务冲突。
- 未全量重跑：前端未改；上轮 `npm run test:system` 仍有 9 个非本轮相关旧 UI 形态断言失败，集中在 Agents / Channels / Chat / Config 测试。
- BigModel live smoke：
  - Anthropic-compatible base `https://open.bigmodel.cn/api/anthropic`，model `glm-4.6`：10/10 通过，覆盖 Chat、Anthropic、Responses、compact、stream、tool/history、error；该 provider 需 endpoint override `/v1/messages`。
  - Chat-compatible base `https://open.bigmodel.cn/api/coding/paas/v4`，model `glm-4.6`：10/10 通过，覆盖 Chat、Anthropic、Responses、compact、stream、tool/history、error；forced object `tool_choice` 会被 BigModel 400，live smoke 使用 `tool_choice:"auto"`。
  - 测试 key 只用于临时 smoke，未写入仓库。
- OpenAI official smoke：代理链路可达，但本机可读 key 是 `PROXY_MANAGED` placeholder；Gateway 已本地拒绝该 placeholder，需真实 OpenAI Platform key 后重测。
- MLAMP Responses-compatible live classification：
  - Base `https://llm-gateway.mlamp.cn/v1`，model `gpt-5`：`/responses` 非流式通过，返回 `object: response`、`status: completed`、`output_text`、Responses usage 字段。
  - `/responses` streaming 通过，返回 `response.created`、`response.in_progress`、`response.output_item.*` SSE 事件。
  - `/chat/completions` 也通过，返回 `object: chat.completion`；因此该 base 是 dual-compatible，当前只作为历史/可选参考，不作为 official compact 门槛。
  - 测试 key 只用于临时 smoke，未写入仓库。
- MLAMP via Studio Gateway live smoke：
  - 临时 provider `apiFormat=openai_responses`，base `https://llm-gateway.mlamp.cn/v1`，model `gpt-5`；当前只保留为历史/可选参考。
  - 非流式 `/v1/responses`、`/v1/chat/completions`、`/v1/messages` 均 200，均产出可读文本和 usage；`gpt-5` 需 `max_output_tokens/max_tokens/max_completion_tokens=512` 才稳定越过 reasoning 输出。
  - 流式 `/v1/responses`、`/v1/chat/completions`、`/v1/messages` 均 200，均完成并产出文本 delta；测试 key 只用于临时 smoke，未写入仓库。
- GMN Responses-native substitute smoke：
  - Base `https://gmn.chuangzuoli.com/v1`；`/v1/models` 可读，`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.5`、`codex-auto-review` 可用，`gpt-5.2` 当前返回上游 503。
  - 直接上游通过：`/v1/responses`、`/v1/responses/compact`、`/v1/chat/completions`；compact 返回 `response.compaction` 或 `response`，均为 200。
  - Studio Gateway 临时 provider `apiFormat=openai_responses` 通过：`/v1/responses`、`/v1/responses/compact`、`/v1/chat/completions`、`/v1/messages`、Responses stream，runtime 全部 success。
  - Tool smoke 通过：Chat Completions 客户端 tool request 经 Gateway 转上游 Responses，返回标准 `tool_calls`。
  - 测试 key 只用于临时 smoke，未写入仓库。
- Claude Code takeover smoke：
  - 通过：Claude Code `2.1.86`，临时 Gateway `/v1/messages`，MLAMP Chat-compatible upstream，返回 `CLAUDE_CODE_GATEWAY_OK`。
  - 通过：Claude Code `2.1.86`，临时 Gateway + BigModel Chat upstream，basic 返回 `CLAUDE_GATEWAY_OK`，Bash tool-use 返回 `CLAUDE_TOOL_OK` 且 Gateway request log 增加 8，summary 类请求返回 `CLAUDE_SUMMARY_OK`。
  - 注意：用户级 `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL=http://127.0.0.1:8317` 会覆盖 shell env；接管 smoke 需用 `--setting-sources local` 或后续 App Connections 生成隔离配置。
- Codex CLI takeover smoke：
  - 通过：Codex CLI `0.137.0`，临时 `CODEX_HOME`，`wire_api="responses"` 指向 Studio Gateway `/v1`，`codex exec` 返回 `CODEX_GATEWAY_OK`。
  - 通过：Codex CLI `0.137.0`，GMN Responses-native 临时 Gateway，`codex exec` 返回 `CODEX_GMN_NATIVE_OK`，runtime 命中 `/v1/responses`。
  - 通过：同一临时 Gateway direct `/v1/responses/compact` 返回 `CODEX_COMPACT_OK`，runtime log 命中 `openai_responses_compact`。
- Compact 说明：
  - MLAMP 当前不作为 `/v1/responses/compact` 原生能力证明。
  - GMN 已覆盖 Responses-native `/v1/responses/compact` 替代 smoke；OpenAI Platform official smoke 仅在需要官方 vendor proof 时单独执行。
- Channel decision：
  - App Connections 只覆盖本地 CLI/AI 工具：Codex、Claude Code、OpenCode、OpenClaw。
  - Channel Connectors 单独覆盖 IM 渠道：CC Bridge、Octo(dmwork)、飞书、微信/企业微信等。
  - 短期托管 cc-connect 配置/进程/日志/事件接入；中期定义 Studio Channel Connector contract；长期优先 native 化 Octo(dmwork)。
  - CC Bridge 需要 OS/user supervisor；Studio/OpenClaw 崩溃时保持服务在线，不内置额外修复流程。

## 下一步

1. 先确认 Channel Connectors 的最小需求：Octo(dmwork) 优先级、CC Bridge supervisor 托管范围、Studio Chat/Agent 路由规则、会话映射和凭据模型。
2. 新建 Studio Gateway 管理页和 App Connections，生成 Codex / Claude Code / OpenCode / OpenClaw 配置 preview 与 apply。
3. 把 BigModel 与 GMN endpoint preset 写入后续 Provider Center，不靠 Gateway 默认猜版本号。
