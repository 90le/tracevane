# Studio Gateway 目标方案

> 状态：Phase C deletion completed; Phase B core matrix completed; Phase B2 maturity hardening in progress
> 更新：2026-06-05
> 文档规则：本文件只保留目标、边界、验收和阶段计划；进度写到 `codex-stack-model-gateway-progress.md`。文件名暂时保留为迁移入口，正文不再把 Codex Stack 当新产品名。

## 1. 最终目标

`Codex Stack` 作为旧功能面终止演进。后续新建 **Studio Gateway** 管理页和后端逻辑，用通用模型网关接入 Codex、Claude / Claude Code、OpenCode、OpenClaw 以及其他 CLI / AI 工具。

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

成熟度门槛：

- 不能只靠 mocked route test 宣称完成；必须有真实 provider smoke 和真实 CLI smoke。
- Anthropic-compatible、OpenAI Chat-compatible、OpenAI Responses-native provider 都必须有真实 provider smoke；OpenAI 官方 Platform 只作为额外 vendor proof。
- 对齐 `/tmp/cc-switch-src` 的协议转换成熟度：SSE 状态机、tool/history、usage/cache、error envelope、reasoning/thinking、并发 tool call 和增量参数。
- 任意 provider 暴露三类客户端协议时，严格客户端不能收到畸形事件、空 usage 对象、裸 upstream 错误或丢失 tool/session 连续性。

参考源码与 live smoke：

- 本地参考源码：`/tmp/cc-switch-src`，重点参考协议转换、SSE 重建、tool/history 和 usage 映射，不迁移旧 UI。
- BigModel Chat Completions smoke base：`https://open.bigmodel.cn/api/coding/paas/v4`
- BigModel Anthropic smoke base：`https://open.bigmodel.cn/api/anthropic`，该 provider 需 endpoint override 到 `/v1/messages`。
- MLAMP OpenAI-compatible smoke base：`https://llm-gateway.mlamp.cn/v1`，model `gpt-5`；该 base 只保留为历史/可选参考，不作为当前 OpenAI 官方 compact 验收门槛。
- GMN Responses-native substitute smoke base：`https://gmn.chuangzuoli.com/v1`，优先 model `gpt-5.4`；可用于替代 OpenAI 官方原生端点验证 `/v1/responses` 与 `/v1/responses/compact`，但不等同于 OpenAI Platform vendor proof。
- OpenAI Platform official smoke：如仍需官方平台证明，后续用真实 Platform base/key 单独验证；凭据不得写入文档、测试 fixture 或 git。

## 3. 生命周期目标

正式模型 relay 只能依赖独立 Local Gateway daemon。

- 非单口模式：CLI 直接访问 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- 单口模式：OpenClaw 只挂载 Studio UI / control API；模型请求默认仍写 daemon loopback，单口 endpoint 只作为可选 ingress/proxy。
- OpenClaw Gateway、Studio API 或 Studio UI 崩溃时，daemon 继续服务已接管客户端。
- daemon 由 OS/user supervisor 托管：Linux `systemd --user`、macOS launchd、Windows scheduled task/service。

## 4. 渠道接入边界

渠道接入是独立产品域，不复用 Codex Stack，也不塞进 Studio Gateway。

```text
飞书 / 微信 / Octo(dmwork) / IM -> Channel daemon / CC Bridge -> Studio Chat / Agent -> Studio Gateway
```

- 短期：用 **CC Bridge** 托管 cc-connect，Studio 管理配置、进程、事件接入、日志和会话路由。
- 中期：定义 Studio Channel Connector contract，统一 incoming、reply、attachment、thread、ack/retry、allowlist、rate limit。
- 长期：按平台逐步 native 化，优先 Octo(dmwork)，再飞书、微信/企业微信和其它渠道。
- 参考源：release 副本 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`，其中 `platform/dmwork` 即 Octo；不得恢复到旧 `resources/codex-stack` 生产路径。

## 5. 新架构边界

| 模块 | 职责 |
| --- | --- |
| Studio Gateway Core | provider registry、secret store、active route、health、request log、adapter registry |
| Studio Gateway daemon | loopback HTTP listener、协议 adapter、provider router、runtime metadata、supervisor contract |
| App Connections | Codex、Claude Code、OpenCode、OpenClaw 的配置检测、preview、apply、rollback |
| Channel Connectors | CC Bridge、Octo(dmwork)、飞书、微信等 IM 渠道配置、事件接入、会话映射和消息路由 |
| Gateway UI | Provider Center、App Connections、Runtime、Diagnostics 的新页面；不复用旧 Codex Stack 页面结构 |

## 6. 删除范围

需要删除或迁移后删除：

- 前端：`apps/web-vue/src/features/codex-stack/**`，包括状态页高级诊断、运行矩阵、运行模式、技术检查、安装修复、路由模型、日志子页和所有 CPA/Compact 说明。
- 后端：`apps/api/modules/codex-stack/**`、`/api/codex-stack/*` routes、Codex Stack summary/profile/job/service schema。
- 资源：`resources/codex-stack/**` 中旧 installer、CPA/Compact 模板、health/smoke 脚本。
- 测试：旧 `codex-stack-*` 测试改为 Studio Gateway / App Connections 测试；不得再用 CPA/Compact 成功路径验收。
- 文档：当前两份 `codex-stack-model-gateway-*` 文件仅作为迁移记录，后续新建正式 `studio-gateway-*` 文档。

## 7. 新功能验收

- Studio Gateway daemon 支持并测试通过：
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/responses/compact`
  - `/v1/messages`
  - streaming 变体
- Provider registry 支持 Anthropic Messages、OpenAI Responses、OpenAI Chat Completions 三类原生 provider。
- Codex、Claude Code、OpenCode、OpenClaw 可通过 App Connections 生成配置 preview，并在用户确认后 apply。
- CC Bridge / Octo(dmwork) 通过 Channel Connectors 独立配置；其消息进入 Studio Chat / Agent，再由 Studio Gateway 调模型。
- 客户端配置只保存 placeholder 或 local endpoint；真实 upstream key 留在 Studio secret store。
- OpenClaw/Studio 崩溃隔离测试通过：daemon direct endpoint 继续可用。
- 生产前后端无 `codex-stack` 命名入口，无 CPA/Compact 用户可见链路。

## 8. 阶段计划

| 阶段 | 目标 |
| --- | --- |
| Phase A | 固定 Studio Gateway 命名、API contract、迁移删除清单 |
| Phase B | 补齐核心协议矩阵 adapter 与测试，确保 Studio Gateway daemon routes 全部通过（核心已完成） |
| Phase B2 | 按 cc-switch 成熟度补齐真实 SSE / tool / history / usage / reasoning 行为，并跑真实 Claude/Codex CLI smoke |
| Phase C | 删除 Codex Stack 前后端、资源和旧测试入口（已完成） |
| Phase D | 新建 Studio Gateway 管理页：Provider Center、App Connections、Runtime、Diagnostics |
| Phase E | 接入 Codex、Claude Code、OpenCode、OpenClaw 配置 preview/apply |
| Phase F | 新建 Channel Connectors：CC Bridge、Octo(dmwork)、飞书、微信的 contract 与管理面 |
| Phase G | 删除迁移文档旧名，切到正式 Studio Gateway / Channel Connectors 文档 |
