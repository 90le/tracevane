# OpenClaw Studio Terminal Transcript / Handoff Persistence Strategy 设计文档

## 1. 背景与目标

System / Terminal redesign 已经明确了 Terminal 的核心定位：

- 多标签终端工作区
- 可恢复 terminal session
- System → Terminal 下沉执行
- 跨设备 attach / takeover-ready 的连续性模型

随后，Terminal workspace shell 与 session model 第一阶段已经落地了：

- `/terminal` 与 `/terminal/:sessionId` 稳定路由
- session descriptor / workspace state / route sync / recent rail
- action panel 与 recent session rail
- System -> Terminal handoff 的基础入口

但当前 Terminal 仍然主要依赖：

- 运行时内存状态
- 前端本地恢复
- 临时 session registry

这意味着它仍然存在几个自然限制：

- 刷新后虽然有 UI 级恢复能力，但长期连续性还不够正式
- System → Terminal handoff 的上下文不够稳定地持久化
- attach / detach / takeover 的关键生命周期缺少正式落盘记录
- session 结束后能回看的只有有限前端上下文，缺少稳定 recent summary
- 如果后续要扩展 transcript persistence，当前还缺少清晰的分层设计

本设计的目标是进入 **Terminal persistence Phase 1：session descriptor + handoff ledger + recent output summary**。

本次目标不是直接做 full transcript persistence，而是先建立：

- **可恢复的 session descriptor 持久化层**
- **可追溯的 handoff / attach / takeover ledger**
- **可读的 recent output summary**
- **与 `/terminal` / `/terminal/:sessionId` 恢复模型闭环的 persistence strategy**

## 2. 定位与边界

### 2.1 定位

本期 Terminal persistence 的定位是：

- **Terminal 模块内的本地持久化连续性层**
- **优先服务 session 恢复、handoff 连续性、attach 生命周期与 recent summary**
- **不等同于全量 transcript 存储系统**
- **未来 transcript persistence / search / replay 的稳定前置层**

### 2.2 不做什么

本期明确不做：

- 完整 terminal transcript 持久化
- stdout / stderr 全量归档
- transcript 搜索系统
- transcript 回放 UI
- 长期归档型 terminal history 平台
- Dashboard 承接 terminal 过程流

### 2.3 与现有 persisted system event log 的关系

本期 Terminal persistence 不应直接把 Terminal 全部数据塞进 System event log。

边界应保持：

- **System event log**：关键系统级摘要事件
- **Terminal persistence layer**：session 连续性与上下文恢复

也就是说：

- Terminal persistence 保留 session continuity 所需信息
- System 事件层只接收高价值 terminal summary 事件，不接收过程流

## 3. 设计目标

本期要解决的核心问题是：

### 3.1 `/terminal/:sessionId` 刷新 / 重进后可恢复

用户刷新、重进、切换设备后，仍能看到：

- 这是哪个 session
- 它来自哪里
- 现在是什么状态
- 最近在干什么

### 3.2 System → Terminal handoff 上下文不丢

用户从 `/system/events` 或其它 system 区域下沉到 Terminal 时，应保留：

- 来源模块
- 来源 route
- 来源事件 / 目标对象
- 推荐命令或动作

### 3.3 attach / takeover 生命周期有持久记录

Terminal 不只是“一个终端窗口”，而是一个：

- 可 attach
- 可 detach
- 可 reattach
- 可 takeover

的 session。关键生命周期节点必须可追踪、可恢复。

### 3.4 recent output summary 可帮助恢复工作上下文

本期不做完整 transcript，但用户恢复一个 session 时必须能快速知道：

- 上次做到哪了
- 最近有没有错误
- 当前应该继续什么

## 4. 推荐总体方案

推荐采用：

- **session descriptor store**
- **handoff / attach ledger**
- **recent output summary**
- **不做 full transcript persistence**

这是当前最合适的折中：

- 比只保留前端内存状态更稳
- 比一开始做 full transcript 更轻
- 更符合当前“元数据 + handoff 上下文优先”的目标
- 后续也容易平滑扩到 transcript persistence

## 5. 持久化对象

### 5.1 TerminalSessionDescriptor

Descriptor 是当前 session 的“当前态快照”。

建议至少包含：

- `sessionId`
- `title`
- `source`
  - `manual`
  - `system-handoff`
  - `action-panel`
- `sourceModule`
- `sourceAction`
- `originRoute`
- `status`
  - `running`
  - `detached`
  - `completed`
  - `failed`
  - `lost`
- `controllerClientId`
- `observerClientIds`
- `createdAt`
- `lastActiveAt`
- `lastAttachedAt`
- `canResume`
- `resumeKey`
- `handoffContext`
- `recentOutputSummary`

### 5.2 TerminalSessionLedgerEvent

Ledger event 用于记录生命周期关键节点。

建议至少包含：

- `id`
- `sessionId`
- `kind`
- `occurredAt`
- `actor`
- `details`

其中 `kind` 至少覆盖：

- `session_created`
- `handoff_created`
- `controller_attached`
- `observer_attached`
- `controller_detached`
- `reattached`
- `takeover_requested`
- `takeover_completed`
- `session_completed`
- `session_failed`

### 5.3 TerminalRecentOutputSummary

Summary 不是 transcript，而是轻量恢复摘要。

建议至少包含：

- `tailText`
- `lastError`
- `lastCommandHint`
- `exitSummary`
- `updatedAt`

目标是让恢复时回答：

- 最近输出的重点是什么
- 最近是否失败
- 当前是否已结束
- 接下来可能继续什么

## 6. 存储形态

### 6.1 session descriptor store

推荐使用：

- `terminal-sessions.json`

理由：

- descriptor 是当前态对象
- 覆盖写更直观
- 恢复时读取简单
- 适合 recent / recoverable session rail

### 6.2 handoff / attach ledger

推荐使用：

- `terminal-session-ledger.jsonl`

理由：

- ledger 天然是事件流
- append-only 更稳
- 更适合后续扩展 attach/takeover/history 相关能力

### 6.3 为什么 recent output summary 不单独建文件

因为 recent output summary 本质上是 descriptor 的当前态摘要。

它应直接嵌在 descriptor 内，而不是单独再维护一份 summary store。

## 7. 生命周期规则

### 7.1 创建

session 可能来自：

- 手动新建 Terminal 标签
- action panel 启动
- System handoff 下沉

创建时必须：

- 写入 descriptor
- 写入 `session_created`
- 如果来自 System，再额外写入 `handoff_created`

### 7.2 attach / reattach

当某设备 attach：

- 更新 descriptor 中的 controller / observer 状态
- 写入 attach / reattach ledger event

### 7.3 detach

当前端离开但 session 本体仍活着时：

- descriptor 更新为 detached 或 running+unattached 状态
- 写入 detach event

### 7.4 takeover

当另一设备接管：

- old controller -> observer
- new controller -> controller
- 写入 `takeover_completed`

### 7.5 complete / fail

session 结束时：

- descriptor 更新为 `completed` 或 `failed`
- recent output summary 固化
- 写入 `session_completed` / `session_failed`

## 8. System ↔ Terminal handoff 持久化

本期只建议保存最关键的 handoff 上下文：

- `fromModule`
- `fromRoute`
- `triggerType`
- `triggerLabel`
- `targetEntity`
- `recommendedCommand`
- `relatedEventId`

例如：

- 来自 System diagnostics
- 对应 gateway RPC failure
- 推荐命令为 collect diagnostics

目的不是恢复整个来源页面，而是让 Terminal 页面持续知道：

- 为什么会创建这个 session
- 它跟哪个 system 事件有关
- 下一步建议是什么

## 9. 恢复模型

### 9.1 `/terminal`

Terminal 首页恢复时：

1. 先读取 persisted descriptors
2. 恢复 recent / recoverable session rail
3. 如有最近 active session，则优先 attach 它

### 9.2 `/terminal/:sessionId`

深链接恢复时：

1. 先读取 descriptor
2. 若 session 可恢复，则 reattach
3. 若已 completed / failed，则展示完成态壳层 + recent output summary

### 9.3 网络抖动

本期不记录每次 reconnect heartbeat，只记录关键转折：

- detach
- reattach
- lost

### 9.4 跨设备

descriptor 保留：

- 当前 controller
- observers
- canResume
- handoffContext

ledger 保留：

- takeover requested / completed

这样已足够支撑 Phase 1 的跨设备继续语义。

## 10. retention 策略

### 10.1 descriptor retention

建议：

- 最近 50 个 session descriptor
- `running` / `detached` 永远保留
- `completed` / `failed` 保留 7 天

### 10.2 ledger retention

建议：

- 最近 14 天
- 或最多 1000 条 ledger event

### 10.3 summary retention

- 每个 session 仅保留当前最新 summary
- 不保留 summary 历史版本

## 11. 前端影响

本期前端不需要重做 Terminal UI 结构。

### 11.1 需要做的最小扩展

- recent / recoverable rail 改为消费 persisted descriptors
- `/terminal/:sessionId` 改为基于 descriptor 恢复壳层
- handoff session 显示来源上下文
- completed / failed session 显示 recent output summary

### 11.2 不需要做的事

- transcript history 面板
- transcript search
- transcript replay
- 全量 terminal output 浏览器

## 12. 模块结构建议

建议在当前 terminal module 下新增 / 调整以下职责：

### `terminal-session-descriptor-store.ts`

负责：

- 读写 `terminal-sessions.json`
- descriptor retention
- 按 sessionId 获取 descriptor
- recent / recoverable list 输出

### `terminal-session-ledger.ts`

负责：

- append ledger events
- 读取最近 ledger history
- ledger retention

### `terminal-session-summary.ts`

负责：

- 生成 recent output summary
- 从运行时状态映射到可持久化 summary 结构

### `terminal-handoff-context.ts`

负责：

- 统一 handoff context schema
- System / action panel / manual source 的上下文映射

### `terminal/service.ts`

负责：

- session create / attach / detach / takeover / complete / fail 时调用 persistence seams
- 为 `/terminal` 与 `/terminal/:sessionId` 提供恢复数据

## 13. 测试建议

### 13.1 后端测试

至少覆盖：

- descriptor create/update/read
- handoff ledger append/read
- attach / detach / takeover persistence
- completed session retention
- running session retention
- restart 后 descriptor 可恢复
- recent output summary 被保留

### 13.2 前端测试

至少覆盖：

- `/terminal/:sessionId` descriptor 恢复
- recent rail 显示 persisted session
- handoff context 渲染
- completed session summary 渲染

## 14. Phase 结论

本期推荐方向是：

- **Terminal persistence Phase 1 = session descriptor + handoff ledger + recent output summary**
- **descriptor store = `terminal-sessions.json`**
- **ledger store = `terminal-session-ledger.jsonl`**
- **不做 full transcript persistence**
- **优先解决恢复能力和 handoff 连续性**

这样可以让 Terminal 模块获得：

- 更稳定的 session 恢复能力
- 更可信的 System ↔ Terminal handoff 连续性
- 更明确的 attach / takeover 生命周期记录
- 向完整 transcript persistence 平滑演进的稳定入口
