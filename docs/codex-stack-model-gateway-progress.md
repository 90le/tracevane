# Codex Stack Model Gateway 进度

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 文档规则：本文件只记录当前状态、已完成 checkpoint、验证和下一步；不要追加研究长文，过期细节直接替换。

## 1. 当前基线

- 正式模型 relay 是自建 Studio Gateway daemon；OpenClaw 单口 mount 只作为 UI/control ingress 或可选 proxy。
- CLI takeover 默认写 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- Provider 原生协议固定为 Anthropic Messages、OpenAI Responses API、OpenAI Chat Completions；Gateway 要把每类 provider 暴露成三类客户端协议。
- 缺失 adapter 必须返回 `model_gateway_adapter_required`，不能伪成功。
- 进度更新采用替换式短状态页，不追加流水账。

## 2. 已完成

- Phase 0 研究和目标边界已固定；后续不继续修补 CPA / Compact Proxy 主链路。
- 已新增 Model Gateway types、provider registry、secret store、runtime log、health/circuit foundation 和 API routes。
- 已开放 CLI routes：`/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages`、`/claude/v1/messages`。
- Adapter foundation 已覆盖 Chat passthrough、Responses passthrough、Anthropic passthrough，以及三类协议间的非流式基础转换；未完成格子继续 adapter-required。
- 已新增 Local Gateway daemon entrypoint、runtime metadata、pid/port lock、survivability tests。
- 已新增 systemd user / launchd / Windows scheduled task 模板与 `/api/model-gateway/daemon-service` API。
- `ensure-running` 已锁定 supervisor-first；未安装 service 时默认 blocked，显式 `allowBootstrap` 才允许 detached fallback。
- Codex Stack install 会写 daemon service template，并准备 inactive `[model_providers.studio]`。
- Codex Studio takeover 需要先确认 local-daemon，并通过 `/v1/responses` 与 `/v1/responses/compact` smoke。
- 本轮删除公开 CPA/Compact 配置面：install env、runtime patch 字段、Codex auth/key 写入、`.cli-proxy-api/config.yaml` 和 `cpa-compact-proxy.service` patch、前端 CPA/Compact 端口/key 表单。
- proxy/upstream 状态读取以 OpenClaw env 为新优先来源；旧 CPA YAML 只作为 legacy fallback。

## 3. 当前仍未完成

- 真实 service manager apply 模式验证：install/start/status/restart 需要在 opt-in 环境执行。
- service template apply UI：需要区分“只写模板”和“执行 service manager 命令”。
- supervisor crash-restart test：daemon 崩溃后由真实 supervisor 拉起。
- 后端 Codex Stack service 仍保留 CPA/Compact service rows、summary components、logs/service control allowlist 和部分 legacy migration tests。
- UI 重做：完整 Provider Center、Universal Provider、App Setup、Diagnostics 尚未完成。
- Adapter 扩展：streaming tool calls、reasoning events、Anthropic streaming、Responses -> Anthropic。
- Failover 扩展：request retry、真实 failover queue、half-open probe、circuit reset policy。

## 4. 验证记录

本轮通过：

- `npm run build:api`
- `npm run typecheck:web`
- `node --test tests/system/codex-stack-service.test.mjs`
- `npx tsx --test tests/system/codex-stack-readiness-action.test.ts`
- Codex Stack UI 相关静态 contract 子集：install/runtime/env reference/channel sync。
- `git diff --check`

近期仍有效：service manager 只读 probe、model-gateway service tests、installer/health-check shell syntax、`npm run build:web`。完整 `studio-web-codex-stack-workspace` 仍有既有前端 design/static contract 债务，本轮未要求全量修复。

## 5. 下一步

1. 删除或替换 Codex Stack 的 CPA/Compact service rows、log selector、service control allowlist 和 summary component 管理逻辑，改接 Studio Gateway daemon/service status。
2. 在 opt-in 环境运行 `OPENCLAW_STUDIO_VERIFY_MODEL_GATEWAY_SERVICE_APPLY=1 node scripts/verify-model-gateway-service-manager.mjs`，锁定真实 service manager happy path。
3. 实现 service template apply UI：只写模板、install/start/restart 三种状态明确分开。
4. 继续协议矩阵：优先补 `openai_responses` -> `anthropic_messages`，再补 streaming tool/reasoning。
