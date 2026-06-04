# Codex Stack Model Gateway 目标方案

> 状态：Phase 1 in progress
> 更新：2026-06-04
> 文档规则：本文件只保留目标、边界、验收和阶段计划；每轮不要追加流水账，进度写到 `codex-stack-model-gateway-progress.md`。

## 1. 最终目标

Codex Stack 不再依赖 CPA `18795`、Compact Proxy `18796` 或 `CPA Gateway` 代理链路。Studio 自建 **Studio Model Gateway daemon**，由它统一承接 Codex、Claude Code、OpenCode、OpenClaw 和其他 CLI / AI 工具的模型请求。

```text
旧链路：Codex -> Compact Proxy -> CPA -> OpenClaw provider/upstream
目标链路：Codex / Claude Code / OpenCode / OpenClaw -> Studio Gateway daemon -> provider router -> upstream
```

`18796` 可以继续作为用户熟悉的本地模型端口，但端口归属必须从 `cpa-compact-proxy` 迁移为 `openclaw-studio-model-gateway.service`。`cc-connect` 只保留为可选 IM / project bridge，不再承担模型代理、模型路由或安装主链路职责。

## 2. 协议目标

用户配置 provider 时只需要说明 provider 的原生协议。Studio Gateway 必须把同一个 provider 暴露为三种主流客户端协议面：

| Provider 原生协议 | 典型来源 | Studio 对外必须支持 |
| --- | --- | --- |
| Anthropic Messages | Claude 官方 API / Claude Code 原生协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Responses API | Codex 官方 API / Codex 原生协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |
| OpenAI Chat Completions | 第三方模型最常见兼容协议 | Anthropic Messages、OpenAI Responses / compact、OpenAI Chat Completions |

规则：

- 原生协议和客户端协议一致时 passthrough。
- 不一致时走 Gateway adapter。
- 未实现的组合必须返回明确 `model_gateway_adapter_required`，不能伪成功。

## 3. 生命周期前提

Studio 支持单口模式和非单口模式，但模型 relay 的正式生命线只能是独立 Local Gateway daemon。

- **非单口模式**：CLI 直接访问 daemon loopback，例如 `http://127.0.0.1:18796/v1`。
- **单口模式**：OpenClaw Gateway 只挂载 Studio UI / control API；模型请求仍默认写 daemon loopback，单口 endpoint 只能是可选 ingress/proxy。

硬性要求：

- OpenClaw Gateway 挂掉时，已接管 CLI 仍能通过 daemon 调模型。
- Studio API / UI 崩溃时，daemon 仍继续服务 `/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`、`/v1/messages`。
- daemon 由 OS/user service supervisor 托管：Linux `systemd --user`、macOS launchd、Windows scheduled task/service。
- detached child process 只能作为开发或首次 bootstrap fallback，不能替代正式 restart policy。
- status 必须区分 `controlPlane`、`openclawMount`、`localDaemon`，避免把 UI/mount 故障误判为模型 relay 不可用。

## 4. 架构边界

**Studio Gateway Control Plane**

- 管 provider registry、secret refs、route policy、health/smoke、request log、audit 和 UI。
- 不把单机 `HOME`、`systemctl --user`、Codex auth 文件等作为控制面真相。
- 读取接口不得返回明文 upstream key。

**Local Gateway Edge / daemon**

- 管 loopback HTTP listener、协议 adapter、provider router、CLI takeover、本机 service。
- 可以写本机客户端配置，但必须 preview、backup、rollback。
- 通过 pid/lock/runtime metadata 声明端口归属。

## 5. 必需能力

- Provider registry：provider CRUD、secret store、app scope、model catalog、默认模型、health、failover queue。
- Runtime router：按 app scope 选择 active provider，记录 request log、health、latency、failover reason。
- Protocol adapters：Responses <-> Chat、Anthropic Messages <-> Chat/Responses、compact route、streaming、tool-call/history。
- App takeover：Codex、Claude Code、OpenCode、OpenClaw 配置接管；真实 key 留在 Studio，客户端只放 placeholder。
- Diagnostics：provider test、Codex Responses/compact smoke、Claude Messages smoke、streaming timeout、最近错误。
- Import：后续可从 cc-switch、cc-connect、Codex、Claude、OpenCode、OpenClaw 配置导入 provider。

## 6. 旧链路删除目标

需要删除或隔离的旧 surface：

- 前端：CPA attach、force CPA、CPA Gateway/proxy 操作面、CPA/Compact 核心链路图。
- 后端：`apply-codex-cpa-after-smoke`、`force-apply-codex-cpa` 等旧接管 action；后续继续删除 CPA/compact 安装与 service 管理代码。
- 资源：`auto-setup.sh` 中 CPA + Compact Proxy 安装逻辑、`compact-proxy.mjs`、CPA config templates。
- 测试：不再用旧 CPA attach 成功路径作为验收；改为 Studio Gateway daemon takeover。

## 7. 阶段计划

| 阶段 | 目标 |
| --- | --- |
| Phase 0 | 研究 cc-switch / cc-connect，固定目标和边界 |
| Phase 1 | Model Gateway types/store/API、provider lifecycle、runtime log、基础 adapters、daemon lifecycle contract、Codex Studio takeover |
| Phase 2 | 完整 Local Gateway daemon runtime、service manager apply 验证、crash restart 验证 |
| Phase 3 | 完整 Codex Responses / Chat / compact adapter，包括 streaming、tool calls、history |
| Phase 4 | Claude Messages adapter 和 Claude Code takeover |
| Phase 5 | OpenCode / OpenClaw config 检测、生成、接管 |
| Phase 6 | 重做 Codex Stack UI 为 Model Gateway / Provider Center |
| Phase 7 | 删除 CPA / compact 旧资源和旧 tests，打包新版本 |

## 8. 验收标准

- 无 `~/.openclaw/openclaw.json` 时也能完成 Codex + Studio Gateway 安装准备。
- Codex takeover 默认写 daemon loopback endpoint，不默认写 OpenClaw 单口 mount endpoint。
- OpenClaw Gateway 或 Studio API/UI 崩溃时，daemon direct endpoint 继续服务已接管 CLI。
- 用户能添加 OpenAI Chat provider，并让 Codex 通过 `/v1/responses` 和 `/v1/responses/compact` 成功请求。
- Claude Code 可通过同一 provider registry 使用 Anthropic native 或 OpenAI-compatible provider。
- 旧 CPA / Compact Proxy 不再作为前端核心组件、公开接管 action 或默认打包安装项。
- secret 读取 API 只返回 masked view；写 secret、takeover、rollback、service 操作都经过 management auth gate。
- system tests 覆盖 provider CRUD、routing、adapter、daemon survivability、Codex takeover、UI 新入口。

## 9. 主要风险

- Codex Responses streaming、tool-call history 和 compact 语义复杂，必须测试先行。
- Claude official auth 与第三方 provider key 不能混用。
- 如果模型 relay 绑定到 Studio API 或 OpenClaw mount，崩溃隔离目标会失败。
- 旧 Codex Stack service 和 installer 仍有 CPA/compact 假设，删除必须分阶段保持 tests 可解释。
