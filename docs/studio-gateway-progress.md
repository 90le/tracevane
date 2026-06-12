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

- 修复 OpenCode SQLite/DB fallback 工具流：
  - DB fallback 不再只读取最新 assistant message；进度会读取本轮所有 assistant rows，避免过程文本和工具调用被丢掉。
  - fallback 重建的 OpenCode JSONL 统一走实时 JSONL parser，工具调用和工具结果继续拆成 `tool_use` / `tool_result`。
  - fallback 最终回复只取最新 assistant message 的 text，避免把过程回复重新拼进最终回复。
  - fallback progress events 会回调给 daemon，Feishu/Octo 仍能渲染过程和工具输出。
- 删除 active `studio-channel-skill` 层：
  - 删除本地 `studio-channel-skill` tool 脚本生成、runner env、PATH 注入和 daemon `/channel-skill/action` endpoint。
  - 删除 Agent prompt/native skill 投影里的 Runtime Action Index 和平台 action 指令。
  - 删除 Studio 内置 platform skill/action registry 文件和 Octo action parser 文件。
  - Channel Connectors 管理页删除 skill runtime action chips。
- daemon 不再执行 `studio-octo-actions` / `studio-feishu-actions` 平台 action；旧 fenced action block 只会被剥离并返回“不再支持 private IM mode”的错误提示，不会触发审批或平台 API。
- `/skills` 和 skill context 只列出用户显式配置的 binding skill 目录；默认不再注入 Studio 内置 Feishu/Octo 平台 action skill。
- 系统测试改为锁定 private-transport-only 行为：Agent stdin/env 不含 `studio-channel-skill`，skill context 不含 runtime action index，旧 Octo action block 不触发审批/建群。
- 压缩文档，移除旧 runtime action 建设流水账，避免后续继续按已取消目标推进。

## 最近验证

- 通过：`npm run typecheck:api`
- 通过：`npm run build:api`
- 通过：`npm run typecheck:web`
- 通过：`node --test --test-name-pattern "OpenCode DB fallback|OpenCode JSON progress|OpenCode tool-calls|Claude Code stream-json progress|Claude text before later tools|Codex command execution progress|Codex agent messages before later tools" tests/system/channel-connectors-service.test.mjs`，7/7 通过。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，90/90 全部通过。

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
