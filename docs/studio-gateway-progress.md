# Studio Gateway / Channel Connectors 进度

> 状态：Studio Gateway core、Provider Center、App Connections、Channel Connectors Octo/Feishu 基础闭环已完成；当前推进 CC Go 成熟能力迁移与上下文管理。
> 更新：2026-06-09
> 文档规则：只保留当前事实、本轮完成、验证、边界和下一步；历史细节看 git commit 与专项文档。

## 当前事实

- Studio Gateway 是唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 生产前后端已删除，不再演进。
- Gateway daemon 与 Channel daemon 都由 OS/user supervisor 守护；Studio / OpenClaw 崩溃后，CLI 与 IM bot 应继续直连本地 daemon。
- Gateway 对外提供 Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions；`GET /v1/models` 聚合启用 provider，并保留模型别名、模型池、能力标记、上下文窗口和输出预算。
- Provider Center 已支持自定义 provider、启停、模型列表/别名/默认模型、能力勾选、priority、App scope、active routing、自动协议/模型识别、secret 和 smoke。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview/apply、备份、rollback、profile 切换和隔离 HOME HTTP 验收。
- Channel Connectors 走 Studio 原生 CLI Agent Bot 路线；Octo(dmwork) 与 Feishu 已接入 Codex/Claude Code/OpenCode runner、Studio Gateway key、IM session override、slash command、Feishu card/menu/progress、附件 staging、history、group context、reply buffer、queue、stop 和基础治理。
- Channel Connectors 任意新功能必须先对照 CC Go 1:1 迁移，再做 Studio 精修；迁移清单见 `channel-connectors-cc-migration-checklist.md`。
- Feishu 长连接专项跟踪见 `feishu-long-connection-issue-tracker.md`；Feishu 目前采用同 App 用户级全局 owner lock、官方 SDK `WSClient`/`EventDispatcher`、`pingTimeout=3`、SDK reconnecting 超 10s 回收、快速 ACK、messageId 去重和 runtime 入站观测。
- IM 文件收发固定为 Studio native transport：入站附件 staging 后交给 Agent；出站由 Agent 声明 `studio-channel-files` manifest，daemon 按平台上传发送。
- Codex live 默认仍是 CC Go 风格 one-shot `codex exec/resume`；Codex app-server persistent driver 仅作为 metadata beta，已覆盖 `turn/start`、原生 compact、interrupt、idle reaper、fallback 和 session 管理。
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；Agent 原生 compact/compress 优先；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底。

## 本轮完成

- Gateway 聚合模型目录新增 `contextWindow` 与 `maxOutputTokens` 输出；同名模型跨 provider 组成模型池时，按最小已知窗口/输出预算合并，避免 failover 到更小窗口 provider 时高估容量。
- Channel Connectors 新增 context budget resolver：按当前模型从 Gateway `/v1/models` 匹配模型 ID / alias / `provider/model` tail，优先使用 Gateway runtime usage，缺失时用本地 IM history 字符估算兜底。
- `/status` 现在会显示当前会话上下文预算：窗口、已用、剩余、usage 来源、max output reserve、auto compact threshold，以及当前 compact 状态边界。
- 用户可见 `/compact` 文案已收紧：当前实现仍是 Gateway `/responses/compact` 手动兜底；native-first 自动触发与 runner 原生 compact capability registry 是下一步，不再把目标误写成已完成。
- 更新迁移清单：P1 上下文预算从“待迁移”改为“进行中”，明确 `/status` 预算已接入，自动 native-first compact 仍未启用。

## 最近验证

- 通过：`npm run typecheck -- --pretty false`。
- 通过：`npm run build:api`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，52 个 Model Gateway 子测试通过。
- 通过：`node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2 个本轮 Channel 命令/卡片合同子测试通过。
- 通过：`node --test --test-name-pattern "isolates Codex app-server persistent sessions by IM session" tests/system/channel-connectors-service.test.mjs`，1 个 persistent 隔离用例通过；用于排除首次全量并发跑法中的时序超时。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`，61 个 Channel Connectors 子测试通过。
- 通过：`git diff --check`。
- 通过：`systemctl --user restart openclaw-studio-model-gateway.service openclaw-studio-channel-connectors.service` 后两个 user services 均为 `active/enabled`。
- 通过：`npm run dev:restart`，前端 `http://127.0.0.1:5176`，后端 `http://127.0.0.1:3761`。
- 通过：Gateway daemon `/gateway/status` 与后端 `/api/model-gateway/status` 均返回 `ok=true`、local daemon `state=running`；后端 `/api/channel-connectors/status` 返回 `ok=true`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- GMN provider 可作为视觉测试源，但未设为所有 App scope 默认 active provider；测试时需显式选择 `gpt-5.5`、`gmn-vision` 或 `gmn/gpt-5.5`。
- Feishu SDK 仍可能因网络或平台关闭连接而 reconnect；当前不使用 connected-idle / zero-inbound / generic watchdog 暴力重建，后续仍按专项文档跟踪真实 reconnect 后消息复验。
- `/status` 已能显示上下文预算，但还不会自动压缩；`/compact` 当前仍是 Studio Gateway compact fallback helper，不是 native-first 入口。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 实现 Agent compact capability registry：Codex app-server / Claude Code / OpenCode 等支持时优先调用原生 compact/compress，不支持或失败才调用 Studio Gateway compact fallback。
2. 接入 native-first auto compact 冷却触发：使用本轮 `/status` 预算结果和模型 `autoCompactTokenLimit`，先无副作用记录，再开启自动执行。
3. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode runner 文件/权限/流式能力。
