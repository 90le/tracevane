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
- IM Agent runner 策略固定为混合架构：默认 one-shot `exec/resume` 保稳定；后续持久 TUI/session driver 只作为可观测、可回收、可降级的高级能力接入。

## 本次完成

- 新增 Studio 出站文件 manifest contract：Agent prompt 只说明 `studio-channel-files`，不出现旧桥接命令；daemon 剥离 manifest 后发送文本和文件。
- 新增出站文件校验：普通权限只允许 Agent workDir 或当前 runtime/staging 根；`yolo` 权限允许任意可读普通文件出站，但仍保留平台/daemon 文件大小限制。
- Feishu transport 补 image/file upload + message send；Octo daemon 接入已有 upload+send media，事件日志记录 declared/resolved/sent/errors。
- Feishu 长连接重投去重改为 messageId 优先，避免同一消息在 reconnect/redelivery 后因 eventId 变化再次触发 Agent 回复。
- Feishu connected-idle refresh 默认从 30 秒调为 5 分钟，保留启动 no-inbound 自检和 metadata 覆盖，减少正常在线时的频繁重连。
- Octo 出站上传改用共享文件名清洗，保留原始文件名中的中文、空格和括号；Agent prompt 明确要求除非用户指定改名，否则 manifest `name` 保持原文件名。
- 入站附件 staging 改为可读文件名策略：仍剥离路径穿越和非法字符，但保留中文、空格、括号等原始文件名信息，方便 Agent 和用户核对文件。
- Octo 大文件 COS 直传已接入：`transport-smoke` 支持 STS 探测、COS PUT 直传和 direct upload + send media；普通 `upload-and-send-media` 会按 `octoUploadStrategy` / `octoDirectUploadMinBytes` 自动分流；返回脱敏 bucket/region/key/cdn/credential fields，不暴露临时密钥。
- Feishu/Octo Agent 入站补 FIFO queue：同一 binding + IM session 已有 active run 时不再并行启动第二个 Agent turn，改为发送“已加入队列，必要时 `/stop`”引导，前序任务结束后自动继续，并记录 `channel.agent.queued` 事件。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，51 个 Model Gateway 子测试通过。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，47 个 Channel Connectors 子测试通过。
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
- Feishu 官方 SDK 仍可能因网络或平台关闭连接而 reconnect；当前策略用 SDK `pingTimeout=10s` 终止无 inbound/pong 的死 socket，消息 ACK 不等待 Agent/附件 IO。长连接 cluster 模式下，安静期无法证明“无用户消息”还是“平台未投递”，因此启动 no-inbound 只自检一次，connected-idle 默认 5 分钟低频刷新且可由 metadata 关闭或调整。SDK `createLarkChannel` 是后续更大重构参考，但当前不直接替换，避免丢失 Studio session/Gateway/进度卡片控制面。
- Codex Agent 图片已走原生 `--image`；Studio `/compact` 已覆盖 IM history 压缩，但 Codex 原生交互式 `/compact`、`/clear` 仍需要持久 Codex session，不能通过一次性 `codex exec` 伪实现；Claude Code / OpenCode 视觉输入、视频理解、OCR、语音/STT/TTS 仍待迁移。
- 出站文件基础链路已覆盖小/中型本地文件，Octo 已具备 multipart/direct upload 自动分流；高级 `yolo` 权限仅放宽本地路径根限制，不绕过平台上传限制。后续仍需做真实大文件限额和更多平台文件收发实测。
- 同 session FIFO queue 当前是 daemon 内存队列；Studio/OpenClaw 崩溃不影响 daemon 内排队，但 Channel daemon 自身重启会丢失未开始的排队消息。后续持久 session driver 设计时再评估是否需要 durable queue。
- Feishu 历史未 ACK 事件可能仍会被平台重投一次；持久化去重会记录并跳过，最终仍需用户发送全新消息复验 live 回复。

## 下一步

1. 设计并测试持久 session driver 最小合同：session pool、事件流、stop/kill、idle 回收、crash recovery、one-shot fallback。
2. 继续按 CC Go 补更多设置型卡片和命令细节，优先做模型/Agent/权限/目录下拉卡片的批量切换、切换结果卡片和分页。
3. 继续迁移 Claude Code / OpenCode 视觉输入、OCR、语音/STT/TTS、真实大文件限额验证和更多平台 adapter。
