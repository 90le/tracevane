# 渠道账号首次保存稳定性设计

## 问题与证据

在尚未创建 `channel-connectors/config.json` 的新环境中，渠道账号点击“检查并保存”后，确认框只闪现一次，账号不会写入。

实机链路已经闭环：

- `GET /api/channel-connectors/config/v3` 返回一个以内存默认配置生成的 revision。
- 默认配置的 `updatedAt` 每次读取都使用新的 `now()`。
- `POST /api/channel-connectors/config/v3/plan` 再次读取默认配置，因此 expected/current revision 必然不同并返回 409。
- 前端在发送 plan 前同步打开确认框，收到 409 后又立即关闭，所以用户只看到闪烁。

截图中的飞书字段不是失败原因。扫码回填的 App ID、App Secret、API URL 与 enabled 生命周期满足现有校验；Bot ID、Verification Token 和 Encrypt Key 均允许为空。

## 目标

- 新环境第一次创建飞书或 Octo 渠道账号能够完成 plan → apply → 持久化。
- 同源的第一次保存 Agent 工作区和会话策略也能工作。
- 已持久化配置继续保留乐观并发冲突保护。
- 计划请求失败时不再闪现空确认框，并向用户保留明确错误。
- 不改变飞书授权协议、凭据字段、secret 回显和 daemon reload 事务。

## 方案比较

### 方案 A：读取时立即写入默认配置

能稳定 revision，但把 GET 变成有副作用的操作，首次访问页面就创建含本机路径的业务配置。拒绝。

### 方案 B：未持久化配置使用固定字符串 revision

实现最小，但服务重启后若默认工作区或网关端点发生变化，旧页面仍可能携带相同 revision 提交旧默认值。可用但保护不足。

### 方案 C：未持久化配置使用确定性内容 revision（采用）

保留动态 `updatedAt` 作为显示元数据，但 snapshot 单独携带 revision。文件不存在时，对忽略 `updatedAt` 后的默认配置做既有 SHA-256 哈希，生成 `unpersisted:<hash>`；文件存在时继续使用已保存的 `updatedAt`。这样同一有效默认配置的 revision 稳定，默认内容变化又能触发真实冲突。

## 后端设计

`ChannelConnectorsV3Snapshot` 同时保存 `config` 和 `revision`。`readV3Snapshot` 是唯一决定 revision 的边界：

- 无文件：`config = defaultV3Config(...)`，`revision = unpersisted:<deterministic hash>`。
- 有文件：`config = normalizeV3Config(...)`，`revision = config.updatedAt`。

`currentV3Config`、`planV3Config`、`applyV3Config` 和 apply 返回值都读取 snapshot revision，不再从动态默认配置的 `updatedAt` 重算。candidate hash、plan expiry、原子写、last-known-good 和 rollback 保持不变。

## 前端设计

账号编辑器继续使用现有 TanStack Query mutation。`requestPlan` 先记录 candidate 并发送请求；只在 `onSuccess` 中设置 plan 并打开 `V3PlanDialog`。`onError` 清理 pending candidate 并显示 toast，不创建随后立即销毁的 modal。按钮 pending 时显示“正在检查…”，既复用现有 mutation 状态，也避免重复提交。

这遵循 Radix Dialog 的 controlled `open/onOpenChange` 契约，并把异步完成作为 modal 状态切换边界；TanStack Query 的 mutation callbacks 继续承载成功/失败副作用。

## 测试边界

- 后端红测：配置文件不存在、`now()` 每次前进时，两次 GET revision 相同；用第一次 revision 执行 plan 成功；首次保存后 revision 切换为持久化版本并保持稳定。
- 前端红测：账号 plan dialog 只能在 mutation `onSuccess` 打开；失败路径不打开 dialog，并清理 pending candidate。
- 回归：API build/typecheck、Web typecheck、Channel Connectors service/web contract tests、浏览器实际执行“检查并保存”，确认 plan dialog 稳定出现且无 console error。
- 测试只使用本地假账号或 draft candidate，不提交截图中的真实 App Secret，也不调用飞书外部接口。
