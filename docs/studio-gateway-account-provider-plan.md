# Studio Gateway Account Provider Plan

> 状态：Phase D2 实现中
> 更新：2026-06-15
> 目的：把 GPT / ChatGPT / Codex 账户接入 Studio Gateway，形成用户本机账户池到三协议 API 的正式能力。

## 参考来源

- CLIProxyAPI：`/tmp/studio-gateway-research-cliproxyapi`，参考 OAuth 登录、账户池、round-robin、session-affinity、Codex headers、token refresh、usage plugin。
- Sub2API：`/tmp/studio-gateway-research-sub2api`，参考账号调度、sticky session、并发槽、账号冷却、usage queue、管理面分层。
- Codex 官方认证文档：ChatGPT/Codex device auth、browser auth、`~/.codex/auth.json` / keyring 存储。
- codexProapi GitHub 页面：参考 Codex 账户池、token auto-refresh、round-robin/failover、账户状态面板。
- 既有 Gateway 协议成熟度参考仍是 `/tmp/cc-switch-src`。

## 边界

- 这是 Studio Gateway 新账户型 provider，不是恢复旧 CPA / Compact / Codex Stack。
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

路由规则：

- 会话类请求优先 sticky 到同一账户，sticky key 来自 `metadata.user_id`、`Session_id`、`X-Session-ID`、`X-Client-Request-Id`、`conversation_id` 或 normalized prompt/cache key。
- sticky 账户不可用时允许 failover，但必须写 runtime log，避免静默换上下文。
- 同模型可跨账户、跨 endpoint、跨 provider 组成模型池；账户级健康、provider 级 priority、endpoint 级 priority 一起参与选择。
- 账户进入 auth failure、quota exceeded、rate limited、capacity error 后进入可解释 cooldown；用户可手动禁用、刷新或重试。

## 功能清单

首期 GPT/Codex account provider：

- 账户登录：Provider Center 直接点击登录 Codex/GPT 账户，打开官方授权页，轮询完成后自动创建本地 account-backed provider。
- 辅助导入：本机 `auth.json` / keyring / 隔离 `CODEX_HOME` 只用于迁移和修复，不要求用户重复登录后再手动导入。
- 账户存储：OS keyring 优先，文件模式必须 `0600`，runtime 只保存 token ref、account hash、email mask、plan type、expiresAt。
- 账户刷新：请求前自动 refresh，后续补后台 refresh worker；刷新失败进入 needs-login 或 cooldown，不阻塞其它账户。
- 账户池：round-robin、fill-first、session-affinity、per-account concurrency、per-account proxy/direct。
- 模型目录：账户 provider 自带模型 catalog，支持 alias/fork/excluded models，和现有 `/v1/models` 聚合合并。
- Codex headers：保留 Codex 需要的 `Session_id`、`X-Codex-*`、`Chatgpt-Account-Id`、user-agent defaults；反代部署时提醒保留 underscore headers。
- usage：按 gateway key、provider、account hash、model、alias、route、status、latency、TTFT、usage tokens 记录；Channel 侧不重复做 token 产品化。
- UI：Provider Center 增加 Account providers 工作区，支持页面登录、刷新、禁用、健康、quota、代理、模型 alias、sticky/cooldown 策略。

## 验收

- 无真实 token 的单元测试覆盖 account schema、redaction、auth storage、route decision、sticky/failover/cooldown、model list merge。
- 页面登录 smoke 验证 Codex 账户自动创建 provider 和普通请求；隔离 `CODEX_HOME` 只用于辅助迁移验证，不污染当前 Codex CLI。
- 真实 live smoke 至少覆盖 Codex account：Responses non-stream、Responses stream、Responses compact、Chat-compatible adapter、Anthropic Messages adapter。
- UI smoke 覆盖账户登录向导、账户表、禁用/刷新、模型别名和 redaction。
- `runtime.json` 不出现 access token、refresh token、auth.json 原文。

## 不做

- 不恢复旧 `features/codex-stack/**`、CPA install page、CPA diagnostics。
- 不做公共 SaaS 计费、转售、账号共享市场。
- 不把 ChatGPT 网页 cookie、第三方成品号或手工复制 refresh token 作为默认路径。
- 不在 App Connections 写入账户 token；客户端只看 Studio Gateway endpoint + Gateway key。
