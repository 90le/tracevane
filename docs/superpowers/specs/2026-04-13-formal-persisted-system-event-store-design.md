# OpenClaw Studio Formal Persisted System Event Store 设计文档

## 1. 背景与目标

System event center / audit timeline Phase 1 已经建立了：

- `/system/events` 独立事件中心入口
- 摘要卡、筛选条、分组时间线、详情与下一步动作
- 从当前 system payload 派生出来的实时事件
- 关键动作事件与轻量最近历史

但 Phase 1 仍然以“当前派生 + 轻量动作记录”为主，存在几个自然限制：

- 刷新与重启后，最近历史的稳定性仍然不够强
- 当前 snapshot 与最近历史之间的边界还不够正式
- 动作事件和状态变化虽然已可展示，但缺少正式的可恢复落盘层
- 后续如果要接入更强的 audit / retention / cross-module event flow，当前结构仍偏 Phase 1 过渡态

本设计的目标是进入 **System event center Phase 2：formal persisted local event log**，为 `/system/events` 提供一层正式但仍然轻量的本地持久化事件能力。

本次目标不是直接进入数据库级 event store，而是先构建一层：

- **可落盘**
- **可恢复**
- **可裁剪**
- **可与当前 snapshot 合并**
- **可为后续演进保留稳定接口**

## 2. 定位与边界

### 2.1 定位

本期 persisted system event store 的定位是：

- **System 模块内的本地持久化事件日志层**
- **为 `/system/events` 提供最近历史与重启后恢复能力**
- **以“动作事件 + 状态变化事件”为主要落盘对象**
- **未来正式 event store / audit timeline 的稳定前置层**

### 2.2 不做什么

本期明确不做：

- SQLite / 数据库级 event store
- Config 全量变更审计库
- Terminal transcript 全量入库
- Dashboard 重构
- 跨模块统一 event bus
- 跨系统统一 audit platform

### 2.3 与 Phase 1 的关系

Phase 1 已经证明了 event center 的产品方向有效。

Phase 2 的职责不是重做 UI，而是把当前 Phase 1 的：

- snapshot-derived events
- action log
- summary / timeline / detail

提升为一套更正式的本地 persisted event log 架构。

也就是说：

- **Phase 1 解决“能看”**
- **Phase 2 解决“能留、能恢复、能长期稳定演进”**

## 3. 目标使用场景

Phase 2 主要服务以下场景：

### 3.1 重启后仍能看到最近发生过什么

例如：

- 前一次升级失败
- 前一次 helper repair 执行过
- 某个 gateway offline / online 切换刚发生过
- 某个 device trust pending request 曾出现又恢复

### 3.2 当前状态与最近历史统一展示

事件中心应同时回答两类问题：

- **当前还在发生什么**
- **最近刚发生过什么**

因此 persisted history 不能孤立存在，必须与当前 snapshot 派生事件统一合并输出。

### 3.3 运维优先的近端审计

本期不是做“长期全量审计平台”，而是做：

- 最近 7 天左右的稳定历史
- 高价值动作可追溯
- 状态变化可恢复
- 页面 refresh / service restart 后不丢最近上下文

## 4. 推荐总体方案

推荐采用：

- **append-only JSONL 主日志**
- **辅助 state 文件**
- **动作 + 状态变化的选择性持久化**
- **persisted history + current snapshot merge**

这是当前最合适的折中：

- 比单一 JSON 覆盖写更稳
- 比 SQLite 更轻
- 比“纯内存 + 临时派生”更正式
- 未来也容易演进到更完整的 event store

## 5. 存储结构

### 5.1 文件形态

建议引入两类文件：

#### A. `system-events.jsonl`

作为 append-only 主事件日志。

每一行都是一条独立 JSON event record，用于：

- 记录动作事件
- 记录状态变化事件
- 在服务重启后恢复最近历史
- 为 compaction / rebuild 提供原始输入

#### B. `system-events.state.json`

作为辅助状态文件，负责保存：

- 最新 dedupe 状态
- 当前 retention / compact metadata
- 最近已知 sourceEntity 状态
- 必要时的 rebuild 游标信息

### 5.2 为什么不用单一 JSON 文件

如果直接维护单个完整数组 JSON 文件：

- 每次写入都要整体重写
- 文件增长后风险更高
- 崩溃时更容易损坏整个文件
- 对后续 compaction / rebuild 不友好

而 JSONL + state 的好处是：

- 追加写简单
- 恢复成本低
- 损坏通常只影响尾部
- 有利于后续从 log 重建状态

## 6. 统一事件结构

Phase 2 的 persisted event record 建议正式包含这些字段：

- `id`
- `dedupeKey`
- `kind`
- `category`
- `severity`
- `occurredAt`
- `persistedAt`
- `title`
- `summary`
- `status`
- `sourceModule`
- `sourceEntity`
- `details`
- `action`

### 6.1 字段职责

#### `id`

一次具体事件实例的唯一 ID。

它回答的是：

- 这一次写入是哪一条事件

#### `dedupeKey`

同一类问题 / 同一类状态对象的稳定 identity。

它回答的是：

- 这条事件是否与之前的某条记录属于“同一个问题/对象”

例如：

- `gateway:offline`
- `bootstrap:pending`
- `device-trust:pending:req-123`
- `helper-trust:drift`
- `upgrade:running`

#### `occurredAt`

事件真正发生的时间。

#### `persistedAt`

事件实际被写入本地存储的时间。

这两者要分开，因为：

- 有些事件是状态变化被检测后写入
- 有些事件可能在 merge/rebuild 时重新进入输出流

#### `sourceModule`

例如：

- `gateway`
- `bootstrap`
- `device-trust`
- `release`
- `diagnostics`
- `system`

#### `sourceEntity`

例如：

- `request:req-123`
- `upgrade:0.2.0`
- `helper:local`
- `gateway:rpc`

#### `details`

保留结构化上下文，例如：

- requestId
- targetVersion
- bootstrap check ids
- device id
- reason code

#### `action`

可选的下一步动作建议元信息，例如：

- `refresh-diagnostics`
- `open-terminal`
- `open-system-release`
- `approve-device-trust`

## 7. 写入策略

### 7.1 一定写盘的事件

这些属于高价值显式动作，必须持久化：

- bootstrap repair started / succeeded / failed
- helper repair started / succeeded / failed
- studio upgrade started / succeeded / failed
- approve device trust
- terminal handoff triggered

### 7.2 只有变化时才写盘的事件

这些属于状态变化类事件，只在状态发生变化时写入：

- gateway offline -> online
- gateway online -> offline
- bootstrap pending -> ready
- bootstrap ready -> pending
- helper trust drift -> in sync
- helper trust in sync -> drift
- pending device trust request 新出现
- pending device trust request 消失
- upgrade idle -> running -> succeeded / failed

### 7.3 明确不写盘的情况

这些不应重复写盘：

- 页面刷新
- 同状态重复派生
- 同一 pending request 每次轮询都重复出现
- 同一 release available 提示反复刷新
- 纯 UI 切换

也就是说，本期 persisted store 的写入原则是：

- **明确动作**
- **真实状态变化**
- **不保存重复刷新噪音**

## 8. dedupe 与状态变化策略

### 8.1 dedupeKey 规范

建议至少覆盖这些稳定 key 模式：

- `gateway:offline`
- `gateway:online`
- `bootstrap:pending`
- `bootstrap:ready`
- `helper-trust:drift`
- `helper-trust:in-sync`
- `device-trust:pending:<requestId>`
- `upgrade:running`
- `upgrade:failed:<targetVersion>`
- `upgrade:succeeded:<targetVersion>`

### 8.2 state file 的职责

`system-events.state.json` 应保存最近一次已知状态，例如：

- gateway 当前 online/offline
- bootstrap 当前 ready/pending
- helper trust 当前 drift/in-sync
- 当前已知 pending request ids
- 当前 upgrade state

下一次检测时，通过“当前状态 vs state 文件中的最近状态”判断：

- 是否出现新变化
- 是否需要写新事件
- 是否只是重复刷新

### 8.3 rebuild 能力

如果 state 文件丢失，应支持：

- 从 JSONL 重扫最近历史
- 还原 dedupe / 最近状态记忆

这样 state 不是单点依赖，而是可重建缓存。

## 9. 读取与合并模型

### 9.1 为什么不能只读 persisted log

如果只展示 persisted history：

- 当前仍然存在的问题可能不出现
- 页面会偏“历史记录器”而不是“事件中心”

### 9.2 推荐读取流程

`/api/system/events` 推荐使用统一 merge 流程：

1. 读取 persisted history
2. 从当前 snapshot 派生 live events
3. 用 `dedupeKey` 合并
4. 让当前态覆盖过时历史态
5. 再做排序、分组、筛选前输出

### 9.3 merge 原则

- persisted history 用于提供最近历史
- snapshot-derived events 用于保证“当前正在发生什么”不丢失
- 对同一 `dedupeKey`，优先保留当前态
- 对明确动作事件，优先保留 persisted history 实例

### 9.4 `/api/system/events/summary`

summary endpoint 不应该有独立第二套数据源。

建议：

- 直接基于 merge 后的统一 event list 计算

这样可以避免：

- list 和 summary 不一致
- summary 显示有失败，但 list 页面里看不到

## 10. retention 与 compaction

### 10.1 默认保留策略

推荐默认采用双限制：

- **最近 7 天**
- **最多 500 条**

### 10.2 compaction 目标

在保持最近历史可读的前提下：

- 不让文件无限膨胀
- 不丢高价值动作
- 减少低价值重复状态变化

### 10.3 compaction 规则

建议：

- 全部高价值动作事件优先保留
- 对同类状态变化仅保留最近关键节点
- 已闭合且低价值的旧恢复项优先裁剪
- 超出 retention 的旧记录定期丢弃

### 10.4 compaction 时机

建议触发条件：

- 写入后条数超过阈值
- 定时 maintenance
- 服务启动时发现日志超过阈值

本期不需要复杂后台 job，只需要在 store 写入或启动时做轻量维护即可。

## 11. 故障恢复策略

### 11.1 JSONL 尾部损坏

读取时逐行解析：

- 成功的保留
- 最后一行损坏则跳过该行
- 不让整个 event center 因单行坏数据报废

### 11.2 state 文件丢失

允许：

- 从 JSONL 重建最近状态
- 重新生成 dedupe memory

### 11.3 日志文件不存在

按空日志处理。

### 11.4 写入原子性

建议：

- JSONL 采用 append 写
- state 文件采用临时文件 + rename 覆盖

这样保证：

- 日志尽量只在尾部风险点受影响
- 状态文件不会部分写坏

## 12. 模块结构建议

建议在当前 system module 下新增 / 调整这些职责：

### `event-types.ts`

统一事件 schema 与 store metadata 类型。

### `event-log-store.ts`

负责：

- append JSONL
- read recent records
- trim by retention
- compact
- rebuild from log

### `event-writer.ts`

负责：

- action event persistence
- status change detection
- dedupe / state file update

### `event-normalizer.ts`

负责：

- 从 diagnostics / bootstrap / device-trust / release / health 派生 live events
- 从动作请求结果映射 action events

### `event-reader.ts`

负责：

- persisted history + live snapshot merge
- dedupe 冲突处理
- 输出给 service 层

### `event-summary.ts`

负责：

- 从统一 merged event list 计算 summary cards

### `service.ts`

暴露：

- `listEvents(limit?, range?)`
- `getEventSummary(limit?, range?)`
- 在 repair / approve / upgrade / handoff 等动作发生时调用 writer

## 13. 对前端的影响

本期前端不需要大规模重构。

建议只保持：

- 继续消费 `/api/system/events`
- 继续消费 `/api/system/events/summary`
- 无需感知底层是 Phase 1 轻量缓存还是 Phase 2 persisted log

也就是说，本期的前端目标是：

- **接口升级透明化**
- **页面结构基本不动**

## 14. 测试要求

至少覆盖以下场景：

- append event 到 JSONL
- action event 一定持久化
- same state repeated does not persist twice
- state transition persists once
- pending request new/disappeared both persist correctly
- retention trims old events
- compaction keeps high-value actions
- corrupted tail line is ignored safely
- state file can rebuild from JSONL
- merged list prefers current snapshot state
- summary endpoint matches merged list

## 15. Phase 2 结论

本期推荐方向是：

- **System event center Phase 2 = formal persisted local event log**
- **技术形态 = JSONL + state file**
- **持久化对象 = 动作 + 状态变化**
- **读取模型 = persisted history + current snapshot merge**
- **保留策略 = 最近 7 天 / 最多 500 条 / 轻量 compaction**
- **仍不进入数据库级 event store**

这样可以让 `/system/events` 获得：

- 重启后可恢复的最近历史
- 更稳定的动作追溯
- 当前态与历史态统一展示
- 向正式 event store 平滑演进的稳定接口
