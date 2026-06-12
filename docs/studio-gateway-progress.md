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
- Feishu/Octo 长连接已由用户 live 验证稳定；Feishu 专项跟踪进入 monitored 状态，任意假在线反馈先写入 `docs/feishu-long-connection-issue-tracker.md` 并对照 OpenClaw/CC 实现排查。
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
- 本轮代码补强：
  - 新增 Claude Code / OpenCode persistent session driver native compact 回归。
  - Claude Code 验证同一个 stream-json 常驻进程接收普通 turn 和 `/compact`，不回退 one-shot。
  - OpenCode 验证 `/compact` 通过 `run --session <id>` 续接 live session，不回退 one-shot。
  - 新增 Octo daemon 私聊 `/compact` 回归，证明 IM 入口会路由到 Claude/OpenCode persistent session，不走 Gateway fallback。
  - 新增 Feishu daemon native-first wiring 回归，锁定 Feishu 长连接派发会先调用 native compact，再允许 Gateway fallback。
  - 修复 Claude Code persistent driver：过程回复不再进入最终回复，且进度回调兼容 `agentTurnRequest.onProgress`。
  - 修复 OpenCode 结构化工具输出解析：`stdout`、`stderr`、`exitCode` 不再被压成空工具结果。
  - 修复 Codex 结构化命令输出解析：嵌套或直接 `stdout` / `stderr` 都会进入工具结果进度。
  - 修复 Claude Code one-shot 与 persistent driver 的结构化 `tool_result` 解析，`stdout` / `stderr` / `exit_code` 会进入工具结果进度。
  - 优化非飞书气泡式进度流：assistant 过程回复不再携带“过程回复”标题，按最终回复同格式发送正文。
  - 补齐 Codex thinking/reasoning 解析：one-shot 和 app-server 都按 CC Go 合同读取 `summary` / `summary_text` / `content`，无文本时不伪造思考进度。
  - 锁定 `/thinking on/off` 进度显示链路：Octo 私聊端到端验证关闭后不发 reasoning 气泡，重新开启后恢复发送；Feishu/Octo 共用同一进度过滤函数。
  - `/status`、`/current`、Feishu 菜单和前端 Channel Connectors 页面已区分 `thinking` parser 支持与当前 Agent/模型 live 输出观测状态，避免把显示开关误当作 live 能力。
  - 新增 Feishu compact live 证据脚本：从 daemon event log 匹配 `longConnection=true` 的真实 Feishu 入站消息和 `agent.native_compact.finished ok=true`，区分 auto compact 与显式 `/compact`。
  - 修复 Feishu compact live 脚本：真实 daemon 会先完成 native compact，再写入 `channel.command` 完成事件；脚本已按入站消息到命令完成窗口匹配。
- 本轮 live/contract 验证：
  - 用户确认 Feishu 与 Octo 长连接都处于稳定状态，标记完成并进入监控态。
  - 用户确认 Markdown 已验证；自动化复验覆盖 Feishu Markdown、Feishu/Octo 文件和媒体收发 contract。
  - Feishu 真实长连接 auto compact 已验证：脚本在 24h 日志内识别 3 条 `action=native`、`longConnection=true`、`nativeOk=true` 证据。
  - Feishu 显式 `/compact` live 已验证 Codex：`longConnection=true`，`command=compact`，`agent=codex`，`model=glm-5`，`nativeOk=true`，`progressEventCount=4`。
  - Feishu 显式 `/compact` live 已验证 Claude Code：`longConnection=true`，`command=compact`，`agent=claude-code`，`model=glm-5`，`nativeOk=true`，`progressEventCount=5`。
  - Feishu 显式 `/compact` live 已验证 OpenCode：`longConnection=true`，`command=compact`，`agent=opencode`，`model=glm-5`，`nativeOk=true`，`progressEventCount=4`。
  - Feishu 入站文件 live 已验证：`messageType=file`、`attachmentCount=1`、本地 staging 文件存在、history 有 `attachmentSummaries`，Claude Code 可读取文件内容并回复。
  - Feishu 权限卡片链路同轮观察通过：文件处理触发 Bash `permission-pending`，用户 `approve-all` 后进入 `permission-allowed-all`，工具结果回到 Agent 流。
  - 真实 CLI thinking smoke：
    - Claude Code 2.1.86 + `claude-sonnet-4-5` + `--effort max` 在当前 Gateway 下只输出 `text`，未输出 `thinking` item。
    - OpenCode 1.17.0 + `--thinking`：`gpt-5.4-mini` 未输出 reasoning；`claude-sonnet-4-5` 输出真实 `reasoning` part。

## 最近验证

- 上一轮代码验证通过：`npm run typecheck:api`
- 上一轮代码验证通过：`npm run build:api`
- 上一轮代码验证通过：`npm run typecheck:web`
- 本轮验证通过：`npm run build:api`
- 本轮验证通过：`node --test --test-name-pattern "persistent Claude and OpenCode drivers run native compact" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "routes Claude and OpenCode compact" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "Feishu compact native-first" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "persistent Claude driver keeps intermediate text|Claude text before later tools|Claude Code final text" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "OpenCode structured tool output|OpenCode JSON progress|OpenCode DB fallback" tests/system/channel-connectors-service.test.mjs`
- 本轮验证通过：`node --test --test-name-pattern "stages attachments|outbound file manifests|outbound IM message manifests|Feishu transport sends markdown|Feishu transport-smoke uploads and sends files|Feishu transport downloads message resources|Feishu transport uploads and sends images or files|Octo transport direct uploads|Octo upload-and-send media|Octo transport preserves outbound upload file names|Octo auto upload falls back|Octo transport smoke uploads and sends media" tests/system/channel-connectors-service.test.mjs`，12/12 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex structured command output|Codex command execution progress|OpenCode structured tool output" tests/system/channel-connectors-service.test.mjs`，3/3 通过。
- 本轮验证通过：`node --test --test-name-pattern "Claude structured tool output|persistent Claude driver keeps intermediate text|Claude Code stream-json progress|Claude text before later tools" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- 本轮验证通过：`node --test --test-name-pattern "Octo group process replies before final reply|daemon keeps Feishu dispatcher parity diagnostics" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex reasoning summaries|Codex app-server maps reasoning" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`node --test --test-name-pattern "Codex reasoning summaries|Claude Code stream-json progress|OpenCode JSON progress|thinking display toggles" tests/system/channel-connectors-service.test.mjs`，4/4 通过。
- 本轮验证通过：`node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2/2 通过。
- 本轮验证通过：`npm run build:web`
- 本轮验证通过：`node --test tests/system/channel-connectors-service.test.mjs`，100/100 全部通过。
- 本轮验证通过：`node --test tests/system/channel-connectors-feishu-compact-live-script.test.mjs`，4/4 通过。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode auto --since-minutes 1440 --json`，识别 3 条 Feishu long-connection native auto compact 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --since-minutes 30 --json`，识别 1 条 Feishu long-connection Codex 显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent claude-code --since-minutes 45 --json`，识别 1 条 Feishu long-connection Claude Code 显式 `/compact` native 证据。
- 本轮 live 验证通过：`node scripts/smoke-channel-connectors-feishu-compact-live.mjs --mode explicit --agent opencode --since-minutes 45 --json`，识别 1 条 Feishu long-connection OpenCode 显式 `/compact` native 证据。
- 本轮 live 验证通过：Feishu 文件消息 `om_x100b6df679c474a4c23ef686549039b`，staging 路径存在，`agent.run.finished agentOk=true replySent=true`。
- 本轮文档清理验证以 `git diff --check` 和 stale term 检查为准。

## 已知边界

- Feishu transport 内仍保留一套低层 legacy action helper 和对应直接 transport 回归；它已不再由 Agent prompt、runner、daemon endpoint 或 UI 暴露。后续如继续瘦身，应单独删除这段 Doc/Drive/Wiki/Bitable 直接 API helper，避免和私聊文件/图片 transport 误删混在一起。
- Octo/Feishu 群聊和管理能力已有实现继续 best-effort 保留，但新需求默认不继续扩展。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 重启会丢失未开始的排队消息，durable queue 尚未实现。
- Claude Code / OpenCode native compact 已覆盖 driver 层、Octo daemon 私聊入口、Feishu native-first wiring、Feishu 真实长连接 auto compact 和 Feishu 显式 `/compact` 三 Agent live smoke。
- 工具流仍需继续打磨：Codex、Claude Code、OpenCode 都必须稳定提取工具名、输入、stdout/stderr、exit/status、真实输出、过程回复和最终回复分类；三者结构化 stdout/stderr 已对齐，Claude persistent 过程/最终回复重复已修。
- 思考流 parser 支持 Codex、Claude Code、OpenCode 原生 thinking/reasoning 事件；Octo 私聊 `/thinking on/off` 已做端到端回归；状态/UI 已区分 parser 支持和 live 输出观测。真实 smoke 证明 OpenCode 会在支持 reasoning 的模型上输出 `reasoning`，Claude Code 2.1.86 当前未输出 `thinking` item；没有原生思考事件的 Agent/模型组合只能标为不支持，不伪造。

## 下一步

1. 继续稳定 Codex、Claude Code、OpenCode 工具流/回复解析，重点修复空工具结果、工具结果被吞、过程回复/最终回复分类错误。
2. 做 Feishu/Octo 私聊文件、图片、权限审批和 `/compact` live smoke 复验；Feishu 入站文件已完成，继续 Feishu 图片、出站文件和 Octo 对应项。
3. 评估 durable queue，避免 daemon 重启丢失未开始消息。
