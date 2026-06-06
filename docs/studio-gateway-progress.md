# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors 平台配置与 Octo/Feishu live 基础闭环已完成；OpenAI Platform official proof optional
> 更新：2026-06-07
> 文档规则：只保留当前状态、最新证据、边界和下一步；不追加流水日志。

## 当前状态

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都使用独立 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Provider Center 已支持自定义 provider、启用/停用、模型列表/别名/默认模型、priority、App scope、active routing、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合所有启用 provider，同名模型可跨 provider 组成模型池。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI smoke harness。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；本地已接入 Octo(dmwork) 与 Feishu，支持 Codex/Claude Code/OpenCode runner、Studio Gateway client key、IM session override、slash command、Feishu card/menu/progress card、附件 staging、history、group context、reply buffer 和基础治理。

## 本次完成

- 本机 Octo `studio-cc` 真实 live inbound 已验证：Octo DM -> WuKongIM WebSocket -> Channel daemon -> Codex CLI Agent -> Studio Gateway -> Octo sendMessage，最近 4 条 run 均 `agentOk=true` / `replySent=true`。
- 同一 Octo IM session 已验证 Codex thread resume 与进度记录：工具调用请求记录 15 个 progress events，图片入站按附件摘要进入 Agent 后正常完成。
- Octo 出站媒体基础合同已迁移并真实验证：参考 CC dmwork 小文件 multipart 上传路径，新增 `upload-file` / `upload-and-send-media` transport smoke；图片会发送 Octo image payload，普通文件发送 file payload。
- Octo 入站附件 URL 兼容已扩展：除 `url` 外，也识别 `file_url/fileUrl/media_url/mediaUrl/download_url/downloadUrl/cdn_url/cdnUrl/origin_url/originUrl/src/href`，payload-only 附件会先补回 `attachments` 再进入 staging。
- Octo 入站协议参考已补齐：已安装 OpenClaw Octo 插件 `~/.openclaw/extensions/octo`（1.0.14）作为 Octo 专属参考源；本次按插件协议补 GIF=3 与 RichText=14 图文混排、多图 `mediaUrls` 入站归一化。
- Feishu/Octo 图片入站已确认可接收并 staging；新增非视觉模型保护，`glm-5` 等未标记 vision 的模型仍执行受控 Agent turn，但 prompt 会禁止视觉推断并要求询问用户下一步；普通文件仍照常进入 Agent。
- 本机 Studio Gateway 已配置 GMN 视觉测试 provider：`gmn`，base `https://gmn.chuangzuoli.com/v1`，默认模型 `gpt-5.5`，alias `gmn-vision` / `vision-gpt-5.5`，key 仅保存在本机 secret store。
- Channel daemon status API 已确认 Octo 与 Feishu connected，`platformBindings=2`；运行中任务可通过 `activeRuns` 观测。

## 最近验证

- 通过：`curl -sS http://127.0.0.1:18797/status`，Octo/Feishu connected，最近 Octo runs 为 completed。
- 通过：解析 `~/.config/openclaw-studio/channel-connectors/daemon/state/octo-events.jsonl`，最近 4 条 Octo inbound run 均 `agentOk=true` / `replySent=true`。
- 通过：`npm run typecheck:api`、`npm run typecheck:web`、`npm run build:api`、`npm run build:web`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Octo transport smoke registers bot|Feishu transport sends replies|Channel Connectors routes|daemon registers Octo|stages attachments"`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Octo transport smoke"`，覆盖 Octo register、multipart upload、media send payload。
- 通过：真实 Octo `studio-cc` `upload-and-send-media` smoke，小文本文件上传与发送均返回 200，`requestCount=2`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "Octo adapter|stages attachments"`，覆盖 Octo 入站 URL 变体归一化和 URL staging。
- 通过：同一 Octo adapter/staging 测试覆盖 payload-only 附件补回、GIF=3、RichText=14 图文混排和多图 `mediaUrls`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs --test-name-pattern "native Channel Connectors agent runner"`，覆盖 `glm-5` 图片附件仍启动 Agent、但带非视觉理解约束 prompt。
- 通过：GMN `gpt-5.5` provider smoke：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 三个上游入口均返回 200；Studio Gateway `/v1/models` 暴露 GMN 模型池。
- 通过：GMN 视觉 smoke：32x32 红色 PNG 经 Studio Gateway `/v1/responses` 和 `/v1/chat/completions` 均路由到 `gmn`，返回 `Red/red`；alias `gmn-vision` 文本 smoke 返回 200。
- 通过：Playwright 打开 `/channel-connectors`，检查 Feishu/Octo 平台配置表单无 console error、无横向溢出。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 已配置为后续视觉测试源，但未设为任何 App scope 的 active provider；当前 active provider 仍是 `glm`。测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu 与 Octo 文本 live 已通过，图片/视频入站接收和 staging 不受模型能力影响；非视觉模型可以继续对话和处理非视觉文件任务，但必须拒绝内容理解。真正视觉理解仍需后续接入可验证的视觉模型输入链路或 OCR/解析工具，不能只把本地路径交给文本模型。
- Octo 出站媒体当前覆盖小文件 multipart upload；CC 的大文件 COS STS 直传尚未迁移，避免引入新依赖前先保持显式边界。
- Feishu card/menu 已可用，但后续视觉和交互仍需继续参考 CC 成熟卡片结构做 Studio 化精修。

## 下一步

1. 把 IM 图片附件接入视觉模型路径：当 session 模型为 `gmn-vision` / `gpt-5.5` 时，将 staged 图片作为 image input 传给 Agent 或 Gateway，而不是只传本地路径。
2. 继续迁移 CC/OpenClaw 的语音/STT/TTS、大文件 COS 直传和多平台 adapter。
3. 精修 Feishu card/menu 与 Octo 弱富交互，保持 IM 命令和 Studio UI 同一 typed 状态。
