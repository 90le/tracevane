# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移
> 更新：2026-06-07
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
- IM Agent runner 策略固定为混合架构：默认 one-shot `exec/resume` 保稳定；Codex 持久 session driver 已接入 metadata 实验路径，显式开启时使用 `codex app-server`，真实 `turn/start`、原生 `/compact`、`turn/interrupt` 和用户 IM `/stop` 已通过，失败回退 one-shot。

## 本次完成

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

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，51 个 Model Gateway 子测试通过。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，5 个 Codex app-server driver 原型子测试通过。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，默认跳过真实 Codex smoke。
- 通过：`STUDIO_CODEX_APP_SERVER_LIVE_TURN=1 STUDIO_CODEX_APP_SERVER_LIVE_COMPACT=1 STUDIO_CODEX_APP_SERVER_LIVE_MODEL=gpt-5.4-mini node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，隔离 HOME 下真实 `codex app-server --stdio` 经本机 Studio Gateway 完成 `turn/start` 精确回复与原生 compact 完成信号。
- 通过：`STUDIO_CODEX_APP_SERVER_LIVE_INTERRUPT=1 STUDIO_CODEX_APP_SERVER_LIVE_MODEL=gpt-5.4-mini node --test tests/system/channel-connectors-codex-app-server-live-smoke.test.mjs`，隔离 HOME 下真实 app-server turn 被 `turn/interrupt` 取消并返回 `cancelled`。
- 通过：`node --test tests/system/channel-connectors-agent-session-driver.test.mjs`，6 个持久 session driver 合同子测试通过；覆盖复用、crash fallback、多用户/模型/权限隔离、禁止 fallback、stop/kill/reap、mode 解析。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，50 个 Channel Connectors 子测试通过；fake Octo + fake Codex app-server 已覆盖 persistent run、daemon `/status` active session、IM `/stop` -> `turn/interrupt` 和 stopped 回执。
- 通过：`node --test tests/system/channel-connectors-persistent-live-script.test.mjs`，验证 live smoke 脚本 dry-run、不泄露 secret、备份、写入 persistent metadata 和 restore-latest。
- 通过：`node --test tests/system/channel-connectors-agent-sessions-live-script.test.mjs`，验证 session live 管理脚本 status 不泄漏 workDir、dry-run kill 不 POST、`--apply` reap/kill 请求正确。
- 通过：`node scripts/smoke-channel-connectors-persistent-live.mjs --bindings octo-studio-cc,feishu-live --apply --json`，真实 Octo/Feishu binding 已写入 persistent metadata，daemon runtime 显示两个 binding `effectiveMode=persistent`；随后轮询 `/status` 确认 Octo 与 Feishu 均 connected，用户已在真实 IM 验证 `/stop` 可用。
- 通过：`node scripts/smoke-channel-connectors-agent-sessions.mjs --json`，真实 Channel daemon 返回两个 persistent binding，`reaped=null`，证明只读 status 不触发 idle cleanup；无 idle session 时 dry-run `--kill-first-idle` 不产生副作用。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs`，Channel Connectors 页面 contract 覆盖 session 管理 API 和 UI 操作。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-model-gateway-page.test.mjs`，6 个前端 contract 子测试通过。
- 通过：`git diff --check`。
- 通过：Feishu live file smoke，`Studio 文件名 保留测试.md` 通过 Feishu file upload + message send 成功，HTTP 200，保留原始文件名。
- 通过：Octo live file smoke，`Studio 文件名 保留测试.md` 通过 Octo upload + send media 成功，HTTP 200，保留原始文件名。
- 通过：Octo live STS smoke，`/v1/bot/upload/credentials` 返回 HTTP 200，region/key/cdn 和三项临时凭证字段存在，响应已脱敏。
- 通过：Octo live COS direct upload smoke，`studio-octo-cos-direct-smoke.md` 通过真实 STS -> COS PUT -> Octo sendMessage，HTTP 200，3 requests，响应已脱敏。
- 通过：重启后后端 API route `POST /api/channel-connectors/adapters/octo/transport-smoke` 以 `direct-upload-and-send-media` 再次完成真实 STS -> COS PUT -> Octo sendMessage。
- 通过：`systemctl --user restart openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service`，两个 user services 均为 `active/enabled`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3762`。
- 通过：Gateway status 显示 local daemon `state=running`、preferred CLI endpoint `http://127.0.0.1:18796/v1`；无正确 Gateway key 访问 `/v1/models` 返回 401，鉴权仍生效。
- 通过：Channel daemon `/health` 返回 `ok=true`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略用 SDK `pingTimeout=10s` 终止无 inbound/pong 的死 socket，消息 ACK 不等待 Agent/附件 IO。长连接 cluster 模式下，安静期无法证明“无用户消息”还是“平台未投递”，因此启动 no-inbound 只自检一次，connected-idle 默认 5 分钟低频刷新且可由 metadata 关闭或调整；connected-idle 重建已清生命周期计数，避免重复低频刷新退化为快速循环。SDK `createLarkChannel` 是后续更大重构参考，但当前不直接替换，避免丢失 Studio session/Gateway/进度卡片控制面。
- Codex Agent 图片已走原生 `--image`；Studio `/compact` 已覆盖 IM history 压缩，但 Codex 原生交互式 `/compact`、`/clear` 仍需要持久 Codex session，不能通过一次性 `codex exec` 伪实现；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 仍待迁移。
- 出站文件基础链路已覆盖小/中型本地文件，Octo 已具备 multipart/direct upload 自动分流；高级 `yolo` 权限仅放宽本地路径根限制，不绕过平台上传限制。后续仍需做真实大文件限额和更多平台文件收发实测。
- 同 session FIFO queue 当前是 daemon 内存队列；Studio/OpenClaw 崩溃不影响 daemon 内排队，但 Channel daemon 自身重启会丢失未开始的排队消息。持久 session driver 合同已覆盖 session 级 crash fallback，但尚未实现 durable queue。
- 持久 session driver 当前只对 Codex metadata 实验路径开放；真实 Codex app-server 已验证 `initialize/thread-start`、Studio Gateway `turn/start` 模型调用、原生 `/compact` 和 `turn/interrupt`；真实 IM `/stop` 已由用户手测通过，仍需更长时间的 idle cleanup、crash fallback 和多用户隔离实测。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 继续做 Codex persistent driver 受控 beta：补真实 idle cleanup、crash fallback、同用户多 session、多用户/群隔离和 UI kill/reap live 验收。
2. 梳理 Channel Connectors 会话页与命令卡片，把 persistent/one-shot、队列、当前模型、权限和最近运行状态做成更清晰的管理面。
3. 再评估是否给 Claude Code / OpenCode 增加独立 persistent driver；默认 one-shot 不变。
