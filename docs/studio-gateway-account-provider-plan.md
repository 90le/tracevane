# Studio Gateway Account Provider Plan

> 状态：Phase D2 核心能力已进入 live 验证
> 更新：2026-06-18
> 目的：把 GPT / ChatGPT / Codex 账户接入 Studio Gateway，形成用户本机账户池到三协议 API 的正式能力。

## 当前核验门禁

- 账户登录、认证刷新、模型目录、媒体、Realtime/WebSocket 和 SDK/CLI 事件格式变更前，必须先核验官方文档、API/spec、SDK/CLI help、changelog、活跃 GitHub issues/discussions 和社区故障报告。
- Codex 官方认证文档、当前 OpenAI/Codex CLI 行为、真实 Gateway smoke 和本地合同测试是首要依据。
- 第三方项目或旧本地快照只作为归档背景；不能作为必须迁移的合同，也不能单独证明某能力可支持。
- 无法用官方资料或真实 smoke 验证的 upstream 能力保持结构化 unsupported，并在错误 envelope 里说明当前缺少稳定合同和替代路径。

## 边界

- 这是 Studio Gateway 新账户型 provider，不是恢复已停止演进的旧模型链路。
- 只支持用户本机、用户自有账号授权；不设计共享售卖、第三方账号导入市场、公共代理池。
- 凭据不写入普通 provider key 字段，不在 UI、日志、测试输出中回显。
- ChatGPT/GPT 账户不做网页 cookie 抓取或通用网页反代；首期由 Gateway Provider 页面直接发起官方 device/browser auth。
- Codex 账户纳入同一账户型 provider；`auth.json` / keyring / 隔离 `CODEX_HOME` 只作为检测、迁移或故障恢复辅助路径，不作为默认手动导入流程。

## 目标形态

Studio Gateway provider 分三类来源：

| 来源 | 例子 | 目标 |
| --- | --- | --- |
| API-key provider | OpenAI API、BigModel、OpenRouter | 已有 Provider Center 继续负责 |
| Account-backed provider | GPT/ChatGPT account、Codex account、Claude Code account、Gemini CLI account | 本机登录、账户池、调度、刷新、quota 和三协议导出 |
| External relay provider | 用户自填兼容中转站 | 作为普通 provider，不继承账户能力 |

Account-backed provider 对外仍暴露：

- `GET /v1/models`
- `/v1/chat/completions`
- `/v1/responses`
- `/v1/responses/compact`
- `/v1/messages`
- `/v1/images/generations`
- `/v1/images/edits`
- `/v1/audio/transcriptions`
- `/v1/audio/translations`
- `/v1/audio/speech`
- `/v1/responses/ws` / `/v1/realtime` 当前只返回结构化 unsupported，直到完整 Realtime/WebSocket bridge 通过测试

路由规则：

- 会话类请求优先 sticky 到同一账户，sticky key 来自 `metadata.user_id`、`Session_id`、`X-Session-ID`、`X-Client-Request-Id`、`conversation_id` 或 normalized prompt/cache key。
- sticky 账户不可用时允许 failover，但必须写 runtime log，避免静默换上下文。
- 同模型可跨账户、跨 endpoint、跨 provider 组成模型池；账户级健康、provider 级 priority、endpoint 级 priority 一起参与选择。
- 账户进入 auth failure、quota exceeded、rate limited、capacity error 后进入可解释 cooldown；非账户 provider 连续 started streaming adapter 失败会更新 health/circuit 并按 failover 走 backup；用户可手动禁用、刷新或重试。

## 功能清单

首期 GPT/Codex account provider：

- 账户登录：Provider Center 直接点击登录 Codex/GPT 账户，打开官方授权页，轮询完成后自动创建本地 account-backed provider。
- 辅助导入：本机 `auth.json` / keyring / 隔离 `CODEX_HOME` 只用于迁移和修复，不要求用户重复登录后再手动导入。
- 账户存储：OS keyring 优先，文件模式必须 `0600`，runtime 只保存 token ref、account hash、email mask、plan type、expiresAt。
- 账户刷新：请求前自动 refresh；Provider Center 支持手动 refresh、启用、停用和重新登录。后续补后台 refresh worker；刷新失败进入 needs-login 或 cooldown，不阻塞其它账户。
- 账户池：round-robin/fill-first、session-affinity、per-account concurrency、HTTP 401/403 needs-login、HTTP 429 或 quota/rate/capacity upstream cooldown、started stream passthrough / adapter failure 旁路解析、cooldown 手动清除、per-account proxy/direct、过期 cooldown 首次重试标记、跨 daemon cursor/affinity 持久化和 runtime/UI accountRouting 诊断已有基础实现；Provider Center 已可编辑策略、sticky、单账号并发，并在最近请求显示 total/ready/capacity/busy/cooldown/needs-login 池容量计数，后续补策略 live smoke。
- 模型目录：账户 provider 使用受控 catalog，API-key provider 可在 Provider Center 从上游 `/models` 刷新并合并目录；刷新只新增模型和补齐空白预算/能力，不覆盖用户已有 alias、能力、预算或默认模型。Codex account catalog 只暴露当前官方/CLI/live smoke 已验证的模型 slug，不暴露历史误生成或 live 证明不支持的模型 slug。
- Codex Responses 转换：Codex account `/v1/responses` 不能按普通 OpenAI Responses 原样透传；必须按 Codex upstream 合同把字符串 `input` 转 message list，强制上游 streaming，并清理 upstream 不接受的 token/采样/context/user 参数，非流式客户端响应再由 SSE 聚合回 JSON；工具历史的 Responses `function_call.id` 必须是 `fc_*`，`call_id` 才保留 Claude/Chat 的 `call_*`。
- 媒体模型：账户 provider catalog 必须区分 text、vision、image generation、audio input、audio output；`gpt-image-2`、transcribe、tts、audio、realtime 类模型不能被当成普通文本模型。
- 图片桥接：Codex account 对外兼容 OpenAI Images generation；上游走 Codex `/responses` + `image_generation` tool，并把 Responses/SSE 输出转成 Images API 响应。实现必须支持 `response.output`、`response.output_item.done`、partial-image 未来扩展点和 upstream `response.failed/error` 诊断。OpenAI-compatible image edits 必须 multipart/binary passthrough；Codex account image edits 在没有真实上游 action 合同前明确报不支持，错误 envelope 说明当前缺少稳定的 Codex account image edit contract，并给出替代路径。
- 音频/Realtime 路由：OpenAI-compatible provider 的音频 REST 端点必须 multipart/binary passthrough；Codex account 音频与 realtime 模型可出现在 catalog，但 REST `/v1/audio/*`、`/v1/responses/ws` 和 `/v1/realtime` 当前明确返回结构化 unsupported。OpenAI 官方已有 request-based audio、Realtime WebSocket 和 Responses WebSocket mode，但 Studio Gateway 对 Codex account backend 仍缺完整 turn state、tool cache、history replay、错误和 close 语义；Realtime/WebSocket 只有拿到官方或直接验证合同并通过 WS live smoke 后，才移除 unsupported。当前 Gateway 不提供无状态 WS 伪转发；需要 realtime 时先直连官方/OpenAI-compatible realtime endpoint。
- Codex headers：保留 Codex 需要的 `Session_id`、`X-Codex-*`、`Chatgpt-Account-Id`、user-agent defaults；反代部署时提醒保留 underscore headers。
- usage：`status/runtime` 保留内部 request log summary；`/api/model-gateway/usage` 只返回本地 `usage-ledger.jsonl` 读取窗口内的 `totals`、全量 `models[]` 和 `readWindow`。Provider Center 模型消耗页只做每个模型请求次数和 token 图表/表格；不做供应商账单导入、provider/account 维度对账、成本估算、筛选、归档、CSV 或最近明细。模型 alias 由 Gateway 按 provider catalog 归并，Channel 侧不重复做 token 产品化。
- UI：Provider Center 已收敛为服务商列表优先；新建服务商时在弹层内选择 API Key 接入 / 账户登录 / 中继服务。账户登录不会由主页面按钮自动触发，必须用户在弹层里明确点击开始登录；账户状态表、刷新、禁用、清除 cooldown、账号代理/直连、账号池策略、媒体模型状态和健康继续保留在编辑弹层与检查页中。后续补模型 alias 与策略 live smoke。

## 验收

- 无真实 token 的单元测试覆盖 account schema、redaction、auth storage、route decision、sticky/failover/cooldown、model list merge。
- 页面登录 smoke 验证 Codex 账户自动创建 provider、Provider smoke 和普通请求；隔离 `CODEX_HOME` 只用于辅助迁移验证，不污染当前 Codex CLI。
- Account pool smoke：`scripts/smoke-model-gateway-account-pool.mjs` 验证真实 daemon active account provider、Responses 请求、runtime accountRouting 池计数和 sticky session；单个 ready account 即可完成默认验收，有 2 个以上 ready account 时扩展验证 round-robin，多账号强制验收必须显式使用 `--require-multi-account`。
- 真实 live smoke 至少覆盖 Codex account：Responses non-stream、Responses stream、Responses compact、Chat-compatible adapter、Anthropic Messages adapter、Claude Code CLI 和 OpenCode tools。
- Media smoke：`scripts/smoke-model-gateway-account-media.mjs` 低成本验证 catalog、image edits route 和 Codex account audio unsupported；Codex account Images generation 需要显式 `--run-image-generation`，且必须确认路由实际命中 `codex-account` 后才能记为 account proof。2026-06-15 已强制 `openclaw=codex-account` 跑通 `--require-image-generation`，`gpt-image-2` 返回 1 张图和 usage；OpenAI-compatible image edits 和音频 transcription 用 multipart 文件验证请求体不被 Gateway 改写。
- UI smoke 覆盖单入口新建服务商、弹层类型选择、账户登录向导不自动触发授权、账户表、禁用/刷新、模型别名和 redaction。
- `runtime.json` 不出现 access token、refresh token、auth.json 原文。

## 不做

- 不恢复旧模型链路页面、安装页或诊断页。
- 不做公共 SaaS 计费、转售、账号共享市场。
- 不把 ChatGPT 网页 cookie、第三方成品号或手工复制 refresh token 作为默认路径。
- 不在 App Connections 写入账户 token；客户端只看 Studio Gateway endpoint + Gateway key。
- 不把 Realtime/WebSocket 做成无状态伪转发；没有完整 state machine 和 live smoke 前保持结构化 unsupported。
