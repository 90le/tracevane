# Codex Stack Model Gateway 目标方案

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 范围：Codex Stack 长期模型接入方案，目标是替换现有 CPA / Compact Proxy / Gateway / cc-connect 代理链路。

## 1. 目标

Studio 需要自建一个长期可维护的本地 Model Gateway，让用户可以在 Studio 里配置任意模型供应商，并把这些供应商接入 Codex、Claude Code、OpenCode、OpenClaw 等 CLI/客户端。

最终目标不是修补 `Compact compaction: This operation was aborted`，而是移除导致该类不稳定的旧链路：

```text
旧链路：Codex -> Compact Proxy -> CPA -> OpenClaw provider/upstream
目标链路：Codex / Claude Code / OpenCode / OpenClaw -> Studio Model Gateway -> provider router -> upstream
```

`cc-connect` 后续只作为可选的 IM / project bridge，不再承担模型代理、模型路由或安装链路的核心职责。

## 2. 现状结论

当前 Codex Stack 是围绕 CPA 和 compact proxy 建立的安装、检查、修复和 UI：

- `types/codex-stack.ts:3` 的组件模型包含 `cpa`、`compact-proxy`、`cc-connect` 和 `watchdog`，说明共享 contract 已把旧链路作为产品真相。
- `apps/api/modules/codex-stack/service.ts:53` 定义 CPA / compact 默认端口、版本、默认模型和 required smoke checks。
- `apps/api/modules/codex-stack/service.ts:77` 把 `cli-proxy-api.service`、`cpa-compact-proxy.service`、`cc-connect.service` 等 systemd unit 作为核心服务。
- `apps/api/modules/codex-stack/service.ts:141` 的安装 env 仍是 `CPA_PORT`、`COMPACT_PORT`、`CPA_PROXY_KEY` 等 CPA 概念。
- `apps/api/modules/codex-stack/service.ts:154` 的 repair actions 包含 `restart-cpa`、`restart-compact-proxy`、`run-smoke-matrix`、`apply-codex-cpa-after-smoke`。
- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh:3` 明确是 `Codex + CPA + Compact Proxy + cc-connect` 安装脚本。
- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh:136` 要求 `~/.openclaw/openclaw.json` 存在，缺失时直接失败。
- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh:146` 从 `openclaw.json` 抽第一个 provider，当作 CPA upstream。
- `resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs:3` 是 CPA 上方的 Responses compatibility shim，并声明 CPA chat-completions path 是 upstream。
- `resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs:10` 只是在本地把 `/v1/responses`、`/v1/responses/compact`、Claude Messages 转到 `/v1/chat/completions`。

因此，旧实现的根因不是某个 compact timeout，而是：

- 模型接入没有 first-class provider store。
- app 配置、provider 配置、smoke gate、failover、协议转换散落在 install script、CPA config、compact proxy 和 cc-connect config 之间。
- 安装依赖 `openclaw.json`，无法在没有 OpenClaw 配置时保底安装 Codex。
- Gateway/CPA/compact/cc-connect 多进程、多端口、多配置文件，任意一层抖动都会让前端验证失败。

## 3. cc-switch 借鉴结论

参考仓库：

- GitHub：<https://github.com/farion1231/cc-switch>
- 官网：<https://ccswitch.io/zh/>
- 本次研究副本：`/tmp/cc-switch-src`
- 授权：上游License；可复制实现代码，但最好需要结合studio设计进行调整。

cc-switch 的核心价值不在 UI 外观，而在这几个设计点：

1. **Provider 是一等对象**
   - `src-tauri/src/database/schema.rs` 建立 provider、endpoint、health、proxy_config 等表。
   - provider 按 `app_type` 隔离，同时支持 universal provider 同步到 Claude / Codex / Gemini。

2. **本地代理是状态化 router，不是单 upstream shim**
   - `src-tauri/src/proxy/provider_router.rs` 按当前 provider / failover queue / circuit breaker 选择 upstream。
   - `src-tauri/src/proxy/forwarder.rs` 在请求级执行 retry、failover、timeout、provider health 记录和错误转换。
   - `src-tauri/src/proxy/server.rs` 保留原始 header casing 并用 HTTP/1.1 代理 CLI 请求，说明 CLI 兼容层需要按 wire behavior 处理。

3. **Codex Responses 兼容需要完整 adapter**
   - `src-tauri/src/proxy/providers/codex.rs` 根据 provider `api_format` 决定是否把 Codex Responses 转成 OpenAI Chat。
   - `src-tauri/src/proxy/providers/transform_codex_chat.rs` 负责 Responses -> Chat 请求转换，覆盖 instructions/input、tools、tool_choice、reasoning、stream options 和 vendor passthrough 字段。
   - `src-tauri/src/proxy/providers/streaming_codex_chat.rs` 负责 Chat SSE -> Responses SSE 状态机。
   - `src-tauri/src/proxy/codex_chat_history.rs` 保存 response / tool-call history，解决 Codex `previous_response_id + function_call_output` 与 chat providers 上下文要求不一致的问题。

4. **Claude Code 不是简单改 baseUrl**
   - `src-tauri/src/proxy/providers/claude.rs` 支持 Anthropic native、OpenAI Chat、OpenAI Responses、Gemini native 等 api format。
   - `src-tauri/src/services/proxy.rs` 通过 live takeover 写入 Claude Code / Codex 配置，把真实 token 留在自身 provider store，客户端配置只放 `PROXY_MANAGED` placeholder。
   - Claude role model aliases、token env、official auth 和第三方 auth 要分开处理。

5. **OpenClaw 缺省配置应该可生成**
   - `src-tauri/src/openclaw_config.rs` 对缺失的 OpenClaw config 返回默认结构，并保留 JSON5 round-trip、backup 和并发写检测。
   - Studio 的一键安装也应允许没有 `openclaw.json`，创建保底配置或只安装 Codex + Model Gateway。

## 4. 目标边界

### 4.0 控制面与本机 Edge 分层

长期实现必须拆成两层，避免把现在的单机安装脚本继续扩成新的中心网关。

**Studio Gateway Control Plane**

- 负责 provider registry、route policy、app scope、health/smoke record、request log、audit 和 UI。
- 不直接依赖 `HOME`、`systemctl --user`、`~/.codex/auth.json` 或 `~/.cc-connect/config.toml`。
- 可在没有 Codex、Claude Code、OpenCode、OpenClaw 本机配置的环境下管理 provider 和生成安装计划。

**Local Gateway Edge / Node**

- 负责 loopback HTTP listener、协议 adapter、CLI takeover、本机 service 和 workstation bootstrap。
- 可以写本机客户端配置，但必须有 preview、backup、rollback。
- 可以作为 user-level service 长期运行，让 Codex / Claude Code 在 Studio UI 关闭后仍可访问本地 Gateway。

这个分层是替换旧链路的关键：控制面决定 provider、路由和安全策略；本机 edge 只执行协议和本机接入。

### 4.1 Studio Model Gateway

新增 Studio 自管 Model Gateway，默认监听 loopback：

```text
127.0.0.1:18796
```

选择继续占用 `18796` 是为了保留用户已熟悉的本地端口语义，但端口含义要从 `cpa-compact-proxy` 改为 `studio-model-gateway`。后续不再暴露 CPA port。

Gateway 需要提供：

- `GET /gateway/status`：capabilities、active providers、app takeover 状态、health summary。
- `GET /gateway/providers`：面向 UI 的 provider registry view。
- `POST /v1/chat/completions`：OpenAI Chat 兼容入口。
- `POST /v1/responses`：Codex Responses 入口。
- `POST /v1/responses/compact`：Codex compaction 入口，走同一个 provider router 和 adapter。
- `POST /v1/messages` 和 `/claude/v1/messages`：Anthropic Messages 入口。
- 其他 OpenAI-compatible path 的有限 forward，必须有 allowlist 和日志。

最终协议兼容目标：

用户配置 provider 时只需要说明该 provider 的原生协议；Studio 必须把这个 provider 暴露成三种主流客户端协议，让 Claude Code、Codex、OpenClaw、OpenCode 和其他 AI CLI / IDE 工具都能接入同一个 provider pool。

| Provider 原生协议 | 市场含义 | 目标客户端协议面 |
| --- | --- | --- |
| Anthropic Messages | Claude 官方 API / Claude Code 原生协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Responses API | Codex 官方 API / Codex 原生协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Chat Completions | 第三方模型最常见兼容协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |

原则：

- provider 原生协议和客户端协议相同时走 passthrough。
- provider 原生协议和客户端协议不同时走 Gateway adapter，不能把用户退回到“只能使用原生支持的 CLI”。
- 未实现的组合必须返回明确 `model_gateway_adapter_required`，直到对应 adapter 和测试补齐。

Local Gateway Edge 需要运行在 Studio 后端可控制的生命周期里。因为 Codex / Claude Code 可能在 Studio UI 关闭后继续使用，最终应支持：

- Studio API 内嵌启动，用于开发和 OpenClaw Gateway 模式。
- user-level service `openclaw-studio-model-gateway.service`，用于 CLI 长期可用。

### 4.2 Provider Registry

Studio 需要自己的 provider registry。v1 可以使用 Studio state JSON + 原子写 + `0600` secret 文件，不先引入新数据库依赖；schema 要保持将来迁移 SQLite 的可能。

建议路径：

```text
~/.openclaw/studio/model-gateway/providers.json
~/.openclaw/studio/model-gateway/secrets.json
~/.openclaw/studio/model-gateway/runtime.json
~/.openclaw/studio/model-gateway/codex-history.json
~/.openclaw/studio/model-gateway/backups/
~/.openclaw/studio/model-gateway/logs/
```

Provider schema 至少包含：

- `id`
- `name`
- `category`: `official` / `openai-compatible` / `aggregator` / `local` / `custom`
- `appScopes`: `codex` / `claude-code` / `opencode` / `openclaw`
- `baseUrl`
- `apiKeyRef`
- `apiFormat`: `openai_chat` / `openai_responses` / `anthropic_messages` / `gemini_native`
- `authStrategy`: `bearer` / `anthropic_api_key` / `openrouter` / `oauth_proxy` / `none`
- `models`: catalog, default model, aliases, context window, feature flags
- `reasoning`: vendor-specific reasoning config
- `endpoints`: optional per-path endpoint override
- `network`: proxy, no_proxy, TLS behavior, timeout
- `health`: last success/failure, latency, circuit state
- `failover`: queue membership, priority, retry limits
- `projectRefs`: 可选项目/工作区引用，支持一个全局 provider 被多个 app 或项目复用
- `metadata`: website, notes, icon, tags, importedFrom

### 4.3 App Takeover

客户端配置应只指向本地 Gateway，不直接保存真实 upstream key。

Codex takeover：

- 写 `~/.codex/config.toml` 的 `[model_providers.studio]`。
- `base_url = "http://127.0.0.1:18796/v1"`。
- `wire_api = "responses"`。
- `model_provider = "studio"`。
- `model` 写 Studio 当前 Codex provider 的默认模型。
- 保留用户已有 MCP servers 和非冲突配置。
- `~/.codex/auth.json` 中真实 key 不再作为 upstream truth；如需 placeholder，使用 `PROXY_MANAGED`。

Claude Code takeover：

- 写 Anthropic base URL 到本地 Gateway。
- 移除或替换与 Studio provider 冲突的 model override env。
- 对 official Claude account 和第三方 OpenAI-compatible provider 分开处理。
- 支持 role model alias，例如 haiku/sonnet/opus alias 映射到当前 provider 模型。

OpenCode / OpenClaw takeover：

- 支持检测已有 config。
- 缺失时生成保底 config。
- 写入本地 Gateway provider，而不是把 OpenClaw provider 反向抽给 Codex。

### 4.4 协议 Adapter

必须把协议转换从 `compact-proxy.mjs` 的单文件 shim 升级为可测试 adapter。

Adapter backlog 按三协议矩阵推进：Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions 三种输入协议最终都要能输出另外两种客户端协议。Phase 1 先锁定 `openai_chat` -> Codex Responses / compact，因为这覆盖最多第三方模型接入 Codex 的现实场景；随后补 `anthropic_messages` -> OpenAI Chat 和 OpenAI Responses / compact，让 Claude 官方 API provider 也能服务 Chat Completions 与 Codex Responses 客户端。

Codex adapter：

- Responses -> Chat request conversion。
- Chat -> Responses non-streaming conversion。
- Chat SSE -> Responses SSE conversion。
- tools / tool_choice / function_call_output / previous_response_id history。
- reasoning 参数映射，包括 GLM/Zhipu/Z.ai、Qwen/DashScope、DeepSeek、Kimi 等 provider quirks。
- `/v1/responses/compact` 走统一 router；compact 失败应携带 provider、model、endpoint、timeout 类型。

Phase 1 implementation note（2026-06-04）：

- 已落地最小非流式 Responses -> Chat adapter 起点。
- 已覆盖 `instructions`、`input` / `messages`、`model`、`stream: false`、function tools、`tool_choice`、`max_output_tokens` 和 Chat usage -> Responses usage 的转换。
- `/v1/responses` 对 `openai_chat` provider 可执行。
- 已落地 Chat SSE -> Responses SSE 文本 delta 最小状态机，支持 `response.created`、`response.in_progress`、message output item、`response.output_text.delta`、done events、`response.completed` 和 `[DONE]`。
- 已新增 `codex-history.json`，用于保存 assistant function_call output items，并在后续 `previous_response_id + function_call_output` 请求中恢复 Chat 所需的 assistant `tool_calls` 消息。
- `/v1/responses/compact` 对 `openai_chat` provider 已复用 Responses -> Chat adapter，可执行最小非流式 compact contract；native `openai_responses` provider 的 compact route 可 passthrough。
- compact `stream: true` 会进入同一 Chat SSE -> Responses SSE adapter，但尚未用 compact-specific streaming 用例单独锁定。
- 已用 system tests 锁定 native `openai_responses` provider 的 `/v1/responses` 和 `/v1/responses/compact` passthrough，以及 native `anthropic_messages` provider 的 `/v1/messages` / `/claude/v1/messages` passthrough。
- 同一批 matrix tests 会确认未实现的跨协议格子继续返回 `model_gateway_adapter_required`，避免伪成功。
- 已落地 `openai_chat_completions` client -> native `anthropic_messages` provider 的最小非流式 adapter，覆盖 system prompt、messages、tools、tool_choice、tool results、default `anthropic-version`、Anthropic response -> Chat response 和 usage 映射。
- Chat streaming -> Anthropic Messages streaming 尚未实现，`stream: true` 仍明确返回 `model_gateway_adapter_required`。
- 已落地 Codex `/v1/responses` 和 `/v1/responses/compact` client -> native `anthropic_messages` provider 的最小非流式链式 adapter，复用 Responses -> Chat -> Anthropic 与 Anthropic -> Chat -> Responses 两段转换，并覆盖 tools/tool_choice、compact、runtime route log 和 secret 脱敏。
- Responses/compact streaming -> Anthropic Messages streaming 尚未实现，`stream: true` 仍明确返回 `model_gateway_adapter_required`。
- streaming tool calls、streaming reasoning restore、provider-specific reasoning quirks 仍保持后续阶段任务。
- 该实现只作为 Phase 1 contract foundation；完整 adapter 仍必须补 compact 专用语义、完整 streaming tool/reasoning 状态机、完整 history/reasoning store 和 provider-specific quirks。

Claude adapter：

- Anthropic Messages native passthrough。
- Anthropic Messages -> OpenAI Chat。
- Anthropic Messages -> OpenAI Responses。
- Anthropic Messages -> Gemini native。
- thinking / tool use / tool result / system messages 的历史修正。

OpenAI-compatible adapter：

- Chat passthrough。
- Responses passthrough。
- provider-specific path normalization，例如 base URL 已带 `/v1`、`/paas/v4` 等。
- structured error mapping。

### 4.5 Router / Failover / Health

Router 是新链路稳定性的核心：

- 每个 app scope 可以有 current provider。
- 每个 app scope 可以有 failover queue。
- failover 只在明确的网络错误、timeout、5xx、限流或 provider policy 错误下触发。
- circuit breaker 记录 provider app-scope 维度状态。
- streaming first-byte timeout、stream idle timeout、non-streaming timeout 分开配置。
- 每次请求记录 provider、model、endpoint、status、latency、retry、failover reason。
- 前端验证不再是一次性 install smoke gate，而是 provider/app/protocol 维度的 runtime diagnostic。

## 5. Studio UI 设计

前端保留在 `apps/web-vue/src/features/codex-stack` 演进，但信息架构要从 CPA stack 改为 Model Gateway stack。

建议页面：

1. **Gateway Overview**
   - Gateway service 状态。
   - 当前 Codex / Claude Code / OpenCode / OpenClaw 接入状态。
   - active provider、当前模型、最近错误、failover 状态。

2. **Providers**
   - provider 列表、启停、排序、failover queue。
   - 一键新增 OpenAI-compatible provider。
   - 预设 provider：OpenAI、Anthropic、DeepSeek、Zhipu GLM、Qwen/DashScope、Kimi、OpenRouter、NewAPI、自定义网关。
   - model catalog、默认模型、role aliases、reasoning 设置。

3. **Universal Provider**
   - 一次填写 base URL / key / models。
   - 可同步到 Codex、Claude Code、OpenCode、OpenClaw。
   - 每个 app 可覆盖 model、api format、reasoning。
   - 支持从 cc-switch、cc-connect、Codex、Claude Code、OpenCode、OpenClaw 现有配置导入 provider。

4. **App Setup**
   - Codex 一键安装和 takeover。
   - Claude Code 可选安装和 takeover。
   - OpenCode / OpenClaw 检测、生成、接管。
   - 配置 diff preview、backup、rollback。

5. **Diagnostics**
   - provider test。
   - Codex Responses / Chat / compact matrix。
   - Claude Messages matrix。
   - streaming first-byte / idle test。
   - 最近请求日志和错误解释。

视觉和交互要求：

- 不再展示 `CPA -> Compact -> cc-connect` 的链路图。
- 进度 UI 以 app takeover / provider validation / gateway service 三条线展示。
- 所有 secret 输入使用 reveal、copy、clear、test actions。
- 对 “配置已被 Studio 接管” 和 “当前客户端仍直连 upstream” 给出明确状态。

## 6. 一键安装目标

一键安装不再要求 `~/.openclaw/openclaw.json`。

最小路径：

1. 检查 Node.js / npm。
2. 安装或验证 Codex CLI。
3. 安装或启动 Studio Model Gateway service。
4. 创建 Studio provider registry。
5. 如果没有 provider，引导用户添加 provider，或写入 disabled placeholder。
6. 写 Codex takeover config，指向本地 Gateway。
7. 运行 Codex Responses smoke。

可选路径：

- 安装或接管 Claude Code。
- 接管 OpenCode。
- 生成 OpenClaw fallback config。
- 导入已有 OpenClaw providers。
- 从 cc-switch / Codex / Claude / OpenCode configs 导入 provider。

## 7. 实施阶段

### Phase 0: 研究和文档

- 固定目标边界。
- 记录 cc-switch 可借鉴模块。
- 标记旧链路要删除的 contract、service、UI 和资源。

### Phase 1: Shared Types / Store / API

- 新增 `types/model-gateway.ts`。
- 新增 `apps/api/modules/model-gateway` 或拆分 `codex-stack/model-gateway`。
- 实现 provider registry store、secret store、runtime store。
- 新增 API：providers CRUD、test、gateway status、app takeover preview/apply。

2026-06-04 Phase 1 checkpoint:

- 已新增 `types/model-gateway.ts`，固定 provider、secret、route decision、status/providers response 的共享 contract。
- 已新增 `apps/api/modules/model-gateway`，并注册到 Studio API context/router。
- 已实现 provider registry + secret store 的 v1 文件存储，路径位于 `~/.openclaw/studio/model-gateway/`，secret 文件使用 `0600` 和 masked view。
- 已开放 `GET /gateway/status`、`GET /gateway/providers`、`GET/POST/PUT /api/model-gateway/providers`、`POST /api/model-gateway/providers/:providerId/secret`。
- 已开放 CLI 入口 `POST /v1/chat/completions`、`POST /v1/responses`、`POST /v1/responses/compact`、`POST /v1/messages`、`POST /claude/v1/messages`。
- 当前 `openai_chat` provider 的 `/v1/chat/completions` 是 passthrough；Codex `/v1/responses` 和 `/v1/responses/compact` 对 `openai_chat` provider 已经通过 Chat adapter 可执行。
- native `openai_responses` 和 native `anthropic_messages` 的 passthrough paths 已有 system tests 覆盖。
- native `anthropic_messages` provider 的 `/v1/chat/completions` 非流式 adapter 已有 system tests 覆盖。
- native `anthropic_messages` provider 的 `/v1/responses` 和 `/v1/responses/compact` 非流式 adapter 已有 system tests 覆盖。
- 未支持的协议组合仍返回 `model_gateway_adapter_required`。
- 已补齐 provider delete、active provider 设置、provider test endpoint、runtime request log 和 provider health 更新。
- `runtime.json` 已记录 gateway request / provider test 的有界日志，status 返回 request log size/latest timestamp。
- Router 已能在 active provider circuit open 时选择同 app scope fallback provider，并在 route decision 中返回 `failoverReason`。
- 尚未完成 app takeover preview/apply、UI、request retry、完整 failover queue 执行、Codex/Claude protocol adapters。

### Phase 2: Gateway Runtime

- 实现 Studio Model Gateway HTTP server。
- 提供 status、chat、responses、messages 基础入口。
- 接入 provider router、timeout、request log。
- 支持 Studio API 内嵌和 user-level service。

### Phase 3: Codex 支持

- 实现 Codex Responses passthrough。
- 实现 Responses -> Chat adapter。
- 实现 Chat -> Responses non-streaming / streaming。
- 实现 compact route 和 Codex chat history store。
- 改造 Codex install/takeover。

### Phase 4: Claude Code 支持

- 实现 Anthropic Messages passthrough。
- 实现 Anthropic Messages -> OpenAI Chat / Responses。
- 实现 Claude Code takeover 和 role model alias。
- 实现 Claude smoke matrix。

### Phase 5: OpenCode / OpenClaw 支持

- 实现 config 检测、生成、备份、恢复。
- 支持缺失 OpenClaw config 的 fallback 创建。
- 支持 Universal Provider 同步。

### Phase 6: UI 替换

- 移除 CPA install/config/smoke/repair UI。
- 增加 Model Gateway overview、provider center、universal provider、app setup、diagnostics。
- 优化执行任务弹层和进度显示到新模型链路。

### Phase 7: 移除旧资源并打包

- 删除或隔离 CPA / compact proxy / cc-connect 旧安装资源。
- 更新 system tests。
- 更新 pack 版本。
- 打包新版本。

## 8. 验收标准

必须全部满足后，才能认为旧链路已被替换：

- 无 `openclaw.json` 时，Studio 可以完成 Codex 一键安装并生成可用本地 Gateway 配置。
- 用户可在 UI 添加一个 OpenAI-compatible provider，并用 Codex 通过 `/v1/responses` 成功请求。
- `glm-5.1` 这类 OpenAI Chat provider 可被 Codex 使用，不依赖 CPA。
- `/v1/responses/compact` 通过同一 provider router 成功执行，不再调用 compact proxy。
- Claude Code 可通过同一个 provider registry 使用 Anthropic native 或 OpenAI-compatible provider。
- OpenCode / OpenClaw 能被检测、生成或接管，且真实 upstream key 不写入客户端配置。
- Provider registry 支持全局 provider、project/app refs、当前 provider 和 failover queue。
- 可从 cc-switch 或 cc-connect provider 配置导入 provider，并能预览导入差异。
- 两个 provider 的 failover queue 能在 timeout/5xx 下自动切换，并在 UI 中展示原因。
- `GET` 类配置读取接口不得返回明文 upstream `api_key`；只返回 masked secret 和 `apiKeyRef`。
- 所有写配置、接管、恢复和 secret 操作必须经过 management access / gateway auth gate。
- App route 切换前必须有匹配目标 provider/model/protocol 的新鲜 smoke 结果；过期或不匹配要阻断。
- 前端不再展示 CPA / Compact Proxy 作为核心组件。
- system tests 覆盖 provider CRUD、Codex install、Codex Responses smoke、compact smoke、Claude Messages smoke、failover、UI provider config。
- 打包产物不再默认安装 CPA 和 cpa-compact-proxy。

## 9. 主要风险

- Codex Responses streaming 和 tool-call history 的兼容成本高，必须先补单元测试再替换 UI。
- Claude Code official auth 与第三方 provider 的策略不同，不能用同一 token 写法处理。
- 将真实 secret 放入 Studio state 时，必须保证文件权限、masked return 和日志脱敏。
- 如果 Gateway 只跟随 Studio UI 进程，CLI 会在 UI 关闭后失效；必须设计长期 service。
- 如果控制面继续依赖单机 `HOME` 路径或 `systemd --user`，后续多节点、远程管理和权限审计会被锁死。
- 如果普通读取接口继续返回明文 `api_key`，Model Gateway 会扩大现有配置泄漏风险。
- 直接复制 cc-switch 代码需要保留 MIT license notice，并处理 Rust/Tauri 到 Node/TypeScript 的语义差异。
