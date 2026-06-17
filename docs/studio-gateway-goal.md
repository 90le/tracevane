# Studio Gateway 目标方案

> 状态：Gateway core matrix、daemon lifecycle、Provider Center、App Connections、真实 provider/CLI smoke 已完成；Channel Connectors 私聊稳定性加固进行中
> 更新：2026-06-17
> 文档规则：本文件只保留目标、边界、验收和阶段计划；当前进度写到 `studio-gateway-progress.md`。

## 1. 最终目标

已停止演进的旧模型链路不再作为产品路径。正式目标是：

```text
Codex / Claude Code / OpenCode / OpenClaw / other clients
  -> Studio Gateway daemon
  -> provider router
  -> upstream model provider
```

硬性前提：

- 生产前后端不再暴露旧模型链路 API、旧页面、诊断矩阵、安装修复页或路由模型页。
- 历史代理端口和旧代理服务都不再是正式模型链路；`18796` 只可作为 Studio Gateway daemon 默认本地端口。
- IM Channel Connectors 是独立产品域，不属于模型 relay，也不放入 App Connections。

## 2. 协议目标

Studio Gateway 必须让任意 provider 无论原生协议是什么，都能对外暴露三类常见客户端协议：

| Provider 原生协议 | 典型来源 | 对外协议 |
| --- | --- | --- |
| Anthropic Messages | Claude 官方 API / Claude Code | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Responses API | Codex 官方 API | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Chat Completions | 第三方兼容模型 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |

规则：

- 原生协议和客户端协议一致时 passthrough，不一致时走 adapter。
- 未实现组合必须返回明确错误，不能伪成功。
- Provider `baseUrl` 是用户填写的上游 API 前缀，不隐式追加 `/v1`；版本号由用户填入 `baseUrl` 或由 endpoint override 明确配置。
- 每个协议格子需要覆盖非流式、流式、tool/history、usage/error envelope 和 compact 语义。
- 新协议、SDK、provider、媒体或 Realtime/WebSocket 能力必须先按 `docs/research-first-development-checklist.md` 完成官方/API/SDK/GitHub/社区核验，再落到 adapter 和测试；无法验证的组合返回结构化 unsupported。

## 3. Provider 与路由

- Provider 支持新增、编辑、启用、停用、删除；停用 provider 不参与 active routing、模型目录和 failover。
- `GET /v1/models` 聚合所有已启用 provider 的模型，支持模型 ID、显示名、别名、能力标记和上下文/输出预算。
- 已知模型预算可由 Gateway 内置推断或 provider 模型目录提供；同一模型的官方后缀/别名不能导致上下文预算退回未知默认值。
- vision 等高风险模型能力不能仅靠模型名推断；只能来自用户配置、上游显式能力元数据或成功 smoke。
- Provider 可包含多个 endpoint profile；同一模型可在同一 provider 下按客户端协议、endpoint 健康状态和 priority 自动选择最合适端点。
- 原生协议匹配优先于 adapter；endpoint profile 有独立 baseUrl、auth strategy、endpoint override、health/circuit 和 failover，可共用或覆盖 provider key。
- 不同 provider 暴露同名 model ID 是合法模型池：Auto 按 provider priority、健康状态和 circuit breaker 切换；同 provider 内 model ID / alias 不允许大小写不敏感重复。
- Gateway key 是本地统一鉴权 key，可由用户编辑或生成；真实 upstream key 留在 Studio secret store，不透传给客户端。
- App Connections 和 Channel Connectors 的模型选择、上下文窗口、compact 阈值、max output、reasoning 默认从 resolved model 派生，用户可在 App/Profile 层覆盖但不能高于已知模型预算。

### 3.1 Account-backed provider

GPT / ChatGPT / Codex 账户接入是 Gateway 下一阶段目标，参考 `docs/studio-gateway-account-provider-plan.md`。

- GPT/ChatGPT account 与 Codex account 都作为本机账户型 provider，不恢复已停止演进的旧模型链路。
- 首期不做网页 cookie 抓取；默认在 Provider Center 直接发起官方 Codex/GPT device/browser auth，授权完成后自动创建本地 account-backed provider。
- `~/.codex/auth.json` / keyring / 隔离 `CODEX_HOME` 只作为检测、迁移或故障恢复辅助路径，不要求用户重复登录后再手动导入。
- 账户凭据和普通 provider API key 分开存储，只保存 token ref、账户 hash、email mask、plan、过期时间和健康状态。
- Account provider 必须同样导出 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions。
- Codex account 的 OpenAI Responses 外观必须经过 Codex upstream 兼容转换，不能把普通 Responses payload 直接透传给 ChatGPT Codex 后端。
- Account provider 的模型目录必须覆盖文本、图片生成、音频输入、音频输出和实时类模型能力；媒体模型不能混作普通文本模型。
- Codex account 对外兼容 OpenAI Images generation，内部可通过 Codex Responses `image_generation` tool bridge；image edits 和音频 REST 能力按 provider 原生支持程度 passthrough 或明确报错。
- 账户池支持 round-robin、fill-first、session affinity、per-account concurrency、per-account proxy/direct、quota/cooldown 和手动禁用。
- 任何 auth failure、quota exceeded、rate limited、capacity error 都必须进入可解释 runtime log 和 UI 状态，不能静默换账号或伪成功。

## 4. 生命周期目标

- 正式模型 relay 依赖独立 Local Gateway daemon。
- 非单口模式：CLI 直接访问 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- 单口模式：OpenClaw 只挂载 Studio UI / control API；模型请求默认仍写 daemon loopback，单口 endpoint 只作为可选 ingress/proxy。
- OpenClaw Gateway、Studio API 或 Studio UI 崩溃时，Gateway daemon 继续服务已接管客户端。
- Gateway daemon 与 Channel daemon 均由 OS/user supervisor 托管：Linux `systemd --user`、macOS launchd、Windows scheduled task/service。
- 新设备首次安装必须能写入 user service、启用系统自启动、启动 daemon，并支持 status/start/stop/restart/ensure-running；已安装时“安装/启用”按重装/重新启用处理。
- `start`、`restart`、`ensure-running` 必须等待 daemon HTTP readiness 才算成功。

## 5. App Connections

App Connections 管理 Codex、Claude Code、OpenCode、OpenClaw 的配置检测、脱敏 preview、确认 apply、备份和 rollback。

必须支持：

- 使用 Gateway endpoint + Gateway key，而不是把 upstream key 写入客户端。
- 从 Gateway 可用模型列表选择默认模型，也允许手动输入兼容 alias。
- 一键切换 App profile：模型、上下文窗口、compact 阈值、max output、reasoning/effort 和必要兼容参数。
- 写入前备份原配置；失败可 rollback。
- Codex 真实测试必须隔离 `CODEX_HOME`，避免污染当前 Codex 任务进程。
- UI 主屏必须保持摘要 + 客户端列表；Profile 编辑、单客户端 preview/apply/rollback 和敏感 key 编辑进入弹层，不把所有字段常驻堆在 Overview 或 Client connections 主屏。

Channel Connectors / CLI Profile 前端管理必须从用户视角组织：

- Gateway / Provider Center 负责模型和协议，Channel Connectors 负责 daemon、平台运维、CLI Profile、模型、目录、权限、绑定摘要和会话记录。
- OpenClaw Agent 管理不承载 Studio Gateway / IM / CLI Profile 主线；长期目标是 Studio 自建 Gateway + Channel Connectors 可脱离 OpenClaw 独立运行。
- CLI Profile 的模型选择必须来自 Gateway 可用模型目录，不允许只显示局部或历史模型列表。
- 高频 Profile 配置在 `/channel-connectors/profiles` 可编辑；低频平台凭证仍留在 Channel Connectors 平台配置页。

## 6. Channel Connectors 边界

Channel Connectors 是独立产品域：

```text
Feishu / Octo(dmwork) / future IM
  -> Studio native Channel daemon
  -> local CLI Agent bot
  -> Studio Gateway daemon
```

当前发布目标只要求私聊能力完整、稳定、好用：

- 私聊文本、图片、文件传输。
- Codex、Claude Code、OpenCode 的 Agent CLI 能力。
- 工具流、思考流、过程回复和最终回复分类正确。
- `/stop`、`/new`、`/reset`、`/compact`、模型/目录/权限/显示开关等核心 IM 命令。
- 上下文预算和 Agent-native compact 优先，Studio/Gateway compact 兜底。

停止扩展：

- active `studio-channel-skill`、Feishu/Octo platform action、文档/群/管理类 API 工具层。
- 群聊、thread、多 bot 协作、Octo Bot API 管理和 Feishu 群管理只保留已实现的 best-effort，不作为首期发布或下一步阻断项。

开工门禁：

- Channel Connectors、CLI Agent runner、IM workflow、SDK/API 和平台能力变更必须先完成当前外部核验：官方文档、API/SDK/CLI help、changelog、GitHub issues/discussions 和社区故障报告。
- 历史实现只能作为归档背景，不再作为必须迁移的合同或成熟度来源。
- 核验结论、拒绝方案、风险和验证计划写入 `docs/research-first-development-checklist.md`、本文件、`studio-gateway-progress.md` 或专项 tracker。

## 7. 验收

- Gateway daemon 支持 `/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages` 及 streaming 变体。
- Gateway daemon 支持 OpenAI Images `/v1/images/generations`、OpenAI-compatible `/v1/images/edits` passthrough 与 OpenAI Audio REST routes；未支持的 Codex account image edits、realtime/WebSocket 或 account upstream 能力必须明确报错。
- Anthropic-compatible、OpenAI Chat-compatible、OpenAI Responses-native provider 均有真实 provider smoke；OpenAI Platform 官方端点作为后续可选 vendor proof。
- Claude Code / Claude CLI 可通过 `/v1/messages` 完成普通对话、流式对话和 summary/compact 类请求。
- Codex 可通过 `/v1/responses` 与 `/v1/responses/compact` 完成普通对话、流式对话和 compact 链路。
- App Connections 可对 Codex、Claude Code、OpenCode、OpenClaw 生成 preview/apply/rollback。
- Channel Connectors 私聊链路可在 Studio/OpenClaw 崩溃后继续由 daemon + Gateway 提供服务。
- 生产前后端无用户可见的旧模型链路入口。

## 8. 阶段计划

| 阶段 | 状态 | 目标 |
| --- | --- | --- |
| Phase A | 完成 | 固定 Studio Gateway 命名、API contract、旧链路删除清单 |
| Phase B | 完成 | 核心协议矩阵 adapter 与 daemon routes |
| Phase B2 | 完成核心，持续加固 | SSE/tool/history/usage/reasoning/error adapter 成熟度由当前官方/API 核验、本地回归和 live smoke 驱动；BigModel 与 GMN smoke 已覆盖主要格子 |
| Phase C | 完成 | 删除 Codex Stack 前后端、资源和旧测试入口 |
| Phase D | 完成核心 | Gateway 服务与配置面、Provider Center、Active routing、模型池、协议/模型自动识别、daemon 生命周期 |
| Phase D2 | 进行中 | GPT/ChatGPT/Codex account-backed provider：页面登录、账户刷新/启停、sticky/concurrency/runtime persistence、Provider smoke 和三协议 live 导出核心已完成；继续补 quota/cooldown、媒体/realtime 和账户池 UI |
| Phase E | 完成核心 | Codex、Claude Code、OpenCode、OpenClaw App Connections preview/apply/profile/rollback |
| Phase F | 进行中 | Channel Connectors 私聊完整闭环、Agent runner、文件/图片、工具流、compact、IM busy guard |
