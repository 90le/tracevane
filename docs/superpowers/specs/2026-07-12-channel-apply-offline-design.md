# 渠道配置首次应用与离线页面设计

## 问题

Channel Connectors v3 会先保存配置，再要求已运行的守护进程执行 reload。Windows 首次创建渠道账号时守护进程可能尚未运行；reload 返回 `daemon_not_running`，应用结果因此为失败，但配置已经持久化。前端保留“确认配置影响”弹窗。同时，概览和会话页面都读取 `/api/channel-connectors/agent-sessions`，该只读接口直接代理离线守护进程并返回 500，导致两个页面整体显示 `fetch failed`。

## 目标

- 首次应用已启用的渠道配置时，如果选定 owner 未运行，由 apply 流程启动它并返回可接受结果。
- 保持独立“重载守护”操作的原语义：停止状态下不会隐式启动。
- 守护离线时，GET 会话状态返回明确的不可用快照，而不是让概览和会话页面整体失败。
- POST 会话管理仍要求真实守护在线，不能把 kill、reset 或 reap 操作伪装成成功。
- 配置写入、plan 单次消费、回滚和管理 token 边界保持不变。

## 方案

### 配置应用

`applyV3Config` 仍先发现运行中的 session/persistent owner，并保存通过校验的配置。它调用现有 reload；仅当响应的 `skippedReason` 为 `daemon_not_running` 时，再调用现有 `manageDaemonService({ action: "start", mode: ownerMode, apply: true })`。启动成功且 manager 状态为 `running` 时，构造 `status: "applied"` 的 reload 结果，使既有前端成功路径关闭弹窗、刷新配置与状态。

启动失败仍进入现有失败/回滚判定。若 manager 已创建进程但 readiness 未达到 running，apply 会先停止并确认该 owner 已退出，再还原配置，避免后台进程稍后带着已拒绝配置恢复。不修改通用 reload 行为，也不引入新的 supervisor 抽象。

### 离线会话快照

扩展 `ChannelConnectorAgentSessionDriverStatusResponse`，将 `persistentDriverReady` 改为 boolean，并增加 `runtimeReachable` 与可空 `unavailableReason`。守护在线时 daemon 返回 `runtimeReachable: true`；GET 代理遇到连接失败时，读取本地 v3 配置和 session store，返回：

- `ok: true`，因为 API 成功描述了当前状态；
- `runtimeReachable: false`、`persistentDriverReady: false`；
- 当前策略和可推导的 binding 信息；
- 空 active runtime sessions / events；
- `unavailableReason: "daemon_unreachable"`。

只降级 GET。守护返回 HTTP 错误或无效响应仍按错误处理，避免掩盖认证、协议或程序错误。

### 前端

概览和会话继续复用现有 Query。它们不再因为守护离线进入整页 ErrorState；在页面内显示“守护离线/会话运行态暂不可用”的警示。应用成功沿用现有 `accepted` 路径自动关闭弹窗。真实失败时弹窗保留，避免用户丢失上下文。

## 验证

- 后端红绿测试：停止守护的首次 apply 会调用 start 并 accepted；session/persistent start degraded 会先 stop 再 rollback；GET agent sessions 连接失败返回离线快照；POST 仍抛错。
- 类型与契约：API build、根 typecheck、Web typecheck、Channel Connectors service/system tests。
- 浏览器：应用变更后弹窗关闭；概览和会话可渲染；守护状态真实显示；控制台无新错误。
