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
- 上下文管理策略固定为 native-first：Gateway/Channel 负责模型预算与触发决策；App Connections apply 会按每个 App 选中模型派生上下文、max output 和 compact 阈值；`/compact` 手动入口已在 daemon 中优先尝试 live persistent Agent 原生 compact；Studio Gateway `/responses/compact` 只作为不支持、失败或 one-shot 不可靠时的兜底。

## 本轮完成

- Gateway 聚合模型目录新增 `contextWindow` 与 `maxOutputTokens` 输出；同名模型跨 provider 组成模型池时，按最小已知窗口/输出预算合并，避免 failover 到更小窗口 provider 时高估容量。
- Channel Connectors 新增 context budget resolver：按当前模型从 Gateway `/v1/models` 匹配模型 ID / alias / `provider/model` tail，优先使用 Gateway runtime usage，缺失时用本地 IM history 字符估算兜底。
- `/status` 现在会显示当前会话上下文预算：窗口、已用、剩余、usage 来源、max output reserve、auto compact threshold，以及当前 compact 状态边界。
- `/compact` 命令路由新增 native-first capability contract：native 成功时不调用 fallback；native 不支持或失败且允许降级时才调用 Studio compact fallback；active run 正在执行时拒绝 compact，避免和同一 app-server turn 并发。
- Channel daemon 已接 Codex app-server 原生 compact：仅当当前 binding 是 persistent、当前 IM session 已有 live driver session 时，发送 `thread/compact/start`；没有 live session 时不会新建空 thread，而是降级 Studio Gateway compact。
- 用户可见 `/compact` 文案已更新为真实状态：手动入口有 live persistent Agent session 时原生优先，否则 Gateway `/responses/compact` 兜底；自动触发仍未启用。
- 更新迁移清单：P1 上下文预算从“待迁移”改为“进行中”，明确 `/status` 预算和手动 native-first compact 已接入，自动 native-first compact 仍未启用。
- Provider Center 模型行已补齐 `contextWindow` 与 `maxOutputTokens` 配置；编辑、保存、检测导入都会保留模型预算字段。
- Detect Provider 会从常见 `/models` 字段识别上下文/输出预算和能力信号，例如 `context_length`、`contextWindow`、`max_output_tokens`、`features`、`capabilities`、`input_modalities`、`supported_parameters`；模型商未返回时用保守模型族默认值兜底。
- Detect Provider 在 `/models` 未返回用户填写模型时，会返回该模型的推断预算和能力，避免小白用户只填 base/key/model 后没有可应用配置。
- App Connections 模型选择已优先使用 Gateway 可用模型下拉，并在选项中显示模型预算；无模型目录时仍允许手动填写兼容 alias。
- App Connections 新增“应用模型预算”和每个 App 的有效预算展示；Codex 写入 `model_context_window` 与 `model_auto_compact_token_limit`，OpenCode/OpenClaw 写入模型目录预算，Claude Code 仍只写官方可识别的 endpoint/key/model，预算由 Gateway/Channel 层用于上下文管理。

## 最近验证

- 通过：`npm run typecheck -- --pretty false`。
- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`npm run build:web`。
- 通过：`node --test tests/system/model-gateway-service.test.mjs`，53 个 Model Gateway 子测试通过。
- 通过：`node --test tests/system/studio-web-model-gateway-page.test.mjs`，3 个 Studio Gateway 页面 contract 子测试通过。
- 通过：`node --test --test-name-pattern "IM commands switch agent|command surface renders text" tests/system/channel-connectors-service.test.mjs`，2 个本轮 Channel 命令/卡片合同子测试通过。
- 通过：`node --test --test-name-pattern "IM commands switch agent|runs Codex app-server when persistent session metadata is enabled" tests/system/channel-connectors-service.test.mjs`，覆盖 `/compact` native 成功不走 fallback，以及 daemon fake app-server 收到 `thread/compact/start`。
- 通过：`node --test tests/system/channel-connectors-codex-app-server-driver.test.mjs`，9 个 Codex app-server driver 子测试通过。
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
- `/status` 已能显示上下文预算；App Connections 已按模型预算写入支持的 Agent 配置；`/compact` 手动入口已 native-first，但 Channel 自动 compact 还不会根据预算自动触发。
- Gateway usage 只有在上游返回 usage 或 runtime ledger 可归因时才准确；缺失 usage 时 Channel 只能用 IM history 字符估算，不能替代真实 tokenizer。
- 同 session FIFO queue 当前是 daemon 内存队列；Channel daemon 自身重启会丢失未开始的排队消息，durable queue 尚未实现。

## 下一步

1. 接入 native-first auto compact 冷却触发：使用 `/status` 预算结果和模型 `autoCompactTokenLimit`，先做无副作用记录，再开启自动执行。
2. 优化 Gateway UI 的批量模型导入/检测结果应用：保持 `模型ID | 显示名 | 别名1,别名2` 简单格式，同时允许批量设置能力和预算。
3. 扩展 Agent compact capability：Claude Code / OpenCode 等 runner 有真实原生 compact/compress 合同时再加入；不支持时继续 Studio fallback。
4. 继续按 CC Go 迁移 Feishu/Octo 菜单与命令细节、Claude Code AskUserQuestion 卡片精修、OpenCode runner 文件/权限/流式能力。
