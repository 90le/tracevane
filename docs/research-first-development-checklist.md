# Research-First Development Checklist

> 更新：2026-06-17
> 原则：任何新功能、行为修改、协议/SDK/Provider/Channel/Agent 适配，都必须先核验当前外部合同，再设计和实现。

## 开工门禁

每个 Gateway、Channel Connectors、CLI Agent runner、IM workflow、Provider、SDK/API、协议转换或用户可见 UI 行为进入实现前必须完成：

1. 定义变更范围：影响的用户路径、协议、平台、Agent、provider、runtime 状态和失败态。
2. 官方优先核验：官方文档、API/spec、SDK 文档、changelog、release notes、CLI help 或内置 schema。
3. GitHub 核验：活跃仓库源码、issues、discussions、release notes、PR 讨论，重点看事件格式、breaking change、失败模式和未解决问题。
4. 社区核验：社区帖子、实践记录、错误报告只作为风险输入；采用前必须回到官方或真实 smoke 验证。
5. 本地边界对比：确认 Studio 的 TypeScript/runtime、daemon、secret、session、file staging、UI 和测试边界能承载该合同。
6. 写入文档：在目标、进度或专项文档记录核验日期、来源、稳定结论、拒绝方案、风险和验证计划。
7. 再实现：没有当前合同或真实 smoke 证据的能力保持结构化 unsupported，不做半截 passthrough 或伪成功。

## 资料优先级

| 优先级 | 来源 | 用途 |
| --- | --- | --- |
| P0 | 官方 API/spec/SDK/CLI/changelog | 决定实现合同、事件格式、认证、错误 envelope 和兼容边界 |
| P1 | 官方或项目 GitHub 仓库、issues、discussions、release notes | 发现 breaking change、未文档化边缘、版本差异和维护状态 |
| P2 | 社区实践、博客、论坛、Stack Overflow、OpenAI/Anthropic/OpenCode 社区讨论 | 收集故障模式和运维风险 |
| P3 | 本地历史实现、旧迁移文档、第三方项目快照 | 只做历史背景或测试灵感，不作为必须迁移目标或实现权威 |

## 历史资料政策

- 旧第三方迁移源、旧本地快照和早期实验项目只能作为归档背景。
- 不再把任何第三方项目当作开工前必须参考的迁移源。
- 不再以“迁移某项目合同”作为完成标准；完成标准必须来自当前官方/SDK/API/GitHub/community 核验、本地代码边界和测试证据。
- 如果第三方实现暴露了有价值风险，必须重新用官方资料、当前 GitHub 证据或本地/live smoke 证实后才能写入设计。

## 当前能力边界

- Channel Connectors 当前只继续推进 Feishu/Octo 私聊完整性和 Codex、Claude Code、OpenCode 三个 live Agent。
- 默认 Agent session driver 使用结构化 persistent 路径：Codex app-server、Claude Code stream-json、OpenCode `run --session`。one-shot/TUI runner 只作为显式 opt-out、persistent fallback 或尚未支持 Agent 的兼容路径。
- 普通 IM 消息不排队、不落 pending store、不 daemon 重启 replay；同 binding + IM session 已有 active/delivering run 时直接 busy guard，用户用 `/stop`、`/cancel` 或等待结束后重发。
- Feishu/Octo 出站附件和私聊消息由 Studio native transport 执行；Agent 只声明受控 manifest。
- 未经当前合同验证的 Realtime/WebSocket、音频、image edits、媒体 passthrough 或新 Agent 事件格式必须返回结构化 unsupported 或保持受控 fallback。

## 风险清单

| 风险 | 防护 |
| --- | --- |
| 任务未结束却误判结束 | 优先结构化 session/SDK 事件；one-shot fallback 必须有权威终态、lingering grace、idle heartbeat 和取消优先级 |
| 任务已结束却继续等待 | 识别官方终态、进程退出、transport close、result/error 事件；终态后进入 bounded cleanup，不无限等待 |
| TUI 只有状态刷新但无真实进展 | TUI 心跳可证明进程存活，但不能无限续期；持续无结构化进展时记录非终态诊断并进入 bounded async/idle 策略 |
| 子 agent/deep research 主窗口静止 | 识别官方/结构化 child-task、subagent、task progress 或 harness 状态；没有结构化事件时用 bounded async idle grace |
| CLI/SDK 事件格式升级 | unknown event 记录 bounded sample 和版本信息；不崩溃、不伪完成；缺少最终回复时返回兼容提示并要求补 parser |
| 网络/SDK 文档不可用 | 不凭记忆新增合同；文档标记 stale-risk，unsupported route 保持明确错误 |
| 多账户复杂度误伤单账户 | 默认单账户可用；多账户 round-robin/sticky/concurrency 只作为增强，不作为基础 smoke 前提 |
| 用户等待无反馈 | IM 返回结构化状态：running、waiting-for-permission、delivering、failed、unsupported、fallback，不把内部诊断伪装成最终回复 |

## 当前任务清单

| 优先级 | 任务 | 状态 | 验收 |
| --- | --- | --- | --- |
| P0 | Research-first 门禁 | 已完成 | `AGENTS.md` 和本文件记录开工前外部核验、文档记录和 unsupported 策略 |
| P0 | `.meta-kim/` 工作区状态 | 已完成 | `.gitignore` 忽略 `.meta-kim/`，避免本地运行态进入提交 |
| P0 | 用户可见第三方引用清理 | 已完成本轮 | 文档和 unsupported 错误不再把旧第三方项目作为实现依据 |
| P1 | Agent session 判断稳定性 | 进行中 | Codex/Claude Code/OpenCode 默认 persistent；one-shot fallback 覆盖 heartbeat、async child task、idle timeout、unknown event 和终态 race |
| P1 | Gateway unsupported 合同 | 进行中 | 未验证的 image edits、audio、Realtime/WebSocket 返回结构化 unsupported，错误说明当前缺少稳定合同和替代路径 |
| P1 | Gateway endpoint profile 回归 | 已补本地回归 | 原生协议优选、passthrough 错误归属和 adapter-required 错误归属均锁定 endpoint profile |
| P1 | Channel final delivery / reaction 回归 | 已补本地回归 | Feishu reaction stop failure 可观测但不阻断生命周期；Feishu 投递失败落卡路径保持源码回归 |
| P1 | Channel legacy action helper 清理 | 已完成本轮 | Feishu transport 删除未暴露 Docx/Drive/Wiki/Bitable 直接 action helper，只保留旧 code fence 剥除 |
| P1 | 真实外部核验记录 | 持续 | 每次新增 provider、SDK、协议、Channel、Agent 或 UI 行为前更新目标/进度/专项文档 |

## 最近验证

- 2026-06-17：核验 OpenAI Codex `AGENTS.md` 官方说明，确认项目级指令是 Codex 开始工作前读取的控制面。
- 2026-06-17：核验 Claude Code 官方 Agent SDK / hooks 文档，确认 hooks、sessions、subagents、Stop/StopFailure 等生命周期事件应优先作为结构化判断来源。
- 2026-06-17：核验 OpenCode 官方 CLI / SDK 文档，确认 `--format json`、headless server、session API 和 SDK types 是优先于 TUI 文本的结构化路径。
- 2026-06-17：核验 Git `gitignore` 官方文档，确认所有开发者都应忽略的本地工作区产物应写入仓库 `.gitignore`。
- 2026-06-17：本轮按用户要求先不跑渠道 live；本地补 Gateway endpoint profile passthrough/adapter 错误归属回归，以及 Feishu reaction stop failure/daemon delivery failure 源码合同回归。
- 2026-06-17：重新核验 Codex app-server、Claude Code Agent SDK / TypeScript SDK、OpenCode CLI / SDK 官方文档；本地补真实 Claude `◯ deep-research ... ↓ tokens`、Codex subagents、OpenCode parallel tasks 的 async child-task TUI 回归，确认优先结构化 driver，TUI 只作 bounded fallback。
- 2026-06-17：核验 Feishu 官方开放平台 Docs/API、官方 Node SDK 和官方 OpenClaw Lark 插件安全边界；本地删除 Studio 未暴露的 Feishu direct action helper，保留私聊 transport 主链路和旧 code fence 剥除。
