# Studio Gateway 迁移进度

> 状态：Phase C completed; Phase B core matrix completed; Phase D provider routing/model catalog MVP added; Phase E app connection preview/apply MVP added; Phase B2 maturity hardening remains open
> 更新：2026-06-05
> 文档规则：只保留当前状态、验证、下一步；过期细节直接替换。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标。
- Codex Stack / CPA / Compact 旧功能面已停止演进。
- 新 UI / API 先做 Studio Gateway 服务与配置：daemon 状态/启停、用户自定义 provider 配置、协议/模型自动识别、secret、模型列表/默认模型、active routing、smoke。
- Gateway UI 参考旧 CPA 管理页的运行态布局和 cc-switch 的 Provider 表单体验；不内置具体 vendor 预设，不恢复旧 Codex Stack / CPA / Compact 文案、诊断矩阵、安装修复复杂度或多子页拆分。
- `/model-gateway` 管理页 MVP 已接入 shell：覆盖 daemon 状态/预览/status/ensure-running、Provider Center、active routing、protocol smoke 和最近请求。
- Provider 配置不内置具体 vendor；只给三种原生协议模板，用户可只填 Base URL + API key 后自动识别协议和模型列表，必要时再手动填模型名称。
- Provider 自动识别入口已贴近 Base URL / API Key；识别过程、三类协议结果和应用动作在弹层中完成，表单只保留紧凑状态。
- Provider registry 已有 `enabled` 字段、App scope、active provider、priority、model alias 和 `/api/model-gateway/active-provider`；UI 可编辑 provider 启用状态、路由优先级、模型列表/别名和 Active routing。
- `GET /v1/models` 已聚合所有启用 provider 的模型。同名模型跨 provider 合法，会形成模型池；active provider 优先，Auto 按 priority/健康状态选择，open circuit 后切换到下一个同名模型 provider。同 provider 内重复 model ID 或 alias 会被拒绝。
- Gateway client key 已实现为用户可编辑/可生成的本地鉴权：设置并启用后，`/v1/models`、`/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages` 和 `/claude/v1/messages` 都接受 `Authorization: Bearer` 或 `x-api-key`，并会替换为 provider upstream key 后再转发。
- App Connections MVP 已实现：Codex CLI、Claude Code、OpenCode、OpenClaw 可生成脱敏配置 preview，并在用户确认后 apply；apply 要求本地 Gateway key 和可用 provider 模型，写入前备份原文件，预览/响应不回显真实 key。
- Gateway daemon service 已覆盖新设备首次安装、systemd/launchd/scheduled-task 自启动启用、启动、停止、重启、status 与 ensure-running；旧坏模板会自动重写并 reload/start/restart，已安装时 install 按重装/重新启用处理。
- `start`、`restart`、`ensure-running` 已改为等待 daemon HTTP status ready 后才标记 started；stop 后 inactive 视为预期结果，不再误报失败。
- CC / cc-connect / Octo(dmwork) 已从 App Connections 拆出，归入独立 Channel Connectors；短期用 CC Bridge，长期逐步 native 化。
- Channel Connectors 后置；当前不实现 CC Bridge / Octo。
- Gateway daemon 与 Channel daemon / CC Bridge 都必须独立守护；Studio / OpenClaw 挂掉后，CLI 模型请求和 IM 到 Codex/Gateway 的对话链路仍应保持运行。
- 协议矩阵目标已固定：Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions 任意原生 provider 都必须对外暴露三类客户端协议。
- 本地参考源码固定为 `/tmp/cc-switch-src`；只参考代理转换、SSE、tool/history、usage 映射。
- Channel Connectors 参考源为 release 副本 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`；其中 `platform/dmwork` 即 Octo，不恢复旧 `resources/codex-stack` 生产路径。
- OpenAI 官方 API smoke 需要真实 OpenAI Platform key；本机 Codex 登录态当前是 `PROXY_MANAGED` 占位符，不可直接用于官方 API。
- 当前 Phase B2：BigModel Anthropic/Chat、GMN Responses-native、Claude/Codex takeover smoke 已通过；OpenAI Platform official smoke 仅作为后续额外 vendor proof。

## 本轮完成

- Phase E App Connections MVP：
  - 新增 `MODEL_GATEWAY_APP_CONNECTION_IDS` 和 App Connection response/apply 类型。
  - 新增 `/api/model-gateway/app-connections` 与 `/api/model-gateway/app-connections/:appId/apply`。
  - Codex CLI 生成受控 TOML block，设置 `model_provider="studio_gateway"`、Responses base URL 和本地 Gateway key。
  - Claude Code 合并 `~/.claude/settings.json` 的 `env`，写入 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` 和默认模型。
  - OpenCode 合并 `provider["studio-gateway"]`，写入 OpenAI Chat-compatible endpoint/key 和聚合模型列表。
  - OpenClaw 合并 `models.providers["studio-gateway"]`，写入本地 Gateway provider、聚合模型列表和默认 agent model。
  - `/model-gateway` 新增 App Connections 卡片，显示 endpoint、目标配置文件、默认模型、阻断原因、脱敏预览和 apply 操作。
  - 右侧主工作区改为 tab 分页：客户端接入、Provider 配置、Smoke / 日志分开呈现，避免 App Connections 和 Provider 表单堆积在同一长页面。
  - App Connections preview 递归脱敏已有配置里的 `apiKey`、`token`、`secret`、`password`、`authorization` 等字段；真实 key 只在 apply 写入目标文件。
- 删除旧后端：`apps/api/modules/codex-stack/**` 和 `/api/codex-stack/*` 注册入口。
- 删除旧前端：`apps/web-vue/src/features/codex-stack/**`、`CodexStackView.vue`、导航和首页入口。
- 删除旧资源：`resources/codex-stack/**`。
- 删除旧测试/设计保护面：`codex-stack-*`、`studio-web-codex-stack-*`、旧 release/design/page-density 合约测试。
- 刷新 `studio-domain-inventory.json`，基线不再包含 `/codex-stack`、`codex-stack` API module 或 web feature。
- 保留并验证 Studio Gateway daemon/service contract；修复 systemd service template 的 `WorkingDirectory` 引号问题。
- 补齐核心协议 adapter：Anthropic Messages ↔ OpenAI Chat、Anthropic Messages ↔ OpenAI Responses、OpenAI Chat ↔ OpenAI Responses 的非流式与文本 streaming 路径。
- 新增 SSE 重建模块，覆盖 Chat/Responses/Anthropic 之间的 `message_start`、`content_block_delta`、`message_delta`、Chat chunk、Responses output_text 事件转换。
- 新增 provider `network.proxyUrl` upstream 支持；OpenAI 这类需代理的 provider 可显式走 HTTP/SOCKS proxy。
- 新增 `PROXY_MANAGED` placeholder guard，避免把本地 managed-account 占位符作为真实 upstream key 发出。
- 更新目标与进度文档：把“绝对成熟度”写为 Phase B2 验收门槛，要求参考 cc-switch 并用真实 provider/CLI smoke 证明。
- Phase B2 成熟度切片：
  - Chat/Anthropic → Responses 请求改为 typed content（`input_text` / `output_text`），对齐 cc-switch，避免部分 Responses provider 200 但无最终文本。
  - Chat streaming `tool_calls` 转 Responses `function_call` SSE：`output_item.added`、`function_call_arguments.delta/done`、`output_item.done`、completed usage。
  - Responses streaming `function_call` 转 Chat `tool_calls` delta 和 Anthropic `tool_use` / `input_json_delta`。
  - Chat reasoning / `reasoning_content` 转 Responses reasoning item 与 reasoning summary SSE；`<think>` 前缀流拆分为 reasoning，不泄露标签。
  - Codex streamed tool call 写入 history，后续 `previous_response_id + function_call_output` 可恢复原 function call。
  - Anthropic streaming `tool_use` 转 Responses `function_call` SSE，并写入 Codex history。
  - Responses `response.failed` SSE 转 adapter error；Chat upstream 非 2xx 转 Responses error envelope，不裸透传 `base_resp` 等上游私有结构。
  - Claude Code `metadata` 不再透传到 OpenAI Chat provider，避免 MLAMP/OpenAI Chat 报 `metadata`/`store` 不兼容。
  - Provider 上游 endpoint 默认不再隐式追加 `/v1`；`baseUrl` 作为 API 前缀，版本号由 `baseUrl` 或 `endpoints` 明确表达。
- Phase D UI MVP：
  - 新增 `/model-gateway` shell route 和导航入口“模型网关”。
  - 新增单页式 Studio Gateway 管理页，借鉴旧 CPA 的运行态布局和 cc-switch 的 provider 表单。
  - 接入现有 `/api/model-gateway/*`：status、runtime、daemon-service、providers、active-provider、provider test。
  - 移除具体 vendor 预设；只保留原生协议模板，由用户自行填写 Base URL、模型列表、默认模型和 API key。
  - daemon service 操作增加可见结果面板，展示 action、service manager、bootstrap 和命令输出。
  - Provider 表单支持多模型列表、默认模型下拉、启用状态和路由优先级；模型行格式为 `模型ID | 显示名 | 别名1,别名2`，兼容旧逗号格式。
  - Provider 保存时拒绝同 provider 内重复 model ID/alias；不同 provider 可暴露同名模型，Gateway 将其作为同名模型池。
  - Gateway daemon 新增 `GET /v1/models`，只返回启用 provider 的聚合模型目录，并包含 `providerIds`、显示名和别名。
  - 请求路由会按 requested `model` 解析 provider/model：active provider 优先，Auto 按 priority/健康状态，显式 `provider/model-or-alias` 可直达指定 provider，并在上游请求中恢复真实 model ID。
  - 新增 `/api/model-gateway/client-auth`，管理本地 Gateway client key；手动保存不回显明文，生成新 key 时只在本次响应显示一次。
  - 前端 Runtime rail 新增 Gateway key 卡片，可保存、生成、停用 client key，并显示 masked 状态。
  - 新增 `/api/model-gateway/detect-provider` 临时探测接口；不保存 provider 或 secret，自动识别三种原生协议和模型列表，多协议通过时让用户选择应用。
  - 优化自动识别 UX：检测按钮移到连接字段旁，新增识别进度/结果弹层、三类协议状态、可用协议应用反馈和紧凑结果入口。
  - 修复 daemon service 生命周期：`ensure-running` 会修复 stale/bad user service，新设备缺失模板时会写入并 enable/start；`start`/`restart` 也会先同步模板；模板更新且服务已 active 时会 restart。
  - 生命周期按钮补齐真实可用性判定：`start`/`restart`/`ensure-running` 等待 daemon HTTP status endpoint ready；`stop` 返回 inactive 视为成功且保留自启动 enabled。
  - systemd 模板补充 `MODEL_GATEWAY_SUPERVISOR=systemd-user`，daemon runtime metadata 可显示真实 supervisor。
  - Runtime 前端改为主操作“确保运行/状态”+“更多操作”菜单；重装/启用自启动、启动、停止、重启、预览收进低频菜单，避免按钮堆积。
  - 新增静态页面测试，防止恢复旧 Codex Stack / CPA UI 词汇和旧 `/api/codex-stack/*`。

## 验证

- 通过：`npm run build:api`
- 通过：`node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs`
- 通过：`node --test --test-reporter=dot tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-domain-inventory.test.mjs tests/system/model-gateway-service.test.mjs`
- 通过：`git diff --check`
- 通过：`npm run typecheck:web`
- 通过：`npm run build:api`
- 通过：`node --test --test-reporter=spec tests/system/studio-web-shell-route-manifest.test.mjs tests/system/studio-web-model-gateway-page.test.mjs tests/system/studio-domain-inventory.test.mjs`
- 通过：`node --test --test-reporter=spec --test-name-pattern "detects provider protocols" tests/system/model-gateway-service.test.mjs`
- Phase D UI dev 重启通过：frontend `http://127.0.0.1:5176/` 与 `/model-gateway` 返回 200；same-origin `/api/model-gateway/daemon-service` 返回 200；backend `http://127.0.0.1:3762/api/system/health` 返回 `gateway: online`。
- 本轮 UI 修正验证通过：same-origin daemon `preview` 返回 `ok/action/template`，daemon `status` 返回 `serviceManager.checked=true/reachable=true/active=false/enabled=true`；页面已增加 action result 面板。
- 本轮自动识别验证通过：dev 重启后 `/model-gateway` 返回 200，same-origin `/api/model-gateway/detect-provider` 对空 Base URL 返回 `model_gateway_detect_base_url_required` 400，确认 route 已接入。
- 本轮自动识别 UX 验证通过：`npm run typecheck:web`；`node --test --test-reporter=spec tests/system/studio-web-model-gateway-page.test.mjs`。
- 本轮 daemon service 修复验证通过：`npm run build:api`；`node --test --test-reporter=spec --test-name-pattern "daemon service management|ensure-running" tests/system/model-gateway-service.test.mjs`；本机 systemd user service 已 `active/enabled`，`/api/model-gateway/status` direct daemon 返回 200。
- 本轮 Runtime 按钮验证通过：`preview`、`status`、`install/reinstall+enable`、`start`、`restart`、`stop`、`ensure-running` 全部走 same-origin API 实测；stop 后 daemon HTTP 为 0，ensure-running 后恢复 200，且成功结果无失败命令残留。
- 本轮浏览器验证通过：Playwright 打开 `/model-gateway` 并真实点击 Status、More actions、Preview、Reinstall/enable、Start、Restart、Stop、Ensure running；结果面板无 failure，截图 `/tmp/model-gateway-runtime-buttons.png`。
- 本轮构建验证通过：`npm run build:api`、`node --test --test-reporter=spec --test-name-pattern "daemon service management|ensure-running|stop treats inactive|start reports bootstrap" tests/system/model-gateway-service.test.mjs`、`npm run typecheck:web`、`node --test --test-reporter=spec tests/system/studio-web-model-gateway-page.test.mjs`、`npm run build --workspace=apps/web-vue`。
- 本轮模型池验证通过：`npm run build:api && node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs && npm run typecheck:web && npm run build --workspace=apps/web-vue && node --test --test-reporter=spec tests/system/studio-web-model-gateway-page.test.mjs`。
- 本轮 Gateway key 验证通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "client key protects" tests/system/model-gateway-service.test.mjs`；覆盖无 key/错 key 401、Bearer/x-api-key 通过、生成 key、停用鉴权和 upstream key 隔离。
- 本轮 App Connections 验证通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "app connections|client key protects" tests/system/model-gateway-service.test.mjs`；覆盖脱敏预览、四类客户端 apply、备份、真实写入 key、无 Gateway key 阻断。
- 本轮完整 Gateway 验证通过：`node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs`，41/41 通过。
- 本轮前端验证通过：`npm run typecheck:web && npm run build --workspace=apps/web-vue && node --test --test-reporter=spec tests/system/studio-web-model-gateway-page.test.mjs`。
- 本轮 tab UI 与脱敏修正验证通过：`npm run build:api && node --test --test-reporter=spec tests/system/model-gateway-service.test.mjs && npm run typecheck:web && npm run build --workspace=apps/web-vue && node --test --test-reporter=spec tests/system/studio-web-model-gateway-page.test.mjs`；页面静态测试锁定 `mgw-workspace-tabs`、三个 tab 和预览脱敏。
- 本轮 dev/live smoke 通过：`npm run dev:restart` 后 frontend `http://127.0.0.1:5176/model-gateway` 返回 200，backend health `gateway=online`，daemon restart 返回 `active=true/started=true`，`/api/model-gateway/app-connections` 返回 4 个连接且不包含已知旧配置 key/token。
- 本轮 Gateway key live smoke 通过：dev 和 daemon 重启后，临时 key 启用时 `GET 18796/v1/models` 无 key 返回 401，带 `x-api-key` 返回 200；测试后已清除临时 key，当前本机 client auth 为 disabled/no secret。
- 本轮补测通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "protocol matrix forwards native openai responses|anthropic messages through openai chat providers|codex compact|chat reasoning|streamed codex tool-call history|upstream responses stream fails|normalizes upstream chat errors" tests/system/model-gateway-service.test.mjs`，8/8 通过。
- 本轮补测通过：`npm run build:api && node --test --test-reporter=spec --test-name-pattern "routing contract selects|records streamed codex tool-call history|adapts streaming chat tool calls|adapts codex responses through native anthropic|protocol matrix forwards" tests/system/model-gateway-service.test.mjs`，7/7 通过。
- Dev 进程已重启：frontend `http://127.0.0.1:5176` 返回 200；backend `http://127.0.0.1:3762/api/system/health` 返回 `gateway: online`。
- 工作树中存在其它 AI 进程处理中的 system/recovery 改动；本轮只验证 Studio Gateway 范围，不处理该并行任务冲突。
- 未全量重跑：前端未改；上轮 `npm run test:system` 仍有 9 个非本轮相关旧 UI 形态断言失败，集中在 Agents / Channels / Chat / Config 测试。
- BigModel live smoke：
  - Anthropic-compatible base `https://open.bigmodel.cn/api/anthropic`，model `glm-4.6`：10/10 通过，覆盖 Chat、Anthropic、Responses、compact、stream、tool/history、error；该 provider 需 endpoint override `/v1/messages`。
  - Chat-compatible base `https://open.bigmodel.cn/api/coding/paas/v4`，model `glm-4.6`：10/10 通过，覆盖 Chat、Anthropic、Responses、compact、stream、tool/history、error；forced object `tool_choice` 会被 BigModel 400，live smoke 使用 `tool_choice:"auto"`。
  - 测试 key 只用于临时 smoke，未写入仓库。
- OpenAI official smoke：代理链路可达，但本机可读 key 是 `PROXY_MANAGED` placeholder；Gateway 已本地拒绝该 placeholder，需真实 OpenAI Platform key 后重测。
- MLAMP Responses-compatible live classification：
  - Base `https://llm-gateway.mlamp.cn/v1`，model `gpt-5`：`/responses` 非流式通过，返回 `object: response`、`status: completed`、`output_text`、Responses usage 字段。
  - `/responses` streaming 通过，返回 `response.created`、`response.in_progress`、`response.output_item.*` SSE 事件。
  - `/chat/completions` 也通过，返回 `object: chat.completion`；因此该 base 是 dual-compatible，当前只作为历史/可选参考，不作为 official compact 门槛。
  - 测试 key 只用于临时 smoke，未写入仓库。
- MLAMP via Studio Gateway live smoke：
  - 临时 provider `apiFormat=openai_responses`，base `https://llm-gateway.mlamp.cn/v1`，model `gpt-5`；当前只保留为历史/可选参考。
  - 非流式 `/v1/responses`、`/v1/chat/completions`、`/v1/messages` 均 200，均产出可读文本和 usage；`gpt-5` 需 `max_output_tokens/max_tokens/max_completion_tokens=512` 才稳定越过 reasoning 输出。
  - 流式 `/v1/responses`、`/v1/chat/completions`、`/v1/messages` 均 200，均完成并产出文本 delta；测试 key 只用于临时 smoke，未写入仓库。
- GMN Responses-native substitute smoke：
  - Base `https://gmn.chuangzuoli.com/v1`；`/v1/models` 可读，`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.5`、`codex-auto-review` 可用，`gpt-5.2` 当前返回上游 503。
  - 直接上游通过：`/v1/responses`、`/v1/responses/compact`、`/v1/chat/completions`；compact 返回 `response.compaction` 或 `response`，均为 200。
  - Studio Gateway 临时 provider `apiFormat=openai_responses` 通过：`/v1/responses`、`/v1/responses/compact`、`/v1/chat/completions`、`/v1/messages`、Responses stream，runtime 全部 success。
  - Tool smoke 通过：Chat Completions 客户端 tool request 经 Gateway 转上游 Responses，返回标准 `tool_calls`。
  - 测试 key 只用于临时 smoke，未写入仓库。
- Claude Code takeover smoke：
  - 通过：Claude Code `2.1.86`，临时 Gateway `/v1/messages`，MLAMP Chat-compatible upstream，返回 `CLAUDE_CODE_GATEWAY_OK`。
  - 通过：Claude Code `2.1.86`，临时 Gateway + BigModel Chat upstream，basic 返回 `CLAUDE_GATEWAY_OK`，Bash tool-use 返回 `CLAUDE_TOOL_OK` 且 Gateway request log 增加 8，summary 类请求返回 `CLAUDE_SUMMARY_OK`。
  - 注意：用户级 `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL=http://127.0.0.1:8317` 会覆盖 shell env；接管 smoke 需用 `--setting-sources local` 或后续 App Connections 生成隔离配置。
- Codex CLI takeover smoke：
  - 通过：Codex CLI `0.137.0`，临时 `CODEX_HOME`，`wire_api="responses"` 指向 Studio Gateway `/v1`，`codex exec` 返回 `CODEX_GATEWAY_OK`。
  - 通过：Codex CLI `0.137.0`，GMN Responses-native 临时 Gateway，`codex exec` 返回 `CODEX_GMN_NATIVE_OK`，runtime 命中 `/v1/responses`。
  - 通过：同一临时 Gateway direct `/v1/responses/compact` 返回 `CODEX_COMPACT_OK`，runtime log 命中 `openai_responses_compact`。
- Compact 说明：
  - MLAMP 当前不作为 `/v1/responses/compact` 原生能力证明。
  - GMN 已覆盖 Responses-native `/v1/responses/compact` 替代 smoke；OpenAI Platform official smoke 仅在需要官方 vendor proof 时单独执行。
- Channel decision：
  - App Connections 只覆盖本地 CLI/AI 工具：Codex、Claude Code、OpenCode、OpenClaw。
  - Channel Connectors 单独覆盖 IM 渠道：CC Bridge、Octo(dmwork)、飞书、微信/企业微信等。
  - 短期托管 cc-connect 配置/进程/日志/事件接入；中期定义 Studio Channel Connector contract；长期优先 native 化 Octo(dmwork)。
  - CC Bridge 需要 OS/user supervisor；Studio/OpenClaw 崩溃时保持服务在线，不内置额外修复流程。

## 下一步

1. 补 App Connections profile 切换：模型、上下文窗口、max output、reasoning/effort、协议兼容参数和 rollback。
2. 补 Provider Center 可用性闭环：Active routing 选择后即时 smoke 验证、停用当前 active provider 时给出明确回退提示。
3. 做真实客户端配置 apply 的人工验收：用测试 HOME/临时配置跑 Codex、Claude Code、OpenCode、OpenClaw。
4. Channel Connectors / CC Bridge / Octo 等网关配置稳定后再启动。
