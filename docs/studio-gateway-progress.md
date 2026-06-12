# Studio Gateway / Channel Connectors 进度

> 更新：2026-06-12
> 规则：只记录当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除。
- Gateway daemon 与 Channel daemon 都必须由 OS/user supervisor 守护；Studio / OpenClaw 崩溃时，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算。
- Provider Center 支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；当前 live Agent 只暴露 Codex、Claude Code、OpenCode。
- Feishu/Octo 首期验收已收窄为私聊完整性：文本对话、文件/图片传输、Agent CLI 原生能力、工具流/回复解析、`/compact`、`/stop`、session/model/permission/workdir 切换。
- 已实现的群聊、thread、多 bot、GROUP.md/THREAD.md、Octo 管理命令和 Feishu 群上下文仅保留 best-effort；不再作为当前主线或发布前阻断项。
- Channel prompt 只描述私聊文件、私聊消息、工作目录、权限、compact 和 Agent CLI 原生命令；不再引导 Agent 调用平台扩展 action。
- `studio-channel-files` 和 `studio-channel-messages` 是保留的 Agent 出站声明合同；文件/消息实际发送仍由 Studio native transport 执行。
- Feishu 长连接专项跟踪见 `docs/feishu-long-connection-issue-tracker.md`；任意假在线反馈先写入专项文档并对照 OpenClaw/CC 实现排查。
- Channel 侧 `/usage` / token 统计不再继续建设；模型消耗后续统一到 Gateway usage/模型消耗页。

## 本轮完成

- 清理并压缩 `docs/`：
  - 新增 `docs/README.md` 作为文档索引和维护规则。
  - 压缩 Gateway、Channel Connectors、Feishu、Chat、富消息、渲染、PRD、架构和当前进展文档。
  - 将 Feishu 9 项稳定性方案归档，当前长连接事实统一写入 `feishu-long-connection-issue-tracker.md`。
  - 将 Chat 长篇实现日志改为 typed contract / session policy / open gate 摘要。
  - 明确 `studio-channel-skill`、platform action、群聊/管理类扩展不是当前目标。
- 上一轮代码完成仍保留为当前事实：
  - OpenCode SQLite/DB fallback 已共用 realtime JSONL parser，工具调用/工具结果和最终回复分离。
  - active `studio-channel-skill` 层已从 prompt/env/UI/daemon endpoint 删除。

## 最近验证

- 上一轮代码验证通过：`npm run typecheck:api`
- 上一轮代码验证通过：`npm run build:api`
- 上一轮代码验证通过：`npm run typecheck:web`
- 上一轮代码验证通过：`node --test tests/system/channel-connectors-service.test.mjs`，90/90 全部通过。
- 本轮文档清理验证以 `git diff --check` 和 stale term 检查为准。

## 已知边界

- Feishu transport 内仍保留一套低层 legacy action helper 和对应直接 transport 回归；它已不再由 Agent prompt、runner、daemon endpoint 或 UI 暴露。后续如继续瘦身，应单独删除这段 Doc/Drive/Wiki/Bitable 直接 API helper，避免和私聊文件/图片 transport 误删混在一起。
- Octo/Feishu 群聊和管理能力已有实现继续 best-effort 保留，但新需求默认不继续扩展。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 重启会丢失未开始的排队消息，durable queue 尚未实现。
- Claude Code / OpenCode native compact live session driver 已有方向，但仍需继续按 CC Go `AgentSession.Send(CompressCommand())` 合同补齐和验收。
- 工具流仍需继续打磨：Codex、Claude Code、OpenCode 都必须稳定提取工具名、输入、stdout/stderr、exit/status、真实输出、过程回复和最终回复分类；OpenCode realtime JSONL 与 SQLite fallback 已对齐，后续重点继续看 Claude/Codex live 差异。

## 下一步

1. 继续稳定 Codex、Claude Code、OpenCode 工具流/回复解析，重点修复空工具结果、工具结果被吞、过程回复/最终回复分类错误。
2. 迁移 Claude Code / OpenCode native compact live session driver，按 CC Go 原生 session compact contract 做，不做 one-shot 伪透传。
3. 做 Feishu/Octo 私聊文件、图片、Markdown、权限审批和 `/compact` live smoke 复验。
4. 评估 durable queue，避免 daemon 重启丢失未开始消息。
