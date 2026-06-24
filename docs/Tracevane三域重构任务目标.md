# Tracevane 三域重构任务目标

> 日期：2026-06-24
> 目标：完成 Model Gateway、IM Channels、CLI Agents 第一阶段边界收敛和统一 Agent Run 投影。

## 目标

1. 创建三域重构 spec，明确是否保留、合并或删除域。
2. 明确三域产品职责、后端边界、前端信息架构、数据流和验收标准。
3. 新增统一只读 Agent Run 聚合合同，避免前端继续拼多个 session 概念。
4. 优化 CLI Agents 前端，增加“运行中”页，概览变成入口和健康摘要。
5. 优化 Model Gateway 前端文案，避免把路由 Cockpit 误解为 Agent Runtime。
6. 优化 IM Channels 前端 tab 文案，突出平台绑定、IM 会话和投递日志。
7. 保持现有功能和数据不破坏，完成构建、类型和系统测试，提交 git。

## 边界

### 可以做

- 新增 docs/spec/plan。
- 新增只读 BFF/API 聚合：`/api/agents/runs`。
- 新增共享类型和纯聚合函数。
- 前端新增/调整 tab、文案、概览布局和只读投影页。
- 删除或下沉重复列表展示，尤其是 CLI Agents 内的 Persona/终端管理入口。
- 补充系统测试覆盖聚合合同。

### 不能做

- 不能删除真实 Provider、Codex account、账号池、IM 绑定、终端 session 或聊天 session。
- 不能修改 Gateway 公开协议路径导致 Codex/Claude/OpenCode 不兼容。
- 不能把所有后端模块合并成一个巨型服务。
- 不能绕过后端备份/确认机制直接写客户端配置。
- 不能引入新依赖。
- 不能用假数据填充 Agent Run。

## 约束

- Research-first：变更前记录官方/项目资料核验结论。
- Backward-compatible：新增 API 只能做只读聚合，不替代原 API。
- Reviewable：第一阶段控制 diff，先修边界和 IA，不做大拆分。
- Testable：API 聚合走纯函数测试，前后端跑 build/typecheck。
- Reversible：所有 UI 文案和新增 tab 可单独回滚，不影响原数据。

## 优先级

### P0

- 决定保留三域，写入 spec。
- 新增 Agent Run 类型、后端聚合、前端查询和“运行中”页。
- 修改 CLI Agents 概览，降低重复；终端管理下沉到 IDE。
- 修正 Model Gateway / IM Channels 容易误导的文案。
- 跑测试并提交。

### P1

- 下一阶段把 Agent Run 增加更细的 run lifecycle、tool evidence、cancellation intent。
- 给 IM Channels 增加更明确的守护服务控制和平台账号配置引导。
- 给 Model Gateway 用量页继续校验 cache hit/write 与统计排序。

### P2

- 导航层增加 “Agent Connectivity” 上层分组。
- 后端服务内部进一步拆分 Model Gateway monolith。
- 跨域审计事件统一到 system event log。

## 回滚方案

- 前端：删除 `runs` tab 和 `RunsView`，恢复旧 Overview 文案。
- 后端：删除 `/api/agents/runs` route 和 `runtime-runs.ts`，不影响原终端/IM/chat API。
- 文档：保留 spec 作为历史决策记录，后续可替换为新的 ADR。


## 第二阶段补充任务（2026-06-24）

### 发现

`/api/agents/runs` 第一阶段已经解决“前端拼多个 session 源”的问题，但运行投影仍把普通 idle / unknown Chat 历史会话放进“运行中”页，真实运行态被历史记录淹没。

### 第二阶段 P0 修正

- Chat 来源只投影真实 run：存在 `activeRunId`、运行中/流式中、异常/中止或有错误信息。
- 普通 idle 历史聊天继续留在 Chat 页面和原始证据页，不进入 Agent Runs 主列表。
- 增加系统回归，防止 idle chat history 再次污染 Agent Runs。

### 不做

- 不删除 Chat 历史数据。
- 不改变 `/api/chat/bootstrap` 合同。
- 不把 Chat 的历史列表职责搬到 CLI Agents。

## 第二阶段评估结果（2026-06-24）

| 检查项 | 当前判断 | 处理 |
| --- | --- | --- |
| 前端导航和页面重复 | 第一阶段已把 Model Gateway / IM Channels / CLI Agents 的主职责拆清；本轮未发现需要删除域。 | 保留三域，继续用 Agent Runs 做统一运行投影。 |
| Agent Run 投影字段 | 字段足够支撑第一阶段运行列表，但 Chat 来源过宽，把 idle/unknown 历史会话混入运行页。 | 已修复：只投影 activeRunId、运行/流式、异常/中止或 runtime error 的 Chat run。 |
| IM 会话与 CLI/Chat 证据可追溯 | `/api/agents/runs` 保留 `evidenceRefs.href`，能回到终端、IM 会话或 Chat 原页。 | 暂不新增写操作，保持只读投影。 |
| Model Gateway 用量/cache/排序 | `UsageView` 已明确“provider 返回缓存证据、不估算折扣/命中率”，模型分布按 request count，表格按 total tokens；未发现本轮必须改动。 | 保持现状，后续可补真实账本样本回归。 |
| 服务守护状态 | Model Gateway daemon 和 Channel Connectors daemon 仍由各自域管理，不进入 Agent Runs。 | 本轮仅重启验证，不改变守护合同。 |
| 客户端接入配置 | Model Gateway 继续拥有 Codex/Claude Code/OpenCode/OpenClaw 配置写入、备份、回滚；CLI Agents 只读引用运行态。 | 不改兼容路径，避免破坏用户配置。 |

### 本轮完成定义

- 第二阶段不做大拆分，只修复当前运行态聚合里最明显的噪声风险。
- 真实用户数据不删除、不迁移、不重写。
- 通过构建、类型检查、系统回归和 live `/api/agents/runs` 验证。


## 第三阶段任务转向（2026-06-24）

### 当前重点

第一、第二阶段已经把“运行态观察”和“路由配置”边界拆清。下一阶段不再继续堆概览页，而是补齐两个薄弱域的可用性：

1. **IM Channels P0**：第一轮已把平台绑定从“能看”推进到“能创建/编辑/删除/测试”：支持账号/机器人 metadata 填写、脱敏保存、启停、Feishu/Octo transport smoke 和 daemon native 绑定证据。下一步按 `IM渠道前端设计契约.md` 重构信息架构：概览 / 平台账号 / 绑定路由 / 会话投递 / 守护诊断，重做宽 Drawer，按平台字段模板替代 JSON-first 表单，并降级 Agent profiles / daemon native bindings 为相关证据。详见 `IM渠道目标与设计.md`。
2. **CLI Agents P0**：把 CLI 代理从 OpenClaw/Persona/通用终端混杂概念里拆出来，明确 Codex CLI / Claude Code / OpenCode 的安装状态、配置引用、运行中 Agent Run、终端证据引用和安全操作。详见 `CLI代理目标与设计.md`。
3. **Model Gateway 持续 P0**：继续保持 Provider、Codex Account、路由、用量、上下文、协议适配的稳定性；不要把 IM/CLI 的写操作塞回 Gateway。

### 本阶段可以做

- 精简三域导航和重复卡片，保留必要入口。
- 为 IM 渠道继续按 Aurora 合同重构页面：平台账号与绑定路由分层、宽 Drawer、平台字段模板、投递日志过滤、更多 verified platform smoke；已完成基础绑定 CRUD、凭据脱敏保留和 Feishu/Octo 测试。
- 为 CLI 代理补 CLI 安装/配置/会话运行的真实状态和安全操作。
- 继续维护 Agent Runs 作为跨域只读运行投影。

### 本阶段不能做

- 不能把 IM token、Provider key、PTY 控制合并到一个配置页。
- 不能继续用 OpenClaw/Persona/通用终端概念替代 Codex/Claude/OpenCode 的真实 CLI 能力。
- 不能用假在线、假绑定、假缓存、假运行态填 UI。
- 不能为了“统一”删除已有真实 Provider、账号池、IM 会话或终端历史。
