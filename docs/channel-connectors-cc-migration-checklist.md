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

Octo 专属能力若 CC Go 不完整，参考 `~/.openclaw/extensions/octo`。模型网关协议转换参考 `/tmp/cc-switch-src`。

## 任务清单

| 优先级 | 任务 | CC 对照 | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| P0 | 路线约束与防偏 | `cc-connect-source` + 本文件 | 已完成 | 根目录 `AGENTS.md` 写入 CC-first 门禁；目标/进度文档引用本清单 |
| P0 | 恢复稳定 live 默认 | `agent/codex` exec/resume | 已完成 | Feishu/Octo live binding 默认 one-shot，不默认走 Codex app-server |
| P1 | Codex runner 1:1 迁移 | `agent/codex` | 进行中：resume 参数顺序已对齐 | `exec/resume` 参数、thread、cwd、permission、tool stream、file manifest、stop/new/reset/compact 全部按 CC 验收 |
| P1 | Feishu 菜单/卡片 1:1 复刻 | `platform/feishu` card/menu | 进行中：Commands tab 已接入 config/Agent 命令列表 | 主菜单、设置子卡、下拉、分页、执行结果卡/文本、callback ACK 均可真实操作 |
| P1 | Feishu 长连接稳定性 | `platform/feishu` daemon/adapter | 进行中 | 快速 ACK、事件去重、断线恢复、idle 策略、重启后不重复触发 Agent |
| P1 | Octo(dmwork) 长连接与媒体 | `platform/dmwork` | 进行中 | WuKongIM、ACK、heartbeat、重连、COS/文件/图片收发、Markdown 回复稳定 |
| P1 | 工具/思考/流式显示 | CC progress renderer | 进行中 | 私聊显示进度和工具结果；群聊默认静默；飞书单卡 patch，Octo 文本 Markdown 不刷屏 |
| P1 | 文件收发 1:1 + Studio transport | CC file/media flow | 进行中：Feishu/Octo service smoke 已覆盖文件发送入口 | 入站 staging、出站 manifest、原始文件名、yolo 权限、大文件策略、Feishu/Octo live smoke |
| P2 | Claude Code runner | `agent/claudecode` | 待迁移 | stream-json、permission prompt、session resume、tool event、文件/图片输入 |
| P2 | OpenCode runner | `agent/opencode` | 待迁移 | 原生命令、session、tool stream、权限、文件/图片输入 |
| P2 | 命令全集 | CC slash/native commands + CommandProvider | 进行中：Claude Code/Gemini Agent 命令文件、`/commands add/del` prompt 命令已接入 | `/help/status/current/list/history/name/search/dir/cd/new/reset/model/mode/reasoning/display/stream/tools/native/stop` 均文本与卡片可用；`/commands` 能列出 config + Agent 命令，命中后按 CC 占位符规则展开并交给 Agent；`addexec` 等 shell 执行面待单独验收 |
| P2 | 治理与自动化 | allowlist/admin/rate/cron/hooks/relay | 部分完成 | 已有基础治理；继续补 cron、hooks、relay、management API |
| P3 | 更多平台 | `platform/{weixin,wecom,dingtalk,telegram,slack,discord,qq,qqbot,line}` | 待迁移 | 每个平台先 1:1 contract，再 Studio UI 配置 |
| P3 | 更多 Agent | `agent/{gemini,kimi,cursor,qoder,iflow,devin,acp}` | 待迁移 | 按 CC Agent 能力逐个移植，统一走 Studio Gateway |

## 当前执行顺序

1. 先锁 Codex `exec/resume` 稳定路径，复验 Feishu/Octo 发文件、工具流、Markdown 最终回复；现有工具流和 `studio-channel-files` 合同只对照补缺，不推翻重写。
2. 再按 CC 复刻 Feishu 菜单/设置卡片、CommandProvider 命令细节和 Octo 文本/Markdown 命令体验。
3. 然后迁移 Claude Code、OpenCode runner 的成熟流式/权限/文件能力。
4. Codex app-server 继续保留 beta，不阻塞稳定 live 路线。
