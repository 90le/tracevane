# Studio Gateway 目标方案

> 状态：Studio Gateway core matrix、daemon lifecycle、Provider Center、App Connections、真实 provider/CLI smoke 与文档迁移已完成；Channel Connectors 迁移进行中；OpenAI Platform vendor proof optional
> 更新：2026-06-11
> 文档规则：本文件只保留目标、边界、验收和阶段计划；进度写到 `studio-gateway-progress.md`。旧 `codex-stack-model-gateway-*` 文档名已停止使用。

## 1. 最终目标

`Codex Stack` 作为旧功能面终止演进。当前正式目标是 **Studio Gateway** 管理页和后端逻辑，用通用模型网关接入 Codex、Claude / Claude Code、OpenCode、OpenClaw 以及其他 CLI / AI 工具。

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

Provider / model routing 目标：

- Provider 可新增多个，并支持启用、停用、删除；停用 provider 不参与 active routing、模型目录和自动 failover。
- Active routing 按 App scope 选择 provider：Codex、Claude Code、OpenCode、OpenClaw 可各自固定 provider，也可保持 Auto 按启用 provider 和健康状态选择。
- Studio Gateway 对外提供统一模型目录，例如 `GET /v1/models`，聚合所有已启用 provider 的模型；模型 ID 必须能映射回 provider，可支持显示名、别名和能力标记（文字、图片、工具、推理、Responses、流式），并允许 App Connections / Channel Connectors 依据能力选择模型。
- Gateway 模型目录是上下文预算源头：每个模型必须允许配置或识别 `contextWindow`、`maxOutputTokens`、是否支持 reasoning/vision/tools；检测优先使用 provider 返回字段，其次用保守模型族默认值兜底；App Connections 和 Channel Connectors 的上下文窗口、自动 compact 阈值、max output 默认从 resolved model 派生，用户可在 App/Profile 层覆盖但不能高于已知模型预算。
- 客户端只配置 daemon endpoint 和一个本地 Gateway key；真实 upstream key 留在 Studio secret store。Gateway key 必须可由用户编辑或生成；设置并启用后，`/v1/models` 和三类客户端协议端点都必须校验该 key，且不会把本地 key 透传上游。
- 不同 provider 暴露同名 model ID 是合法模型池：优先 active routing 所属 provider；Auto 按 provider priority 和健康状态选择；open circuit 自动切换到下一个同名模型 provider；也支持 `provider/model` 或 alias 显式选择。
- 同一个 provider 内不允许重复 model ID 或重复 alias，重复判定大小写不敏感，保存时必须拒绝。

成熟度门槛：

- 不能只靠 mocked route test 宣称完成；必须有真实 provider smoke 和真实 CLI smoke。
- Anthropic-compatible、OpenAI Chat-compatible、OpenAI Responses-native provider 都必须有真实 provider smoke；OpenAI 官方 Platform 只作为额外 vendor proof。
- 对齐 `/tmp/cc-switch-src` 的协议转换成熟度：SSE 状态机、tool/history、usage/cache、error envelope、provider-declared reasoning/thinking 映射、并发 tool call 和增量参数。
- 任意 provider 暴露三类客户端协议时，严格客户端不能收到畸形事件、空 usage 对象、裸 upstream 错误或丢失 tool/session 连续性。

参考源码与 live smoke：

- 本地参考源码：`/tmp/cc-switch-src`，重点参考协议转换、SSE 重建、tool/history 和 usage 映射，不迁移旧 UI。
- BigModel Chat Completions smoke base：`https://open.bigmodel.cn/api/coding/paas/v4`，已覆盖 Responses basic/stream/tool-call/tool-history/error-envelope。
- BigModel Anthropic smoke base：`https://open.bigmodel.cn/api/anthropic`，该 provider 需 endpoint override 到 `/v1/messages`，已覆盖 Messages basic/stream/tool-use/error-envelope。
- MLAMP OpenAI-compatible smoke base：`https://llm-gateway.mlamp.cn/v1`，model `gpt-5`；该 base 只保留为历史/可选参考，不作为当前 OpenAI 官方 compact 验收门槛。
- GMN Responses-native substitute smoke base：`https://gmn.chuangzuoli.com/v1`，model `gpt-5.4`；已替代 OpenAI 官方原生端点验证 `/v1/responses`、stream、`/v1/responses/compact` 与 error envelope，但不等同于 OpenAI Platform vendor proof。
- OpenAI Platform official smoke：降为可选 vendor proof；如仍需官方平台证明，后续用真实 Platform base/key 单独验证；凭据不得写入文档、测试 fixture 或 git。

## 3. 生命周期目标

正式模型 relay 只能依赖独立 Local Gateway daemon。

- 非单口模式：CLI 直接访问 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- 单口模式：OpenClaw 只挂载 Studio UI / control API；模型请求默认仍写 daemon loopback，单口 endpoint 只作为可选 ingress/proxy。
- OpenClaw Gateway、Studio API 或 Studio UI 崩溃时，daemon 继续服务已接管客户端。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 托管：Linux `systemd --user`、macOS launchd、Windows scheduled task/service。
- 新设备首次安装必须能通过 Studio 写入 user service、启用系统自启动、启动 daemon，并支持后续 status、start、stop、restart、ensure-running；已安装时“安装/启用”按重装/重新启用处理。
- `start`、`restart`、`ensure-running` 不能只看 supervisor active；必须等 daemon HTTP status endpoint ready 后才算真正 started。

## 4. 渠道接入边界

渠道接入是独立产品域，不复用 Codex Stack，也不塞进 Studio Gateway。

```text
飞书 / 微信 / Octo(dmwork) / IM -> Studio native Channel daemon -> local CLI Agent bot -> Studio Gateway
```

- Channel Connectors 改为 Studio 原生实现，不上线短期托管 cc-connect 方案；CC 二开源码已有功能都必须纳入 Studio 原生目标，首批平台只是实施顺序。
- Channel Connectors 使用独立 Studio 配置/secret/state，不写入 `openclaw.json`、OpenClaw channels 或 OpenClaw bindings。
- Channel daemon 必须常驻守护；Studio / OpenClaw 崩溃时仍保持渠道服务和 Codex/Gateway 对话链路，不内置额外修复流程。
- Channel / Agent 任意新功能实现前必须先定位 CC Go 对应实现，按平台协议、消息语义、交互菜单、错误处理、长连接和状态流做 1:1 contract 迁移，再做 Studio 化精修；禁止在已有成熟设计时重新盲目设计。
- Octo/Feishu 等平台 skills 必须是“文档 + typed runtime action + 执行器”的组合：Agent 可阅读 runtime skill 文档，但任何平台操作只有进入 Studio 白名单 manifest 并由 daemon/service 执行器落地才算支持；禁止只把 OpenClaw/CC skill 文档注入 prompt 后宣称能力已支持。
- Channel Connectors 进度跟踪以 `docs/channel-connectors-cc-migration-checklist.md` 为准；任何偏离 CC 的实现都必须写明原因、验收证据和回退方式。
- Channel daemon 的平台长连接必须以 CC Go 成熟实现为基线迁移；Octo(dmwork) 默认 30s heartbeat、10s PONG timeout、RECVACK、5 分钟 messageId 去重、`3s + 0..3s` 抖动重连和 5 分钟 REST heartbeat 备用保活，Feishu 采用同 App 共享长连接后扇出事件。
- Feishu 入站消息必须先完成轻量解析/去重/准入并快速 ACK；文件下载、Agent 调用、进度卡片和最终回复必须后台异步执行，避免 SDK dispatcher 被 IO 阻塞后触发平台重投。
- Feishu card/menu 的导航动作才返回卡片；`/new`、`/reset` 等执行动作必须直接执行并返回结果，不得自动弹出完整菜单。
- IM 原生命令穿透必须区分未知 slash 兜底和显式 `/native`：未知 `/xxx` 可按 CC Go 提示后进入 Agent，显式 `/native <命令>` 必须作为 runner `nativeCommand` 处理，不得混入 history/group/attachment prompt；不支持的 CLI 原生命令必须明确拒绝，不能送给模型当普通文本。
- IM 文件收发必须由 Studio native Channel transport 完成：入站附件 staging 后交给 Agent，出站文件由 Agent 声明本地文件 manifest，daemon 再按 Feishu/Octo/后续平台上传和发送；不得把外部桥接命令或平台 CLI 暴露为生产发送路径。
- IM 上下文管理分三层：Studio/Gateway 负责模型预算和触发决策；Agent 原生上下文管理优先执行，用于压缩 Agent 内部 session；Studio-managed compact 只作为不支持原生、原生失败或非持久 runner 不可靠时的通用兜底。
- IM `/compact` / `/compress` 是“智能压缩”入口：优先调用当前 Agent 的原生 compact/compress 能力；不支持或失败时调用 Studio Gateway `/responses/compact` 压缩当前 IM history，替换为 summary，并清理不可靠的旧 Agent 续接。Codex `exec/resume` 不得硬塞交互式 `/compact`，Codex `app-server` 等持久 driver 才可走原生 compact。`/native /compact` 保留为强制原生命令入口。
- Agent runner 采用混合策略：默认 one-shot `exec/resume` 保持守护稳定、易恢复、易隔离；Codex persistent driver 先作为 metadata 实验路径接入 `codex app-server`，真实 `turn/start`、`/compact` 和 `turn/interrupt` 已通过 Studio Gateway smoke，IM `/stop` 已通过 daemon fake app-server 回归；扩大默认范围前仍需真实 IM live stop、session cleanup 和 fallback 验收。其他 Agent 的持久 driver 逐 Agent 评估。持久 driver 必须按 binding + IM session + Agent Profile + permission 隔离，有 idle TTL、max sessions、健康检查、强制 kill、日志和降级到 one-shot 的策略。
- 多 Agent 必须基于 session pool 而不是单全局 TUI：每个 IM 会话可绑定不同 Agent/Profile/模型/工作目录；群聊中多 bot 或多 Agent relay 不共享进程上下文，跨 Agent 协作通过显式 relay/session key 记录。
- `/stop`、取消、重置等 IM 执行动作必须走真实 runner/session contract；其中 `/stop` 必须终止当前 binding + IM session 的 active CLI Agent 进程，不能只返回占位提示。
- Feishu 长连接不得只相信 SDK `connected` 状态；Studio 必须记录真实 dispatcher callback、business message ingress、ping/pong 和控制帧 freshness；默认启用当前 Lark SDK 的 lower-case `pingTimeout=3` liveness watchdog，并把有效 ping 调度 clamp 到 10s，`connected` 只有在无 pong overdue、无 transport stale 时才为真；不因空闲无业务消息主动重建；所有 WS event handler 必须快速 ACK，业务处理后台化；死 socket 依赖 SDK liveness、SDK/socket terminal lifecycle、官方重连、OpenClaw-style 外层重建、Studio short pong timeout 和 transport stale 回收处理；同一会话已处理更新消息后，Feishu 补投的更旧消息必须按水位线跳过，不得插队进入 Agent。其他自动轮换必须先有专项文档证据。发布前必须评估并记录是否采用 webhook/hybrid ingress 或 Studio-owned WS transport 来达到 Octo 级稳定目标。
- Rich 平台优先使用卡片/Markdown；普通文本平台也必须有清晰命令分组、当前会话状态、原生 Agent 透传说明和长回复读取入口，不能只给一串无结构命令列表。
- 原生 contract 统一 incoming、reply、attachment、voice、thread、ack/retry、allowlist、admin、rate limit、banned words、slash command、cron、hooks、relay、session key 和 bot->Agent binding。
- 优先 Octo(dmwork)，再飞书、微信/企业微信；后续覆盖 CC 已有平台，包括钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE 等。
- 参考源：CC 二开全量源码 `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`，其中 `platform/dmwork` 即 Octo；OpenClaw Feishu 最新参考 `/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`；OpenClaw Octo 插件参考 `/home/binbin/.openclaw/extensions/octo` 与 `/home/binbin/.openclaw/extensions/octo/skills/octo-bot-api/SKILL.md`；生产实现不依赖 cc-connect binary，也不得恢复旧 `resources/codex-stack` 生产路径。

## 5. 新架构边界

| 模块 | 职责 |
| --- | --- |
| Studio Gateway Core | provider registry、secret store、active route、health、request log、usage ledger、adapter registry |
| Studio Gateway daemon | loopback HTTP listener、协议 adapter、provider router、runtime metadata、supervisor contract |
| Gateway Service & Config | daemon 安装/启用自启动/启动/停止/重启/状态、用户自定义 provider 配置、provider 启停、协议/模型自动识别弹层、secret 写入、聚合模型目录、模型别名、默认模型、模型能力标记、模型上下文/输出预算、active provider、resolved route 状态、provider-native smoke、client-protocol active-route smoke |
| App Connections | Codex、Claude Code、OpenCode、OpenClaw 的配置检测、脱敏 preview、确认后 apply、备份/rollback、默认模型与 App 级模型覆盖、模型目录选择、上下文/compact/max output/reasoning profile；支持写入预算字段的 Agent 配置直接随选中模型写入，Claude Code 等无标准预算字段的工具由 Gateway/Channel 层使用预算做上下文管理；Codex 低频兼容参数收进高级折叠 |
| Channel Connectors | Studio 原生 Channel daemon、typed config store、Agent Profile、workDir/model/permission/Gateway key ref、platform/bot->Agent 绑定、CC 全功能原生化、Octo(dmwork)、飞书、微信等 IM 渠道事件接入、会话映射、治理、自动化、消息路由、平台 skill runtime action 白名单与执行器 |
| Gateway UI | Runtime/Gateway key/Active routing 左侧常驻，右侧用 tabs 分开 App Connections、Provider Center、Smoke；参考旧 CPA 管理页的运行态布局和 cc-switch 的 provider 表单，但不内置具体 vendor 预设，也不复用旧 Codex Stack / CPA / Compact 文案、诊断矩阵、安装修复复杂度；Provider 原生协议只展示三类常见协议 |

## 6. 删除范围

需要删除或迁移后删除：

- 前端：`apps/web-vue/src/features/codex-stack/**`，包括状态页高级诊断、运行矩阵、运行模式、技术检查、安装修复、路由模型、日志子页和所有 CPA/Compact 说明。
- 后端：`apps/api/modules/codex-stack/**`、`/api/codex-stack/*` routes、Codex Stack summary/profile/job/service schema。
- 资源：`resources/codex-stack/**` 中旧 installer、CPA/Compact 模板、health/smoke 脚本。
- 测试：旧 `codex-stack-*` 测试改为 Studio Gateway / App Connections 测试；不得再用 CPA/Compact 成功路径验收。
- 文档：正式入口为 `studio-gateway-goal.md` 与 `studio-gateway-progress.md`；旧 `codex-stack-model-gateway-*` 文档名不再使用。

## 7. 新功能验收

- Studio Gateway daemon 支持并测试通过：
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/responses/compact`
  - `/v1/messages`
  - streaming 变体
- Provider registry 支持 Anthropic Messages、OpenAI Responses、OpenAI Chat Completions 三类原生 provider。
- `GET /v1/models` 返回已启用 provider 的聚合模型目录；一个本地 Gateway key 可用于所有授权模型，且不会暴露 upstream key。
- Active routing 可把 provider 应用到 Codex、Claude Code、OpenCode、OpenClaw；停用 provider 不可被选中，已被选中的 provider 停用后必须回退或提示；每个 active route 必须显示 resolved provider/model，并能验证实际 Gateway 客户端协议入口。
- Codex、Claude Code、OpenCode、OpenClaw 可通过 App Connections 生成脱敏配置 preview，并在用户确认后 apply；apply 前必须有本地 Gateway key 和可用 provider 模型，写入前备份原文件，且支持 rollback。
- App Connections 支持一键切换 app profile：默认模型、每个 App 单独模型覆盖、上下文窗口、compact 阈值、max output、reasoning/effort、必要兼容参数；模型选择必须来自 Gateway 可用模型列表并允许手动输入兼容 alias。
- Channel Connectors 原生配置 Octo(dmwork) / 飞书 / 微信等 IM 渠道；消息进入本地 CLI Agent bot，再由 Studio Gateway 调模型。
- Channel Connectors 遇到图片/视频/贴纸等视觉附件时，必须优先使用 Gateway 模型能力：当前模型支持 vision 则保持不变；当前模型不支持且模型池存在 vision 模型时，仅本轮切换到 vision 模型；没有 vision 模型时继续受控对话并禁止视觉推断。
- Channel Connectors `/compact` 验收必须证明：命令不会作为普通 prompt 发送给 Agent；优先按当前 runner 能力触发 Agent 原生 compact/compress；不支持或失败时 Gateway compact 使用用户/配置给出的 endpoint 前缀请求 `/responses/compact`，例如 endpoint 已带 `/v1` 时请求 `/v1/responses/compact`；Gateway compact 成功后 history 只保留 compact summary；不可靠的旧 Agent/Codex thread 续接被清理；所有失败都返回明确错误。
- Channel Connectors 自动上下文管理验收必须证明：resolved model 的 `contextWindow/maxOutputTokens` 可进入本 IM session 预算；Gateway runtime usage 优先，字符估算兜底；达到剩余上下文阈值时优先触发 Agent-native compact；成功后记录 used-token baseline，后续按 `当前 used - baseline used` 继续判断；runner 不支持、原生失败或 one-shot 不可靠时降级 Studio compact；失败或 native 阻塞才进入 retry cooldown；每次 `/status` 或可选 footer 能显示剩余上下文百分比。
- Channel Connectors `/usage` 验收必须证明：命令读取 Studio Gateway runtime 的真实 usage/token 账本，并按当前 binding + IM session 的 Agent run 时间窗汇总；没有上游 usage 时必须明确提示无统计，不能返回占位数字。
- Channel Connectors `/reasoning` 验收必须证明：IM session 可用序号或 `low|medium|high|xhigh|default` 切换推理强度，切换后旧 Agent 续接被清理，Codex/Claude Code/OpenCode runner 都收到对应原生 CLI 参数。
- Channel Connectors platform skill 验收必须证明：Octo/Feishu 内置 skills 会进入普通 IM prompt 和 Codex/Claude/OpenCode 原生 skill 投影；管理页可查看每个 skill 的 runtime actions；Agent 声明的 `studio-channel-messages`、`studio-channel-files`、`studio-octo-actions`、`studio-feishu-actions` 只有在 typed action 白名单内才会执行；未接执行器的操作必须明确失败或提供 fallback，不能只靠 prompt 文档假装支持。
- Claude Code 权限验收必须证明：`control_request` 不能只作为进度展示，必须按 CC Go 合同回写 `control_response`；自动模式可 allow，保守模式必须 fail-safe deny 或经 IM 文本/Feishu 按钮卡片批准；`AskUserQuestion` 必须按 CC Go 特例处理为用户问题回答，不能被 yolo/full-auto 自动 allow，也不能把 `allow/deny` 误当权限命令。
- Channel Connectors session 管理验收必须证明：`/name` 可命名当前或指定序号 Agent session，`/search` 可按名称/sessionId 等字段搜索，Feishu 卡片和纯文本菜单都显示命名结果。
- 持久 session driver 验收必须证明：进程可观测、可停止、可 idle 回收，并在 Studio API/UI 暴露 status、reap-idle、kill 管理入口；crash 后 session store 不损坏；同一用户可切换多个 Agent；不同用户/群/线程不会串上下文；driver 不支持某能力时能回退 one-shot runner。
- Channel Connectors 发布前必须覆盖 CC 二开源码的核心能力：多平台、多 Agent、文本/图片/文件/语音、群聊 mention、会话续接/切换、allowlist/admin/rate limit、slash command、cron、hooks、relay、management/status/logs。
- 客户端配置只保存 placeholder 或 local endpoint；真实 upstream key 留在 Studio secret store。
- OpenClaw/Studio 崩溃隔离测试通过：daemon direct endpoint 继续可用。
- 生产前后端无 `codex-stack` 命名入口，无 CPA/Compact 用户可见链路。

## 8. 阶段计划

| 阶段 | 目标 |
| --- | --- |
| Phase A | 固定 Studio Gateway 命名、API contract、迁移删除清单 |
| Phase B | 补齐核心协议矩阵 adapter 与测试，确保 Studio Gateway daemon routes 全部通过（核心已完成） |
| Phase B2 | 按 cc-switch 成熟度补齐真实 SSE / tool / history / usage / reasoning 行为；strict smoke 已覆盖真实 CLI 启动、Claude tool/summary、OpenClaw agent local provider/model/usage、Gateway HTTP compact/tool-history/error-envelope probes、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 参数映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started Responses/Anthropic upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix、GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof |
| Phase C | 删除 Codex Stack 前后端、资源和旧测试入口（已完成） |
| Phase D | 先新建 Studio Gateway 服务与配置面：daemon 状态/启停、provider 配置、provider 启停、active routing、resolved route 状态、聚合 `/v1/models`、模型池/别名/优先级、模型能力和上下文/输出预算、可编辑统一 Gateway key、协议/模型自动识别、secret、模型列表/默认模型、provider-native smoke、client-protocol active-route smoke；UI 借鉴旧 CPA 的运维入口和 cc-switch 的 Provider 管理体验，检测入口贴近 Base URL / API Key，daemon Runtime 只暴露主操作并把低频运维动作收进更多菜单，启停动作以 HTTP readiness 为最终成功条件 |
| Phase E | Codex、Claude Code、OpenCode、OpenClaw 配置 preview/apply/profile/rollback 与隔离 HOME HTTP 验收已完成；继续做真实 CLI 启动 smoke 和细节兼容 |
| Phase F | Channel Connectors 原生 daemon 与 CLI Agent Bot：CC 全功能映射、Octo(dmwork)、飞书、微信、多 Agent、消息/治理/自动化 contract、Gateway 模型能力路由、上下文预算/自动 compact 与管理面 |
| Phase G | Studio Gateway 文档已切到正式文件名；Channel Connectors 原生方案文档已建立 |
