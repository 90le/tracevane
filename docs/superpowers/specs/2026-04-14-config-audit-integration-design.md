# OpenClaw Studio Config Audit Integration into Persisted System Event Log 设计文档

## 1. 背景与目标

System event center 已完成两层建设：

- Phase 1：建立 `/system/events` 事件中心页面、摘要、筛选、分组时间线、详情与下一步动作
- Phase 2：建立 formal persisted local event log，使 action event 与 status-change event 能在刷新与重启后保留最近历史

但当前 persisted system event log 仍然主要覆盖：

- 系统运行状态变化
- repair / approve / upgrade / handoff 等动作事件
- snapshot-derived current-state events

它还缺少一个很重要的 audit 维度：

- **关键配置变更到底是什么时候发生的**
- **哪些关键配置刚被改过**
- **是不是某个关键配置变更导致了后续 system 状态变化**
- **用户看到某条 config audit event 后，下一步应该回到哪个 config 区域继续处理**

本设计的目标是把 **关键配置变更** 接入当前的 persisted system event log，使 `/system/events` 能把 config 变更纳入运维优先的 audit timeline，而不把自己膨胀为全量 config 审计平台。

本次目标不是做“所有配置的全量审计库”，而是做：

- **关键字段白名单**
- **写入成功后的 before/after diff**
- **结构化 config_change persisted event**
- **事件中心内可读、可追、可跳转的 config audit timeline**

## 2. 定位与边界

### 2.1 定位

本期 config audit integration 的定位是：

- **persisted system event log 的一个新事件来源层**
- **只纳入关键配置变更，不纳入全量配置字段历史**
- **继续服务 `/system/events`，而不是新做独立 config 审计平台**
- **偏运维 / 审计辅助，而不是合规级全量审计系统**

### 2.2 不做什么

本期明确不做：

- Config 全量字段级审计库
- 所有 patch 原文落盘
- 独立 config audit 页面
- rejected / invalid config request 全分类审计
- 通用 deep diff 引擎
- 跨模块统一全平台配置审计

### 2.3 与 persisted event store 的关系

本期 config audit integration 不新建第二套存储。

它应继续复用当前已建立的：

- persisted JSONL event log
- companion state file
- persisted event writer
- merged event reader
- event center summary / timeline / detail 渲染路径

也就是说：

- **config audit 是 persisted event log 的新 event source**
- **不是新的独立 persistence system**

## 3. 设计目标

本期要实现的核心能力是：

### 3.1 记录关键配置变更

当关键配置被成功修改时：

- 产生 `config_change` persisted event
- 记录变更前后摘要
- 落到 persisted event log
- 在 `/system/events` 时间线中可见

### 3.2 避免噪音

不应该把 system event center 变成“配置变更垃圾场”。

因此本期必须：

- 只记录关键配置白名单字段
- 不记录所有小改动
- 不记录展示/UI层面的低价值配置变化
- 不重复记录语义上没变化的改动

### 3.3 保持可读性与可跳转

每条 config audit event 必须能回答：

- 改了什么
- 从什么变成什么
- 这是哪个模块的配置
- 下一步应该跳去哪里

## 4. 推荐总体方案

推荐采用：

- **关键字段白名单**
- **字段路径级结构化 diff**
- **写入成功后生成 `config_change` persisted event**
- **继续复用现有 persisted event writer/store**

这是当前最合适的折中：

- 比模块级模糊摘要更有审计价值
- 比全量字段级审计更低噪音
- 比通用 deep diff 更简单、更可测
- 与当前 `/system/events` 的产品定位更一致

## 5. 审计范围

### 5.1 第一批纳入的关键配置

建议优先纳入以下白名单字段：

#### A. transport / gateway

- `transport.standalone.enabled`
- `transport.standalone.port`
- `transport.gateway.enabled`
- `transport.gateway.basePath`
- `gatewayPort`
- `gatewayWsUrl`
- `gatewayControlUiBasePath`

#### B. bootstrap / runtime safety

- 会直接影响 bootstrap ready / pending 判定的关键配置
- 会影响推荐初始化 / 默认修复路径的关键字段

#### C. device trust / helper trust

- `deviceTrust.autoApproveLocalHelper`
- helper trust repair 关键项
- 会影响 pending request / trust drift / helper pairing 的关键配置

#### D. terminal continuity / handoff

- 会影响 `/system/events` -> `/terminal` 下一步动作稳定性的关键配置

### 5.2 暂不纳入的配置

本期明确不纳入：

- 纯展示/UI配置
- 一般展示字段
- 非关键 agents/channels/skills/cron 普通字段
- 大块嵌套对象的全量 diff
- 全量 patch payload 原文

## 6. 白名单粒度

本期建议内部按 **字段路径级** 管理白名单，但输出时按 **模块 + 字段摘要** 展示。

### 6.1 内部白名单示例

例如：

- `transport.gateway.enabled`
- `transport.gateway.basePath`
- `transport.standalone.port`
- `deviceTrust.autoApproveLocalHelper`

### 6.2 页面展示示例

输出到事件中心时，不直接暴露生硬路径，而是展示成可读文本，例如：

- `Gateway transport 配置已更新`
- `Gateway basePath 配置已更新`
- `Local helper auto-approve 配置已更新`

detail panel 中再补充：

- 字段标签
- 原始路径
- before
- after

## 7. 模块结构建议

建议引入三个小而清晰的 config audit seam：

### 7.1 `config-audit-fields.ts`

职责：

- 定义关键字段白名单
- 维护字段路径 -> 模块 -> 标签 -> 默认 severity / action 的映射

例如每条配置元数据至少包含：

- `path`
- `module`
- `label`
- `severity`
- `actionKey`

### 7.2 `config-audit-diff.ts`

职责：

- 输入 `before` / `after`
- 只对白名单路径做值提取与比较
- 输出结构化 diff records

输出结构建议包含：

- `module`
- `path`
- `label`
- `before`
- `after`
- `changeType`

### 7.3 `config-audit-events.ts`

职责：

- 把 diff records 映射成 persisted event records
- 统一生成：
  - `kind`
  - `title`
  - `summary`
  - `sourceModule`
  - `sourceEntity`
  - `details`
  - `action`

### 7.4 `config/service.ts`

职责：

- 写入成功前获取 `before`
- 写入成功后获取 `after`
- 调用 `config-audit-diff.ts`
- 调用 `config-audit-events.ts`
- 把生成的事件交给 persisted event writer 落盘

## 8. 事件模型

### 8.1 第一轮事件 kind

第一轮只建议新增：

- `config_change`

后续如需要再考虑：

- `config_reverted`
- `config_invalid_rejected`

但本期不需要先做这些衍生分类。

### 8.2 推荐字段映射

#### `category`

- `audit`

#### `severity`

- 默认 `info`
- 若某个关键字段影响较大，可由白名单元数据指定为 `warning`

#### `sourceModule`

- `config`

#### `sourceEntity`

例如：

- `config:transport.gateway.enabled`
- `config:transport.gateway.basePath`
- `config:deviceTrust.autoApproveLocalHelper`

#### `details`

建议保留结构化内容：

- `module`
- `path`
- `label`
- `before`
- `after`
- `changeType`

#### `action`

建议默认给：

- `open-config-section`

如果当前 config 页面还没有足够细的 section route，则先退化为：

- `open-config`

## 9. dedupeKey 策略

config audit event 与 snapshot 状态变化事件不同。

它不应该为了“当前状态 dedupe”去覆盖真实历史，而更接近：

- 一次具体配置动作 / 配置审计实例

因此本期建议 config audit event 的 `dedupeKey` 采用：

- `config-change:<path>:<occurredAt>`

例如：

- `config-change:transport.gateway.enabled:2026-04-14T10:00:00.000Z`
- `config-change:deviceTrust.autoApproveLocalHelper:2026-04-14T10:00:01.000Z`

这样可以：

- 明确知道这条事件属于哪个关键字段
- 同时保留真实变更历史
- 不会把多次关键配置修改压成一条

## 10. diff 策略

### 10.1 不做通用 deep diff

本期不建议引入通用 deep diff engine。

原因是：

- 当前目标明确是关键配置白名单
- 通用 deep diff 会引入过多复杂度
- 容易把 scope 拉向全量 config 审计

### 10.2 推荐策略

采用：

- **白名单路径提取 + 值比较**

流程：

1. 遍历白名单字段
2. 从 `before` 取值
3. 从 `after` 取值
4. 如果语义不同，生成 change record

### 10.3 值比较规则

建议仅做最小归一化：

- `undefined` / 缺失统一处理
- boolean / number 直接比较
- string 按原值比较
- 数组/对象仅在某个白名单字段确实需要时再支持

本期不需要把所有字段都抽象成统一 diff primitive。

## 11. 写入时机

### 11.1 只在写入成功后生成事件

Config audit event 的正确时机应是：

- 获取 `before`
- 写入 config
- 写入成功
- 读取 `after`
- 做 diff
- 生成并落盘 `config_change`

### 11.2 不写事件的情况

- 没命中白名单字段
- 命中字段但语义没变化
- 只是格式化 / 归一化，没有真正值变化
- UI 层临时编辑，但最终没有提交成功

### 11.3 暂不纳入失败请求

本期建议暂不纳入：

- `config_invalid_rejected`
- `config_write_failed`

除非当前 config service 已有稳定错误分类点。

否则这一轮会明显扩大范围。

## 12. 前端影响

本期前端不需要做大规模重构。

### 12.1 需要做的最小扩展

#### A. kind 扩展

前端 event kind 增加：

- `config_change`

#### B. actions 扩展

config 类事件应能生成：

- `open-config`
- 或 `open-config-section`

#### C. detail 扩展

detail panel 对 config event 额外展示：

- 字段标签
- 配置路径
- before
- after

### 12.2 不需要做的事

- 新页面
- 新 timeline
- 新 config audit dashboard

现有 `/system/events` 结构已经足够承接本期 config audit event。

## 13. 测试建议

### 13.1 后端测试

至少覆盖：

- 白名单字段变化会生成 config audit event
- 非白名单字段变化不会生成 event
- 多个关键字段同时变化会生成多条 event
- `before == after` 不生成 event
- 生成的 config audit event 会通过 persisted writer 落盘

### 13.2 前端测试

至少覆盖：

- `config_change` 能映射成前端 event item
- detail panel 能展示 path / before / after
- next-step action 能跳转 config 页面

## 14. Phase 结论

本期推荐方向是：

- **Config audit integration Phase 1 = key config changes into persisted system event log**
- **技术策略 = 关键字段白名单 + 字段路径级 diff**
- **事件形态 = `config_change` persisted event**
- **写入时机 = config 写入成功后**
- **存储策略 = 继续复用现有 persisted event writer/store**
- **前端策略 = 最小 kind/detail/action 扩展**

这样可以让 `/system/events` 获得：

- 最近关键配置变更的稳定历史
- config 变更与 runtime event 的统一时间线
- 更低噪音且可读的运维 audit 视图
- 向更完整 config audit 能力平滑演进的稳定入口
