# Channel Connectors / CLI Agent Bot 原生方案

> 状态：Tracevane 原生 Channel daemon 路线；Feishu/Octo 私聊闭环已进入 live 抽查；Agent runner 继续加固；IM busy guard 已取代普通消息排队
> 更新：2026-06-17
> 开工门禁：`research-first-development-checklist.md`

## 1. 当前结论

Tracevane 不走短期托管 `cc-connect` 方案。Channel Connectors 直接做成 Tracevane 原生能力：

```text
Feishu / Octo(dmwork) / future IM
  -> Tracevane native Channel daemon
  -> local CLI Agent bot (Codex / Claude Code / OpenCode)
  -> Tracevane Gateway daemon
  -> upstream provider
```

首期目标收窄为 **私聊完整闭环**：

- 私聊文本、图片、文件传输。
- Agent CLI 原生能力和少量 Tracevane 会话控制命令。
- 工具流、思考流、过程回复、最终回复分类稳定。
- `/stop`、`/new`、`/reset`、`/compact`、模型/目录/权限/显示开关可用。
- Tracevane / OpenClaw 崩溃时，Channel daemon 与 Gateway daemon 仍可继续服务。

不再继续扩展：

- active `tracevane-channel-skill`
- `tracevane-octo-actions` / `tracevane-feishu-actions`
- 平台 runtime action index
- Feishu/Octo 文档、群、管理类 API 工具层
- 群聊、thread、多 bot 协作和 Bot API 管理能力

已实现的群聊/thread/多 bot 能力保留 best-effort，但不再作为当前发布目标或下一步阻断项。

## 2. Research-First 门禁

任何 Channel Connectors、Agent runner、菜单、卡片、进度、文件、会话、权限或 IM 命令功能开工前必须先完成当前外部核验：

1. 官方优先：Feishu/Lark、OpenCode、Claude Code、OpenAI Codex、Octo/WuKongIM 或目标平台的官方文档、API、SDK、CLI help、changelog。
2. GitHub 与社区补充：活跃仓库、issues、discussions、release notes 和社区故障报告，用来发现事件格式升级、SDK bug、运维风险和未解决问题。
3. 本地边界对比：只在确认 Tracevane daemon、session、secret、file staging、UI 和测试边界能承载后实现。
4. 文档记录：把来源、日期、稳定合同、拒绝方案、风险和验证计划写入本文件、`tracevane-gateway-progress.md` 或专项 tracker。
5. Codex / Claude Code / OpenCode 默认使用结构化 persistent driver；one-shot `exec/resume` / TUI runner 只作为显式 opt-out、persistent crash fallback 或未支持 Agent 的兼容路径。新 Agent 若要成为默认路径，必须先补齐结构化事件、session、stop/compact、fallback 和回归证据。

## 3. Runtime 与持久化

- service：`openclaw-tracevane-channel-connectors.service`
- config：`~/.config/tracevane/channel-connectors/config.json`
- daemon config：`~/.config/tracevane/channel-connectors/daemon/config.json`
- state：`~/.config/tracevane/channel-connectors/daemon/state`
- logs：`~/.config/tracevane/channel-connectors/daemon/logs/channel-connectors.log`
- runtime：`~/.config/tracevane/channel-connectors/daemon/runtime.json`
- override：`TRACEVANE_CHANNEL_CONNECTORS_DIR` 或 `TRACEVANE_DATA_DIR`

守护要求：

- Channel daemon 是独立进程，由 OS/user supervisor 守护。
- 运行期不依赖 Tracevane API；Tracevane 只负责配置、安装、启停、日志和管理面。
- 同一 binding + IM session 同时只接受一个普通 Agent 任务；已有任务未结束时，新的普通 IM 消息直接回复 busy guard 提示，不入队、不落盘、不自动重放。
- `/stop` / `/cancel` / `/status` 等控制命令仍即时执行；用户需先用 `/stop` 或 `/cancel` 结束当前任务，再重新发送新消息。

## 4. 平台私聊合同

Feishu：

- 使用官方长连接 SDK，单 App 本机只允许一个 owner，并在进程内扇出到 binding。
- 长连接已由用户 live 验证稳定，后续进入监控态。
- WS event handler 只做轻量解析、去重、准入和快速 ACK；附件下载、Agent run、进度卡片和最终回复后台执行。
- 健康不只看 SDK `connected`；必须结合 ping/pong、transport stale、dispatcher callback、owner lock 和入站水位线。
- `/new`、`/reset` 等执行命令返回普通文本结果，不自动弹完整菜单。

Octo(dmwork)：

- WuKongIM 长连接按当前官方/API 核验和 live smoke 证据维护：heartbeat、PONG timeout、RECVACK、messageId 去重、抖动重连和 REST heartbeat。
- 长连接已由用户 live 验证稳定，后续进入监控态。
- 文件发送优先 STS + COS PUT 直传；旧 multipart 上传只作为兼容回退。
- accountId 需要按 OpenClaw Octo v1.0.15 的 mixed-case 归一规则处理。

通用：

- 入站附件先 staging 到受控目录，再交给 Agent。
- 出站文件由 Agent 输出 `tracevane-channel-files` manifest，daemon 校验路径和权限后按平台上传发送。
- 私聊默认显示思考、过程回复和工具过程；非飞书气泡式渠道的过程回复按最终回复同格式发送正文，不加“过程回复”标题；群聊中间过程只保留 best-effort。

## 5. Agent Runner 合同

首批 Agent：Codex、Claude Code、OpenCode。

必须支持：

- persistent/live driver 是默认路径，必须优先使用结构化事件判断运行中、完成、失败和 stop/compact。
- one-shot 路径稳定可用，作为显式 opt-out 和 persistent fallback。
- 工具调用、工具输入、stdout/stderr、工具结果、过程回复、最终回复分类正确，不出现空工具流或最终回复重复进过程流。
- `/native <命令>` 作为显式原生命令入口；未知 slash 需要按当前 IM 命令合同提示并进入 Agent。
- `/compact` 优先 Agent-native compact/compress；不支持或失败时才走 Tracevane/Gateway compact。
- `/stop` 必须真实终止当前 binding + IM session 的 active runner。

当前状态：

- Codex app-server 已覆盖真实 Gateway `turn/start`、`/compact`、`turn/interrupt`、approval driver 合同、内部 prompt echo 过滤、结构化 stdout/stderr 工具结果解析和 reasoning summary/content 思考流解析。
- Claude Code stream-json 已覆盖普通 turn、Bash tool-use、文件 manifest、视觉附件、compact、stop/cancel、结构化 tool_result 输出渲染，并修复 persistent 过程回复污染最终回复。
- OpenCode `run --session` 已覆盖普通 turn、文件 manifest、视觉附件、compact、stop/cancel；SQLite fallback 已统一复用 live parser，结构化 `stdout`/`stderr`/`exitCode` 已保留，避免丢工具结果或把过程回复拼进最终回复。
- session driver 默认模式已从 one-shot 切到 persistent；daemon status/runtime 会显示 `defaultMode=persistent`，Codex reason 为 `codex-app-server`，绑定 metadata 可显式回退 one-shot。
- Claude Code / OpenCode persistent native compact 已新增真实子进程 driver 回归：Claude 用同一个 stream-json 常驻进程接收 `/compact`，OpenCode 用 `run --session <id>` 续接 `/compact`，均不回退 one-shot。
- Octo daemon 私聊 `/compact` 已新增回归：普通消息建立 live session 后，`/compact` 会进入 Claude/OpenCode persistent driver，不走 Gateway fallback。
- Feishu daemon 已补 native-first wiring 回归：长连接已稳定，派发会先调用 Agent native compact，再允许 Gateway fallback；Feishu 显式 `/compact` 24h live 已验证 Codex / Claude Code / OpenCode。

## 6. 当前完成

- 独立 `/channel-connectors` 页面和 `/api/channel-connectors/*` API。
- 原生 config store：Agent Profile、workDir、Agent、model、permission、Gateway key ref、platform/bot binding、allowlist/admin。
- Octo/Feishu 私聊文本往返、文件/图片 staging、出站文件 manifest；视觉模型自动选择是 binding 级显式开关，默认关闭，失败回退原模型附件说明模式。
- Octo/Feishu 长连接已由用户 live 验证稳定，Markdown 已验证。
- Feishu card/menu、会话子卡、命令路由、进度卡片和快速 ACK 后台派发。
- IM 命令：`/help`、`/status`、`/agent`、`/model`、`/mode`、`/reasoning`、`/dir`、`/cd`、`/new`、`/reset`、`/stop`、`/display`、`/thinking`、`/process`、`/tools`、`/compact` 等核心命令。
- 私聊工具流、思考流、过程回复显示开关。
- Codex 思考流解析合同已覆盖 one-shot 和 app-server；Octo 私聊 `/thinking` 开关已有端到端回归；状态、菜单和前端能力展示已区分 parser 支持与当前 live 输出观测。真实 CLI smoke 显示 Claude Code 2.1.86 当前不输出 `thinking` item，OpenCode 1.17.0 仅在支持 reasoning 的模型上输出 `reasoning` part。没有 CLI 原生事件时不伪造。
- allowlist/admin、rate limit、banned words 基础治理。
- active `tracevane-channel-skill` 与 platform action 暴露层已删除。
- Codex / Claude Code / OpenCode direct runner smoke 已证明过程回复、工具输出和最终回复分类正常；真实 IM event-log 中三者均已有过程回复样本。
- Feishu/Octo 文件、图片、权限审批、出站文件、`/stop`、Octo 显式/自动 compact 已有回归或 24h live 证据。

## 7. 下一步

1. 继续抽查 Feishu/Octo 私聊文件、图片、工具流、过程回复、思考流、审批路径和 busy guard 拒绝提示；Markdown 只做回归抽查。
2. 后续路线图：微信/企微、钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE；更多 Agent 如 Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP。
