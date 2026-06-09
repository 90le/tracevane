# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-09
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算；模型预算是 App Connections 与 Channel Connectors 的默认上下文来源。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、`pingTimeout=3`、SDK reconnecting 超 10s 回收、快速 ACK、messageId 去重和 runtime 入站观测。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；Codex app-server persistent driver 仅作为 metadata beta，已覆盖 `turn/start`、原生 compact、interrupt、idle reaper、fallback 和 session 管理。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口和 daemon 自动触发都优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底。

## 本轮完成

- Channel daemon `/status` 的最近 `autoCompacts` 记录已通过 Studio API `/api/channel-connectors/status` 代理到前端；daemon 离线时返回 `runtime.reachable=false`，页面不报错。
- Channel Connectors 管理页 Runtime tab 新增 daemon snapshot 与 Auto compact 观察区：展示最近 native / fallback / skipped、effective used、threshold、remaining、history cleanup、summary preview、error 和 retry window。
- 自动 compact 的触发语义保持不变：按模型上下文剩余量触发；retry/cooldown 只作为失败或 native 阻塞后的恢复状态展示，不作为正常触发条件。
- 共享类型新增 `ChannelConnectorsDaemonRuntimeStatus` 与 `ChannelConnectorsDaemonRuntimeAutoCompactRecord`，前后端和测试都走同一 contract。
- 更新迁移清单：P1 上下文预算与自动压缩的“成功 baseline 和失败 retry 记录可观测”已落到 `/status` 与管理页。

## 最近验证

- 通过：`npm run typecheck -- --pretty false`。
- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`npm run build:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，61 个 Channel Connectors 子测试通过。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs`，3 个页面 contract 子测试通过。
- 通过：`git diff --check`。
- 通过：`systemctl --user restart openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service` 后两个 user services 均为 `active/enabled`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3761`。
- 通过：Gateway daemon `/gateway/status` 返回 `ok=true`；Channel daemon `/status` 返回 `ok=true`、`autoCompacts=0`；后端 `/api/channel-connectors/status` 返回 `runtime.reachable=true`、`runtime.autoCompacts=0`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建，后续仍按专项文档跟踪真实 reconnect 后消息复验。
- `/status` 与 Channel 管理页已能显示最近 auto compact 记录；真实剩余 token 仍取决于上游 usage 或 Gateway runtime ledger 是否能归因。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 优化 Gateway UI 的批量模型导入/检测结果应用：保持 `模型ID | 显示名 | 别名1,别名2` 简单格式，同时允许批量设置能力和预算。
2. 扩展 Agent compact capability：Claude Code / OpenCode 等 runner 有真实原生 compact/compress 合同时再加入；不支持时继续 Studio fallback。
3. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode runner 文件/权限/流式能力。
4. 设计 durable queue，避免 Channel daemon 重启时丢失尚未开始的同 session 排队消息。
