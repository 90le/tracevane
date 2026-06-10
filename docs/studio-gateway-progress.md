# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-10
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算；模型预算是 App Connections 与 Channel Connectors 的默认上下文来源。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、批量模型导入、批量预算/能力应用、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、默认不启用 SDK 额外 `pingTimeout`、SDK reconnecting 超 10s 回收、应用层 ping/pong runtime proof、pong timeout 回收、快速 ACK、messageId 去重和 runtime 入站观测；无业务消息时不再默认 startup recycle。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；persistent session pool 作为 metadata beta 覆盖 Codex app-server、Claude Code stream-json 和 OpenCode `run --session`，已锁定原生 compact、interrupt/stop、idle reaper、fallback、session 管理合同和真实 CLI mock-Gateway smoke。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底；`/native /compact` 是强制原生入口，没有真实 native compact contract 时会拒绝伪透传。
- Channel daemon `/status` 的最近 `autoCompacts` 已通过 Studio API 代理到 Channel 管理页；自动 compact 触发仍只看上下文预算压力，retry/cooldown 只表示失败恢复状态。

## 本轮完成

- OpenCode 1.16.2 `run --format json` 在本机可能 exit 0 但 stdout 为空；已补本地 `opencode.db` best-effort fallback，恢复 session id、assistant text、step/tool progress，并保留旧 stdout JSONL 路径优先。
- 扩展 `smoke:channel-connectors:native-cli-sessions`：隔离 HOME + mock Studio Gateway，直接调用 daemon 同款 native persistent driver，覆盖 Claude Code 普通 turn、Bash tool-use、`studio-channel-files` manifest、`/compact`、`/stop`，以及 OpenCode 普通 turn、`studio-channel-files` manifest、`/compact`、`/stop`。
- 修复 OpenCode 取消路径误读旧 `opencode.db` 状态的问题：DB fallback 只在 exit 0、未取消、无错误且 stdout 为空时启用。
- 修复 Claude Code persistent stop：用户停止当前 turn 时直接返回 `cancelled` 结果，不再把被取消的 resident process 当成 driver crash 或 one-shot fallback。
- 按 CC Go `agent/opencode/session.go` 迁移 OpenCode 视觉输入合同：视觉模型 + 已 staging 图片时，`opencode run` 会在 `--` prompt 分隔符前追加 `--file <imagePath>`，非视觉模型仍走 Studio 视觉保护提示。
- 修复 Claude 工具流渲染：Claude `user/tool_result` 的纯输出文本不再被进度卡片解析器吞掉首行，单行工具结果不会再显示为“无输出”。
- 按 CC Go 迁移 Codex app-server 运行中权限批准合同：`item/commandExecution/requestApproval`、`item/fileChange/requestApproval` 和 `item/permissions/requestApproval` 进入现有 IM permission resolver，分别回写 `{decision:"accept|decline"}` 与 turn-scoped `permissions` 结果。

## 最近验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck -- --pretty false`。
- 通过：`node --test tests/system/channel-connectors-agent-session-driver.test.mjs`，覆盖 OpenCode `--session` compact、OpenCode 空 stdout SQLite fallback、Claude stream-json compact、Claude persistent stop cancel 和 OpenCode persistent stop abort。
- 通过：`node --test --test-name-pattern "agent runner builds gateway-backed" tests/system/channel-connectors-service.test.mjs`，覆盖 Codex `--image`、Claude image content block、OpenCode `--file` 图片传入和非视觉模型保护。
- 通过：`node --test --test-name-pattern "native Channel Connectors process runner maps Claude Code stream-json progress|process runner answers Claude Code permission requests|process runner waits for interactive Claude Code permission decisions" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon owns Feishu long-connection ingress" tests/system/channel-connectors-service.test.mjs`，覆盖 Claude tool_result 纯输出渲染保护源码合同。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，覆盖 Codex app-server sandbox/approvalPolicy、compact、stop、tool output、command/file/permissions requestApproval 回包。
- 通过：`node scripts/smoke-channel-connectors-native-cli-sessions.mjs --apps opencode --strict --json`，本机真实 OpenCode 通过普通 turn、文件 manifest、原生 compact 和 stop cancel；取消结果不再混入旧 DB 输出。
- 通过：`npm run smoke:channel-connectors:native-cli-sessions:strict -- --json`，本机真实 Claude Code / OpenCode 均通过普通 turn、文件 manifest、原生 compact 和 stop cancel；Claude Code 额外通过 Bash tool-use，OpenCode 命中 `opencode.db` fallback 或 stdout JSONL 路径。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon entry exposes health" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors daemon runs Codex app-server when persistent session metadata is enabled" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/channel-connectors-agent-sessions-live-script.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors IM commands switch agent, model, and permission per session" tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test --test-name-pattern "native Channel Connectors agent runner builds gateway-backed Codex turns" tests/system/channel-connectors-service.test.mjs`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建。ping/pong proof 能证明 transport 活着，真实消息级延迟仍需用户继续用 Feishu live 反馈；如仍不稳定，下一步评估 webhook/hybrid ingress 或 Studio-owned WS transport。
- Feishu 官方长连接仍要求 3s 内处理事件且同 App 多连接是集群分发；Studio 必须保持同 App owner lock 和 fast ACK，不允许让 Agent run、附件下载或卡片更新阻塞 SDK ACK。
- Claude Code 普通 turn、Bash tool-use、文件 manifest、`/compact`、`/stop` 和 OpenCode 普通 turn、文件 manifest、`/compact`、`/stop` 已有真实 CLI mock-Gateway smoke；OpenCode 已按 CC Go 补原生图片 `--file` 参数构建测试；Claude 权限批准已有 runner/IM 基础闭环；Codex app-server requestApproval 已有 driver 合同回归，真实 IM live approval、真实视觉 CLI smoke 和 IM live 文件上传链路仍需逐项验收。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 做真实 IM live approval smoke：Codex app-server Bash/Patch/Permissions、Claude AskUserQuestion/permission、OpenCode permission，确认飞书按钮和文本 `/approve`/`/deny` 都能闭环。
2. 继续扩展真实 Claude Code / OpenCode persistent smoke：视觉输入和 IM live 文件上传链路，并确认 one-shot 默认路径不受影响。
3. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode 文件/权限/流式能力。
4. 设计 durable queue，避免 Channel daemon 重启时丢失尚未开始的同 session 排队消息。
