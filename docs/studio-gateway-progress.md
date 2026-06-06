# Studio Gateway 进度

> 状态：Studio Gateway core completed; Provider Center/App Connections completed; CLI/Gateway/live smoke harness completed; Channel Connectors F3d Octo/Codex roundtrip, session resume, progress/failure observability completed; OpenAI Platform vendor proof optional
> 更新：2026-06-06
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect；F3d 真实 Octo DM 文本往返、Codex session resume、运行中状态和失败可观测已通过。
- Phase B2 已按 `/tmp/cc-switch-src` 覆盖核心协议成熟度：CLI 启动、Claude tool/summary、OpenClaw agent provider/model/usage、Gateway HTTP compact/tool-history/error envelope、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix，以及 GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof。

## 本轮完成

- Channel Connectors F2 已完成：`/api/channel-connectors/config` typed store、Agent Profile、workDir、Agent、model、permission、Gateway endpoint/key ref、platform/bot binding、allowlist/admin。
- daemon runtime config 改为从 native config 派生；个人微信账号不能绑定不同 Agent Profile。
- 前端 `/channel-connectors` 的 Projects / Platforms tab 已从只读 skeleton 改为真实编辑保存。
- 新增 `docs/channel-connectors-native-feature-map.md`，压缩记录 CC/OpenClaw -> Studio 原生能力映射。
- 新增 Octo(dmwork) adapter contract 与 `/api/channel-connectors/adapters/octo/incoming`：支持 DM/群聊 session key、群聊 directed 规则、bot->Agent 绑定解析、文本 inbound dry-run、reply payload 分片和 mention 渲染。
- 新增 Octo REST transport：binding metadata `apiUrl/botToken/wsUrl`、register、typing、sendMessage、`/api/channel-connectors/adapters/octo/transport-smoke`；incoming `sendReply:true` 可按 replyPlan 真实发送文本。
- Channel daemon 已接 Octo register credential cache、WuKongIM WebSocket CONNECT/CONNACK/heartbeat/RECVACK/AES 解密、runtime status、Codex/Claude Code/OpenCode 一次性 CLI runner 合同；入站消息可进入 runner 并通过 REST sendMessage 回复。
- Channel daemon 已接 runner JSONL progress、`activeRuns` status、Octo event start/progress/finish、typing pulse 和失败短回执。

## 验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs`。
- 通过：`npm run build:web`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Channel Connectors 已用真实 Octo 凭据验证 register、WuKongIM WebSocket、用户消息入站、Codex CLI Agent、Studio Gateway、Octo sendMessage 和同一 IM session 的 Codex thread 续接。尚未补审批回传、图片/文件/历史上下文。

## 下一步

1. 进入 F3e：补 CLI Agent 权限审批回传。
2. 进入 F4：补图片/文件、群聊成员/history context、长回复 group buffer 和治理策略。
3. 进入 F6：按 CC 源码继续迁移飞书、微信/企业微信和其它平台。
