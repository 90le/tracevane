# Studio Gateway 目标方案

> 状态：Phase C deletion completed; Phase B core matrix completed; Phase D provider routing/model catalog/active-route smoke MVP added; Phase E app connection profile/rollback/isolated apply acceptance completed; Phase B2 CLI/Gateway/live smoke harness added; Phase G docs renamed; Claude tool/summary and OpenClaw agent CLI smoke passed; Responses->Chat streaming usage、provider-declared reasoning/thinking、parallel tool-call、SSE failed 和 started-stream error envelope behavior aligned; BigModel Chat/Anthropic live maturity passed; GMN Responses-native substitute live proof passed; OpenAI Platform vendor proof optional
> 更新：2026-06-07
> 文档规则：本文件只保留目标、边界、验收和阶段计划；进度写到 `studio-gateway-progress.md`。旧 `codex-stack-model-gateway-*` 文档名已停止使用。

## 1. 最终目标

`Codex Stack` 作为旧功能面终止演进。当前正式目标是 **Studio Gateway** 管理页和后端逻辑，用通用模型网关接入 Codex、Claude / Claude Code、OpenCode、OpenClaw 以及其他 CLI / AI 工具。

```text
旧目标：Codex Stack -> CPA / Compact / cc-connect 混合链路
新目标：Clients -> Studio Gateway daemon -> provider router -> upstream
```

硬性前提：

- 删除生产代码里的 `/api/codex-stack/*` 后端模块、`features/codex-stack` 前端页面和旧安装/修复/路由模型 UI。
- 不再以 CPA `18795`、Compact Proxy `18796` 或 CPA Gateway 作为正式链路；`18796` 只可作为 Studio Gateway daemon 默认本地端口。
- `cc-connect` / CC / Octo(dmwork) 不属于模型 relay，也不放入 App Connections；它们属于独立的渠道接入域。

## 2. 协议目标

Studio Gateway 必须让任意 provider 无论原生协议是什么，都能对外暴露三类常见客户端协议：

| Provider 原生协议 | 典型来源 | Studio Gateway 对外协议 |
| --- | --- | --- |
| Anthropic Messages | Claude 官方 API / Claude Code | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Responses API | Codex 官方 API | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Chat Completions | 第三方模型最常见兼容协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |

规则：

- 原生协议和客户端协议一致时 passthrough。
- 不一致时走 adapter。
- 未实现组合必须返回明确错误，不能伪成功。
- Provider `baseUrl` 是上游 API 前缀，不隐式追加 `/v1`；版本号由用户填入 `baseUrl` 或由 provider `endpoints` override 明确给出。
- 所有协议格子需要测试覆盖：非流式、流式、tool/history、compact 语义。
- Claude Code / Claude CLI 必须能通过 `/v1/messages` 完成普通对话、流式对话和压缩/summary 类请求。
- Codex 必须能通过 `/v1/responses` 与 `/v1/responses/compact` 完成普通对话、流式对话和 compact 链路。
- OpenAI Responses-native provider 必须按原生 `/v1/responses` 与 `/v1/responses/compact` 验收；MLAMP 这类 dual-compatible base 不作为 compact 原生能力证明。

Provider / model routing 目标：

- Provider 可新增多个，并支持启用、停用、删除；停用 provider 不参与 active routing、模型目录和自动 failover。
- Active routing 按 App scope 选择 provider：Codex、Claude Code、OpenCode、OpenClaw 可各自固定 provider，也可保持 Auto 按启用 provider 和健康状态选择。
- Studio Gateway 对外提供统一模型目录，例如 `GET /v1/models`，聚合所有已启用 provider 的模型；模型 ID 必须能映射回 provider，可支持显示名、别名和能力标记（文字、图片、工具、推理、Responses、流式），并允许 App Connections / Channel Connectors 依据能力选择模型。
- 客户端只配置 daemon endpoint 和一个本地 Gateway key；真实 upstream key 留在 Studio secret store。Gateway key 必须可由用户编辑或生成；设置并启用后，`/v1/models` 和三类客户端协议端点都必须校验该 key，且不会把本地 key 透传上游。
- 不同 provider 暴露同名 model ID 是合法模型池：优先 active routing 所属 provider；Auto 按 provider priority 和健康状态选择；open circuit 自动切换到下一个同名模型 provider；也支持 `provider/model` 或 alias 显式选择。
- 同一个 provider 内不允许重复 model ID 或重复 alias，重复判定大小写不敏感，保存时必须拒绝。

成熟度门槛：

- 不能只靠 mocked route test 宣称完成；必须有真实 provider smoke 和真实 CLI smoke。
- Anthropic-compatible、OpenAI Chat-compatible、OpenAI Responses-native provider 都必须有真实 provider smoke；OpenAI 官方 Platform 只作为额外 vendor proof。
- 对齐 `/tmp/cc-switch-src` 的协议转换成熟度：SSE 状态机、tool/history、usage/cache、error envelope、provider-declared reasoning/thinking 映射、并发 tool call 和增量参数。
- 任意 provider 暴露三类客户端协议时，严格客户端不能收到畸形事件、空 usage 对象、裸 upstream 错误或丢失 tool/session 连续性。

参考源码与 live smoke：

- 本地参考源码：`/tmp/cc-switch-src`，重点参考协议转换、SSE 重建、tool/history 和 usage 映射，不迁移旧 UI。
- BigModel Chat Completions smoke base：`https://open.bigmodel.cn/api/coding/paas/v4`，已覆盖 Responses basic/stream/tool-call/tool-history/error-envelope。
- BigModel Anthropic smoke base：`https://open.bigmodel.cn/api/anthropic`，该 provider 需 endpoint override 到 `/v1/messages`，已覆盖 Messages basic/stream/tool-use/error-envelope。
- MLAMP OpenAI-compatible smoke base：`https://llm-gateway.mlamp.cn/v1`，model `gpt-5`；该 base 只保留为历史/可选参考，不作为当前 OpenAI 官方 compact 验收门槛。
- GMN Responses-native substitute smoke base：`https://gmn.chuangzuoli.com/v1`，model `gpt-5.4`；已替代 OpenAI 官方原生端点验证 `/v1/responses`、stream、`/v1/responses/compact` 与 error envelope，但不等同于 OpenAI Platform vendor proof。
- OpenAI Platform official smoke：降为可选 vendor proof；如仍需官方平台证明，后续用真实 Platform base/key 单独验证；凭据不得写入文档、测试 fixture 或 git。

## 3. 生命周期目标

正式模型 relay 只能依赖独立 Local Gateway daemon。

- 非单口模式：CLI 直接访问 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- 单口模式：OpenClaw 只挂载 Studio UI / control API；模型请求默认仍写 daemon loopback，单口 endpoint 只作为可选 ingress/proxy。
- OpenClaw Gateway、Studio API 或 Studio UI 崩溃时，daemon 继续服务已接管客户端。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 托管：Linux `systemd --user`、macOS launchd、Windows scheduled task/service。
- 新设备首次安装必须能通过 Studio 写入 user service、启用系统自启动、启动 daemon，并支持后续 status、start、stop、restart、ensure-running；已安装时“安装/启用”按重装/重新启用处理。
- `start`、`restart`、`ensure-running` 不能只看 supervisor active；必须等 daemon HTTP status endpoint ready 后才算真正 started。

## 4. 渠道接入边界

渠道接入是独立产品域，不复用 Codex Stack，也不塞进 Studio Gateway。

```text
飞书 / 微信 / Octo(dmwork) / IM -> Studio native Channel daemon -> local CLI Agent bot -> Studio Gateway
```

- Channel Connectors 改为 Studio 原生实现，不上线短期托管 cc-connect 方案；CC 二开源码已有功能都必须纳入 Studio 原生目标，首批平台只是实施顺序。
- Channel Connectors 使用独立 Studio 配置/secret/state，不写入 `openclaw.json`、OpenClaw channels 或 OpenClaw bindings。
- Channel daemon 必须常驻守护；Studio / OpenClaw 崩溃时仍保持渠道服务和 Codex/Gateway 对话链路，不内置额外修复流程。
- Channel / Agent 任意新功能实现前必须先定位 CC Go 对应实现，按平台协议、消息语义、交互菜单、错误处理、长连接和状态流做 1:1 contract 迁移，再做 Studio 化精修；禁止在已有成熟设计时重新盲目设计。
- Channel daemon 的平台长连接必须以 CC Go 成熟实现为基线迁移；Octo(dmwork) 默认 30s heartbeat、10s PONG timeout、RECVACK、5 分钟 messageId 去重和 `3s + 0..3s` 抖动重连，Feishu 采用同 App 共享长连接后扇出事件。
- 原生 contract 统一 incoming、reply、attachment、voice、thread、ack/retry、allowlist、admin、rate limit、banned words、slash command、cron、hooks、relay、session key 和 bot->Agent binding。
- 优先 Octo(dmwork)，再飞书、微信/企业微信；后续覆盖 CC 已有平台，包括钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE 等。
- 参考源：CC 二开全量源码 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`，其中 `platform/dmwork` 即 Octo；OpenClaw 频道实现作为账号/绑定/运行态参考；生产实现不依赖 cc-connect binary，也不得恢复旧 `resources/codex-stack` 生产路径。

## 5. 新架构边界

| 模块 | 职责 |
| --- | --- |
| Studio Gateway Core | provider registry、secret store、active route、health、request log、adapter registry |
| Studio Gateway daemon | loopback HTTP listener、协议 adapter、provider router、runtime metadata、supervisor contract |
| Gateway Service & Config | daemon 安装/启用自启动/启动/停止/重启/状态、用户自定义 provider 配置、provider 启停、协议/模型自动识别弹层、secret 写入、聚合模型目录、模型别名、默认模型、模型能力标记、active provider、resolved route 状态、provider-native smoke、client-protocol active-route smoke |
| App Connections | Codex、Claude Code、OpenCode、OpenClaw 的配置检测、脱敏 preview、确认后 apply、备份/rollback、默认模型与 App 级模型覆盖、上下文/compact/max output/reasoning profile；Codex 低频兼容参数收进高级折叠 |
| Channel Connectors | Studio 原生 Channel daemon、typed config store、Agent Profile、workDir/model/permission/Gateway key ref、platform/bot->Agent 绑定、CC 全功能原生化、Octo(dmwork)、飞书、微信等 IM 渠道事件接入、会话映射、治理、自动化和消息路由 |
| Gateway UI | Runtime/Gateway key/Active routing 左侧常驻，右侧用 tabs 分开 App Connections、Provider Center、Smoke；参考旧 CPA 管理页的运行态布局和 cc-switch 的 provider 表单，但不内置具体 vendor 预设，也不复用旧 Codex Stack / CPA / Compact 文案、诊断矩阵、安装修复复杂度；Provider 原生协议只展示三类常见协议 |

## 6. 删除范围

需要删除或迁移后删除：

- 前端：`apps/web-vue/src/features/codex-stack/**`，包括状态页高级诊断、运行矩阵、运行模式、技术检查、安装修复、路由模型、日志子页和所有 CPA/Compact 说明。
- 后端：`apps/api/modules/codex-stack/**`、`/api/codex-stack/*` routes、Codex Stack summary/profile/job/service schema。
- 资源：`resources/codex-stack/**` 中旧 installer、CPA/Compact 模板、health/smoke 脚本。
- 测试：旧 `codex-stack-*` 测试改为 Studio Gateway / App Connections 测试；不得再用 CPA/Compact 成功路径验收。
- 文档：正式入口为 `studio-gateway-goal.md` 与 `studio-gateway-progress.md`；旧 `codex-stack-model-gateway-*` 文档名不再使用。

## 7. 新功能验收

- Studio Gateway daemon 支持并测试通过：
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/responses/compact`
  - `/v1/messages`
  - streaming 变体
- Provider registry 支持 Anthropic Messages、OpenAI Responses、OpenAI Chat Completions 三类原生 provider。
- `GET /v1/models` 返回已启用 provider 的聚合模型目录；一个本地 Gateway key 可用于所有授权模型，且不会暴露 upstream key。
- Active routing 可把 provider 应用到 Codex、Claude Code、OpenCode、OpenClaw；停用 provider 不可被选中，已被选中的 provider 停用后必须回退或提示；每个 active route 必须显示 resolved provider/model，并能验证实际 Gateway 客户端协议入口。
- Codex、Claude Code、OpenCode、OpenClaw 可通过 App Connections 生成脱敏配置 preview，并在用户确认后 apply；apply 前必须有本地 Gateway key 和可用 provider 模型，写入前备份原文件，且支持 rollback。
- App Connections 支持一键切换 app profile：默认模型、每个 App 单独模型覆盖、上下文窗口、compact 阈值、max output、reasoning/effort、必要兼容参数；模型选择必须来自 Gateway 可用模型列表并允许手动输入兼容 alias。
- Channel Connectors 原生配置 Octo(dmwork) / 飞书 / 微信等 IM 渠道；消息进入本地 CLI Agent bot，再由 Studio Gateway 调模型。
- Channel Connectors 遇到图片/视频/贴纸等视觉附件时，必须优先使用 Gateway 模型能力：当前模型支持 vision 则保持不变；当前模型不支持且模型池存在 vision 模型时，仅本轮切换到 vision 模型；没有 vision 模型时继续受控对话并禁止视觉推断。
- Channel Connectors 发布前必须覆盖 CC 二开源码的核心能力：多平台、多 Agent、文本/图片/文件/语音、群聊 mention、会话续接/切换、allowlist/admin/rate limit、slash command、cron、hooks、relay、management/status/logs。
- 客户端配置只保存 placeholder 或 local endpoint；真实 upstream key 留在 Studio secret store。
- OpenClaw/Studio 崩溃隔离测试通过：daemon direct endpoint 继续可用。
- 生产前后端无 `codex-stack` 命名入口，无 CPA/Compact 用户可见链路。

## 8. 阶段计划

| 阶段 | 目标 |
| --- | --- |
| Phase A | 固定 Studio Gateway 命名、API contract、迁移删除清单 |
| Phase B | 补齐核心协议矩阵 adapter 与测试，确保 Studio Gateway daemon routes 全部通过（核心已完成） |
| Phase B2 | 按 cc-switch 成熟度补齐真实 SSE / tool / history / usage / reasoning 行为；strict smoke 已覆盖真实 CLI 启动、Claude tool/summary、OpenClaw agent local provider/model/usage、Gateway HTTP compact/tool-history/error-envelope probes、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 参数映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started Responses/Anthropic upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix、GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof |
| Phase C | 删除 Codex Stack 前后端、资源和旧测试入口（已完成） |
| Phase D | 先新建 Studio Gateway 服务与配置面：daemon 状态/启停、provider 配置、provider 启停、active routing、resolved route 状态、聚合 `/v1/models`、模型池/别名/优先级、模型能力勾选、可编辑统一 Gateway key、协议/模型自动识别、secret、模型列表/默认模型、provider-native smoke、client-protocol active-route smoke；UI 借鉴旧 CPA 的运维入口和 cc-switch 的 Provider 管理体验，检测入口贴近 Base URL / API Key，daemon Runtime 只暴露主操作并把低频运维动作收进更多菜单，启停动作以 HTTP readiness 为最终成功条件 |
| Phase E | Codex、Claude Code、OpenCode、OpenClaw 配置 preview/apply/profile/rollback 与隔离 HOME HTTP 验收已完成；继续做真实 CLI 启动 smoke 和细节兼容 |
| Phase F | Channel Connectors 原生 daemon 与 CLI Agent Bot：CC 全功能映射、Octo(dmwork)、飞书、微信、多 Agent、消息/治理/自动化 contract、Gateway 模型能力路由与管理面 |
| Phase G | Studio Gateway 文档已切到正式文件名；Channel Connectors 原生方案文档已建立 |
