# Codex custom tool call ID 修复设计

## 问题

Codex app-server 将本地工具调用记录为合法的 OpenAI Responses `custom_tool_call`，其 item ID 使用 `ctc_*`，并通过独立的 `call_id` 与 `custom_tool_call_output` 关联。Tracevane Model Gateway 在 Codex account 请求清理阶段把 `function_call` 与 `custom_tool_call` 合并处理，并为二者统一生成 `fc_*` item ID。恢复包含工具调用的会话时，上游因此拒绝该历史项，返回 `Expected an ID that begins with 'ctc'`。

## 修复边界

- 只修改 Codex account Responses 输入历史的 item ID 归一化。
- `function_call` 继续使用或生成 `fc_*`。
- `custom_tool_call` 保留合法的 `ctc_*`；缺失或命名空间错误时，根据稳定的调用标识生成 `ctc_*`。
- `call_id` 保持原有调用关联语义，不修改飞书、Codex app-server session 或工具执行流程。
- 对缺少必要 `call_id`/`name` 的畸形历史继续使用现有安全降级行为。

## 数据流

1. Codex app-server 重放历史中的 `custom_tool_call` 与对应 output。
2. Model Gateway 按 item 类型选择 ID 归一化规则。
3. 合法 `ctc_*` 原样进入上游 Responses 请求；普通函数调用仍规范为 `fc_*`。
4. 上游能够校验并恢复工具调用历史，后续回合继续执行。

## 测试

先增加一个 Codex scope 的 Model Gateway 系统测试，提交包含合法 `ctc_*` custom tool call、对应 output 和后续用户消息的 `/v1/responses` 请求，并捕获实际上游请求体。测试必须先证明当前实现把 ID 错改为 `fc_*`，随后验证修复后仍为原始 `ctc_*`，且 `call_id` 和 output 关联未丢失。

验证范围：

- 新增的定向回归测试；
- 相关 Model Gateway 系统测试；
- API TypeScript 类型检查；
- `git diff --check`。

不要求真实供应商凭据；现有飞书日志和 Codex rollout 作为生产症状证据，自动化测试覆盖协议边界。

## 风险控制

该修改不引入新依赖或新抽象，只拆分现有两种 item 类型的命名空间规则。主要风险是历史中存在非标准 custom tool call ID；实现会优先保留合法 `ctc_*`，否则生成符合上游合同的稳定 ID，并通过测试锁定行为。
