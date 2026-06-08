# Channel Connectors CC Migration Checklist

> 更新：2026-06-08
> 原则：CC Go 先 1:1 迁移，Studio 再精修。禁止在 CC 已有成熟方案时重新造轮子。

## 迁移门禁

每个功能进入实现前必须完成：

1. 定位 CC Go 源码：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`。
2. 写明要迁移的 contract：消息、命令、状态、文件、权限、错误、重试、测试。
3. 先移植等价行为，再做 Studio typed config / Gateway / UI 优化。
4. 用自动测试和真实 IM/CLI smoke 验证用户可见行为。
5. 偏离 CC 时，在本清单和 commit trailer 记录原因。

Octo 专属能力若 CC Go 不完整，参考 `~/.openclaw/extensions/octo`。模型网关协议转换参考 `/tmp/cc-switch-src`。Feishu 长连接假在线问题单独跟踪在 `feishu-long-connection-issue-tracker.md`，所有反馈和假设先写入该文档。

当前已记录偏离：CC Go `/quiet` 支持 `quiet -> compact -> full` 三态循环；Studio 现有显示 schema 只有 stream/tool 两个开关，因此先将 `/quiet` 与 `/quiet compact` 都映射为“隐藏中间态、保留最终回复”，`/quiet full` 恢复默认显示。独立 compact display 需要后续扩展 session-control schema 后再做。

当前已记录偏离：CC Go `/delete` 调 Agent `SessionDeleter` 删除 agent-side session；Studio 当前先删除本地 Agent resume/session store 记录，并拒绝删除当前 active session。若要同时 kill daemon persistent process，需后续接入 agent-session management kill 合同。

## 任务清单

| 优先级 | 任务 | CC 对照 | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| P0 | 路线约束与防偏 | `cc-connect-source` + 本文件 | 已完成 | 根目录 `AGENTS.md` 写入 CC-first 门禁；目标/进度文档引用本清单 |
| P0 | 恢复稳定 live 默认 | `agent/codex` exec/resume | 已完成 | Feishu/Octo live binding 默认 one-shot，不默认走 Codex app-server |
| P1 | Codex runner 1:1 迁移 | `agent/codex` | 进行中：one-shot 主链路可用，`/new`/`/reset`/Studio `/compact` 自动合同、Feishu/Octo service smoke、无副作用 probe、命令 live smoke 和 Agent run live 观测脚本已覆盖；真实 Feishu/Octo `/compact`、`/new`、`/reset` no-send apply 已通过；工具流与 Markdown 用户可见 live 已通过用户反馈和日志 smoke；图片、入站文件、非视觉模型自动切视觉模型已由真实日志 smoke 固定证据；one-shot 最终回复/manifest 保真已锁测试 | `exec/resume` 参数、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 全部按 CC 验收 |
| P1 | Feishu 菜单/卡片 1:1 复刻 | `platform/feishu` card/menu | 进行中：Commands tab 已接入 config/Agent 命令列表；CC Card `RenderText()` 式文本 fallback、`/help <section>` 表格化分组帮助、session list 删除按钮和 `/whoami`/`/version` session 按钮已接入 | 主菜单、设置子卡、下拉、分页、执行结果卡/文本、callback ACK 均可真实操作 |
| P1 | Feishu 长连接稳定性 | `platform/feishu` daemon/adapter + latest OpenClaw `extensions/feishu/src/monitor.transport.ts` | 进行中：同 App 用户级全局 owner lock；每 cycle 一个官方 SDK `WSClient` + `EventDispatcher`；SDK `pingTimeout=3`；terminal error 后按 OpenClaw 外层循环重建；SDK `reconnecting` 超过 10s 时回收到外层循环；connected-idle / zero-inbound / verified-ingress / generic watchdog 重建默认关闭；5 分钟 live soak 326 samples / 0 violations / dispatcherCallbacks=12 / receivedMessages=4 | 继续做更长 idle、真实 SDK reconnect 后消息复验；若再假在线，先按专项文档抓 runtime/log/lock/process，不先重启 |
| P1 | Octo(dmwork) 长连接与媒体 | `platform/dmwork` | 进行中 | WuKongIM、ACK、heartbeat、重连、COS/文件/图片收发、Markdown 回复稳定 |
| P1 | 工具/思考/流式显示 | CC progress renderer | 进行中 | 私聊显示进度和工具结果；群聊默认静默；飞书单卡 patch，Octo 文本 Markdown 不刷屏 |
| P1 | 文件收发 1:1 + Studio transport | CC file/media flow | 进行中：Feishu/Octo service smoke 已覆盖文件发送入口；Agent run live smoke 已能验证入站文件 staging 和出站文件发送 | 入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke |
| P2 | Claude Code runner | `agent/claudecode` | 进行中：`--verbose`、stream-json progress、图片输入、session resume、权限自动回包、IM 批准、Feishu 权限按钮卡片、AskUserQuestion 基础回答闭环已对齐 | stream-json、permission prompt、session resume、tool event、文件/图片输入；AskUserQuestion 卡片精修待迁移 |
| P2 | OpenCode runner | `agent/opencode` | 待迁移 | 原生命令、session、tool stream、权限、文件/图片输入 |
| P2 | 命令全集 | CC slash/native commands + CommandProvider + SkillRegistry | 进行中：Claude Code/Gemini Agent 命令文件、`/commands add/del` prompt 命令、`/skills` 与 Skill invocation、CC Go exact-first/唯一前缀/歧义透传、binding metadata 命令别名、`/commands` 子命令缩写、`/help` 分组帮助、`/quiet`、`/delete`、`/whoami` 和 `/version` 已接入 | `/help/status/whoami/version/current/list/history/name/search/delete/dir/cd/new/reset/model/mode/reasoning/display/quiet/stream/tools/native/stop` 均文本与卡片可用；`/commands` 能列出 config + Agent 命令，命中后按 CC 占位符规则展开并交给 Agent；`/skills` 能列出并调用 SKILL.md；`addexec` 等 shell 执行面待单独验收 |
| P2 | 治理与自动化 | allowlist/admin/rate/cron/hooks/relay | 部分完成 | 已有基础治理；继续补 cron、hooks、relay、management API |
| P3 | 更多平台 | `platform/{weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}` | 待迁移 | 每个平台先 1:1 contract，再 Studio UI 配置 |
| P3 | 更多 Agent | `agent/{gemini,kimi,cursor,qoder,iflow,devin,acp}` | 待迁移 | 按 CC Agent 能力逐个移植，统一走 Studio Gateway |

## 当前执行顺序

1. 先锁 Codex `exec/resume` 稳定路径；`/compact`、`/new`、`/reset`、工具流、Markdown、图片、入站文件和自动视觉切换均已完成 live 日志证据。现有工具流和 `studio-channel-files` 合同只对照补缺，不推翻重写。
2. 再按 CC 复刻 Feishu 菜单/设置卡片、剩余 CommandProvider 命令细节和 Octo 文本/Markdown 命令体验。
3. 然后继续迁移 Claude Code AskUserQuestion 卡片精修/file 能力，并迁移 OpenCode runner 的成熟流式/权限/文件能力。
4. Codex app-server 继续保留 beta，不阻塞稳定 live 路线。

## Codex 完成判断

- 结论：Codex 未全部迁移完成。
- 已完成：默认 live 回到 one-shot `codex exec/resume`，Gateway key/config、thread resume、图片参数顺序、工具/文件 manifest、one-shot 最终回复/manifest 保真、工具流与 Markdown 用户可见 live、图片/入站文件/自动视觉切换真实日志 smoke、`/stop`、queue、`/new`/`/reset` 清 session/history、Studio `/compact` 调 Gateway compact 并清旧续接，以及 Feishu/Octo service smoke、recent-session 命令 smoke、Agent run live 观测脚本、adapter dry-run 无副作用合同、真实 `/compact`、`/new`、`/reset --apply --no-send-reply` 和 app-server beta 测试已有覆盖。
- 未完成：Codex app-server 仍是 metadata beta，不算默认完成；更多 Claude/OpenCode 文件能力需按各自 runner 继续迁移。
- 完成标准：上表 P1 验收项全部通过自动测试与真实 IM smoke，且 beta app-server 边界不会影响默认 live 稳定路径。
