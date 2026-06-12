# Channel Connectors CC Migration Checklist

> 更新：2026-06-12
> 原则：CC Go 先 1:1 迁移，Studio 再精修。禁止在 CC 已有成熟方案时重新造轮子。

## 迁移门禁

每个功能进入实现前必须完成：

1. 定位 CC Go 源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`。
2. 写明要迁移的 contract：消息、命令、状态、文件、权限、错误、重试、测试。
3. 先移植等价行为，再做 Studio typed config / Gateway / UI 优化。
4. 用自动测试和真实 IM/CLI smoke 验证用户可见行为。
5. 偏离 CC 时，在本清单和 commit trailer 记录原因。

Octo 专属能力若 CC Go 不完整，参考 `~/.openclaw/extensions/octo`；Feishu 专属能力参考 `/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`。这些外部源码只作迁移参考，运行时默认 platform skills 必须由 Studio 自管并随 Studio 发布，不能依赖 OpenClaw 插件目录存在。模型网关协议转换参考 `/tmp/cc-switch-src`。Feishu 长连接假在线问题单独跟踪在 `feishu-long-connection-issue-tracker.md`，所有反馈和假设先写入该文档。

当前已记录偏离：产品未发布前不为旧实验命令/字段做兼容负担；Studio 显示 schema 已改为三路控制：`/thinking` 控制思考、`/process` 控制过程回复、`/tools` 控制工具，`/quiet` 与 `/quiet compact` 批量隐藏三类中间态，`/quiet full` 恢复默认显示。

当前已记录偏离：CC Go `/delete` 调 Agent `SessionDeleter` 删除 agent-side session；Studio 当前先删除本地 Agent resume/session store 记录，并拒绝删除当前 active session。若要同时 kill daemon persistent process，需后续接入 agent-session management kill 合同。

当前已记录偏离：CC Go `/compress` 调当前 Agent `CompressCommand()`；Studio 现有 `/compact`/`/compress` 已先落成 Channel 自建压缩兜底。目标已调整为 native-first：入口优先调用当前 Agent 原生 `CompressCommand` / app-server compact；不支持、失败或 Codex one-shot 不可靠时才降级 Gateway `/responses/compact` 摘要 IM history 并清旧续接。`/native /compact` 保留为强制原生路径，但没有真实 live persistent compact contract 时必须拒绝伪透传；Codex persistent beta 已验证原生 app-server compact，Claude Code stream-json 与 OpenCode `run --session` 已补 CC Go `AgentSession.Send("/compact")` contract，并通过真实 CLI mock-Gateway 普通 turn + compact smoke；Claude Code/OpenCode stop cancel 也已进入同一 strict smoke。

当前已记录偏离：CC Go OpenCode runner 期望 `opencode run --format json` 输出 NDJSON；本机 OpenCode 1.16/1.17 可能 exit 0 但 stdout 为空，并把 session/message/part 写入 `opencode.db`。Studio 保留 stdout NDJSON 优先，同时补 `sqlite3 -json` fallback；fallback 只接受本轮启动后的 assistant part，并短轮询等待异步写入，避免读到上一轮旧回复。

当前已记录边界：`CHANNEL_CONNECTOR_AGENT_IDS` 保留完整迁移路线图，但 Channel Connectors 的 live `supportedAgents` 只暴露当前已有 runner 和自动 skill 回归的 Codex、Claude Code、OpenCode。其它 Agent 未迁移前保存配置会被拒绝，避免前端提供不可运行选项。Codex/Claude Code 这类原生支持 skills 目录的 Agent，会额外收到 Studio runtime 版 platform skill 投影；投影必须来自 Studio 内置或 binding 显式配置，过滤安装、注册、凭证等 setup 章节。

当前已记录边界：Feishu 群 @bot 不能依赖用户手工填写 `botId`。Studio daemon 必须启动前解析并缓存 Feishu `bot.open_id`，并把运行时 `botOpenId` 与配置 `botId/metadata.botOpenId` 一起用于 mention gate；`/status` 必须暴露 bot identity 诊断，群消息跳过日志必须能区分“未 @bot”和“bot 身份未解析”。

当前已记录边界：Octo/Feishu platform skills 不再扩展为平台 API 工具层。`studio-channel-skill`、`studio-octo-actions`、`studio-feishu-actions`、platform runtime action index 和对应执行器不再是目标，后续删除。Agent prompt/skills 只保留私聊消息、文件/图片附件、工作目录、权限、compact 和 Agent CLI 原生命令说明；出站附件和文本仍由 Studio native transport 执行。

当前已记录边界：2026-06-12 起，Feishu/Octo 后续验收只继续推进私聊完整性。私聊文本对话、文件/图片传输、Agent CLI 原生能力、工具流/过程回复解析和 compact 是主线；已实现的群聊、thread、多 bot、GROUP.md/THREAD.md、群管理动作保留为 best-effort，不再作为下一步任务或发布前阻断项。

当前已记录边界：runtime action manifest 的显式 `params/arguments/args` 是业务参数对象；顶层紧凑 manifest 也常用 `name/title` 表达群名、表名、字段名。parser 只能在字段确实是 tool 元数据时剥除，不能误删或误判业务 `name/title`。Octo parser 必须接受 Studio 标准 `{tool:"octo_management",action:"list-groups"}`、模型常见 `{"action":"octo_management.list-groups"}`、`tool:"octo_management.list-groups"`、OpenClaw/SDK 函数名 `fetchBotGroups/getGroupMembers/listThreads/getFileDownloadUrl` 和 keyed object 形态，但只能归一到 Studio 白名单 Bot API runtime actions；mutation 仍必须走 IM 审批。
已有回归会遍历 Studio 内置 Octo/Feishu runtime action 白名单，确认每个 `studio-octo-actions` / `studio-feishu-actions` 动作都能被 parser 地址化并保留业务 `name`，并额外覆盖 Octo `octo_management.<action>` 写法和 runtime smoke 名称别名。

当前已记录边界：Octo User API bot management（`/v1/user/bots`、创建/删除 bot、user API key、bot token retrieval）属于 Studio admin-plane，不进入 Agent runtime action。Agent 只能使用 Studio 白名单内的 Bot API runtime actions；bot 生命周期配置后续应在 Studio 管理页实现。

## 任务清单

| 优先级 | 任务 | CC 对照 | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| P0 | 路线约束与防偏 | `cc-connect-source` + 本文件 | 已完成 | 根目录 `AGENTS.md` 写入 CC-first 门禁；目标/进度文档引用本清单 |
| P0 | 恢复稳定 live 默认 | `agent/codex` exec/resume | 已完成 | Feishu/Octo live binding 默认 one-shot，不默认走 Codex app-server |
| P1 | Codex runner 1:1 迁移 | `agent/codex` | 进行中：one-shot 主链路可用，`/new`/`/reset`/Studio `/compact` 自动合同、Feishu/Octo service smoke、无副作用 probe、命令 live smoke 和 Agent run live 观测脚本已覆盖；真实 Feishu/Octo `/compact`、`/new`、`/reset` no-send apply 已通过；工具流与 Markdown 用户可见 live 已通过用户反馈和日志 smoke；图片、入站文件、非视觉模型自动切视觉模型已由真实日志 smoke 固定证据；one-shot 最终回复/manifest 保真已锁测试；`channel-connectors-service` + `agent-run-live` 组合测试 71/71 已恢复全绿 | `exec/resume` 参数、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 全部按 CC 验收 |
| P1 | Feishu 菜单/卡片 1:1 复刻 | `platform/feishu` card/menu | 进行中：Commands tab 已接入 config/Agent 命令列表、Skills 和 Aliases 入口；CC Card `RenderText()` 式文本 fallback、`/help <section>` 表格化分组帮助、session list 删除按钮、CC Go delete-mode 批量删除表单、`/whoami`/`/version` session 按钮已接入；运行中权限审批只嵌入进度卡，审批后同卡更新状态；agent-run-live smoke 已能验证 permission prompt/reply 与 Feishu permission progress-card 日志证据；独立审批卡仅作无进度卡/Claude Code 提问型交互回退 | 主菜单、设置子卡、下拉、分页、执行结果卡/文本、callback ACK、进度卡内审批均可真实操作 |
| P1 | Feishu 长连接稳定性 | `platform/feishu` daemon/adapter + latest OpenClaw `extensions/feishu/src/monitor.transport.ts` | 进行中：同 App 用户级全局 owner lock；每 cycle 一个官方 SDK `WSClient` + `EventDispatcher`；默认启用 SDK lower-case `pingTimeout=3` watchdog；包装 SDK `pingLoop()` 把有效 ping interval clamp 到 10s；terminal error 后按 OpenClaw 外层循环重建；SDK `reconnecting` 超过 5s 时回收到外层循环；`pongTimeoutMs=8000` 外层兜底；23s control-frame stale 判死；connected-idle / zero-inbound / verified-ingress / generic watchdog 重建默认关闭；startup ingress validation 改为 opt-in 诊断；Feishu `create_time` + 会话水位线会跳过补投旧消息；群消息、topic/thread 和成员上下文能力保留为 best-effort，不再继续扩展 | 10s 默认已通过结构/系统回归；下一步只做真实 Feishu 私聊长连接、私聊文件/图片/语音、权限与 skill runner live smoke；若再假在线，先按专项文档抓 runtime/log/lock/process，不先重启 |
| P1 | Octo(dmwork) 长连接与媒体 | `platform/dmwork` | 进行中：Octo 纯文本权限审批已进入串行门控；出站文件默认 STS/COS 直传，旧 multipart 410 自动回退；Bot API transport 已补 read receipt、event ack、群/成员/Space、thread、history sync、file download URL、message edit、GROUP.md、THREAD.md、delete-thread、voice context；按 Octo 插件 v1.0.15 补 account/bot ID 大小写归一、广播 mention gate 和 daemon 入站 read receipt；daemon 已接入 Bot API 群成员、短历史 timeline、实时未触发消息内存 timeline、GROUP.md/THREAD.md prompt context、文件下载 URL staging、平台 skill context、`studio-channel-messages` Octo human DM/group/thread + bot group/thread @mention + `on_behalf_of` persona 身份合同；群/thread、多 bot、GROUP.md/THREAD.md、persona/OBO 和群管理动作保留为 best-effort，不再继续扩展；Octo progress 气泡用 5s best-effort 发送并带 `client_msg_no`；`studio-octo-actions` 已覆盖 Bot API runtime action，read-only 直接执行，mutation 走 Studio IM 审批，parser 已接受 Studio 标准写法、`octo_management.<action>`、OpenClaw/SDK 函数名和 keyed object | WuKongIM、ACK、heartbeat、重连、私聊 COS/文件/图片收发、Markdown 回复稳定；下一步只做真实 Octo human DM、私聊文件/图片/语音、权限与 skill runner live smoke |
| P1 | 工具/思考/中间态显示 | CC progress renderer | 继续推进：Claude `tool_use`/`tool_result`、OpenCode NDJSON、Codex JSONL/app-server event 都必须稳定提取工具名、输入、stdout/stderr、exit/status 和真实输出；重点检查空工具结果、工具结果被吞、最终回复误归为过程回复、过程回复缺失等问题；思考流只展示上游真实 `reasoning/thinking`；`/thinking` / `/process` / `/tools` 三路独立控制 | 私聊显示过程回复、思考和工具结果；工具结果不得显示空输出，最终回复不重复显示为过程回复；Feishu/Octo 私聊 Markdown/卡片/纯文本都要稳定 |
| P1 | 文件/消息收发 1:1 + Studio transport | CC file/media/message flow | 进行中：Feishu/Octo service smoke 已覆盖文件发送入口；Agent run live smoke 已能验证入站文件 staging、出站文件发送和 `studio-channel-messages` declared/sent 证据；Octo auto 上传默认 STS/COS 并覆盖旧 `/v1/bot/file/upload` 410 回退；新增 `studio-channel-messages`，Octo 支持 human DM、group/thread 文本、`@[uid:显示名]`、`mentionUids`、`mentionAll`、`onBehalfOf/on_behalf_of/respondAs`；Feishu 按 OpenClaw target 合同支持 `chat/open_id/user_id/dm` 文本与 Markdown(post) 目标并映射到官方 `receive_id_type`；群/thread/多 bot 发送能力保留 best-effort；transport-smoke 可用 `receiveId/receiveIdType` 直接验证目标；Feishu open_id 文本和 Markdown(post) transport-smoke 真实通过 | 私聊入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke；Octo human DM、Feishu open_id/user_id 文本/Markdown、私聊文件/图片/语音真实发送为后续验收 |
| P1 | 上下文预算与自动压缩 | `ContextUsageReporter` / `ContextCompressor` / auto-compress | 进行中：Gateway `/v1/models` 已暴露 `contextWindow/maxOutputTokens`；Channel `/status` 已接 resolved model 预算、Gateway usage 优先和 IM history 估算兜底；本地 IM history 默认保留/注入最多 20 条，prompt 每条 360 字符、整段 8000 字符封顶，避免长历史撑爆上下文；`/history`、`/status` 估算、自动 compact 判断和 Studio fallback compact 统一使用 20 条窗口，compact prompt 单条再裁剪到 900 字符；手动 `/compact` 和 daemon 自动触发均已 native-first，Codex app-server 已覆盖 `thread/compact/start`；`/native /compact` 已收紧为只走真实 native compact contract，Claude Code/OpenCode one-shot 拒绝伪执行，persistent fake CLI 与真实 CLI mock-Gateway 普通 turn + compact/stop smoke 已覆盖；自动触发用剩余上下文阈值判断，成功后记录 used-token baseline 防重复触发，失败/阻塞才进入 retry cooldown；最近 native/fallback/skipped、effective used、summary/error/retry 已在 `/status` 和管理页可观测 | `/status` 显示剩余上下文；Gateway usage 优先、估算兜底；达到阈值优先触发 Agent 原生 compact/compress；不支持、失败或 one-shot 不可靠时降级 Studio compact；强制 native compact 不允许伪透传；成功 baseline 和失败 retry 记录可观测；真实视觉 smoke 待补 |
| P1 | Codex app-server 权限批准 | `agent/codex/appserver_session.go` pending approvals | 已完成 driver 合同：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval` 复用 Studio IM permission resolver，并按 CC Go 回写 decision / turn-scoped permissions；Feishu 进度卡内审批 action 合同已锁测试；agent-run-live smoke 已补 `--require-permission-prompt` / `--require-permission-resolved` / `--require-feishu-permission-progress-card`；真实 IM live approval smoke 待做 | 飞书进度卡按钮和文本 `/approve`/`/deny`/`/allow-all` 在真实 Codex app-server 运行中审批场景闭环，并由 daemon JSONL 证明 prompt/reply/card 状态 |
| P2 | Claude Code runner | `agent/claudecode` | 进行中：`--verbose`、stream-json progress、图片输入、session resume、权限自动回包、IM 批准、Feishu 权限按钮卡片、AskUserQuestion 基础回答闭环和 Feishu 独立问题卡/单选按钮、persistent stream-json `/compact` contract 与真实 CLI mock-Gateway 普通 turn、Bash tool-use/result、文件 manifest、视觉附件、compact、stop cancel 已对齐；text-before-tool 会作为过程回复，最终 text 不进过程；stop 不再触发 driver-error 或 one-shot fallback；Claude 审批已由用户 live 测试通过 | stream-json、permission prompt、session resume、tool event、文件/图片输入；AskUserQuestion live 卡片回答和 IM live 文件上传待验收 |
| P2 | OpenCode runner | `agent/opencode` | 进行中：one-shot JSON progress、`run --session` 续接、sessionID 提取、空 stdout SQLite fallback、persistent `/compact` contract 与真实 CLI mock-Gateway 普通 turn、文件 manifest、视觉附件、compact、stop cancel 已对齐；取消路径禁止读取旧 DB 输出；按 CC Go 拆分 `tool_use` 和 tool result；按 CC Go `stageImages`/`buildRunArgs` 补视觉模型图片 `--file` 参数构建；vision-capable 隔离配置已写入 `attachment`、`modalities`、`limit`、`tool_call`；短模型名会自动转为 `studio-gateway/<model>`，带斜杠的 Gateway 模型 ID 也保留在 `studio-gateway` provider 下；runner 每轮生成隔离 OpenCode config，session 数据放在 Channel runtime dataHome，旧全局 sessionId 不存在时自动新建；隔离 `opencode.json.instructions` 会加载 Studio 生成的 platform skill 投影，避免只靠 prompt 字符串；OpenCode JSON error envelope 会显示 `data.message/name/ref`；本机真实 Gateway `glm-5` 短对话已通过 | 原生命令、session、tool stream、权限、文件/图片输入；OpenCode 工具/权限和 IM live 文件上传待验收 |
| P2 | 命令全集 | CC slash/native commands + CommandProvider + SkillRegistry | 进行中：保留私聊常用命令、Agent 原生命令透传、`/compact`、`/stop`、`/thinking`、`/process`、`/tools`、目录/模型/权限切换和文件收发；`studio-channel-skill`、`studio-feishu-actions`、`studio-octo-actions`、文档/群/管理类 platform action 进入删除清单；`/usage` / token 统计不再继续建设，后续统一在 Gateway 侧查看模型消耗 | 私聊命令简洁可用；Agent CLI 能力透传稳定；平台扩展 action 不再出现在 prompt/skill/菜单中 |
| P2 | 治理与自动化 | allowlist/admin/rate | 部分完成 | 已有基础治理；cron、hooks、relay 不再是当前私聊目标 |
| P3 | 更多平台 | `platform/{weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}` | 路线图：未迁移 | 暂不推进；后续若恢复，只按私聊文本/文件/图片和 Agent CLI 能力迁移 |
| P3 | 更多 Agent | `agent/{gemini,kimi,cursor,qoder,iflow,devin,acp}` | 路线图：未迁移，未进入 live `supportedAgents` | 暂不推进；后续每新增一个 runner 必须先通过工具流、文件/图片、compact 和 stop 验收 |

## 当前执行顺序

1. 删除 `studio-channel-skill` 与 Feishu/Octo platform action 扩展层，保留私聊 transport、文件/图片和 Agent CLI 能力。
2. 继续稳定 Codex、Claude Code、OpenCode 工具流/回复解析，重点修复空工具流、空工具结果、过程回复/最终回复分类错误。
3. 继续 compact：优先 Agent 原生 compact/compress；失败或不支持再 Gateway compact；确保 `/compact` 不进普通 prompt。
4. 消息队列需要补 durable queue 或可恢复队列，避免 daemon 重启丢失未开始任务。

## Codex 完成判断

- 结论：Codex 未全部迁移完成。
- 已完成：默认 live 回到 one-shot `codex exec/resume`，Gateway key/config、thread resume、图片参数顺序、工具/文件 manifest、one-shot 最终回复/manifest 保真、工具流与 Markdown 用户可见 live、图片/入站文件/自动视觉切换真实日志 smoke、`/stop`、queue、`/new`/`/reset` 清 session/history、Studio `/compact` 调 Gateway compact 并清旧续接，以及 Feishu/Octo service smoke、recent-session 命令 smoke、Agent run live 观测脚本、adapter dry-run 无副作用合同、真实 `/compact`、`/new`、`/reset --apply --no-send-reply` 和 app-server beta 测试已有覆盖。
- 未完成：Codex app-server 仍是 metadata beta，不算默认完成；更多 Claude/OpenCode 文件能力需按各自 runner 继续迁移。
- 完成标准：上表 P1 验收项全部通过自动测试与真实 IM smoke，且 beta app-server 边界不会影响默认 live 稳定路径。
