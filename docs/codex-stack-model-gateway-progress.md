# Codex Stack Model Gateway 进度

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 文档规则：本文件只记录当前状态、已完成 checkpoint、验证和下一步；不要追加研究长文，过期细节直接替换。

## 1. 当前决定

- 不继续修补 CPA / Compact Proxy 链路；目标是直接切到自建 Studio Gateway daemon。
- Studio Gateway daemon 是模型 relay 的正式生命线；OpenClaw 单口 mount 只作为 UI/control ingress 或可选 proxy。
- CLI takeover 默认写 daemon loopback endpoint，不能只依赖 OpenClaw 单口 endpoint。
- `cc-connect` 后续只保留为可选 IM / project bridge。
- Provider 原生协议为 Anthropic Messages、OpenAI Responses API、OpenAI Chat Completions 三类；Studio 最终要把每类 provider 暴露成三类客户端协议。
- 每轮完成后更新本进度文件并提交 git；更新时替换状态，不追加流水账。

## 2. Phase 1 已完成

### Model Gateway API / Store

- 新增 `types/model-gateway.ts`。
- 新增 `apps/api/modules/model-gateway/*` 并注册到 Studio API。
- 已有 provider registry、secret store、runtime request log、health/circuit foundation。
- 已开放 provider CRUD、secret update、active provider、provider test、gateway status/runtime API。
- 已开放 CLI routes：`/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages`、`/claude/v1/messages`。

### Protocol Matrix Foundation

| Provider 原生协议 | Chat Completions client | Responses / compact client | Anthropic Messages client |
| --- | --- | --- | --- |
| `openai_chat` | passthrough 已测 | 非流式、文本 SSE、compact foundation、最小 tool history 已测 | 未开始 |
| `openai_responses` | 非流式 Chat adapter 已测 | passthrough 已测 | 未开始，adapter-required |
| `anthropic_messages` | 非流式 Chat adapter 已测 | 非流式 Responses/compact adapter 已测 | passthrough 已测 |

未完成格子继续返回 `model_gateway_adapter_required`。

### Daemon / Service Lifecycle

- 已新增最小 Local Gateway daemon entrypoint：`apps/api/model-gateway-daemon.ts`。
- daemon 可写 `daemon-runtime.json`、`daemon.pid`、`gateway-port.lock`。
- status 已返回 `lifecycle.controlPlane`、`lifecycle.openclawMount`、`lifecycle.localDaemon`、`lifecycle.endpointPolicy`。
- 已有 Studio API listener shutdown survivability test。
- 已有 OpenClaw single-port/mount fallback survivability test。
- 已新增 supervisor 模板和 API：systemd user、launchd、Windows scheduled task。
- 已新增 `GET/POST /api/model-gateway/daemon-service`，支持 preview/install/ensure-running/start/stop/restart/status。
- `ensure-running` 已锁定 supervisor-first；未安装 service 时默认 blocked，只有显式 `allowBootstrap` 才允许 detached fallback。
- 已新增 `scripts/verify-model-gateway-service-manager.mjs`；默认只读 probe，不安装、不启动、不重启。

### Codex Stack 接入

- Codex Stack install 成功后会写 daemon service template。
- install 准备 inactive `[model_providers.studio]`，endpoint 为 `http://127.0.0.1:18796/v1`，`wire_api = "responses"`，token 为 `PROXY_MANAGED`。
- 已新增 `apply-codex-studio-after-smoke` repair action。
- active takeover 前必须确认 daemon `runtimeMode === "local-daemon"`，并通过 `/v1/responses` 与 `/v1/responses/compact` smoke。
- smoke 通过后才写 Codex top-level `model_provider = "studio"`。
- Codex Stack 安装/修复页已有 Studio Gateway daemon status、service 操作面板和 Studio takeover 入口。

### 本轮完成

- 压缩目标/进度文档，删除历史流水账和过期 temporary bootstrap UI 说明。
- 前端删除旧 CPA attach / force attach 操作面：
  - Install/Repair 主流程不再暴露 `attach-codex-cpa`。
  - Runtime config 不再暴露“保存并验证 CPA / 保存并强制 CPA”。
  - 页面标题和状态文案收敛到 Studio Model Gateway / legacy local route。
- 后端公开 repair contract 删除：
  - `apply-codex-cpa-after-smoke`
  - `force-apply-codex-cpa`
- Readiness action 现在把未接管状态导向 `apply-codex-studio-after-smoke`。
- 旧 CPA attach 成功路径测试改为“legacy action 被拒绝”或 Studio Gateway takeover contract。

## 3. 当前仍未完成

- 真实 service manager apply 模式验证：install/start/status/restart 需要在 opt-in 环境执行。
- service template apply UI：需要区分“只写模板”和“执行 service manager 命令”。
- supervisor crash-restart test：daemon 崩溃后由真实 supervisor 拉起。
- 安装脚本替换：`auto-setup.sh` 仍有 CPA/Compact 旧安装逻辑。
- 资源删除：`compact-proxy.mjs`、CPA config templates、旧 systemd unit 仍待删除或隔离。
- UI 重做：完整 Provider Center、Universal Provider、App Setup、Diagnostics 尚未完成。
- Adapter 扩展：streaming tool calls、reasoning events、Anthropic streaming、Responses -> Anthropic。
- Failover 扩展：request retry、真实 failover queue、half-open probe、circuit reset policy。

## 4. 验证记录

本轮验证：

- `npm run build:api`：通过。
- `npm run typecheck:web`：通过。
- `node --test tests/system/codex-stack-service.test.mjs`：通过，68 个用例全绿。
- `node --test --test-name-pattern "attach action|repair board|settings page delegates runtime config" tests/system/studio-web-codex-stack-workspace.test.mjs`：通过，3 个相关 UI 静态 contract 用例全绿。
- `npx tsx --test tests/system/codex-stack-readiness-action.test.ts`：通过，9 个 readiness action 用例全绿。
- `git diff --check`：通过。

近期仍有效但本轮未重复：

- `npm run build:web`：上一轮通过，存在第三方 Rollup annotation 警告。
- `node scripts/verify-model-gateway-service-manager.mjs`：上一轮通过只读 probe；当前 Linux `systemd --user` 可达，service 未安装/未启用，dry-run blocked。
- `node --test tests/system/model-gateway-service.test.mjs`：上一轮通过。

完整 `tests/system/studio-web-codex-stack-workspace.test.mjs` 之前未全绿，失败集中在既有前端 design/static contract 债务；本轮只要求相关子集通过。

## 5. 下一步

1. 运行本轮 targeted tests，修正因删除 CPA attach 合约带来的失败。
2. 在 opt-in 环境运行 `OPENCLAW_STUDIO_VERIFY_MODEL_GATEWAY_SERVICE_APPLY=1 node scripts/verify-model-gateway-service-manager.mjs`，锁定真实 service manager happy path。
3. 实现 service template apply UI：只写模板、install/start/restart 三种状态明确分开。
4. 删除或隔离 `auto-setup.sh` 的 CPA/Compact 安装逻辑，改为 Studio Gateway daemon install path。
5. 删除或隔离 `compact-proxy.mjs` 和 CPA config templates，并迁移相关 tests。
6. 继续协议矩阵：优先补 `openai_responses` -> `anthropic_messages`，再补 streaming tool/reasoning。
