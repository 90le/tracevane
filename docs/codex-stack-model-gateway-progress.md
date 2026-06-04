# Codex Stack Model Gateway 进度

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 当前阶段：Phase 1 - shared contract、provider store、secret store、API routes 和 routing contract foundation 已落地

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

当前边界：

- 已有的是 Model Gateway control/API foundation，不是完整长期 edge service。
- OpenAI Chat passthrough 可用；Codex Responses、compact、Claude Messages adapter 尚未实现。
- provider CRUD 仍缺少 delete、active-provider 独立 endpoint、provider test 和导入能力。
- 尚未接入 runtime request log、health update、failover queue、circuit breaker。
- 尚未改 UI、安装脚本、Codex takeover 或 CPA/compact 旧资源。

## 5. 后续任务清单

| 阶段 | 状态 | 任务 |
| --- | --- | --- |
| Phase 0 | 已完成 | 研究、目标方案、进度文档 |
| Phase 1 | 进行中 | 新增 model gateway shared types、store、API；下一步补 provider management/test/runtime log |
| Phase 2 | 未开始 | 实现 Studio Model Gateway runtime |
| Phase 3 | 未开始 | 实现 Codex Responses / Chat / compact adapter |
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
- `tests/system/model-gateway-service.test.mjs`（已新增 provider registry / routing contract foundation）
- 新增 gateway adapter tests。
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
- `node --test tests/system/model-gateway-service.test.mjs`：通过，3 个新增用例全绿。
- `npm run test:system`：未全绿。新增 gateway 用例通过；失败集中在当前工作树已有的 codex-stack job 超时和多项前端/UI design contract，完整复核日志为 `/tmp/openclaw-studio-system-after-model-gateway.log`。

## 9. 风险和待定项

- **Gateway 生命周期**：仅运行在 Studio API 进程会导致 CLI 在 UI 关闭后不可用；需要 user-level service。
- **控制面边界**：Control Plane 不能绑定单机 `HOME` 和 systemd；这些只能留在 Local Edge。
- **Secret 存储**：v1 文件存储必须用 `0600`、masked API 和日志脱敏；后续可评估 OS keychain。
- **管理授权**：所有 secret、takeover、rollback、service 操作必须经过 management auth gate。
- **Codex streaming**：SSE event sequence 必须贴近 Codex client 预期，不能只做 JSON 转换。
- **Tool history**：没有 Codex chat history store 时，tool result 会在 chat provider 上下文中丢失来源。
- **Claude official auth**：official account、Anthropic API key、OpenRouter、OpenAI-compatible key 不能混用。
- **License**：若复制 cc-switch 代码，需要保留 MIT license notice。
- **旧 UI 迁移**：现有 codex-stack 前端已大量绑定 CPA/compact 文案和状态，不能只替换标题。
- **测试规模**：替换链路后需要 mock upstream 和真实 browser smoke 双层验证。

## 10. 下一步

下一轮继续 Phase 1：

1. 补齐 provider management API：delete、set-active-provider、provider validation/test endpoint。
2. 新增 runtime store / request log / health update，把 passthrough 成功失败写入 provider health。
3. 为 routing contract 增加 failover queue / retry decision 的纯函数测试。
4. 进入 Codex adapter 起点：实现 Responses -> Chat non-streaming 最小转换，让 `/v1/responses` 不再只返回 `adapter-required`。
