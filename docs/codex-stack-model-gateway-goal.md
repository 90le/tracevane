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

- 独立 Local Gateway daemon，默认由 OS/user service supervisor 托管，例如 Linux `systemd --user` unit `openclaw-studio-model-gateway.service`，macOS launchd user agent，Windows user service / scheduled task。
- Studio API 内嵌启动只用于开发、测试和临时 fallback，不能作为正式 CLI 中转链路的唯一生命周期。
- Studio / OpenClaw 可以负责安装、启动、停止、健康检查、配置下发和 UI 展示，但不能成为模型 relay 的父进程或唯一入口。

### 4.1.1 单口模式、非单口模式和守护存活前提

Studio 需要同时支持两种运行形态：

- **非单口模式**：CLI / AI 工具直接访问 Local Gateway daemon 的 loopback 地址，例如 `http://127.0.0.1:18796/v1`。
- **单口模式**：OpenClaw Gateway 挂载 Studio UI / control API，并可把部分 Gateway control path proxy 到 Studio；但模型 relay 仍由独立 Local Gateway daemon 承担。

设计前提：

- 这个功能的首要目的就是避免 OpenClaw Gateway、Studio API 或 Studio UI 崩溃时把模型中转链路一起带挂。
- 单口模式只解决入口聚合和 UI/control mount，不解决 relay 进程存活；不能把 OpenClaw Gateway 作为模型 relay 的父进程或唯一入口。
- 非单口模式也不能退回到 Studio API 内嵌 relay；否则 Studio 后端崩溃仍会切断 Codex / Claude Code / OpenCode 等客户端请求。
- CLI takeover 必须默认写 daemon loopback endpoint；单口 endpoint 只能作为可选 proxy/ingress，并且必须保留 direct daemon fallback。

硬性目标：

- OpenClaw Gateway 挂掉时，Local Gateway daemon 不能随之退出。
- Studio API / UI 被 OpenClaw 带崩或自身崩溃时，Local Gateway daemon 仍要继续服务 Codex、Claude Code、OpenCode、OpenClaw 和其他 CLI 的模型请求。
- 单口模式只能是 control/UI ingress 和可选 proxy 入口，不能是模型中转的唯一生命线。
- CLI takeover 默认应写入稳定的 daemon loopback endpoint；如果产品需要暴露单口入口，也必须保留 direct daemon fallback。
- daemon 通过 pid/lock/runtime metadata 声明端口归属，避免 Studio API、OpenClaw Gateway 和 daemon 争抢 `18796`。
- health/status 必须区分 `controlPlane`、`openclawMount` 和 `localDaemon`，避免把 UI 或 mount 崩溃误判成模型 relay 已不可用。

方案决策：正式方案应使用独立守护进程 + OS/user service supervisor。自动启动子进程只能作为 bootstrap 便利性，用于检测 service 未安装时启动 detached daemon，并在随后提示或执行 service 安装；它不能替代 systemd/launchd/Windows service 的 restart policy、开机自启和父进程崩溃隔离能力。

推荐启动和托管策略：

1. **正式运行态**：安装 `studio-model-gateway-daemon` 为用户级 service，由当前 OS supervisor 托管。
   - Linux：`systemd --user` unit，配置 `Restart=always`。
   - macOS：launchd user agent，配置 `RunAtLoad` 和 `KeepAlive`。
   - Windows：user scheduled task / service，配置登录启动和失败重启。
2. **Studio / OpenClaw 控制态**：只执行 `ensureDaemonRunning`、配置下发、状态展示、启动/停止/重启命令和 smoke gate。
   - 如果 service 已安装，优先调用 supervisor 的 start/status/restart。
   - 如果 service 未安装，可临时启动 detached daemon 子进程，并立即引导安装用户级 service。
   - detached 子进程必须断开父子生命周期依赖，例如独立进程组、`stdio: ignore`、`unref()`、runtime lock 和 pid metadata；父进程退出不能向 daemon 传播致命退出。
3. **CLI takeover 态**：Codex / Claude Code / OpenCode / OpenClaw 等客户端默认写入 daemon loopback endpoint。
   - 单口 endpoint 只能作为可选 ingress/proxy，不作为默认模型 endpoint。
   - active takeover 必须验证 `localDaemon.runtimeMode === "local-daemon"` 和模型 smoke，通过后才写入客户端配置。

故障场景要求：

| 场景 | 期望结果 |
| --- | --- |
| OpenClaw Gateway 挂掉 | 已接管 CLI 继续通过 daemon loopback 调模型；单口 UI/control ingress 不可用但模型 relay 不受影响 |
| Studio API / UI 崩溃 | daemon 继续服务 `/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages` |
| Studio API 被 OpenClaw mount 带崩 | daemon 不跟随退出；runtime metadata 仍能声明端口归属 |
| daemon 自身崩溃 | OS/user supervisor 自动重启；下一轮 health/status 能报告 restart 后的 runtime metadata |
| service 未安装但用户触发安装/接管 | Studio 可临时启动 detached daemon，但 active takeover 仍应提示补齐正式 service 托管 |

Phase 1 lifecycle contract checkpoint（2026-06-04）：

- `GET /gateway/status` 和 `GET /api/model-gateway/status` 已新增 `lifecycle` contract。
- `lifecycle.controlPlane` 标识当前 Studio API control plane 是否运行以及 embedded fallback 是否接管模型入口。
- `lifecycle.openclawMount` 标识 OpenClaw 单口 mount 是否配置，并明确其角色是 `control-ui-ingress`，`ownsModelRelay: false`。
- `lifecycle.localDaemon` 标识目标 daemon endpoint、service name、期望 supervisor、runtime/pid/lock 路径、当前 state 和是否能在 control plane 崩溃后继续服务。
- `lifecycle.endpointPolicy` 固定 CLI 优先写 daemon loopback endpoint，OpenClaw single-port endpoint 只能作为可选入口，并要求 direct daemon fallback。
- 没有 `daemon-runtime.json` 时 status 会明确返回 `localDaemon.state: "not-installed"` 和 `runtimeMode: "studio-api-embedded"`；有 daemon runtime metadata 且 pid 存活时会显示 `runtimeMode: "local-daemon"` 和 `survivesControlPlaneCrash: true`。

Phase 1 daemon entrypoint checkpoint（2026-06-04）：

- 已新增 `apps/api/modules/model-gateway/daemon.ts`，提供最小 Local Gateway daemon HTTP server。
- daemon 启动后写入 `daemon-runtime.json`、`daemon.pid` 和 `gateway-port.lock`，并在停止时清理这些 runtime 文件。
- daemon 复用现有 Model Gateway route contract，可服务 `GET /gateway/status`、`GET /gateway/providers`、`GET /api/model-gateway/runtime` 和 `/v1/chat/completions` / `/v1/responses` / `/v1/messages` 等 CLI 模型入口。
- 已新增 `apps/api/model-gateway-daemon.ts` 作为可直接执行入口，编译后路径为 `dist/apps/api/model-gateway-daemon.js`，后续 systemd/launchd/Windows service 模板应调用该入口。
- daemon entrypoint 支持 `OPENCLAW_STATE_DIR`、`MODEL_GATEWAY_HOST`、`MODEL_GATEWAY_PORT` 和 `MODEL_GATEWAY_SUPERVISOR`，便于 service template、测试和 bootstrap 指定状态目录与监听端口。
- 已新增 child-process survivability system test：Studio API listener 关闭后，child daemon direct loopback endpoint 仍可服务 `/v1/chat/completions` 并转发到 provider。
- 已新增 OpenClaw single-port/mount fallback system test：`/studio` mount 关闭后，daemon direct loopback endpoint 仍可服务 `/v1/chat/completions`。
- 当前仍未完成真实 OS/user service manager 启停验证、restart policy 验证和 supervisor crash-restart 验证。

Phase 1 supervisor/install contract checkpoint（2026-06-04）：

- 已新增 daemon supervisor plan contract，`GET /api/model-gateway/daemon-service` 可返回当前平台的 selected template、三平台模板清单和 install/start/stop/restart/status 命令计划。
- 已支持生成 Linux `systemd --user` unit、macOS launchd plist 和 Windows scheduled task XML 模板。
- 已新增 `POST /api/model-gateway/daemon-service` 管理入口，支持 `preview`、`install`、`ensure-running`、`start`、`stop`、`restart`、`status` action。
- `install` 支持 `apply: true, runCommands: false` 只写当前平台模板；真实执行 service manager 命令必须显式传 `runCommands: true`。
- 已锁定 `runCommands` 执行 contract：`start`、`restart`、`status` 会按当前平台 selected supervisor 命令执行，并返回每条命令的 `ok`、`exitCode`、`stdout`、`stderr` 和 `error`。
- daemon service response 已新增 `serviceManager` 摘要，解释命令结果为 `checked`、`reachable`、`active`、`enabled` 和 `lastError`，供 UI/安装流直接判断当前平台 service manager 状态。
- `ensure-running` 已锁定 bootstrap contract：已有 service template 时优先运行 supervisor status/start/status；没有 service template 时默认阻断，只有 `apply: true` 且 `allowBootstrap: true` 才允许启动 detached daemon fallback。
- detached bootstrap response 会标记 `bootstrap.mode: "detached"`、`temporary: true`、pid、endpoint 和提示信息；它是临时 fallback，不代表正式 supervisor restart policy 已生效。
- 已新增 `scripts/verify-model-gateway-service-manager.mjs`，用于验证真实当前平台 service manager contract。
- 该脚本默认 probe 模式只做 service template preview、read-only status command 和 `ensure-running` dry-run；只有显式设置 `OPENCLAW_STUDIO_VERIFY_MODEL_GATEWAY_SERVICE_APPLY=1` 才执行 install/start/status/restart。
- 当前 Linux probe 已确认 `systemd --user` 可达，但 `openclaw-studio-model-gateway.service` 尚未安装/启用；`ensure-running` dry-run 返回 blocked，未启动 detached bootstrap。
- 当前仍未完成安装脚本接入、显式 apply 模式下的真实 `systemctl` / `launchctl` / `schtasks` 启停验证和 supervisor crash-restart 验证。

Phase 1 Codex install/takeover preparation checkpoint（2026-06-04）：

- Codex Stack 安装成功后会写入当前平台的 Studio Model Gateway daemon service template。
- 如果 `~/.codex/config.toml` 已存在，安装成功后会写入 inactive `[model_providers.studio]`，指向 `http://127.0.0.1:18796/v1`，`wire_api = "responses"`，`supports_websockets = false`。
- `model_providers.studio.experimental_bearer_token` 使用 `PROXY_MANAGED` placeholder，避免把真实 upstream key 写入 Codex 客户端配置。
- 该准备步骤不会把 top-level `model_provider` 切到 `studio`；active takeover 必须先通过 daemon lifecycle 和模型 smoke gate。

Phase 1 Codex active takeover smoke gate checkpoint（2026-06-04）：

- 已新增 `apply-codex-studio-after-smoke` repair action。
- 接管前必须先请求 daemon `GET /gateway/status`，确认 `lifecycle.localDaemon.runtimeMode === "local-daemon"`；embedded fallback 或单口 mount 状态不能触发 active takeover。
- 接管前必须通过 daemon `/v1/responses` 和 `/v1/responses/compact` smoke，并验证 compact sentinel 被保留。
- 只有 smoke gate 通过后才把 Codex top-level `model_provider` 切到 `studio`，并继续使用 `[model_providers.studio].experimental_bearer_token = "PROXY_MANAGED"`。
- Codex Stack 安装/修复页已读取 `/api/model-gateway/daemon-service`，展示 Studio Gateway daemon runtime、CLI endpoint、service template 和 supervisor status。
- 安装/修复页已新增 Studio Gateway 接管入口，触发 `apply-codex-studio-after-smoke`；按钮只有在 `localDaemon.runtimeMode === "local-daemon"` 且 `state === "running"` 时启用。
- 安装/修复页已新增 Studio Gateway daemon service 操作面板，支持 service template preview、supervisor status command 和 `ensure-running`，默认不会传 `allowBootstrap`，避免 UI 静默启动临时 detached daemon。
- 当前仍未完成真实 service manager start/restart 执行验证、service template apply / explicit temporary bootstrap UI 策略和真实 crash-survivability 测试。

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
- 已落地 `openai_chat_completions` client -> native `openai_responses` provider 的最小非流式 adapter，覆盖 Chat messages、system/developer instructions、tools、tool_choice、tool outputs、Responses output -> Chat response 和 usage 映射。
- Chat streaming -> OpenAI Responses streaming 尚未实现，`stream: true` 仍明确返回 `model_gateway_adapter_required`。
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
   - Local Gateway daemon、Studio control plane、OpenClaw mount 的分层状态。
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
3. 安装或启动独立 Studio Model Gateway daemon / user service。
4. 创建 Studio provider registry。
5. 如果没有 provider，引导用户添加 provider，或写入 disabled placeholder。
6. 写 Codex takeover config，默认指向 daemon loopback endpoint。
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
- native `openai_responses` provider 的 `/v1/chat/completions` 非流式 adapter 已有 system tests 覆盖。
- 未支持的协议组合仍返回 `model_gateway_adapter_required`。
- 已补齐 provider delete、active provider 设置、provider test endpoint、runtime request log 和 provider health 更新。
- `runtime.json` 已记录 gateway request / provider test 的有界日志，status 返回 request log size/latest timestamp。
- status 已暴露 `lifecycle.controlPlane`、`lifecycle.openclawMount`、`lifecycle.localDaemon` 和 `lifecycle.endpointPolicy`，用于后续 UI / install takeover 区分 control plane、single-port mount 和独立 daemon。
- 已新增最小 Local Gateway daemon entrypoint，可写 runtime metadata/pid/port lock，并直接服务 Model Gateway status/provider/runtime 与 CLI 模型入口。
- 已新增 daemon supervisor 模板和管理 API contract，可预览/写入当前平台 service template，并列出 start/stop/restart/status 命令计划。
- 已锁定 daemon service manager 命令执行 contract，可测试 `start`、`restart`、`status` 的 selected supervisor command execution 和结果回传。
- 已新增 daemon service manager status summary，可把 `status runCommands:true` 的原始命令结果解释成 manager reachable、service active/enabled 和失败摘要。
- 已新增安全的真实 service manager 验证脚本 `scripts/verify-model-gateway-service-manager.mjs`：默认只读 probe，不安装、不启动、不重启；显式 env gate 后才执行 apply install/start/status/restart。
- Codex Stack 安装成功后已会写入 daemon service template，并为 Codex 准备 inactive `model_providers.studio`，默认 endpoint 为 daemon loopback。
- Router 已能在 active provider circuit open 时选择同 app scope fallback provider，并在 route decision 中返回 `failoverReason`。
- 尚未完成 service manager apply 模式真实启停验证、安装脚本替换、request retry、完整 failover queue 执行、Codex/Claude protocol adapters。

### Phase 2: Gateway Runtime

- 实现独立 Studio Model Gateway daemon HTTP server。
- 提供 status、chat、responses、messages 基础入口。
- 接入 provider router、timeout、request log。
- 支持 OS/user service supervisor 托管，具备 restart policy、开机/登录启动和父进程崩溃隔离。
- 支持 Studio API 内嵌 fallback，但仅用于开发、测试和 bootstrap。
- 实现端口 lock/pid/runtime metadata，避免与 Studio API / OpenClaw mount 争抢 listener。
- status schema 拆分 `controlPlane`、`openclawMount`、`localDaemon`。

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
- Local Gateway daemon 由 user-level service 托管；OpenClaw Gateway 挂掉或 Studio API/UI 崩溃时，已接管 CLI 仍可通过 daemon loopback endpoint 发起模型请求。
- 单口模式下 OpenClaw mount 只作为 control/UI ingress 或可选 proxy；CLI takeover 不能只依赖单口 mount endpoint，必须保留 direct daemon fallback。
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
- 如果 Gateway 只跟随 Studio UI、Studio API 或 OpenClaw Gateway mount 进程，CLI 会在 UI 关闭、Studio 崩溃或 OpenClaw 挂掉后失效；必须设计独立 daemon + user-level service。
- 如果单口模式把模型 relay 绑定到 OpenClaw mount endpoint，OpenClaw 崩溃仍会切断模型请求；takeover 默认 endpoint 必须指向 daemon loopback，并把单口入口视为可选 proxy。
- 如果控制面继续依赖单机 `HOME` 路径或 `systemd --user`，后续多节点、远程管理和权限审计会被锁死。
- 如果普通读取接口继续返回明文 `api_key`，Model Gateway 会扩大现有配置泄漏风险。
- 直接复制 cc-switch 代码需要保留 MIT license notice，并处理 Rust/Tauri 到 Node/TypeScript 的语义差异。
