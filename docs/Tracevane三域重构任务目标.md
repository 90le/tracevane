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
- 删除或下沉重复列表展示。
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
- 修改 CLI Agents 概览，降低重复。
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
