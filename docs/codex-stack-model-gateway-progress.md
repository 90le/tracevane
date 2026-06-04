# Codex Stack Model Gateway 进度

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 当前阶段：Phase 1 - provider management、runtime request log、health update、routing fallback foundation、协议互转矩阵 passthrough tests、OpenAI Responses -> Chat 非流式 adapter、Anthropic Messages -> Chat/Responses 非流式 adapters、Codex Responses/compact Chat adapter、文本 SSE streaming、最小 tool-call history foundation 已落地；独立 Local Gateway daemon survivability 目标、status lifecycle contract、最小 daemon entrypoint、supervisor/install API contract、service command execution/status summary contract、`ensure-running` bootstrap contract、Studio API listener shutdown survivability test、OpenClaw single-port/mount fallback test、Codex install 准备接入、active Codex `studio` takeover smoke gate 和首个 UI takeover/status 入口已落地，真实 service 启停、完整 daemon 操作面板和 supervisor crash-restart 验证尚未完成

## 1. 当前决定

- 不做短期 CPA / compact timeout 止血。
- 不继续把 CPA / Gateway / cc-connect 作为模型代理链路。
- Studio 自建 Model Gateway，并由 Studio 持有 provider registry、app takeover、router、failover、diagnostics。
- Studio 支持单口和非单口运行，但模型 relay 的正式生命周期必须属于独立 Local Gateway daemon，而不是 OpenClaw Gateway mount 或 Studio API 进程。
- 正式运行态使用 OS/user service supervisor 托管 daemon；Studio 自动启动 detached 子进程只能作为 bootstrap / dev fallback，不能替代 service restart policy 和父进程崩溃隔离。
- Codex / Claude Code / OpenCode 等 CLI 的默认接管 endpoint 必须是 daemon loopback；OpenClaw 单口 endpoint 只能作为 UI/control ingress 或可选 proxy，不能成为模型 relay 唯一生命线。
- cc-switch 作为架构和实现参考，不作为运行时依赖直接嵌入。
- v1 存储优先使用 Studio state JSON + 原子写 + `0600` secret 文件，避免立即引入新数据库；schema 要保留迁移 SQLite 的空间。
- `cc-connect` 后续只保留为可选 IM / project bridge。
- 一键安装必须支持没有 `~/.openclaw/openclaw.json` 的环境。

## 2. 已完成研究

### 2.1 Studio 当前实现

已确认当前 Codex Stack 是 CPA 中心实现：

- `types/codex-stack.ts:3`：共享类型把 `cpa`、`compact-proxy`、`cc-connect`、`watchdog` 建成组件。
- `apps/api/modules/codex-stack/service.ts:53`：定义 CPA / compact 默认端口、版本、默认模型。
- `apps/api/modules/codex-stack/service.ts:77`：把 CPA、compact proxy、cc-connect systemd unit 纳入服务状态。
- `apps/api/modules/codex-stack/service.ts:141`：安装参数仍围绕 CPA / compact。
- `apps/api/modules/codex-stack/service.ts:154`：repair action 仍围绕 CPA / compact / smoke matrix。
- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh:3`：安装脚本标题就是 `Codex + CPA + Compact Proxy + cc-connect`。
- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh:136`：没有 `openclaw.json` 直接失败。
- `resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs:3`：compact proxy 明确依赖 CPA chat-completions upstream。

结论：要实现最终目标，不能只修 `Compact compaction`。需要从 contract、service、resources、UI 和 tests 层面替换成 Model Gateway。

架构复核补充：

- 长期 Gateway 应拆成 Studio Gateway Control Plane 和 Local Gateway Edge / Node。
- Control Plane 不应依赖 `HOME`、`systemd --user`、`~/.codex/auth.json`、`~/.cc-connect/config.toml`。
- Local Edge 负责本机 listener、adapter、CLI takeover 和 workstation bootstrap。
- 现有 readiness/smoke 语言可以复用，但要升级为 provider/model/protocol 维度。
- 配置读取接口不能返回明文 `api_key`，写配置和 secret 操作必须走 management auth gate。

### 2.2 cc-switch 研究

本次已拉取并阅读上游源码到：

```text
/tmp/cc-switch-src
```

重点研究结果：

- `src-tauri/src/database/schema.rs`
  - provider、endpoint、proxy_config、provider_health 是核心数据面。
  - proxy_config 按 `claude`、`codex`、`gemini` 初始化，包含 auto failover、max retries、streaming timeout、non-streaming timeout、circuit breaker。

- `src-tauri/src/proxy/server.rs`
  - 本地 proxy 使用 Hyper HTTP/1.1。
  - 请求进入时保存原始 header casing，说明 CLI 兼容要重视 wire-level 行为。

- `src-tauri/src/proxy/provider_router.rs`
  - router 根据 app type、current provider、failover queue、circuit breaker 选择 provider。
  - 成功/失败会更新 provider health 和 circuit breaker。

- `src-tauri/src/proxy/forwarder.rs`
  - 请求级 retry / failover / timeout / provider switch。
  - 使用 `PROXY_MANAGED` placeholder 避免客户端配置持有真实 upstream secret。

- `src-tauri/src/proxy/handlers.rs`
  - Claude `/v1/messages`、Codex `/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact` 都是同一个 proxy/router 体系处理。
  - Codex compact 不是单独 CPA shim，而是 provider adapter 的一部分。

- `src-tauri/src/proxy/providers/codex.rs`
  - 根据 provider `api_format` 决定 Codex Responses 是否转换为 Chat Completions。
  - 对 GLM/Zhipu/Z.ai、Qwen/DashScope 等 vendor reasoning 做差异化映射。

- `src-tauri/src/proxy/providers/transform_codex_chat.rs`
  - 实现 Codex Responses -> OpenAI Chat，包括 instructions/input、tools、tool_choice、reasoning、passthrough 字段。

- `src-tauri/src/proxy/providers/streaming_codex_chat.rs`
  - 实现 Chat SSE -> Responses SSE 状态机。

- `src-tauri/src/proxy/codex_chat_history.rs`
  - 解决 Codex `previous_response_id + function_call_output` 与 chat provider 上下文格式不一致的问题。

- `src-tauri/src/proxy/providers/claude.rs`
  - 支持 Anthropic native、OpenAI Chat、OpenAI Responses、Gemini native。
  - auth strategy 和 api format 分离。

- `src-tauri/src/services/proxy.rs`
  - 实现 Claude / Codex live takeover。
  - 启动 proxy 时备份真实配置，把客户端配置改成本地 proxy + placeholder token。
  - 停止或同步时把 live config 的真实 token 回收进 provider store。

- `src/config/codexProviderPresets.ts`
  - provider preset 不只是 URL + key，还包含 apiFormat、modelCatalog、reasoning config 和 Codex TOML 生成。

- `src/config/universalProviderPresets.ts`、`src/components/universal/UniversalProviderPanel.tsx`
  - Universal Provider 可以一次配置并同步 Claude / Codex / Gemini。
  - Studio 应借鉴这种 UI 信息架构，但用 Vue 重写。

- `src-tauri/src/openclaw_config.rs`
  - 缺失 OpenClaw config 时返回默认配置结构，而不是直接失败。
  - 有 JSON5 round-trip、backup 和并发写检测。

### 2.3 cc-connect 本地参考

仓库内也有 `cc-connect-source`，它不是最终模型网关，但已有可借鉴的 provider UI 和迁移能力：

- `resources/codex-stack/cc-connect-source/README.md:163`：Web Admin UI 可管理 providers、sessions、cron jobs。
- `resources/codex-stack/cc-connect-source/README.md:166`：支持 Global Provider Management，并可从 cc-switch config 导入。
- `resources/codex-stack/cc-connect-source/web/src/api/providers.ts:77`：已有 global provider API。
- `resources/codex-stack/cc-connect-source/web/src/api/providers.ts:89`：已有 cc-switch migration API。
- `resources/codex-stack/cc-connect-source/docs/usage.md:136`：支持 runtime provider switching。
- `resources/codex-stack/cc-connect-source/docs/usage.md:202`：已有不同 agent 的 env var mapping。

结论：Studio 可以借鉴 global provider + project/app refs + import flow，但不能把 cc-connect 继续放在模型代理主链路上。

## 3. 目标文档

已新增目标方案文档：

```text
docs/codex-stack-model-gateway-goal.md
```

该文档固定：

- 最终目标链路。
- 旧链路要替换的原因。
- cc-switch 的借鉴模块。
- Studio Model Gateway 的 provider registry、app takeover、adapter、router、UI、安装、阶段计划和验收标准。

## 4. Phase 1 本轮进展

本轮已从文档阶段进入 Phase 1，实现新 Model Gateway 的最小后端 contract：

- 新增 `types/model-gateway.ts`，定义 provider、secret、status、providers response 和 route decision。
- 新增 `apps/api/modules/model-gateway/service.ts`。
  - provider registry 写入 `~/.openclaw/studio/model-gateway/providers.json`。
  - secret store 写入 `~/.openclaw/studio/model-gateway/secrets.json`，使用原子写和 `0600`。
  - provider list 只返回 masked secret，不返回明文 key。
  - route decision 按 app scope 选择 active provider。
  - `/v1/responses` 和 `/v1/responses/compact` 默认走 `codex` scope。
  - `/v1/chat/completions` 默认走 `openclaw` scope，也支持 `x-studio-app-scope` 覆盖。
  - base URL 已带 `/v1` 时不会生成重复 `/v1/v1/...`。
- 新增 `apps/api/modules/model-gateway/routes.ts`。
  - `GET /gateway/status`
  - `GET /gateway/providers`
  - `GET /api/model-gateway/status`
  - `GET/POST/PUT /api/model-gateway/providers`
  - `POST /api/model-gateway/providers/:providerId/secret`
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `POST /v1/responses/compact`
  - `POST /v1/messages`
  - `POST /claude/v1/messages`
- 注册 `modelGateway` service 到 `apps/api/core/context.ts`、`apps/api/index.ts`、`apps/api/server.ts`。
- 新增 `tests/system/model-gateway-service.test.mjs`，锁定：
  - provider secret 分离存储和 masked view。
  - Codex Responses routes 使用 codex app scope。
  - 未支持的 provider/route 组合返回 `adapter-required` contract。
  - OpenAI Chat passthrough 会向 upstream 注入 provider secret。

2026-06-04 后续推进：

- 补齐 provider lifecycle foundation。
  - `DELETE /api/model-gateway/providers/:providerId` 可删除 provider，并清理不再被引用的 secret。
  - `POST /api/model-gateway/active-provider` 可设置或清除 app scope 的 active provider。
  - active provider 需要 enabled 且支持目标 app scope。
- 新增 provider test foundation。
  - `POST /api/model-gateway/providers/:providerId/test` 会根据 provider `apiFormat` 构造最小 Chat / Responses / Anthropic Messages 测试请求。
  - 未实现 adapter 的组合不会假成功，而是返回 `model_gateway_adapter_required`。
  - provider test 会写入 runtime request log，并更新 provider health。
- 新增 runtime store foundation。
  - `~/.openclaw/studio/model-gateway/runtime.json` 保存最近 200 条 gateway request / provider test 日志。
  - runtime log 不记录请求正文或 secret，只记录 provider、route、model、status、latency、outcome、错误摘要。
  - `GET /api/model-gateway/runtime` 返回 runtime view。
  - `GET /api/model-gateway/status` 返回 `runtime.requestLogSize` 和 `runtime.latestRequestAt`。
- 新增 health / circuit foundation。
  - passthrough 和 provider test 成功会更新 `lastSuccessAt`、`lastLatencyMs`，清空连续失败。
  - 失败会更新 `lastFailureAt`、`lastError`、`consecutiveFailures`。
  - 连续 3 次失败会把 provider circuit 置为 `open`。
  - route decision 会避开 open circuit 的 active provider，选择同 scope fallback，并返回 `failoverReason`。
- 新增 Codex Responses -> OpenAI Chat 非流式 adapter 起点。
  - 新增 `apps/api/modules/model-gateway/codex-adapter.ts`，把 Responses `instructions`、`input` / `messages`、function tools、`tool_choice`、`max_output_tokens` 映射到 Chat Completions request。
  - `/v1/responses` 在 `codex` scope 选中 `openai_chat` provider 时，不再直接返回 501，而是转发到 provider 的 `/v1/chat/completions`。
  - Chat upstream 的非流式 JSON 成功响应会转换回 Responses-like JSON，包含 `object: "response"`、`status`、`output_text` 和 usage token 映射。
  - `stream: true` 会保留为 Chat streaming request，并进入 Chat SSE -> Responses SSE adapter。
  - adapter path 会继续写 runtime request log、provider health，并继续屏蔽 secret。
- 新增 Chat SSE -> Responses SSE 文本 streaming foundation。
  - 新增 `apps/api/modules/model-gateway/codex-streaming.ts`。
  - 对 Chat SSE text delta 生成 Responses SSE event sequence：`response.created`、`response.in_progress`、message `response.output_item.added`、`response.content_part.added`、`response.output_text.delta`、done events、`response.completed` 和 `[DONE]`。
  - streaming path 会继续注入 provider secret、写 runtime request log、更新 provider health，并向客户端返回 `text/event-stream`。
  - 当前只覆盖文本 delta 和 usage 映射；streaming tool calls、reasoning events、inline think block 和 provider-specific quirks 仍待后续扩展。
- 新增 Codex `/v1/responses/compact` 最小 adapter contract。
  - `openai_chat` provider 下，compact route 复用 Responses -> Chat adapter，并转发到 provider `/v1/chat/completions`。
  - native `openai_responses` provider 的 compact route 可 passthrough，不再要求协议 adapter。
  - runtime request log 保留独立 `routeId: "openai_responses_compact"`，方便后续诊断 compact 路径。
  - 当前已锁定 compact 非流式请求；compact `stream: true` 会复用同一 SSE adapter，但尚未用 compact-specific streaming 用例单独锁定。
- 新增 Codex tool-call history foundation。
  - 新增 `apps/api/modules/model-gateway/codex-history.ts`。
  - `~/.openclaw/studio/model-gateway/codex-history.json` 使用原子写和 `0600` 保存最近 assistant function_call output items，不写入 secret。
  - Chat upstream 返回 tool calls 时，Gateway 会把转换后的 Responses `function_call` output item 记录到 history store。
  - 后续 Codex 请求只带 `previous_response_id + function_call_output` 时，Gateway 会在转换为 Chat 前恢复缺失的 assistant `tool_calls` 消息，避免 Chat provider 只收到孤立 tool output。
  - 当前只覆盖 function_call / tool_calls 的最小恢复；reasoning_content、custom tools、web search 和 provider-specific thinking 仍待后续扩展。
- 新增协议互转矩阵 passthrough system tests。
  - native `openai_responses` provider 的 `/v1/responses` 和 `/v1/responses/compact` 会原样 forward，注入 bearer secret，写 runtime log 和 provider header。
  - native `anthropic_messages` provider 的 `/v1/messages` 和 `/claude/v1/messages` 会原样 forward，注入 `x-api-key`，保留 `anthropic-version`，写 runtime log 和 provider header。
  - 同一批测试确认未实现的跨协议格子继续返回 `model_gateway_adapter_required`，且不会触发 upstream fetch。
- 新增 `anthropic_messages` -> `openai_chat` 最小非流式 adapter foundation。
  - 新增 `apps/api/modules/model-gateway/anthropic-chat-adapter.ts`。
  - `/v1/chat/completions` 在选中 native `anthropic_messages` provider 时，会转到 provider `/v1/messages`。
  - Chat request 会映射为 Anthropic Messages request，覆盖 system/developer prompt、user/assistant/tool messages、function tools、tool_choice、tool results、`max_tokens`、`temperature`、`top_p` 和 `stop_sequences`。
  - adapter 会注入默认 `anthropic-version: 2023-06-01`，并保留 provider `x-api-key` secret 注入和日志脱敏。
  - Anthropic Messages response 会映射回 Chat Completions response，覆盖 assistant text、tool_use -> tool_calls、finish_reason 和 usage。
  - 当前只覆盖非流式；Chat `stream: true` -> Anthropic streaming 仍返回 `model_gateway_adapter_required`。
- 新增 `anthropic_messages` -> `openai_responses` / compact 最小非流式 adapter foundation。
  - `/v1/responses` 和 `/v1/responses/compact` 在选中 native `anthropic_messages` provider 时，会转到 provider `/v1/messages`。
  - request path 复用 Responses -> Chat -> Anthropic 两段转换，覆盖 `instructions`、`input`、function tools、`tool_choice`、`max_output_tokens` 和 compact route。
  - response path 复用 Anthropic -> Chat -> Responses 两段转换，覆盖 text、tool_use -> Responses `function_call`、usage 和 `codex-history` 记录。
  - runtime log 保留原始 routeId：`openai_responses` 或 `openai_responses_compact`。
  - 当前只覆盖非流式；Responses/compact `stream: true` -> Anthropic streaming 仍返回 `model_gateway_adapter_required`。
- 新增 `openai_responses` -> `openai_chat` 最小非流式 adapter foundation。
  - 新增 `apps/api/modules/model-gateway/responses-chat-adapter.ts`。
  - `/v1/chat/completions` 在选中 native `openai_responses` provider 时，会转到 provider `/v1/responses`。
  - Chat request 会映射为 Responses request，覆盖 system/developer instructions、user/assistant/tool messages、function tools、tool_choice、tool outputs、`max_tokens`、`temperature` 和 `stream: false`。
  - Responses output 会映射回 Chat Completions response，覆盖 text、Responses `function_call` -> Chat `tool_calls`、finish_reason 和 usage。
  - 当前只覆盖非流式；Chat `stream: true` -> Responses streaming 仍返回 `model_gateway_adapter_required`。
- 新增 daemon lifecycle status contract foundation。
  - `types/model-gateway.ts` 新增 `ModelGatewayLifecycleStatus`、daemon runtime metadata、supervisor kind、local daemon state 和 endpoint policy 类型。
  - `GET /gateway/status` 与 `GET /api/model-gateway/status` 现在返回 `lifecycle.controlPlane`、`lifecycle.openclawMount`、`lifecycle.localDaemon` 和 `lifecycle.endpointPolicy`。
  - 没有 daemon runtime metadata 时，status 明确显示 `localDaemon.state: "not-installed"`、`runtimeMode: "studio-api-embedded"`、`survivesControlPlaneCrash: false`。
  - 如果后续 daemon 写入 `daemon-runtime.json` 且 pid 存活，status 可识别为 `localDaemon.state: "running"`、`runtimeMode: "local-daemon"`、`survivesControlPlaneCrash: true`。
  - 新增 system test 锁定 embedded fallback 和 daemon metadata 两种状态，避免 UI/安装流误把单口 mount 当模型 relay owner。
- 新增 Local Gateway daemon entrypoint foundation。
  - 新增 `apps/api/modules/model-gateway/daemon.ts`，提供最小 daemon HTTP server，复用现有 Model Gateway routes。
  - 新增 `apps/api/model-gateway-daemon.ts`，编译后可通过 `node dist/apps/api/model-gateway-daemon.js` 直接启动。
  - daemon entrypoint 支持 `OPENCLAW_STATE_DIR`、`MODEL_GATEWAY_HOST`、`MODEL_GATEWAY_PORT`、`MODEL_GATEWAY_SUPERVISOR`，便于测试和 service/bootstrap 指定状态目录、随机端口和 supervisor metadata。
  - daemon 启动后写 `daemon-runtime.json`、`daemon.pid`、`gateway-port.lock`，停止时清理 runtime metadata。
  - daemon status 会显示 `controlPlane.state: "not-attached"`、`localDaemon.runtimeMode: "local-daemon"`、`survivesControlPlaneCrash: true`。
  - 新增 system test 锁定 daemon 启动、metadata/lock/pid 文件、status 切换和 `/v1/chat/completions` CLI route。
  - 新增 child-process survivability system test：Studio API listener 关闭后，child daemon direct endpoint 仍可服务 `/v1/chat/completions` 并注入 provider secret 转发到 upstream。
  - 新增 OpenClaw single-port/mount fallback system test：`/studio` mount 关闭后，daemon direct endpoint 仍可服务 `/v1/chat/completions`，并保持 mount `ownsModelRelay: false` 与 direct daemon fallback policy。
- 新增 daemon supervisor/install management contract foundation。
  - 新增 `apps/api/modules/model-gateway/supervisor.ts`，生成当前平台 selected template 和 Linux/macOS/Windows 三平台模板清单。
  - Linux 模板为 `systemd --user` unit，调用 `node dist/apps/api/model-gateway-daemon.js`，带 `Restart=always` 和 `OPENCLAW_STATE_DIR`。
  - macOS 模板为 launchd user agent plist，带 `RunAtLoad`、`KeepAlive` 和 `OPENCLAW_STATE_DIR`。
  - Windows 模板为 scheduled task XML，带 logon trigger 和 restart-on-failure policy。
  - 新增 `GET /api/model-gateway/daemon-service` 返回模板、路径、命令计划、安装状态和 lifecycle。
  - 新增 `POST /api/model-gateway/daemon-service` 支持 `preview`、`install`、`ensure-running`、`start`、`stop`、`restart`、`status`；`install` 可 `apply: true, runCommands: false` 只写模板，真实执行 service manager 命令需要显式 `runCommands: true`。
  - 新增 system test 锁定三平台模板、preview 不写文件、install/apply 写当前平台模板、start preview 不执行命令。
  - 新增 service command runner contract，锁定 `start`、`restart`、`status runCommands:true` 会执行当前平台 selected supervisor 命令，并回传每条命令的 stdout/stderr/exit 状态。
  - 新增 `serviceManager` status summary，将 status command results 解释为 `checked`、`reachable`、`active`、`enabled` 和 `lastError`，并覆盖成功/失败摘要测试。
  - 新增 `ensure-running` bootstrap contract：如果 selected service template 已安装，优先运行 supervisor status/start/status；如果 service template 未安装，默认返回 `bootstrap.mode: "blocked"`，只有 `apply: true` 且 `allowBootstrap: true` 才会尝试 detached daemon fallback。
  - detached bootstrap 使用 `spawn(..., { detached: true, stdio: "ignore" })` 和 `unref()`，并返回 `temporary: true`、pid、endpoint、error/notes；测试通过注入 bootstrap runner 验证它只在显式允许时触发。
- 新增 Codex Stack install / takeover preparation foundation。
  - `apps/api/modules/codex-stack/service.ts` 已接入 `createModelGatewayDaemonServicePlan`。
  - Codex Stack install job 成功后会写入当前平台 Studio Model Gateway daemon service template。
  - 如果 `~/.codex/config.toml` 已存在，install job 会准备 inactive `[model_providers.studio]`，指向 `http://127.0.0.1:18796/v1`，`wire_api = "responses"`，`supports_websockets = false`。
  - `model_providers.studio.experimental_bearer_token` 使用 `PROXY_MANAGED` placeholder，不把真实 upstream key 写入 Codex 客户端配置。
  - 当前只准备 inactive provider，不会把 top-level `model_provider` 切到 `studio`；active takeover 仍待 smoke gate / management action。
  - `tests/system/codex-stack-service.test.mjs` 已锁定 install 后 daemon service template 与 inactive Studio provider 写入。
- 新增 active Codex `studio` takeover smoke gate。
  - 新增 `apply-codex-studio-after-smoke` repair action。
  - 接管前先验证 daemon `GET /gateway/status` 返回 `lifecycle.localDaemon.runtimeMode: "local-daemon"`，阻断 Studio API embedded fallback 或 OpenClaw 单口 mount 冒充正式 relay。
  - 接管前继续跑 daemon `/v1/responses` 与 `/v1/responses/compact` smoke，并验证 compact sentinel。
  - smoke 通过后才写 Codex top-level `model_provider = "studio"` 和当前模型，`[model_providers.studio]` 继续使用 daemon loopback endpoint 与 `PROXY_MANAGED` placeholder。
  - 新增 system tests 锁定成功接管和 daemon lifecycle 不满足时拒绝接管。
- 新增 Codex Stack UI takeover/status entrypoint。
  - `apps/web-vue/src/features/codex-stack/api.ts` 已新增 `fetchModelGatewayDaemonService` 和 `manageModelGatewayDaemonService` wrapper。
  - `CodexStackControlPage.vue` 会在 `loadAll` 中读取 `/api/model-gateway/daemon-service`，并把 daemon runtime、CLI endpoint、service template 和 supervisor status 组装成 Studio Gateway preflight rows。
  - `CodexStackRepairBoard.vue` 新增 Studio Gateway 接管按钮并保留 CPA 接管按钮；Studio 按钮只有在 local daemon running 时启用。
  - `CodexStackInstallSection.vue` 已透传 `attach-codex-studio` 事件；ControlPage 触发 `["apply-codex-studio-after-smoke"]` repair job。

当前边界：

- 已有的是 Model Gateway control/API foundation，不是完整长期 edge service。
- 已补入 daemon survivability 目标、status lifecycle contract、最小 daemon entrypoint、supervisor/install API contract、service command execution/status summary contract、`ensure-running` bootstrap contract、Studio API listener shutdown survivability test、OpenClaw single-port/mount fallback test、Codex Stack install 准备接入、active Codex `studio` takeover smoke gate 和首个 UI takeover/status 入口；当前仍缺真实当前平台 service manager 启停验证、完整 daemon 操作面板和 supervisor crash-restart 测试。
- OpenAI Chat passthrough 可用；Codex Responses -> OpenAI Chat 非流式最小适配可用。
- Codex Responses streaming text delta -> Responses SSE 最小适配可用。
- Codex `/v1/responses/compact` -> OpenAI Chat 非流式最小适配可用，且保留独立 runtime route 诊断。
- Codex `previous_response_id` / `function_call_output` 的最小 tool-call history restore 可用。
- native `openai_responses` 和 native `anthropic_messages` passthrough 已有 system tests 锁定。
- native `anthropic_messages` provider 服务 OpenAI Chat Completions 非流式请求的最小 adapter 可用。
- native `anthropic_messages` provider 服务 OpenAI Responses / compact 非流式请求的最小链式 adapter 可用。
- native `openai_responses` provider 服务 OpenAI Chat Completions 非流式请求的最小 adapter 可用。
- Codex compact 专用 prompt shaping、compact-specific streaming 测试、streaming tool calls、streaming reasoning、reasoning history restore、Claude Messages adapter 尚未实现。
- Chat/Responses streaming -> Anthropic Messages streaming、Chat streaming -> OpenAI Responses streaming、OpenAI Responses -> Anthropic Messages adapter 尚未实现。
- provider CRUD 仍缺少 import/export、bulk reorder、preset creation 和 UI form。
- 已有 runtime request log、health update、open-circuit fallback；尚未实现 request retry、真实 failover queue 执行、half-open probe 和 circuit reset policy。
- UI 已有 Studio Gateway daemon status / takeover 首个入口，但尚未完成完整 Provider Center、daemon service 操作面板、安装脚本替换和 CPA/compact 旧资源移除。

协议互转矩阵进度：

最终目标是：用户配置任一 provider 原生协议后，Studio Gateway 都能同时对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions 三种客户端协议面。

| 用户配置的 provider 原生协议 | 典型来源 | 对外 Chat Completions | 对外 Responses / compact | 对外 Anthropic Messages |
| --- | --- | --- | --- | --- |
| `openai_chat` | 第三方模型最常见兼容协议 | 已有 passthrough | Phase 1 foundation：Responses 非流式、文本 SSE、compact 非流式、最小 tool-call history | 未开始 |
| `openai_responses` | Codex 官方 API 原生协议 | Phase 1 foundation：非流式 Chat adapter 已锁定；streaming 仍 adapter-required | passthrough system tests 已锁定，含 compact native passthrough | 未开始，已确认 adapter-required |
| `anthropic_messages` | Claude 官方 API 原生协议 | Phase 1 foundation：非流式 Chat adapter 已锁定；streaming 仍 adapter-required | Phase 1 foundation：非流式 Responses / compact adapter 已锁定；streaming 仍 adapter-required | passthrough system tests 已锁定，含 `/v1/messages` 和 `/claude/v1/messages` |

进度跟踪要求：

- 每完成一个矩阵格子，都要补对应 adapter contract、system test、runtime log/health 行为和文档进度。
- passthrough 也需要保留测试；不能只在 adapter-required contract 中间接证明。
- 未完成格子继续返回 `model_gateway_adapter_required`，避免伪成功。

运行形态 / daemon survivability 跟踪：

- 目标已锁定：单口模式和非单口模式都必须依赖独立 Local Gateway daemon 承担模型 relay，而不是让 OpenClaw Gateway 或 Studio API 成为 relay 的父进程。
- 单口模式只作为 OpenClaw Gateway 挂载 Studio UI/control API 的入口；模型请求应优先写入 daemon loopback endpoint，并保留 direct daemon fallback。
- OpenClaw Gateway 挂掉、Studio API/UI 崩溃或被 OpenClaw 带崩时，daemon 必须继续服务已接管的 Codex、Claude Code、OpenCode、OpenClaw 和其他 CLI。
- 正式方案优先：Linux `systemd --user` service、macOS launchd user agent、Windows user service / scheduled task。detached child process 只允许用于首次 bootstrap、开发和未安装 service 时的临时 fallback。
- 启动策略已定并有后端 contract：Studio / OpenClaw 只做 `ensure-running` 和 service 管理；service 已安装时走 supervisor status/start/status，service 未安装时默认阻断，显式 `allowBootstrap` 后才可临时启动 detached daemon 子进程，并随后引导安装正式用户级 service。
- detached 子进程不是长期方案，当前实现已使用 detached/unref/ignored stdio 并通过 bootstrap response 标注 `temporary: true`；它仍不能承担 crash restart、开机自启或父进程崩溃隔离的正式保证。
- daemon 必须有端口归属 lock/pid/runtime metadata，避免与 Studio API/OpenClaw mount 争抢 `127.0.0.1:18796`。
- status/diagnostics 需要拆分 `controlPlane`、`openclawMount`、`localDaemon`，避免 UI/mount 故障被误报为模型 relay 不可用。
- 当前状态：目标、进度跟踪、shared type、status API contract、daemon entrypoint、supervisor template/API contract、service command execution/status summary contract、`ensure-running` bootstrap contract、Studio API listener shutdown survivability test、OpenClaw single-port/mount fallback test、Codex Stack install 准备接入、active Codex `studio` takeover smoke gate、首个 UI takeover/status 入口和相关静态 UI contract tests 已补齐；真实 supervisor start/restart、完整 UI health 操作面板和 supervisor crash-restart tests 尚未实现。

## 5. 后续任务清单

| 阶段 | 状态 | 任务 |
| --- | --- | --- |
| Phase 0 | 已完成 | 研究、目标方案、进度文档 |
| Phase 1 | 进行中 | 新增 model gateway shared types、store、API、provider lifecycle、runtime log、health fallback、协议互转矩阵跟踪和 native passthrough tests、OpenAI Responses -> Chat 非流式 adapter、Anthropic Messages -> Chat/Responses 非流式 adapters、Codex Responses/compact -> Chat adapter、文本 streaming foundation、tool-call history foundation、独立 daemon survivability 目标跟踪、status lifecycle contract、daemon entrypoint、supervisor/install API contract、service command execution/status summary contract、`ensure-running` bootstrap contract、Studio API listener shutdown survivability test、OpenClaw single-port/mount fallback test、Codex Stack install 准备接入、active Codex `studio` takeover smoke gate 和首个 UI takeover/status 入口；下一步补完整 daemon service 操作面板，再验证真实 service manager start/restart 和 supervisor crash-restart |
| Phase 2 | 未开始 | 实现 Studio Model Gateway runtime，并拆出独立 Local Gateway daemon / user service |
| Phase 3 | 未开始 | 实现完整 Codex Responses / Chat / compact adapter，包括 streaming、compact 和 history restore |
| Phase 4 | 未开始 | 实现 Claude Messages adapter 和 Claude Code takeover |
| Phase 5 | 未开始 | 实现 OpenCode / OpenClaw config 检测、生成、接管 |
| Phase 6 | 未开始 | 重做 codex-stack UI 为 Model Gateway / Provider Center |
| Phase 7 | 未开始 | 移除 CPA / compact 资源和旧 tests，打包新版本 |

## 6. 需优先改造的文件区域

### 后端

- `types/codex-stack.ts`
- `apps/api/modules/codex-stack/service.ts`
- `apps/api/modules/codex-stack/routes.ts`
- `types/model-gateway.ts`（已新增，后续随 adapter/failover 扩展）
- `apps/api/modules/model-gateway/*`（已新增，后续补 supervisor/install/takeover）
- `apps/api/model-gateway-daemon.ts`（已新增最小 daemon entrypoint，后续 service unit 调用）
- `apps/api/modules/model-gateway/supervisor.ts`（已新增三平台 supervisor 模板和命令计划生成）
- `apps/api/modules/codex-stack/service.ts`（已接入 daemon service template 写入和 inactive Codex Studio provider 准备）

### 前端

- `apps/web-vue/src/features/codex-stack/api.ts`
- `apps/web-vue/src/features/codex-stack/CodexStackInstallConfigPanel.vue`
- `apps/web-vue/src/features/codex-stack/*Progress*`
- `apps/web-vue/src/features/codex-stack/*Workspace*`
- `apps/web-vue/src/features/codex-stack/*.css`

### 资源和安装

- `resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh`
- `resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs`
- `resources/codex-stack/codex-docs/resources/cpa-config-templates/*`
- systemd user unit templates

### 测试

- `tests/system/studio-web-codex-stack-workspace.test.mjs`
- `tests/system/codex-stack-service.test.mjs`（已扩展 install job，锁定 daemon service template、inactive `[model_providers.studio]`、active Studio takeover smoke gate 和 lifecycle 不满足时拒绝接管）
- `tests/system/model-gateway-service.test.mjs`（已新增 provider registry / routing contract foundation，并扩展 provider lifecycle / runtime log / health / open-circuit fallback / daemon lifecycle status contract / daemon supervisor template/API contract / service command execution/status summary contract / `ensure-running` supervisor-first 和 detached-bootstrap-gated contract / daemon entrypoint smoke / Studio API listener shutdown survivability / OpenClaw single-port mount fallback / native Responses passthrough / native Anthropic Messages passthrough / OpenAI Responses -> Chat 非流式 adapter / Anthropic Messages -> Chat 非流式 adapter / Anthropic Messages -> Responses 非流式 adapter / Codex Responses 非流式 adapter / text streaming adapter / compact adapter / tool-call history restore）
- 扩展 gateway adapter tests 到 compact streaming、streaming tool calls、streaming reasoning、reasoning history 和 provider quirks。
- 新增 install/takeover tests。

## 7. 验证计划

实现阶段必须逐层验证：

1. **Unit**
   - provider schema normalize。
   - secret masking。
   - URL/path normalization。
   - Codex Responses -> Chat。
   - Chat -> Responses non-streaming。
   - Chat SSE -> Responses SSE。
   - Codex history restore。
   - Claude Messages transforms。
   - router failover decision。

2. **API / Integration**
   - provider CRUD。
   - provider test。
   - app takeover preview/apply/rollback。
   - Gateway status。
   - request log and health update。

3. **Daemon / Service**
   - daemon direct loopback smoke。
   - Studio API down 时 daemon 仍可处理 `/v1/responses` / `/v1/chat/completions`。
   - OpenClaw Gateway/mount down 时 daemon direct endpoint 仍可用。
   - `ensure-running` 优先使用已安装 supervisor；未安装 service 时 detached bootstrap 必须显式允许。
   - service restart policy 生效。
   - port lock 防止 Studio API 与 daemon 双重监听。

4. **System**
   - no `openclaw.json` install path。
   - Codex one-click install。
   - Codex `/v1/responses` smoke。
   - Codex `/v1/responses/compact` smoke。
   - Claude Messages smoke。
   - OpenCode/OpenClaw config generation。
   - failover with mocked timeout / 5xx。

5. **Browser UI**
   - add provider。
   - select active provider。
   - sync universal provider。
   - run app setup。
   - view diagnostics。
   - task execution popup and progress display use Model Gateway states, not CPA states。

## 8. 本轮验证

- `npm run build:api`：通过。
- `npm run typecheck:web`：通过。
- `node --test tests/system/model-gateway-service.test.mjs`：通过，21 个 Model Gateway 用例全绿，新增 `ensure-running` 已安装 service 时 supervisor-first 命令顺序覆盖，以及未安装 service 时 detached bootstrap 必须显式 `allowBootstrap` 的门禁覆盖。
- `node --test tests/system/codex-stack-service.test.mjs`：上一轮通过，71 个 Codex Stack 用例全绿，覆盖 active Studio takeover smoke gate 成功/拒绝路径；本轮未改 Codex Stack service，未重复跑。
- `node --test --test-name-pattern "repair board|attach action" tests/system/studio-web-codex-stack-workspace.test.mjs`：通过，2 个相关静态 UI contract 用例全绿，覆盖 RepairBoard / InstallSection / ControlPage 的 Studio Gateway status 和 takeover 事件链。
- `node --test tests/system/studio-web-codex-stack-workspace.test.mjs`：未全绿，36/52 通过，16 个失败为当前工作树已有前端 design/static contract 债务，首个失败为 Codex Stack feature CSS raw color token contract；本轮相关 `repair board|attach action` 子集已单独通过。
- 上一轮 `npm run test:system` 未全绿。新增 gateway 用例通过；失败集中在当前工作树已有的 codex-stack job 超时和多项前端/UI design contract，完整复核日志为 `/tmp/openclaw-studio-system-after-model-gateway.log`。本轮未重复跑全量 system suite。

## 9. 风险和待定项

- **Gateway 生命周期**：仅运行在 Studio API 进程会导致 CLI 在 UI 关闭、Studio 崩溃或 OpenClaw Gateway 挂掉时不可用；需要独立 Local Gateway daemon + user-level service supervisor。
- **单口模式耦合**：OpenClaw Gateway mount 只能作为 control/UI ingress。如果 CLI takeover 只写单口 mount endpoint，OpenClaw 崩溃仍会切断模型请求；默认 takeover 应写 daemon loopback endpoint，并把 mount 当可选 proxy。
- **控制面边界**：Control Plane 不能绑定单机 `HOME` 和 systemd；这些只能留在 Local Edge。
- **Secret 存储**：v1 文件存储必须用 `0600`、masked API 和日志脱敏；后续可评估 OS keychain。
- **管理授权**：所有 secret、takeover、rollback、service 操作必须经过 management auth gate。
- **Codex streaming**：已有文本 delta 最小状态机；tool-call streaming、reasoning streaming、inline think block 和 provider-specific event quirks 仍需补齐。
- **Tool history**：已有最小 function_call history store；reasoning_content、custom tools、web search 和跨进程并发策略仍未完整覆盖。
- **Claude official auth**：official account、Anthropic API key、OpenRouter、OpenAI-compatible key 不能混用。
- **License**：若复制 cc-switch 代码，需要保留 MIT license notice。
- **旧 UI 迁移**：现有 codex-stack 前端已大量绑定 CPA/compact 文案和状态，不能只替换标题。
- **测试规模**：替换链路后需要 mock upstream 和真实 browser smoke 双层验证。

## 10. 下一步

下一轮继续 Phase 1：

1. 扩展 Codex Stack UI daemon service 操作面板：提供 `ensure-running` / install preview / status command 入口，并清楚区分 supervisor 和 detached bootstrap。
2. 在已有 service command execution contract 上验证真实 service manager start/restart：Linux `systemd --user`、macOS launchd、Windows scheduled task 至少先锁定当前平台的 install/start/status/restart happy path 和失败日志。
3. 扩展 crash/restart survivability tests：daemon 进程崩溃后由真实 supervisor 拉起，并确认 direct endpoint 恢复服务 `/v1/responses` / `/v1/chat/completions`。
4. 扩展 Chat SSE -> Responses SSE：streaming tool calls、reasoning events、inline think block、compact-specific streaming case 和 finish_reason 细节。
5. 扩展 Codex history：reasoning_content、custom tools、web search、ambiguous call_id fallback 和 provider-specific thinking quirks。
6. 扩展 Anthropic adapter：Chat/Responses streaming、image/file parts、response_format、provider-specific thinking / tool edge cases。
7. 启动下一格协议 adapter：`openai_responses` -> `anthropic_messages`，让 Codex 官方 API provider 服务 Claude Messages clients。
