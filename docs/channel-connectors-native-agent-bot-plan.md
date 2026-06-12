# Channel Connectors / CLI Agent Bot 原生方案

> 状态：Studio 原生 Channel daemon 路线；Feishu/Octo 私聊基础闭环已可用；Agent runner、工具流、文件/图片和 compact 继续加固
> 更新：2026-06-12
> 迁移清单：`channel-connectors-cc-migration-checklist.md`

## 1. 当前结论

Studio 不走短期托管 `cc-connect` 方案。Channel Connectors 直接做成 Studio 原生能力：

```text
Feishu / Octo(dmwork) / future IM
  -> Studio native Channel daemon
  -> local CLI Agent bot (Codex / Claude Code / OpenCode)
  -> Studio Gateway daemon
  -> upstream provider
```

首期目标收窄为 **私聊完整闭环**：

- 私聊文本、图片、文件传输。
- Agent CLI 原生能力和少量 Studio 会话控制命令。
- 工具流、思考流、过程回复、最终回复分类稳定。
- `/stop`、`/new`、`/reset`、`/compact`、模型/目录/权限/显示开关可用。
- Studio / OpenClaw 崩溃时，Channel daemon 与 Gateway daemon 仍可继续服务。

不再继续扩展：

- active `studio-channel-skill`
- `studio-octo-actions` / `studio-feishu-actions`
- 平台 runtime action index
- Feishu/Octo 文档、群、管理类 API 工具层
- 群聊、thread、多 bot 协作和 Bot API 管理能力

已实现的群聊/thread/多 bot 能力保留 best-effort，但不再作为当前发布目标或下一步阻断项。

## 2. 迁移门禁

任何 Channel Connectors、Agent runner、菜单、卡片、进度、文件、会话、权限或 IM 命令功能开工前必须先定位成熟参考：

- CC Go：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`
- OpenClaw Feishu：`/home/binbin/.openclaw/projects/openclaw/latest/extensions/feishu`
- OpenClaw Octo 插件：`/home/binbin/.openclaw/extensions/octo`
- Octo Bot API skill：`/home/binbin/.openclaw/extensions/octo/skills/octo-bot-api/SKILL.md`

规则：

1. 先迁移 CC/OpenClaw contract：输入输出、session key、文件 staging/send、菜单命令、进度事件、错误 envelope、权限语义和重试策略。
2. 再做 Studio 化精修。
3. 若不采用参考方案，必须写明原因、测试证据和回退方式。
4. Codex `app-server` / persistent session 仍是 beta，未达到 one-shot `exec/resume` 路径同等稳定性前不得成为 live 默认。

## 3. Runtime 与持久化

- service：`openclaw-studio-channel-connectors.service`
- config：`~/.config/openclaw-studio/channel-connectors/config.json`
- daemon config：`~/.config/openclaw-studio/channel-connectors/daemon/config.json`
- state：`~/.config/openclaw-studio/channel-connectors/daemon/state`
- logs：`~/.config/openclaw-studio/channel-connectors/daemon/logs/channel-connectors.log`
- runtime：`~/.config/openclaw-studio/channel-connectors/daemon/runtime.json`
- override：`OPENCLAW_STUDIO_CHANNEL_CONNECTORS_DIR` 或 `OPENCLAW_STUDIO_DATA_DIR`

守护要求：

- Channel daemon 是独立进程，由 OS/user supervisor 守护。
- 运行期不依赖 Studio API；Studio 只负责配置、安装、启停、日志和管理面。
- 同一 binding + IM session 默认 FIFO 排队；普通消息排队，`/stop`、`/status` 等控制命令即时执行。
- daemon 重启后需要补 durable queue / 可恢复队列，避免未开始消息丢失。

## 4. 平台私聊合同

Feishu：

- 使用官方长连接 SDK，单 App 本机只允许一个 owner，并在进程内扇出到 binding。
- 长连接已由用户 live 验证稳定，后续进入监控态。
- WS event handler 只做轻量解析、去重、准入和快速 ACK；附件下载、Agent run、进度卡片和最终回复后台执行。
- 健康不只看 SDK `connected`；必须结合 ping/pong、transport stale、dispatcher callback、owner lock 和入站水位线。
- `/new`、`/reset` 等执行命令返回普通文本结果，不自动弹完整菜单。

Octo(dmwork)：

- WuKongIM 长连接参考 CC Go：heartbeat、PONG timeout、RECVACK、messageId 去重、抖动重连和 REST heartbeat。
- 长连接已由用户 live 验证稳定，后续进入监控态。
- 文件发送优先 STS + COS PUT 直传；旧 multipart 上传只作为兼容回退。
- accountId 需要按 OpenClaw Octo v1.0.15 的 mixed-case 归一规则处理。

通用：

- 入站附件先 staging 到受控目录，再交给 Agent。
- 出站文件由 Agent 输出 `studio-channel-files` manifest，daemon 校验路径和权限后按平台上传发送。
- 私聊默认显示思考、过程回复和工具过程；非飞书气泡式渠道的过程回复按最终回复同格式发送正文，不加“过程回复”标题；群聊中间过程只保留 best-effort。

## 5. Agent Runner 合同

首批 Agent：Codex、Claude Code、OpenCode。

必须支持：

- one-shot 路径稳定可用。
- persistent/live driver 逐 Agent 验收后再扩大默认范围。
- 工具调用、工具输入、stdout/stderr、工具结果、过程回复、最终回复分类正确，不出现空工具流或最终回复重复进过程流。
- `/native <命令>` 作为显式原生命令入口；未知 slash 可按 CC Go 语义提示并进入 Agent。
- `/compact` 优先 Agent-native compact/compress；不支持或失败时才走 Studio/Gateway compact。
- `/stop` 必须真实终止当前 binding + IM session 的 active runner。

当前状态：

- Codex app-server 已覆盖真实 Gateway `turn/start`、`/compact`、`turn/interrupt`、approval driver 合同、内部 prompt echo 过滤、结构化 stdout/stderr 工具结果解析和 reasoning summary/content 思考流解析。
- Claude Code stream-json 已覆盖普通 turn、Bash tool-use、文件 manifest、视觉附件、compact、stop/cancel、结构化 tool_result 输出渲染，并修复 persistent 过程回复污染最终回复。
- OpenCode `run --session` 已覆盖普通 turn、文件 manifest、视觉附件、compact、stop/cancel；SQLite fallback 已统一复用 live parser，结构化 `stdout`/`stderr`/`exitCode` 已保留，避免丢工具结果或把过程回复拼进最终回复。
- Claude Code / OpenCode persistent native compact 已新增真实子进程 driver 回归：Claude 用同一个 stream-json 常驻进程接收 `/compact`，OpenCode 用 `run --session <id>` 续接 `/compact`，均不回退 one-shot。
- Octo daemon 私聊 `/compact` 已新增回归：普通消息建立 live session 后，`/compact` 会进入 Claude/OpenCode persistent driver，不走 Gateway fallback。
- Feishu daemon 已补 native-first wiring 回归：长连接已稳定，派发会先调用 Agent native compact，再允许 Gateway fallback；外部 `/compact` live smoke 仍待复验。

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
- active `studio-channel-skill` 与 platform action 暴露层已删除。

## 7. 下一步

1. 稳定 Codex、Claude Code、OpenCode 的工具流/回复解析，尤其空工具结果、过程回复和最终回复重复问题。
2. 做 Feishu live `/compact` smoke。
3. 补 durable queue / 可恢复队列。
4. 复验 Feishu/Octo 私聊文件、图片、工具流和审批路径；Markdown 后续抽查即可。
5. 后续路线图：微信/企微、钉钉、Telegram、Slack、Discord、QQ/QQBot、LINE；更多 Agent 如 Gemini、Kimi、Cursor、Qoder、iFlow、Devin、ACP。
