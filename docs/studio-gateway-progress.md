# Studio Gateway 进度

> 状态：Studio Gateway core completed; Provider Center/App Connections completed; CLI/Gateway/live smoke harness completed; Channel Connectors native daemon F1 completed; OpenAI Platform vendor proof optional
> 更新：2026-06-06
> 文档规则：只保留当前状态、最近完成、验证和下一步；旧流水已压缩。

## 当前状态

- Studio Gateway 是后续唯一正式模型中转目标；旧 Codex Stack / CPA / Compact 功能面已停止演进并从生产前后端删除。
- Gateway daemon 使用独立 OS/user supervisor 守护；Studio / OpenClaw 挂掉后，CLI 应继续直连 daemon endpoint。
- Provider Center 已支持用户自定义 provider、启用/停用、模型列表、别名、默认模型、priority、App scope、active routing、resolved route 状态、自动协议/模型识别、secret、provider-native smoke 和 active-route smoke。
- `GET /v1/models` 聚合所有启用 provider。不同 provider 同名 model 合法并形成模型池；同 provider 内重复 model ID / alias 会被拒绝。
- 本地 Gateway client key 可编辑/生成；启用后保护 `/v1/models`、Chat Completions、Responses、Responses compact、Anthropic Messages，并不会透传给 upstream。
- App Connections 已覆盖 Codex CLI、Claude Code、OpenCode、OpenClaw 的脱敏 preview、apply、备份、rollback、profile 切换、隔离 HOME HTTP 验收和真实 CLI 启动 smoke harness。
- App Connections profile 是两层模型选择：全局默认模型 + 每个 App 单独模型覆盖；模型输入从 Gateway 可用模型列表提供 datalist，仍允许手动输入 alias。
- Codex 低频兼容参数（WebSocket、WebSocket v2、请求压缩）已收进 `Codex advanced` 折叠，避免普通用户误触。
- Channel Connectors 已切换为 Studio 原生 CLI Agent Bot 路线；CC/OpenClaw 只作为参考，不再走短期托管 cc-connect；CC 二开源码已有功能必须全部纳入 Studio 原生目标。
- Phase B2 已按 `/tmp/cc-switch-src` 覆盖核心协议成熟度：CLI 启动、Claude tool/summary、OpenClaw agent provider/model/usage、Gateway HTTP compact/tool-history/error envelope、Responses->Chat streaming `include_usage`、provider-declared reasoning/thinking 映射、parallel tool-call index grouping、Chat SSE error -> Responses `response.failed`、started upstream stream failure -> target protocol error event、BigModel Chat/Anthropic live provider matrix，以及 GMN Responses-native substitute `/v1/responses` + `/v1/responses/compact` live proof。

## 本轮完成

- 新增独立 Channel Connectors 页面和 `/channel-connectors` 导航入口；未和 Model Gateway 同页管理。
- 新增后端 `channel-connectors` 模块：`/api/channel-connectors/status`、`/api/channel-connectors/daemon/config`、`service`、`logs`。
- 新增 Studio 原生 daemon entry：`apps/api/modules/channel-connectors/daemon.ts`；service 名称为 `openclaw-studio-channel-connectors.service`。
- 原生 daemon skeleton 可写 runtime/log，并暴露本地 health/status；平台 adapter 和 CLI Agent 调度留给 F2/F3。

## 验证

- 通过：`npm run build:api`。
- 通过：`npm run typecheck:web`。
- 通过：`node --test tests/system/channel-connectors-service.test.mjs`。
- 通过：`node --test tests/system/studio-web-channel-connectors-page.test.mjs tests/system/studio-web-shell-route-manifest.test.mjs`。
- 通过：`npm run build:web`。

## 已知边界

- OpenAI Platform official smoke 已降为可选 vendor proof；GMN 已作为 Responses-native substitute 完成当前验收。
- Channel Connectors F1 只完成原生 daemon skeleton；尚未实现配置 store、Octo(dmwork) adapter、真实 CLI Agent 调度和文本往返。

## 下一步

1. 进入 F2：先产出 CC/OpenClaw -> Studio 原生功能映射表，覆盖平台、Agent、消息、会话、治理、自动化和管理 API。
2. 进入 F2：实现原生 project / workDir / Agent profile / model / permission / Gateway key ref / platform-bot binding store。
3. 进入 F3：按 CC `platform/dmwork` 和 OpenClaw channel 模型实现 Octo(dmwork) adapter。
