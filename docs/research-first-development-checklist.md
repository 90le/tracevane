# Research-First Development Checklist

> 更新：2026-06-18
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
- 未经当前合同验证的 Realtime/WebSocket、音频、image edits、媒体 passthrough 或新 Agent 事件格式必须返回结构化 unsupported 或保持受控 fallback；官方已有能力不等于 Studio Gateway 已有可承载 bridge。

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
| Gateway 已开始的流式请求中途失败却被记为成功 | SSE adapter 必须把已写给客户端的 `error` / `response.failed` 同步反馈给 service，runtime 记 `failure`，health/circuit 可触发 fallback，Codex account quota/rate/capacity 可进入 cooldown |
| Gateway 忽略上游 Retry-After 继续打受限 provider | 普通 provider 和 endpoint health 持久化 `retryAfterUntil`；带 Retry-After 的失败立即打开 circuit，到期前不 probe，优先 fallback |
| Endpoint profile 已降级但状态摘要仍显示健康 | `/api/model-gateway/status` 必须把启用 endpoint profile 的 health/circuit 纳入 `healthSummary`；全部 endpoint open 的 provider 不计入 `okProviders` |
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
| P1 | Gateway started streaming failure 收口 | 已补本地回归 | 已开始的 SSE adapter 失败会保持客户端失败事件，同时更新 runtime failure、provider health、circuit 和 fallback |
| P1 | Gateway Retry-After / circuit 收口 | 已补本地回归 | 普通 provider 和 endpoint profile 429 保留上游错误码，Retry-After 写入对应 health 并阻止到期前 probe |
| P1 | Gateway endpoint health summary 收口 | 已补本地回归 | endpoint profile circuit 纳入 status healthSummary，全部 endpoint open 的 provider 不再算 ok |
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
- 2026-06-18：核验 OpenAI 官方 Realtime/audio、Responses WebSocket mode 和 `openai-node` Realtime WebSocket 说明；结论是官方能力存在，但 Studio Gateway 对 Codex account backend 仍缺完整 turn-state/tool-cache/history/close 合同，所以继续结构化 unsupported，并补齐 audio/realtime 错误 envelope 的可行性、参考和替代路径。
- 2026-06-18：核验智谱官方 GLM Coding Plan 快速开始、GLM-5.2 模型页和模型切换文档；结论是 Coding Plan 使用专属 `https://open.bigmodel.cn/api/coding/paas/v4` endpoint，GLM-5.2 为 1M context / 128K output，Claude Code 是官方覆盖的切换场景。本地用已配置 `glm` provider 完成 Codex / Claude Code / OpenCode 三协议 active-route smoke，验证后 activeProviders 恢复原状。
- 2026-06-18：将 Gateway provider 三协议 proof 固化为 `scripts/smoke-model-gateway-active-routes.mjs`：脚本会保存原 activeProviders、必要时临时启用 provider、临时激活目标 provider、逐 scope 调用 active-route-smoke、finally 恢复 enabled/activeProviders 并二次读取 `/providers` 校验恢复一致性；本地 GLM `glm-5.2` live 通过并断言两个 endpoint profile，GMN `gpt-5.4` 在临时启用后 live 通过并恢复禁用。
- 2026-06-18：核验 OpenAI Codex 官方 Advanced Configuration：`https://developers.openai.com/codex/config-advanced#oss-mode-local-providers` 是用户粘贴缺失后的正确入口；custom model providers / `openai_base_url` / `wire_api="responses"` 对 Studio Gateway 生成 Codex CLI 配置有帮助，`--oss` 主要面向 Ollama/LM Studio 本地 provider，不替代 Gateway 三协议适配测试。
- 2026-06-18：将“GLM 两种上游原生协议 + Codex 登录账户官方 Responses”整理为发布级协议矩阵，并新增 `scripts/smoke-model-gateway-protocol-matrix.mjs`；真实执行证明 GLM `coding-anthropic`、GLM `coding-chat`、`codex-account` 三项主流协议 proof 均通过，验证后 activeProviders 恢复为空。
- 2026-06-18：核验 OpenAI rate-limit 指南（`https://developers.openai.com/cookbook/examples/how_to_handle_rate_limits`）、Anthropic 错误文档（`https://docs.anthropic.com/en/api/errors` / `https://platform.claude.com/docs/en/api/errors`）、OpenAI Node `Retry-After` 讨论（`https://github.com/openai/openai-node/issues/1108`、`https://github.com/openai/openai-node/issues/1477`）和 Claude Code / community rate-limit 失败报告（例如 `https://github.com/anthropics/claude-code/issues/64030`、`https://github.com/vercel/ai/issues/5018`）；结论是 Gateway 不应对 rate/quota/capacity 失败做盲目同路由立即重试，而应保留上游错误、尊重 cooldown/Retry-After、更新 health/circuit 并允许 fallback。本地补 started streaming adapter failure 和 Retry-After 回归：已开始的 Chat/Responses/Anthropic SSE adapter 失败仍向客户端写协议内失败事件，同时 runtime 记 `failure`，provider 连续失败打开 circuit，下一次请求路由到 backup provider；普通 provider 和 endpoint profile 429 会保留上游错误码、写入对应 `health.retryAfterUntil`，到期前不 probe。
- 2026-06-18：本地补 Gateway endpoint health summary 回归；同 provider 多 endpoint fallback 后，`/api/model-gateway/status` 会显示 endpoint `openCircuits/degradedProviders`，全部启用 endpoint open 时 provider 不再计入 `okProviders`，避免 Overview/状态 API 掩盖真实路由不可用。
- 2026-06-18：核验 OpenClaw 官方 Gateway security/secrets、Gateway runbook、Gateway CLI restart `--safe`、plugins uninstall/manage 文档，以及本机 `openclaw gateway restart --help`；结论是 Recovery 应收敛 Gateway token 到 SecretRef/env 单一来源、清理废弃插件 allow/entry/index 残留、配置修复后优先 safe restart，并在修复前备份 runtime sidecar。本地补 Recovery 回归：SecretRef/env sync、Discord token 移除、`studio-local.gatewayAuthToken` 清理、`acpx`/`discord` residue 清理、legacy install index 归档、sidecar 回滚和 safe restart 合同。
- 2026-06-18：按用户要求制造真实 OpenClaw Recovery 损坏样本：破坏 Linux systemd Gateway service `ExecStart` 后，Recovery full repair 成功 reinstall/start 并等到 RPC ready；删除全局包 `openclaw.mjs` 后，Recovery 通过 install manifest 执行 `npm install -g openclaw@2026.6.8` 恢复 CLI。本轮因此修复 Gateway service repair 后过早 deep probe 的误判，以及 CLI shim 对 shell wrapper 的执行方式。
- 2026-06-18：核验 OpenClaw secrets 官方 CLI：`audit` 是只读扫描，`configure` 是交互式 helper，非交互 `--plan-out` 在当前环境需要 TTY。实际 audit 仍有 28 个 BigModel 明文 key finding 和 1 个 OpenAI OAuth legacy residue；已将 agent `models.json` 权限收紧到 `0600`，但明文迁移不由 Recovery 自动改写，后续应走官方交互式 SecretRef 迁移。
