# Codex Stack Model Gateway 进度

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 当前阶段：Phase 1 - provider management、runtime request log、health update、routing fallback foundation、Codex Responses Chat adapter、文本 SSE streaming 和最小 tool-call history foundation 已落地

## 1. 当前决定

- 不做短期 CPA / compact timeout 止血。
- 不继续把 CPA / Gateway / cc-connect 作为模型代理链路。
- Studio 自建 Model Gateway，并由 Studio 持有 provider registry、app takeover、router、failover、diagnostics。
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
  - Codex Responses / compact 使用 codex app scope，并在缺少 adapter 时返回 `adapter-required` contract。
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
  - `stream: true` 会保留为 Chat streaming request，并进入 Chat SSE -> Responses SSE adapter；`/v1/responses/compact` 仍保持 adapter-required contract。
  - adapter path 会继续写 runtime request log、provider health，并继续屏蔽 secret。
- 新增 Chat SSE -> Responses SSE 文本 streaming foundation。
  - 新增 `apps/api/modules/model-gateway/codex-streaming.ts`。
  - 对 Chat SSE text delta 生成 Responses SSE event sequence：`response.created`、`response.in_progress`、message `response.output_item.added`、`response.content_part.added`、`response.output_text.delta`、done events、`response.completed` 和 `[DONE]`。
  - streaming path 会继续注入 provider secret、写 runtime request log、更新 provider health，并向客户端返回 `text/event-stream`。
  - 当前只覆盖文本 delta 和 usage 映射；streaming tool calls、reasoning events、inline think block 和 provider-specific quirks 仍待后续扩展。
- 新增 Codex tool-call history foundation。
  - 新增 `apps/api/modules/model-gateway/codex-history.ts`。
  - `~/.openclaw/studio/model-gateway/codex-history.json` 使用原子写和 `0600` 保存最近 assistant function_call output items，不写入 secret。
  - Chat upstream 返回 tool calls 时，Gateway 会把转换后的 Responses `function_call` output item 记录到 history store。
  - 后续 Codex 请求只带 `previous_response_id + function_call_output` 时，Gateway 会在转换为 Chat 前恢复缺失的 assistant `tool_calls` 消息，避免 Chat provider 只收到孤立 tool output。
  - 当前只覆盖 function_call / tool_calls 的最小恢复；reasoning_content、custom tools、web search 和 provider-specific thinking 仍待后续扩展。

当前边界：

- 已有的是 Model Gateway control/API foundation，不是完整长期 edge service。
- OpenAI Chat passthrough 可用；Codex Responses -> OpenAI Chat 非流式最小适配可用。
- Codex Responses streaming text delta -> Responses SSE 最小适配可用。
- Codex `previous_response_id` / `function_call_output` 的最小 tool-call history restore 可用。
- Codex streaming tool calls、streaming reasoning、`/v1/responses/compact`、reasoning history restore、Claude Messages adapter 尚未实现。
- provider CRUD 仍缺少 import/export、bulk reorder、preset creation 和 UI form。
- 已有 runtime request log、health update、open-circuit fallback；尚未实现 request retry、真实 failover queue 执行、half-open probe 和 circuit reset policy。
- 尚未改 UI、安装脚本、Codex takeover 或 CPA/compact 旧资源。

## 5. 后续任务清单

| 阶段 | 状态 | 任务 |
| --- | --- | --- |
| Phase 0 | 已完成 | 研究、目标方案、进度文档 |
| Phase 1 | 进行中 | 新增 model gateway shared types、store、API、provider lifecycle、runtime log、health fallback、Codex Responses -> Chat adapter、文本 streaming foundation 和 tool-call history foundation；下一步扩 compact 或进入 install/UI takeover contract |
| Phase 2 | 未开始 | 实现 Studio Model Gateway runtime |
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
- `apps/api/modules/model-gateway/*`（已新增，后续补 runtime/test/takeover）

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
- `tests/system/model-gateway-service.test.mjs`（已新增 provider registry / routing contract foundation，并扩展 provider lifecycle / runtime log / health / open-circuit fallback / Codex Responses 非流式 adapter / text streaming adapter / tool-call history restore）
- 扩展 gateway adapter tests 到 compact、streaming tool calls、streaming reasoning、reasoning history 和 provider quirks。
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

3. **System**
   - no `openclaw.json` install path。
   - Codex one-click install。
   - Codex `/v1/responses` smoke。
   - Codex `/v1/responses/compact` smoke。
   - Claude Messages smoke。
   - OpenCode/OpenClaw config generation。
   - failover with mocked timeout / 5xx。

4. **Browser UI**
   - add provider。
   - select active provider。
   - sync universal provider。
   - run app setup。
   - view diagnostics。
   - task execution popup and progress display use Model Gateway states, not CPA states。

## 8. 本轮验证

- `npm run build:api`：通过。
- `node --test tests/system/model-gateway-service.test.mjs`：通过，7 个 Model Gateway 用例全绿。
- 上一轮 `npm run test:system` 未全绿。新增 gateway 用例通过；失败集中在当前工作树已有的 codex-stack job 超时和多项前端/UI design contract，完整复核日志为 `/tmp/openclaw-studio-system-after-model-gateway.log`。本轮未重复跑全量 system suite。

## 9. 风险和待定项

- **Gateway 生命周期**：仅运行在 Studio API 进程会导致 CLI 在 UI 关闭后不可用；需要 user-level service。
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

1. 给 `/v1/responses/compact` 设计最小 adapter contract，并决定是否复用 text streaming / history path。
2. 扩展 Chat SSE -> Responses SSE：streaming tool calls、reasoning events、inline think block 和 finish_reason 细节。
3. 扩展 Codex history：reasoning_content、custom tools、web search、ambiguous call_id fallback 和 provider-specific thinking quirks。
4. 继续补 failover：把 open-circuit fallback 从 route decision 扩展到实际 request retry / failover 执行。
3. 扩展 Codex history：reasoning_content、custom tools、web search、ambiguous call_id fallback 和 provider-specific thinking quirks。
4. 继续补 failover：把 open-circuit fallback 从 route decision 扩展到实际 request retry / failover 执行。
