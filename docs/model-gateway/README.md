# Model Gateway 100% 验收合同

本文定义 Tracevane Model Gateway 的“100%支持”含义。这里的 100% 不是承诺每个上游模型都原生支持所有能力，而是要求每个入口、协议、工具流、附件流都有明确状态、自动化证据和失败边界。

当前签收记录：[`release-signoff-2026-07-09.md`](./release-signoff-2026-07-09.md)。

## 外部合同来源

- OpenAI Responses API：`POST /responses` 支持文本、图片输入、JSON 输出、自定义代码和 web/file search 等内置工具。参考：https://developers.openai.com/api/reference/resources/responses/methods/create
- OpenAI Chat Completions：`/chat/completions` 是基于 messages 的模型响应接口，官方建议新项目优先考虑 Responses。参考：https://developers.openai.com/api/reference/chat-completions/overview
- OpenAI 文件输入：Responses 的 `input_file` 可使用 base64、Files API file id 或外部 URL；PDF、文档、表格处理方式不同。参考：https://developers.openai.com/api/docs/guides/file-inputs
- OpenAI Audio：转写接口接收实际音频文件对象，不是本地文件名。参考：https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
- Anthropic Messages 和 Streaming：Messages 支持 SSE 流式输出，覆盖文本、tool use、extended thinking delta。参考：https://docs.anthropic.com/en/api/messages-streaming
- Claude Code CLI：`--output-format stream-json`、`--input-format stream-json`、`--mcp-config` 是 Tracevane 非交互驱动的关键合同。参考：https://docs.anthropic.com/en/docs/claude-code/cli-reference
- OpenCode CLI / MCP：`opencode run` 是程序化入口，OpenCode MCP servers 自动作为工具暴露给 LLM。参考：https://opencode.ai/docs/cli/ 和 https://opencode.ai/docs/mcp-servers/

## 状态词

- `native`：同协议同 endpoint 透传，上游响应不经语义转换。
- `adapted-lossless`：跨协议翻译后，文本、工具调用、工具结果、错误和流式事件保持可验证等价。
- `adapted-degraded`：能力不能等价表达，但会保留可读摘要、降级事件和原因。
- `path-handoff`：本地文件路径交给 CLI agent，由 CLI 自己读取；这不等于网关模型已收到文件字节。
- `direct-upload`：请求体内包含 base64、multipart 文件、file id、URL，网关或上游 API 实际接收文件内容引用。
- `unsupported-explicit`：明确返回 unsupported code，或模型目录暴露 `unsupportedGatewayRoutes`。
- `unknown`：未验收；发布门禁中不允许保留 unknown。

## 三协议 x 三 Agent 验收矩阵

| Agent scope | OpenAI Responses | Anthropic Messages | OpenAI Chat Completions |
| --- | --- | --- | --- |
| `codex` | `native` when provider is Responses/Codex account | `adapted-lossless` required when routed to Anthropic provider | `adapted-lossless` required when routed to Chat provider |
| `claude-code` | `adapted-lossless` through Anthropic view | `native` when provider is Anthropic Messages | `adapted-lossless` required when routed to Chat provider |
| `opencode` | `adapted-lossless` through Chat view | `adapted-lossless` required when routed to Anthropic provider | `native` when provider is Chat Completions |

100% 的判定方式：

1. 每个格子必须有 `native`、`adapted-lossless`、`adapted-degraded` 或 `unsupported-explicit` 状态。
2. 每个 `native` / `adapted-lossless` 格子必须有非流式和流式证据。
3. 工具调用必须验证“模型发起调用”和“客户端回传工具结果”两个方向。
4. MCP、内置工具、普通 function/custom tool 要分开验收，不能只用一个 echo tool 代表全部工具流。
5. 附件验收必须标注 `path-handoff` 或 `direct-upload`，不能把本地路径传给 CLI 当作网关模型直接上传。

当前本地门禁由 `tests/system/model-gateway-service.test.mjs` 覆盖服务级协议翻译，由 `tests/system/model-gateway-protocol-matrix-smoke-script.test.mjs` 覆盖 release protocol matrix runner 的严格输出结构。真实账号和真实 CLI 仍需运行 live smoke。

## 工具流验收

| 能力 | 100%要求 | 当前验收入口 |
| --- | --- | --- |
| 普通文本 | 三协议非流式和流式都能返回最终文本 | `model-gateway-service.test.mjs`、`smoke-model-gateway-active-routes.mjs` |
| function tool | tool schema、tool choice、parallel tool calls、call id、arguments、result 都保留 | service tests + active route `--tool-smoke` / `--tool-result-smoke` |
| custom tool | Responses custom tool call/input/output 和 Chat/Anthropic 降级语义明确 | service tests |
| shell/local shell | `shell_call_output` 和 `local_shell_call_output` 必须保留 `call_id` 与 output | service tests |
| web/file search | 原生协议保留；跨协议不能原生表达时必须降级为安全上下文或 unsupported-explicit | service tests |
| code interpreter / computer / image generation calls | 原生协议保留；跨协议必须记录可读摘要或 explicit unsupported | service tests |
| MCP tools | MCP call/list/approval 在可表达协议间转换；不能表达时转文本上下文并记录降级 | `mcp-translation.ts` 相关 service tests |
| 错误流 | JSON 错误、HTML 错误、上游非 2xx、流式中断都要转换成客户端可读错误 | service tests + active route error smoke |
| 兼容清理 | 不支持字段不能静默破坏请求；必须清理、保留摘要或明确报错 | active route compatibility/malformed smoke |

## 附件和多模态验收

| 场景 | 判定 | 100%要求 |
| --- | --- | --- |
| 图片给 Codex CLI | `path-handoff` | CLI argv 必须含 `--image <localPath>`；进度事件必须记录 `agent.visual.input`；另需真实 CLI smoke 证明 CLI 确实消费图片。 |
| 图片给 Gateway API | `direct-upload` | 请求必须是协议原生 `input_image`、Chat image content 或 Anthropic image block；非视觉模型必须拒绝或降级。 |
| 普通文件给 CLI | `path-handoff` | 消息里必须包含可审计本地路径/文件摘要；CLI 是否读取文件不能由网关假设。 |
| 普通文件给 Responses | `direct-upload` | 必须使用 `input_file` 的 file id、URL 或 base64；大文件需要走 Files API 或外部 URL，不把本地路径当文件上传。 |
| 大文件 | `path-handoff` 或 `direct-upload` | 分别验收大小限制、截断/摘要策略、错误事件和用户可见提示。 |
| 非视觉模型收到图片 | `adapted-degraded` 或 `unsupported-explicit` | 触发 visual fallback，记录原因，不能假装模型看到了图片。 |
| 视频 | `path-handoff` 默认 | 作为文件/本地路径处理；除非后续引入视频理解 API，否则只保证路径、摘要和降级事件。 |
| 音频 | `direct-upload` only for audio API | Gateway audio endpoints 要按 API 文件上传合同验收；Codex account audio 当前为 explicit unsupported。 |

## 发布门禁

最小本地门禁：

```bash
npm run typecheck:api
npm run build:api
node --test tests/system/model-gateway-service.test.mjs tests/system/model-gateway-protocol-matrix-smoke-script.test.mjs
```

CLI/Channel Connector 门禁：

```bash
node --test tests/system/channel-connectors-agent-session-driver.test.mjs tests/system/channel-connectors-codex-app-server-driver.test.mjs tests/system/channel-connectors-agent-runner-direct-script.test.mjs
```

真实服务门禁：

```bash
npm run smoke:model-gateway:protocol-matrix -- --endpoint http://127.0.0.1:18796
node scripts/smoke-model-gateway-representative-matrix.mjs \
  --endpoint http://127.0.0.1:18796 \
  --report-file .omx/state/model-gateway/representative-matrix.json \
  --markdown-report .omx/state/model-gateway/representative-matrix.md \
  --json
node scripts/smoke-channel-connectors-agent-runner-direct.mjs
```

上线前必须把 live smoke 结果粘到对应 release 记录中，至少包括：三 scope 路由、三协议格式、工具调用/工具结果、流式工具、MCP、附件 path-handoff/direct-upload、非视觉降级、音频/视频 unsupported 或降级。

## 运行诊断和恢复

真实 smoke 如果返回 `model_gateway_upstream_failed` / `fetch failed`，错误体必须包含脱敏诊断：

- `diagnostics.network.causeCode`：如 `ECONNREFUSED`、`ETIMEDOUT`。
- `diagnostics.network.causeAddress` / `causePort`：连接失败的地址和端口。
- `diagnostics.network.proxy.source`：`account`、`provider`、`environment` 或 `none`。
- `diagnostics.network.proxy.url`：脱敏后的代理 URL，不允许暴露用户名、密码、token。

熔断被旧失败打开后，不应手动编辑 registry；使用管理接口清健康状态：

```bash
curl -X POST http://127.0.0.1:18796/api/model-gateway/providers/<providerId>/health/reset \
  -H "Authorization: Bearer <gateway-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

只重置 endpoint profile 时传：

```json
{ "endpointProfileId": "coding-chat" }
```

live 验收报告由 protocol matrix runner 输出：

```bash
node scripts/smoke-model-gateway-protocol-matrix.mjs \
  --endpoint http://127.0.0.1:18796 \
  --report-file .omx/state/model-gateway/protocol-acceptance.json \
  --markdown-report .omx/state/model-gateway/protocol-acceptance.md \
  --json
```
