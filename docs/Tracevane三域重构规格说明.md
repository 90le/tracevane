# Tracevane 三域重构规格说明

> 日期：2026-06-24  
> 阶段：第一阶段（边界收敛 + 统一运行投影 + 前端 IA 修正）

## 1. 结论：不删除三域，保留三域但收敛为一个产品闭环

本次评估后，不建议把 Model Gateway、IM Channels、CLI Agents 删除成一个域；也不建议继续让三个域各自重复展示“Agent/会话/运行状态”。更合理的结构是：

- **保留三个后端/产品域**：它们的外部协议、安全边界、写操作风险完全不同。
- **新增统一运行投影**：CLI Agents 负责把终端、IM、对话三种运行状态汇总成 Agent Runs。
- **删除/下沉重复 UI**：概览页只做入口和健康摘要，不再复制 IM 会话列表、终端会话列表、网关路由列表。
- **未来可在导航上做一个上层分组**：例如 “Agent Connectivity”，但不是把代码和数据模型强行合并。

### 为什么不直接合并成一个域

1. **Model Gateway 是协议与路由边界**：它要面对 OpenAI Responses、Chat-compatible、Anthropic Messages、客户端配置写入、Provider 密钥、账号池和用量统计。
2. **IM Channels 是外部消息入口边界**：它要面对飞书/企业微信/Octo 等平台账号、webhook/长连接、绑定、投递、重试和守护服务。
3. **CLI Agents 是本地 Agent Runtime 边界**：它要面对 Codex/Claude Code/OpenCode CLI、PTY/终端、Persona、运行证据和用户操作。
4. 强行合并会扩大 blast radius：Provider 密钥、IM token、终端会话控制、客户端配置写入会混在一个服务里，回归和权限边界更难控。

### 哪些东西可以“像一个域”一样呈现

- 面向用户的主闭环可以统一成：**客户端/IM 输入 → Agent Run → Gateway 路由模型 → 证据/回复**。
- 统一的是“运行投影”和“入口导航”，不是把所有写动作、配置文件和守护服务放到一个模块。

## 2. 外部合同依据

- OpenAI Codex 当前手册确认：Codex CLI/IDE 支持 ChatGPT 登录和 API key 两类认证；自定义 provider 可配置 `base_url`、`wire_api`、auth command、`model_context_window` 等，本地状态在 `CODEX_HOME` 下，项目配置不能覆盖 provider/auth 等高风险键。
- Claude Code LLM Gateway 文档确认：Claude Code 网关至少要暴露 Anthropic Messages `/v1/messages`、`/v1/messages/count_tokens`，并转发 `anthropic-beta`、`anthropic-version` 等请求头；`ANTHROPIC_BASE_URL` 可指向统一网关或 pass-through 网关。
- Claude Code 网关资料还确认：网关通常用于集中认证、用量跟踪、成本控制、审计和模型路由；Tracevane 应承接这些网关职责，但不能把 CLI 进程状态伪装成 Gateway 状态。
- OpenCode 文档确认：OpenCode 通过 JSON/JSONC 配置、provider `baseURL` 和 `/connect` 凭据机制接入模型；OpenAI-compatible provider、Responses/Chat 不同 npm adapter 选择需要被客户端接入页明确表达。

## 3. 三域职责

### 3.1 Model Gateway

**拥有：**

- Provider registry、endpoint profile、模型目录、账号池。
- 三协议转发/适配：OpenAI Responses、OpenAI Chat-compatible、Anthropic Messages。
- 路由、fallback、熔断、health、usage、cache stats。
- Codex/Claude Code/OpenCode/OpenClaw 的客户端接入配置写入、备份、回滚。
- Gateway daemon/service 状态。

**不拥有：**

- CLI 进程运行中/已退出状态。
- IM 平台账号与 IM 投递状态。
- Persona 编辑与 Agent 任务编排。

### 3.2 IM Channels / Channel Connectors

**拥有：**

- IM 平台账号、渠道绑定、webhook/长连接、守护服务。
- IM 消息入站、命令面板、投递、回包、事件日志。
- IM 触发的持久 Agent session driver。

**不拥有：**

- Provider/API key/模型目录配置。
- 终端 PTY 生命周期。
- 全局 Agent Runtime 汇总的最终信息架构。

### 3.3 CLI Agents

**拥有：**

- Codex / Claude Code / OpenCode CLI 安装状态。
- Persona、CLI runtime、终端 session、Agent Run 投影、证据聚合。
- 用户从本地 CLI 或 IM 任务进入后的运行态观察。

**不拥有：**

- 直接修改 Provider、模型路由、账号池。
- 直接修改 IM 平台账号、app secret、长连接守护服务。

## 4. 统一 Agent Run 抽象

第一阶段实现只读聚合，不做破坏性迁移。

字段：

- `id`：投影 ID，例如 `terminal:<sid>` / `im:<poolKey>` / `chat:<key>`。
- `source`：`terminal` / `im-channel` / `chat`。
- `originId`：原始 session/run ID。
- `agentId`、`cli`、`model`、`routeScope`、`workspace`。
- `status`、`statusLabel`、`startedAt`、`updatedAt`、`error`。
- `evidenceRefs`：回到原始归属页的引用。

写操作仍回到原域：终端结束/删除在 CLI Agents 的 sessions；IM kill/reap 在 IM Channels；模型路由和 provider 修复在 Model Gateway。

## 5. 前端信息架构

### Model Gateway

主 tab 保持：概览 / 服务商 / 模型 / 用量。

- 概览：路由 Cockpit、Provider 健康、客户端接入风险。
- 服务商：Provider 列表、配置、账号池。
- 模型：全局模型目录与预算。
- 用量：请求、token、cache、错误和排序。
- 客户端接入是 Gateway 的子页，因为它写 Codex/Claude/OpenCode 配置；但运行中状态不在这里显示。

### CLI Agents

主 tab 调整为：概览 / 运行中 / Persona / CLI / 终端会话 / 原始证据。

- 概览：只做入口、健康摘要和边界说明。
- 运行中：统一 Agent Runs。
- Persona：身份/能力/绑定只读详情。
- CLI：CLI 安装与版本状态。
- 终端会话：终端 session 写操作。
- 原始证据：IM driver events、chat sessions 的原始证据。

### IM Channels

主 tab 调整文案为：概览 / 平台绑定 / IM 会话 / 投递日志。

- 不再把“会话”泛化成 Agent Runtime；它只表达 IM 触发会话。
- 守护服务和平台接入归本域。

## 6. 后端边界

第一阶段新增轻量 BFF 合同：

- `GET /api/agents/runs`
- 聚合：`terminal.listPersistedSessions()`、`channelConnectors.getAgentSessions()`、`chat.getBootstrap()`。
- 只读，不改原始数据、不删除 session、不触发 provider/daemon 写动作。

继续保持公开 API 向后兼容：不删除 `/api/terminal/sessions`、`/api/channel-connectors/agent-sessions`、`/api/chat/bootstrap`。

## 7. 不做事项

- 不删除用户已有 Provider、Codex account、IM 绑定、终端 session、聊天 session。
- 不把 Provider 密钥、IM token、PTY 控制合到一个服务里。
- 不伪造“自动压缩/自动上下文管理”状态；只能展示已真实检测或官方合同支持的能力。
- 不引入新依赖。
- 不做大爆炸式后端拆分。

## 8. 验收标准

- `/api/agents/runs` 可构造终端、IM、chat 三类只读运行投影。
- CLI Agents 页面有“运行中”主 tab，概览不再重复 IM 事件列表和终端会话列表。
- Model Gateway 概览的 “Agent Cockpit” 改为 “路由 Cockpit”，明确 Gateway 只管路由不管运行进程。
- IM Channels tab 文案表达平台绑定、IM 会话、投递日志。
- `npm run build:api`、`npm run typecheck:web`、`npm run build:web` 和相关系统测试通过。
