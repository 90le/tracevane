# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移
> 更新：2026-06-08
> 文档规则：只保留当前状态、最新完成、验证、边界和下一步；不追加流水日志。

## 当前状态

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池和能力标记。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；本地 Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer 和基础治理。
- IM 文件收发边界已固定为 Studio native transport：Agent 只读入站 staging 文件，出站只声明工作目录内文件 manifest，由 daemon 按平台上传发送。
- IM Agent run 默认按 binding + sessionKey 串行排队：上一条 Agent 消息未结束时，新普通消息会收到“已加入队列”引导，并在前序任务完成后自动处理；`/stop`、`/status` 等 Studio 命令仍可执行，binding metadata 可显式打开 parallel。
- IM Agent runner 策略固定为混合架构：真实 Feishu/Octo live binding 当前使用 one-shot `exec/resume` 保稳定；Codex 持久 session driver 保留为 metadata 实验路径，显式开启时使用 `codex app-server`，已覆盖 `turn/start`、原生 `/compact`、`turn/interrupt`、`/stop`、超时中断和失败回退。
- CC Go 旧源码对照结论已固定：Codex 正式稳定路径优先复刻 CC 的 `codex exec/resume` 子进程模型；当前 Codex 未全部完成，one-shot 主链路可用，`/new`/`/reset`/Studio `/compact` 自动合同和 Feishu/Octo service smoke 已覆盖，但仍需真实 Feishu/Octo 文件、工具流、Markdown、new/reset/compact 实测收口。Codex app-server 不作为默认 live 路线，只保留为受控 beta。
- 仓库级约束已固定：Channel Connectors 任意新功能必须先按 CC Go 1:1 迁移，再做 Studio 精修；迁移跟踪见 `channel-connectors-cc-migration-checklist.md`。

## 本次完成

- 新增根目录 `AGENTS.md`，把 CC-first 迁移门禁写成仓库级约束，明确禁止在 CC 已有成熟方案时重新造轮子。
- 新增 `docs/channel-connectors-cc-migration-checklist.md`，按 P0-P3 拆出 Codex runner、Feishu/Octo、文件/流式/菜单、Claude/OpenCode、更多平台和更多 Agent 的迁移任务。
- 更新 Channel Connectors 方案和 Studio Gateway 目标，要求任何偏离 CC 的方案必须记录原因、验收证据和回退方式。
- Codex one-shot `exec/resume` 参数顺序已按 CC Go `agent/codex/session.go` 对齐：resume 时先传 `thread_id`，再传 `--image ...`，最后 `--json -`，避免 IM 图片续接场景偏离 CC 合同。
- 新增 Studio 出站文件 manifest contract：Agent prompt 只说明 `studio-channel-files`，不出现旧桥接命令；daemon 剥离 manifest 后发送文本和文件。
- 新增出站文件校验：普通权限只允许 Agent workDir 或当前 runtime/staging 根；`yolo` 权限允许任意可读普通文件出站，但仍保留平台/daemon 文件大小限制。
- Feishu transport 补 image/file upload + message send；Octo daemon 接入已有 upload+send media，事件日志记录 declared/resolved/sent/errors。
- Feishu 长连接重投去重改为 messageId 优先，避免同一消息在 reconnect/redelivery 后因 eventId 变化再次触发 Agent 回复。
- Feishu connected-idle refresh 默认从 30 秒调为 5 分钟，保留启动 no-inbound 自检和 metadata 覆盖；connected-idle 触发重建前会清当前生命周期计数，避免重连后沿用旧消息时间造成 5 秒循环重建。
- Octo 出站上传改用共享文件名清洗，保留原始文件名中的中文、空格和括号；Agent prompt 明确要求除非用户指定改名，否则 manifest `name` 保持原文件名。
- 入站附件 staging 改为可读文件名策略：仍剥离路径穿越和非法字符，但保留中文、空格、括号等原始文件名信息，方便 Agent 和用户核对文件。
- Octo 大文件 COS 直传已接入：`transport-smoke` 支持 STS 探测、COS PUT 直传和 direct upload + send media；普通 `upload-and-send-media` 会按 `octoUploadStrategy` / `octoDirectUploadMinBytes` 自动分流；返回脱敏 bucket/region/key/cdn/credential fields，不暴露临时密钥。
- Feishu/Octo Agent 入站补 FIFO queue 并完成运行级回归：fake Octo WebSocket 连续投两条同 session 消息，第二条收到排队引导，且 fake Codex 捕获到第二个 Agent turn 在第一个结束后才启动。
- 持久 session driver 已接入 Channel daemon 实验路径：按 binding/project/session/Agent/model/workDir/permission 隔离 session pool，Codex binding metadata 显式开启时走 `codex app-server`，driver crash 自动回退 one-shot。
- Channel daemon `/status` 和 runtime 已显示真实 persistent session 状态：Codex persistent binding effective mode 为 `persistent`，active session 会显示 `codex-app-server:*`、turnCount、idleMs；非 Codex persistent 请求标记为 unsupported。
- Codex app-server driver 已对齐真实协议：`thread/start.sandbox` 使用 Codex `SandboxMode` 字符串，`turn/start.sandboxPolicy` 使用 turn 级 policy object；原生 `/compact` 不再只看提交成功，而是等待 `thread/compacted` 或 `contextCompaction` item + compact `turn/completed`。
- `/stop` 已打通 persistent driver：IM 命令 abort 当前 active run，session pool 调用 `turn/interrupt`，driver 将 app-server `cancelled/interrupted` 映射为 `status=cancelled`，Octo/Feishu 终态回执显示“Agent 已停止”而不是失败。
- 新增 Codex persistent IM live smoke 脚本：可备份真实 Channel 配置、为指定 binding 临时写入 `agentSessionDriver=persistent`、重启 daemon、验证 runtime effective mode，并在用户发真实 Octo/Feishu 消息后等待 active session/idle cleanup；默认 dry-run 且输出脱敏。
- 新增持久 Agent session 管理入口：Channel daemon 暴露 `/agent-sessions` status/reap-idle/kill，Studio API 转发 `/api/channel-connectors/agent-sessions`，Channel Connectors 会话页可刷新、清理空闲会话和停止指定 persistent session。
- 新增持久 session live 管理 smoke 脚本：`scripts/smoke-channel-connectors-agent-sessions.mjs` 可只读查看、等待 active/idle、dry-run kill、显式 `--apply` 后 reap/kill；同时修正 `GET /agent-sessions` 为纯 status，避免只读探针误清理 idle session。
- 持久 session runtime 现在显式暴露 `permissionMode`，会话页和 live smoke 输出都能区分同一用户/模型下不同权限的独立 session；driver 测试补齐用户/session/model/permission 隔离，以及 fallback disabled / user abort 不自动降级的契约。
- Codex persistent app-server 现在按 pool/session 派生独立 `CODEX_HOME`，避免不同 IM session 共享同一个 Codex 配置/状态目录；daemon 回归覆盖同一 Octo binding 下两个用户生成两个 app-server process、两个 session、两个 `CODEX_HOME`，并验证 kill 一个 session 不影响另一个。
- Channel daemon 新增 persistent session idle reaper：生产默认 10 分钟 idle TTL / 60 秒巡检；测试可用环境变量缩短 TTL，系统回归已证明无需手动 `reap-idle` 也会自动清理空闲 Codex app-server session。
- persistent driver 最近事件已进入 daemon `/status` 与 `/agent-sessions`，可观察 `turn.failed`、`session.disposed`、`turn.fallback` 等状态；daemon 回归已证明 Codex app-server 崩溃后会清理坏 session 并回退 one-shot 回复同一条 IM 消息。
- Channel Connectors 会话页已接入 persistent driver `recentEvents`，Sessions tab 可查看最近 fallback/failed/disposed/reaped 等事件，并在会话操作结果中显示事件数，方便 UI 侧确认 kill/reap/fallback 真实发生。
- IM 工具进度解析已补齐结构化输出兼容：runner 能读取 `content/output_text/result/stdout/stderr` 等工具结果字段，daemon 解析 `output:` 后保留原始换行、缩进和空行，避免工具结果为空或布局被压扁。
- Claude Code runner 开始按 CC Go `agent/claudecode` 对齐：CLI 参数补 `--verbose`，stream-json 解析已能拆出 `system` session、assistant `thinking/tool_use/text`、user `tool_result` 和最终 `result`；视觉模型收到本地 staged 图片时，stdin 改用 Claude 原生 base64 image content block；`system/result.session_id` 已写入通用 `agentNativeSessionId`，下一轮按 CC 合同追加 `--resume <session_id>`；`control_request` 已按权限模式写回 CC 兼容 `control_response`，`suggest/plan` 下可经 IM `/approve`、`/deny`、`/allow-all` 或 pending 时纯文本 `allow/deny` 批准，Feishu 已补权限确认卡片按钮并保留文本 fallback。
- Codex persistent app-server 输出链路已补齐保真：delta 不再 trim，最终回复优先使用完整 `item/completed agentMessage`，工具事件复用结构化输出解析，`studio-channel-files` fenced block 不会被压成一行导致文件无法发送。
- Codex persistent app-server 已过滤内部 `userMessage` / history prompt 回显，Feishu/Octo 进度不再展示 `Recent messages in this IM session...` 等内部上下文；one-shot runner 也过滤 `user_message` 事件，避免同类噪音。
- Codex persistent app-server 普通 turn 新增独立完成超时：若 app-server 已有 assistant 输出但迟迟没有 `turn/completed`，driver 会发 `turn/interrupt`、释放 active run，并交给外层 pool 按策略回退 one-shot，避免 IM 发送文件等场景永久卡住。
- Feishu/Octo 可见进度新增生命周期噪音过滤：底层仍保留 `turn.started` / `turn/started` 到日志和 runtime，但 IM 卡片/文本不再展示 `Codex turn started` 或 `Codex app-server turn started` 这类无业务价值的“运行中”条目。
- Feishu `transport-smoke` 补齐 `upload-and-send-media`：复用已有 `uploadAndSendFeishuMedia`，只增加 service/API 验证入口，不改 Studio 已定义的工具流、`studio-channel-files` 出站合同或底层文件发送实现。
- 按 CC CommandProvider 合同补 Agent 命令文件扫描：Claude Code 扫描 `.claude/commands`，Gemini 扫描 `.gemini/commands`；`/commands` 列出当前 Agent 命令文件，未知 `/xxx` 命中命令文件时按 `{{1}}`、`{{2*}}`、`{{args}}` 等占位规则展开 prompt 后交给当前 Agent，未命中仍原生透传。
- `/commands add/del` 已接入 Studio 原生 prompt 自定义命令 store：按 project 隔离，built-in 命令优先，其次 config prompt command，再次 Agent command file，最后才原生透传；`addexec` 暂不开放，shell 执行面后续需按 admin/yolo/审计合同单独验收。
- Feishu/Studio command surface 新增 Commands tab：主菜单可进入自定义命令子卡，显示 config prompt command 与 Agent command file，并提供按钮执行；添加/删除仍通过 `/commands add/del` 文本命令完成，避免卡片输入复杂化。
- 按 CC SkillRegistry 合同接入 `/skills` 与 Skill invocation：递归发现 `SKILL.md`，解析 frontmatter，Codex/Claude Code/Gemini/Kimi/Cursor/Qoder 使用各自 CC `SkillDirs()` 路径；未知 `/skill-name` 命中后构造成 CC 风格 Skill 执行 prompt 交给当前 Agent。
- Commands tab 已同时展示 Skills：可从 Feishu 卡片查看 `/skills`，并按钮执行当前 Agent 可用 Skill；优先级固定为 Studio 内置命令 > config command > Agent command file > Skill > 原生透传。
- Claude Code AskUserQuestion 基础闭环已按 CC Go 语义接入：`AskUserQuestion` 不再被 yolo/full-auto 自动 allow；pending question 时 IM 下一条普通回复会作为答案写入 `updatedInput.answers`，`allow/deny` 也按答案处理，`/stop` 等硬控制命令仍可执行。
- Studio `/compact` 合同已从 Channel daemon 抽成可测 helper：自动验证会向 Gateway `/responses/compact` 发送摘要请求，成功后 IM history 只保留 compact summary，并清理当前 binding + sessionKey 的旧 Codex/Claude Agent 续接；daemon 仍只负责把 runtime config 映射为路径和 Gateway endpoint。
- Service 层命令 smoke 已补齐 Feishu/Octo `/compact`：Feishu slash webhook 和 Octo incoming slash 都复用 Studio compact helper，返回用户可见文本结果，不进入 Agent；Octo service slash `/new`、`/reset` 也已覆盖清 history/session 和文本 replyPlan。
- 新增 Channel Connectors 命令 live smoke 脚本：默认只做 dry-run 计划，`--recent-sessions` 可从 daemon state 自动定位每个 binding 最近真实会话；`--probe` 只打后端 adapter dry-run，不触发平台发送、Gateway compact 或 session/history 清理；显式 `--apply --from-uid --channel-id` 或 `--apply --recent-sessions` 才发送真实 Feishu/Octo 命令请求；JSON 输出会脱敏 token/key/secret。
- Studio Gateway 新增 OpenAI Chat-compatible upstream 统一兼容层：所有进入 `apiFormat=openai_chat` provider 的 direct Chat、Anthropic->Chat、Responses/compact->Chat 请求默认剥离顶层 `metadata`，避免 BigModel 等严格 Chat 网关返回 `400/1210`；高级 provider 可用 metadata `openaiChatMetadataPassthrough=true` 显式保留。cc-switch 默认允许 `metadata` passthrough，本项目在该点偏离的原因是常见 Chat-compatible provider 兼容性。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，52 个 Model Gateway 子测试通过。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，60 个 Channel Connectors 子测试通过；覆盖 Codex resume 参数顺序、Feishu/Octo 文件收发、Feishu transport-smoke 文件发送入口、Agent/config 自定义命令扫描/展开/添加/删除、Skill 扫描/调用、Commands 菜单卡片、Studio `/compact` Gateway 请求与 session 清理、Feishu/Octo service slash compact、Octo service `/new`/`/reset`、adapter dry-run 不触发 Gateway compact 或清理状态、Claude Code stream-json 进度、图片输入、`--resume` 续接、权限 `control_response`、IM 文本批准、Feishu 权限卡片按钮、AskUserQuestion IM 回答、进度/工具事件和 daemon 合同。
- 通过：`node --test tests/system/channel-connectors-command-live-script.test.mjs`，6 个命令 live smoke 脚本子测试通过；覆盖 dry-run 不触发后端、recent session 自动定位、probe adapter dry-run、apply 前强制显式会话地址或 recent session、apply 请求带真实发送开关。
- 通过：`node scripts/smoke-channel-connectors-command-live.mjs --json` 的真实本机配置 dry-run 探针，规划 Feishu/Octo 共 6 个命令请求，输出中的 Feishu token 已脱敏。
- 通过：重启后 `node scripts/smoke-channel-connectors-command-live.mjs --recent-sessions --commands /compact --probe --json`，真实 Feishu/Octo 最近会话均返回 dry-run 提示，未再触发 Gateway compact。
- 通过：直接 BigModel Chat 字段矩阵，`metadata` 单独触发 `400/1210`，最小 Chat、`max_tokens` 和无 metadata compact shape 均成功。
- 通过：重启后直接请求本机 Gateway `/v1/chat/completions`，model=`glm-5`、带顶层 `metadata`，经统一兼容层返回 HTTP 200，runtime 记录 `openai_chat_completions` 成功。
- 通过：重启后直接请求本机 Gateway `/v1/responses/compact`，model=`glm-5`、带 internal metadata、`max_output_tokens=1000` 返回 HTTP 200 和 markdown summary；runtime 记录 `/v1/responses/compact` 后续请求均为 200。
- 通过：`node scripts/smoke-channel-connectors-command-live.mjs --recent-sessions --commands /compact --apply --no-send-reply --json`，真实 Feishu/Octo 最近会话均完成 compact，history `6 -> 1`，Agent sessions cleared `1`，未向 IM 发送可见回复。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，9 个 Codex app-server driver 原型子测试通过；覆盖 persistent markdown/文件 manifest 保真、工具输出保真、内部 userMessage 回显过滤、unfinished turn 超时中断。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，默认跳过真实 Codex smoke。
- 通过：`STUDIO_CODEX_APP_SERVER_LIVE_TURN=1 STUDIO_CODEX_APP_SERVER_LIVE_COMPACT=1 STUDIO_CODEX_APP_SERVER_LIVE_MODEL=gpt-5.4-mini node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，隔离 HOME 下真实 `codex app-server --stdio` 经本机 Studio Gateway 完成 `turn/start` 精确回复与原生 compact 完成信号。
- 通过：`STUDIO_CODEX_APP_SERVER_LIVE_INTERRUPT=1 STUDIO_CODEX_APP_SERVER_LIVE_MODEL=gpt-5.4-mini node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，隔离 HOME 下真实 app-server turn 被 `turn/interrupt` 取消并返回 `cancelled`。
- 通过：`node --test tests/system/channel-connectors-agent-session-driver.test.mjs`，6 个持久 session driver 合同子测试通过；覆盖复用、crash fallback、多用户/模型/权限隔离、禁止 fallback、stop/kill/reap、mode 解析。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，57 个 Channel Connectors 子测试通过；fake Octo + fake Codex app-server 已覆盖 persistent run、daemon `/status` active session、自动 idle reap、app-server crash -> one-shot fallback、IM `/stop` -> `turn/interrupt`、双 IM session 隔离、targeted kill、Codex `function_call_output` 结构化工具结果、Claude Code `thinking/tool_use/tool_result/result` 进度、Claude 原生 image content block、Claude native session store/resume、权限自动 allow/deny、IM resolver allow 和多行输出保真；one-shot runner 已覆盖 `user_message` progress 过滤，daemon source contract 已覆盖 `turn.started` 可见进度过滤。
- 通过：`node --test tests/system/channel-connectors-persistent-live-script.test.mjs`，验证 live smoke 脚本 dry-run、不泄露 secret、备份、写入 persistent metadata 和 restore-latest。
- 通过：`node --test tests/system/channel-connectors-agent-sessions-live-script.test.mjs`，验证 session live 管理脚本 status 不泄漏 workDir、dry-run kill 不 POST、`--apply` reap/kill 请求正确。
- 通过：`node scripts/smoke-channel-connectors-persistent-live.mjs --bindings octo-studio-cc,feishu-live --apply --json`，真实 Octo/Feishu binding 曾写入 persistent metadata 并验证 `effectiveMode=persistent`、Octo/Feishu connected、用户真实 IM `/stop` 可用；当前 live 配置已恢复 `agentSessionDriver=one-shot`，用于保持文件发送和流式进度稳定。
- 通过：`node scripts/smoke-channel-connectors-agent-sessions.mjs --json`，真实 Channel daemon 返回两个 persistent binding，`reaped=null`，证明只读 status 不触发 idle cleanup；无 idle session 时 dry-run `--kill-first-idle` 不产生副作用。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs`，Channel Connectors 页面 contract 覆盖 session 管理 API、persistent driver recent events 和 UI 操作。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-model-gateway-page.test.mjs`，6 个前端 contract 子测试通过。
- 通过：`git diff --check`。
- 通过：Feishu live `transport-smoke` file smoke，`Studio 文件名 保留测试.md` 通过 Feishu file upload + message send 成功，HTTP 200，3 requests，保留原始文件名。
- 通过：Octo live `transport-smoke` file smoke，`Studio 文件名 保留测试.md` 通过 Octo upload + send media 成功，HTTP 200，2 requests，保留原始文件名。
- 通过：Octo live STS smoke，`/v1/bot/upload/credentials` 返回 HTTP 200，region/key/cdn 和三项临时凭证字段存在，响应已脱敏。
- 通过：Octo live COS direct upload smoke，`studio-octo-cos-direct-smoke.md` 通过真实 STS -> COS PUT -> Octo sendMessage，HTTP 200，3 requests，响应已脱敏。
- 通过：重启后后端 API route `POST /api/channel-connectors/adapters/octo/transport-smoke` 以 `direct-upload-and-send-media` 再次完成真实 STS -> COS PUT -> Octo sendMessage。
- 通过：`systemctl --user restart openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service`，两个 user services 均为 `active/enabled`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3761`。
- 通过：Gateway status 显示 local daemon `state=running`、preferred CLI endpoint `http://127.0.0.1:18796/v1`；无正确 Gateway key 访问 `/v1/models` 返回 401，鉴权仍生效。
- 通过：Channel daemon `/health` 返回 `ok=true`。
- 通过：Channel daemon `/agent-sessions` 返回 `requestedPersistentBindings=[]`、Feishu/Octo live binding `effectiveMode=one-shot`、`activeSessions=[]`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略用 SDK `pingTimeout=10s` 终止无 inbound/pong 的死 socket，消息 ACK 不等待 Agent/附件 IO。长连接 cluster 模式下，安静期无法证明“无用户消息”还是“平台未投递”，因此启动 no-inbound 只自检一次，connected-idle 默认 5 分钟低频刷新且可由 metadata 关闭或调整；connected-idle 重建已清生命周期计数，避免重复低频刷新退化为快速循环。SDK `createLarkChannel` 是后续更大重构参考，但当前不直接替换，避免丢失 Studio session/Gateway/进度卡片控制面。
- Codex Agent 图片已走原生 `--image`；Studio `/compact` 已覆盖 IM history 压缩，但 Codex 原生交互式 `/compact`、`/clear` 仍需要持久 Codex session，不能通过一次性 `codex exec` 伪实现；Claude Code 已支持图片输入、权限自动回包和 IM 文本批准，但 Feishu 权限按钮卡片、AskUserQuestion、视频理解、OCR、语音/STT/TTS 仍待迁移；OpenCode 视觉输入仍待迁移。
- 出站文件基础链路已覆盖小/中型本地文件，Octo 已具备 multipart/direct upload 自动分流；高级 `yolo` 权限仅放宽本地路径根限制，不绕过平台上传限制。后续仍需做真实大文件限额和更多平台文件收发实测。
- 同 session FIFO queue 当前是 daemon 内存队列；Studio/OpenClaw 崩溃不影响 daemon 内排队，但 Channel daemon 自身重启会丢失未开始的排队消息。持久 session driver 合同已覆盖 session 级 crash fallback，但尚未实现 durable queue。
- 持久 session driver 当前只对 Codex metadata 实验路径开放，不作为 live 默认路径；真实 Codex app-server 已验证 `initialize/thread-start`、Studio Gateway `turn/start` 模型调用、原生 `/compact`、`turn/interrupt`、daemon idle reaper、超时中断和内部 prompt 过滤。文件发送/工具流式的正式 live 路径仍优先 one-shot，persistent 继续做受控 beta。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 用 `scripts/smoke-channel-connectors-command-live.mjs --recent-sessions --apply` 复验真实 Feishu/Octo `/new`、`/reset`、`/compact` 用户可见行为，再继续 Codex `exec/resume` live 文件、工具流式和最终 Markdown 排版。
2. 继续复刻 CC Go 的 Feishu/Octo 菜单、设置卡片、长连接和媒体收发细节。
3. 继续迁移 Claude Code AskUserQuestion 卡片精修/file 能力与 OpenCode runner；Codex app-server 继续保持 beta，不阻塞稳定 live 路线。
