# Channel Connectors CC Migration Checklist

> 更新：2026-06-11
> 原则：CC Go 先 1:1 迁移，Studio 再精修。禁止在 CC 已有成熟方案时重新造轮子。

## 迁移门禁

每个功能进入实现前必须完成：

1. 定位 CC Go 源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`。
2. 写明要迁移的 contract：消息、命令、状态、文件、权限、错误、重试、测试。
3. 先移植等价行为，再做 Studio typed config / Gateway / UI 优化。
4. 用自动测试和真实 IM/CLI smoke 验证用户可见行为。
5. 偏离 CC 时，在本清单和 commit trailer 记录原因。

Octo 专属能力若 CC Go 不完整，参考 `~/.openclaw/extensions/octo`。模型网关协议转换参考 `/tmp/cc-switch-src`。Feishu 长连接假在线问题单独跟踪在 `feishu-long-connection-issue-tracker.md`，所有反馈和假设先写入该文档。

当前已记录偏离：产品未发布前不为旧实验命令/字段做兼容负担；Studio 显示 schema 已改为三路控制：`/thinking` 控制思考、`/process` 控制过程回复、`/tools` 控制工具，`/quiet` 与 `/quiet compact` 批量隐藏三类中间态，`/quiet full` 恢复默认显示。

当前已记录偏离：CC Go `/delete` 调 Agent `SessionDeleter` 删除 agent-side session；Studio 当前先删除本地 Agent resume/session store 记录，并拒绝删除当前 active session。若要同时 kill daemon persistent process，需后续接入 agent-session management kill 合同。

当前已记录偏离：CC Go `/compress` 调当前 Agent `CompressCommand()`；Studio 现有 `/compact`/`/compress` 已先落成 Channel 自建压缩兜底。目标已调整为 native-first：入口优先调用当前 Agent 原生 `CompressCommand` / app-server compact；不支持、失败或 Codex one-shot 不可靠时才降级 Gateway `/responses/compact` 摘要 IM history 并清旧续接。`/native /compact` 保留为强制原生路径，但没有真实 live persistent compact contract 时必须拒绝伪透传；Codex persistent beta 已验证原生 app-server compact，Claude Code stream-json 与 OpenCode `run --session` 已补 CC Go `AgentSession.Send("/compact")` contract，并通过真实 CLI mock-Gateway 普通 turn + compact smoke；Claude Code/OpenCode stop cancel 也已进入同一 strict smoke。

当前已记录偏离：CC Go OpenCode runner 期望 `opencode run --format json` 输出 NDJSON；本机 OpenCode 1.16/1.17 可能 exit 0 但 stdout 为空，并把 session/message/part 写入 `opencode.db`。Studio 保留 stdout NDJSON 优先，同时补 `sqlite3 -json` fallback；fallback 只接受本轮启动后的 assistant part，并短轮询等待异步写入，避免读到上一轮旧回复。

## 任务清单

| 优先级 | 任务 | CC 对照 | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| P0 | 路线约束与防偏 | `cc-connect-source` + 本文件 | 已完成 | 根目录 `AGENTS.md` 写入 CC-first 门禁；目标/进度文档引用本清单 |
| P0 | 恢复稳定 live 默认 | `agent/codex` exec/resume | 已完成 | Feishu/Octo live binding 默认 one-shot，不默认走 Codex app-server |
| P1 | Codex runner 1:1 迁移 | `agent/codex` | 进行中：one-shot 主链路可用，`/new`/`/reset`/Studio `/compact` 自动合同、Feishu/Octo service smoke、无副作用 probe、命令 live smoke 和 Agent run live 观测脚本已覆盖；真实 Feishu/Octo `/compact`、`/new`、`/reset` no-send apply 已通过；工具流与 Markdown 用户可见 live 已通过用户反馈和日志 smoke；图片、入站文件、非视觉模型自动切视觉模型已由真实日志 smoke 固定证据；one-shot 最终回复/manifest 保真已锁测试；`channel-connectors-service` + `agent-run-live` 组合测试 71/71 已恢复全绿 | `exec/resume` 参数、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 全部按 CC 验收 |
| P1 | Feishu 菜单/卡片 1:1 复刻 | `platform/feishu` card/menu | 进行中：Commands tab 已接入 config/Agent 命令列表、Skills 和 Aliases 入口；CC Card `RenderText()` 式文本 fallback、`/help <section>` 表格化分组帮助、session list 删除按钮、CC Go delete-mode 批量删除表单、`/whoami`/`/version` session 按钮已接入；运行中权限审批优先嵌入进度卡，审批后同卡更新状态；agent-run-live smoke 已能验证 permission prompt/reply 与 Feishu permission progress-card 日志证据；独立审批卡仅作无进度卡/问答型交互回退 | 主菜单、设置子卡、下拉、分页、执行结果卡/文本、callback ACK、进度卡内审批均可真实操作 |
| P1 | Feishu 长连接稳定性 | `platform/feishu` daemon/adapter + latest OpenClaw `extensions/feishu/src/monitor.transport.ts` | 进行中：同 App 用户级全局 owner lock；每 cycle 一个官方 SDK `WSClient` + `EventDispatcher`；默认启用 SDK lower-case `pingTimeout=3` watchdog；包装 SDK `pingLoop()` 把有效 ping interval clamp 到 10s；terminal error 后按 OpenClaw 外层循环重建；SDK `reconnecting` 超过 5s 时回收到外层循环；`pongTimeoutMs=8000` 外层兜底；23s control-frame stale 判死；connected-idle / zero-inbound / verified-ingress / generic watchdog 重建默认关闭；startup ingress validation 改为 opt-in 诊断；Feishu `create_time` + 会话水位线会跳过补投旧消息 | 10s 默认已通过结构/系统回归；下一步做 live smoke 与用户新消息业务入站复验；若再假在线，先按专项文档抓 runtime/log/lock/process，不先重启 |
| P1 | Octo(dmwork) 长连接与媒体 | `platform/dmwork` | 进行中：Octo 纯文本权限审批已进入串行门控；等待审批时缓冲非终止进度，审批通过后按顺序释放，拒绝/超时丢弃缓冲；权限请求不再重复显示为普通工具气泡；出站文件默认按 OpenClaw Octo 插件走 STS/COS 直传，旧 multipart 410 会自动回退；Bot API transport 已补 read receipt、event ack、群/成员/Space、thread、history sync、file download URL | WuKongIM、ACK、heartbeat、重连、COS/文件/图片收发、Markdown 回复稳定；下一步把 Bot API 接入 daemon 自动 read receipt、群成员/历史上下文、thread target、文件下载/staging；真实 Octo 审批 + 工具流 live smoke 待补 |
| P1 | 工具/思考/中间态显示 | CC progress renderer | 进行中：Claude `tool_use`/`tool_result` 递归提取对象、数组和 stdout/stderr，并用 `tool_use_id` 将结果回填到对应工具名；OpenCode NDJSON 按 CC Go 拆分 completed `tool_use` 为工具调用 + 工具输出；进度渲染层按 `rawType/itemType` 区分 `tool_use/tool_result`，Feishu 卡片和 Octo/纯文本不再把 Claude/OpenCode 工具调用误显示成“工具结果”；工具识别补齐 `exec_command`、`write_stdin`、`TodoRead`、`Patch`、`Permissions`、子任务、计划更新、图像查看和 MCP；Octo/纯文本工具结果统一代码块显示且标题不再用粗体大标题；assistant 正文统一缓冲为 intermediate/final；Codex app-server delta 仍不逐 token 刷过程；思考流只展示上游真实 `reasoning/thinking`；`/thinking` / `/process` / `/tools` 三路独立控制 | 私聊显示过程回复、思考和工具结果；最终回复不重复显示为过程回复；群聊默认静默；飞书单卡 patch，Octo 文本 Markdown 不刷屏 |
| P1 | 文件收发 1:1 + Studio transport | CC file/media flow | 进行中：Feishu/Octo service smoke 已覆盖文件发送入口；Agent run live smoke 已能验证入站文件 staging 和出站文件发送；Octo auto 上传默认 STS/COS 并覆盖旧 `/v1/bot/file/upload` 410 回退 | 入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke |
| P1 | 上下文预算与自动压缩 | `ContextUsageReporter` / `ContextCompressor` / auto-compress | 进行中：Gateway `/v1/models` 已暴露 `contextWindow/maxOutputTokens`；Channel `/status` 已接 resolved model 预算、Gateway usage 优先和 IM history 估算兜底；手动 `/compact` 和 daemon 自动触发均已 native-first，Codex app-server 已覆盖 `thread/compact/start`；`/native /compact` 已收紧为只走真实 native compact contract，Claude Code/OpenCode one-shot 拒绝伪执行，persistent fake CLI 与真实 CLI mock-Gateway 普通 turn + compact/stop smoke 已覆盖；自动触发用剩余上下文阈值判断，成功后记录 used-token baseline 防重复触发，失败/阻塞才进入 retry cooldown；最近 native/fallback/skipped、effective used、summary/error/retry 已在 `/status` 和管理页可观测 | `/status` 显示剩余上下文；Gateway usage 优先、估算兜底；达到阈值优先触发 Agent 原生 compact/compress；不支持、失败或 one-shot 不可靠时降级 Studio compact；强制 native compact 不允许伪透传；成功 baseline 和失败 retry 记录可观测；真实视觉 smoke 待补 |
| P1 | Codex app-server 权限批准 | `agent/codex/appserver_session.go` pending approvals | 已完成 driver 合同：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval` 复用 Studio IM permission resolver，并按 CC Go 回写 decision / turn-scoped permissions；Feishu 进度卡内审批 action 合同已锁测试；agent-run-live smoke 已补 `--require-permission-prompt` / `--require-permission-resolved` / `--require-feishu-permission-progress-card`；真实 IM live approval smoke 待做 | 飞书进度卡按钮和文本 `/approve`/`/deny`/`/allow-all` 在真实 Codex app-server 运行中审批场景闭环，并由 daemon JSONL 证明 prompt/reply/card 状态 |
| P2 | Claude Code runner | `agent/claudecode` | 进行中：`--verbose`、stream-json progress、图片输入、session resume、权限自动回包、IM 批准、Feishu 权限按钮卡片、AskUserQuestion 基础回答闭环和 Feishu 独立问题卡/单选按钮、persistent stream-json `/compact` contract 与真实 CLI mock-Gateway 普通 turn、Bash tool-use/result、文件 manifest、视觉附件、compact、stop cancel 已对齐；text-before-tool 会作为过程回复，最终 text 不进过程；stop 不再触发 driver-error 或 one-shot fallback；Claude 审批已由用户 live 测试通过 | stream-json、permission prompt、session resume、tool event、文件/图片输入；AskUserQuestion live 卡片回答和 IM live 文件上传待验收 |
| P2 | OpenCode runner | `agent/opencode` | 进行中：one-shot JSON progress、`run --session` 续接、sessionID 提取、空 stdout SQLite fallback、persistent `/compact` contract 与真实 CLI mock-Gateway 普通 turn、文件 manifest、视觉附件、compact、stop cancel 已对齐；取消路径禁止读取旧 DB 输出；按 CC Go 拆分 `tool_use` 和 tool result；按 CC Go `stageImages`/`buildRunArgs` 补视觉模型图片 `--file` 参数构建；vision-capable 隔离配置已写入 `attachment`、`modalities`、`limit`、`tool_call`；短模型名会自动转为 `studio-gateway/<model>`，带斜杠的 Gateway 模型 ID 也保留在 `studio-gateway` provider 下；runner 每轮生成隔离 OpenCode config，session 数据放在 Channel runtime dataHome，旧全局 sessionId 不存在时自动新建；OpenCode JSON error envelope 会显示 `data.message/name/ref`；本机真实 Gateway `glm-5` 短对话已通过 | 原生命令、session、tool stream、权限、文件/图片输入；OpenCode 工具/权限和 IM live 文件上传待验收 |
| P2 | 命令全集 | CC slash/native commands + CommandProvider + SkillRegistry | 进行中：Claude Code/Gemini Agent 命令文件、`/commands add/del` prompt 命令、admin-only `/commands addexec [--work-dir]` shell 命令、`/alias add/del/list` binding 级命令别名、binding 一等 `disabledCommands` 命令 ACL（兼容 metadata `disabledCommands/disabled_commands`）、`/skills` 与 Skill invocation、CC Go exact-first/唯一前缀/歧义透传、binding metadata 命令别名、`/commands` 子命令缩写、`/help` 分组帮助、`/quiet`、`/delete`、`/whoami` 和 `/version` 已接入；`/delete` 支持 sessionId 逗号列表并承接 Feishu delete-mode form submit；非 Feishu 实际 `/help` 命令与 fallback 已改为列表式 Markdown，`buffer` / `commands` / `native` 拆成独立文本页，避免多表格渲染不稳定；prompt command、Agent command、Skill、native passthrough 和 shell exec 已带结构化 audit；`/commands addexec` 已迁移 CC Go `runShellWithProgress` 核心合同：500ms 内完成不刷进度，长命令发 started/progress/terminal 事件，Feishu patch 单卡，Octo 只发运行提示并保留最终结果；command-live smoke 已能等待/验证 daemon `channel.command.progress` 日志、Feishu card patch 和 Octo progress sent | `/help/status/whoami/version/current/list/history/name/search/delete/dir/cd/new/reset/model/mode/reasoning/display/quiet/thinking/process/tools/native/stop/alias` 均文本与卡片可用；`/commands` 能列出 config + Agent 命令，命中后按 CC 占位符规则展开并交给 Agent；`disabledCommands` 可在 UI/API 中配置并阻断 built-in/custom/skill，显式 adminUsers 可绕过；`/commands addexec` 能 admin-only 添加/执行 shell 命令并回显 stdout/stderr，日志记录 cwd、exit、elapsed、stdout/stderr 字节和预览；长时间 shell 命令需真实 Feishu/Octo live smoke 验收 |
| P2 | 治理与自动化 | allowlist/admin/rate/cron/hooks/relay | 部分完成 | 已有基础治理；继续补 cron、hooks、relay、management API |
| P3 | 更多平台 | `platform/{weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}` | 待迁移 | 每个平台先 1:1 contract，再 Studio UI 配置 |
| P3 | 更多 Agent | `agent/{gemini,kimi,cursor,qoder,iflow,devin,acp}` | 待迁移 | 按 CC Agent 能力逐个移植，统一走 Studio Gateway |

## 当前执行顺序

1. 按 CC 复刻 Feishu 菜单/设置卡片、剩余 CommandProvider 命令细节和 Octo 文本/Markdown 命令体验。
2. 继续做真实 IM live approval smoke：Claude 已由用户确认通过，下一步用 agent-run-live permission flags 覆盖 Codex/OpenCode/Octo 的 prompt、resolved decision 和 Feishu 进度卡状态。
3. 继续迁移 Claude Code / OpenCode 的 IM live 文件上传、真实 IM 视觉效果、工具流和权限细节。
4. Codex app-server 继续保留 beta，不阻塞稳定 live 路线；native compact 是上下文管理优先路径，但只在持久/交互式 runner 具备真实能力时启用。

## Codex 完成判断

- 结论：Codex 未全部迁移完成。
- 已完成：默认 live 回到 one-shot `codex exec/resume`，Gateway key/config、thread resume、图片参数顺序、工具/文件 manifest、one-shot 最终回复/manifest 保真、工具流与 Markdown 用户可见 live、图片/入站文件/自动视觉切换真实日志 smoke、`/stop`、queue、`/new`/`/reset` 清 session/history、Studio `/compact` 调 Gateway compact 并清旧续接，以及 Feishu/Octo service smoke、recent-session 命令 smoke、Agent run live 观测脚本、adapter dry-run 无副作用合同、真实 `/compact`、`/new`、`/reset --apply --no-send-reply` 和 app-server beta 测试已有覆盖。
- 未完成：Codex app-server 仍是 metadata beta，不算默认完成；更多 Claude/OpenCode 文件能力需按各自 runner 继续迁移。
- 完成标准：上表 P1 验收项全部通过自动测试与真实 IM smoke，且 beta app-server 边界不会影响默认 live 稳定路径。
