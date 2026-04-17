# OpenClaw Studio System Event Center / Audit Timeline 设计文档

## 1. 背景与目标

Studio 已完成 System runtime control center 与 Terminal workspace 的阶段化重构，System 现已具备健康、诊断、Bootstrap、Release、Environment 与 Terminal handoff 等显式分区能力，但仍缺少一个统一回答“最近系统发生了什么、做过什么、哪里需要继续处理”的事件中枢。

本设计的目标是构建一套 **System event center / audit timeline**，用于把当前已有的系统状态、诊断结果和关键控制动作组织为可读、可筛选、可继续处理的事件时间线，并保持与 Dashboard、System、Terminal、Config 的边界清晰。

本设计只覆盖第一阶段：

- 建立 System 事件中心详情页
- 以“派生事件流 + 关键动作记录”为主的数据模型
- 提供摘要卡、过滤器、日期分组时间线、详情与下一步动作
- 为后续正式事件日志演进预留稳定结构

## 2. 定位与边界

### 2.1 定位

System event center / audit timeline 的定位是：

- **System 模块下的独立事件中心详情页**
- **运维优先、审计为辅的混合型事件中枢**
- **Dashboard 的摘要入口对应的下钻详情页**

它解决的问题是：

- 最近系统到底发生了什么
- 哪些异常刚出现 / 已恢复
- 哪些控制动作已经执行过
- 哪些事件需要继续处理
- 哪些关键审计动作需要追溯

### 2.2 不做什么

第一阶段明确不做：

- 全量日志系统
- 全量审计平台
- Dashboard 替代品
- Terminal 输出浏览器
- Config 字段级变更历史总库
- 跨全平台的统一事件基础设施重构

### 2.3 与其他模块的边界

#### Dashboard

- 只展示事件摘要入口
- 不承载完整事件中心正文
- 点击摘要后进入 System event center

#### System

- 承载完整的 event center 详情页
- 负责筛选、详情、下一步动作与事件上下文

#### Terminal

- 不承载 event center 正文
- 作为某些事件的“继续处理入口”
- 承接深度排障与执行

#### Config

- 第一阶段不纳入主要事件源
- 避免边界过早混乱

## 3. 页面结构

### 3.1 信息架构

推荐在 System 下新增独立入口页：

- `/system/events`

Dashboard 中仅保留：

- 最近失败事件摘要
- 待处理审计事件摘要
- 最近修复 / 升级事件摘要

点击后进入 `/system/events` 查看完整事件中心。

### 3.2 主视图结构

默认视图采用：

- **顶部摘要卡**
- **过滤与切换条**
- **日期分组时间线正文**
- **事件详情抽屉或侧板**

#### 顶部摘要卡

服务于事件中心内部导航，而非全局 Dashboard 摘要。建议包含：

- 最近失败事件数
- 待处理事件数
- 最近修复结果
- 最近升级事件
- 最近审计动作数

#### 过滤与切换条

第一阶段建议支持：

- 事件范围：全部 / 运维 / 审计
- 严重级别：全部 / 错误 / 警告 / 成功 / 信息
- 来源模块：Gateway / Bootstrap / Release / Device Trust / Terminal Handoff / Diagnostics
- 时间范围：今天 / 最近 3 天 / 最近 7 天 / 全部

#### 时间线正文

- 默认按日期分组
- 组内按时间倒序
- 同类低价值连续事件可折叠
- 严重事件默认展开

#### 详情面板

点击事件后查看：

- 关键上下文
- 关联状态快照
- 来源对象
- 推荐动作
- 关联跳转

## 4. 事件模型

### 4.1 第一阶段纳入的事件类型

第一阶段仅纳入 4 大类：

#### 运行异常事件

来自当前状态或诊断异常，例如：

- Gateway 不可达
- doctor 检查异常
- bootstrap 检查失败
- helper token 漂移
- device trust pending request 出现
- 升级任务失败

#### 运维动作事件

来自显式执行动作，例如：

- bootstrap repair started / succeeded / failed
- helper repair started / succeeded / failed
- studio upgrade started / succeeded / failed
- refresh diagnostics triggered

#### 状态恢复事件

来自异常恢复正常，例如：

- Gateway offline → online
- helper token drift → in sync
- bootstrap pending → ready
- upgrade running → succeeded

#### 审计动作事件

第一阶段只纳入关键审计类动作：

- approve device trust request
- toggle auto-approve helper
- repair helper trust
- terminal handoff triggered from system

### 4.2 第一阶段不纳入的事件

明确排除：

- 全量配置字段变更
- 页面刷新类噪音事件
- 全量 stdout / stderr 原文
- 全量 terminal 输入输出事件
- 所有系统内部细碎状态变化
- 全量 API 调用日志

### 4.3 统一事件结构

每条事件统一为最小公共结构：

- `id`
- `kind`
- `category`
- `severity`
- `occurredAt`
- `title`
- `summary`
- `sourceModule`
- `sourceEntity`
- `status`
- `action`
- `details`

### 4.4 推荐枚举

#### `kind`

- `health_change`
- `diagnostic_issue`
- `repair_started`
- `repair_succeeded`
- `repair_failed`
- `upgrade_started`
- `upgrade_succeeded`
- `upgrade_failed`
- `device_trust_approved`
- `terminal_handoff`

#### `category`

- `operations`
- `audit`
- `recovery`
- `alerts`

#### `severity`

- `info`
- `warning`
- `error`
- `success`

## 5. 数据来源与持久化策略

### 5.1 第一阶段来源策略

采用两条来源链：

#### A. 派生事件缓存

从当前已有 payload 派生，例如：

- `SystemDiagnosticsPayload`
- `SystemHealthPayload`
- `SystemStudioUpgradeStatusPayload`
- `SystemDeviceTrustPayload`

#### B. 显式动作记录

对明确动作直接写事件记录，例如：

- repair bootstrap
- start studio upgrade
- approve device trust
- repair helper trust
- terminal handoff trigger

### 5.2 第一阶段持久化形态

不引入数据库级 event store。建议先使用：

- 轻量事件 JSON 文件 / 状态文件
- 有限保留长度
- 可重建的派生缓存
- 高价值动作事件的显式记录

### 5.3 两层实现结构

#### Layer 1：事件规范化层

负责把不同来源统一映射成标准事件对象：

- health → event
- diagnostics → event
- release / upgrade → event
- device trust → event
- action result → event

#### Layer 2：事件时间线层

负责：

- 合并
- 去重
- 排序
- 日期分组
- 保留条数限制
- 输出给前端

### 5.4 去重与稳定性策略

为避免 timeline 抖动：

- 派生事件必须有稳定 identity，例如：
  - `gateway:offline`
  - `bootstrap:pending`
  - `device-trust:pending:<requestId>`
- 动作事件必须有动作 identity，例如：
  - `repair-bootstrap:<timestamp>`
  - `upgrade-start:<timestamp>`
- 同类且状态未变化的问题不重复插入新事件
- 仅在“新出现 / 状态变化 / 明确动作执行”时生成新事件

## 6. 交互规则

### 6.1 默认交互路径

事件中心的默认交互原则是：

1. 先看摘要
2. 再筛选
3. 再进入详情
4. 必要时执行下一步动作

### 6.2 每条事件的展示结构

每条事件至少有 4 层信息：

#### A. 头部

- 标题
- 时间
- 严重级别
- 类型标签

#### B. 摘要

- 一句话描述发生了什么
- 一句话描述影响或结果

#### C. 上下文

- 来源模块
- 关联对象
- 当前状态
- 关键字段（版本 / 请求 ID / 设备 ID / 服务名等）

#### D. 动作区

- 查看详情
- 跳转相关模块
- 下一步动作

### 6.3 事件动作模型

每条事件默认支持：

- **1 个主动作**
- **0~2 个次动作**

例如：

- `upgrade_failed`
  - 主动作：重试升级
  - 次动作：查看 release 页
  - 次动作：去 Terminal 排查

- `bootstrap_pending`
  - 主动作：应用推荐初始化
  - 次动作：查看 bootstrap 详情

- `helper_trust_drift`
  - 主动作：修复 helper trust
  - 次动作：查看 environment 分区

- `device_trust_pending`
  - 主动作：批准请求
  - 次动作：查看 environment 分区

- `gateway_unreachable`
  - 主动作：刷新诊断
  - 次动作：去 Terminal 排查

### 6.4 详情展开规则

- 列表默认折叠
- 点击事件展开详情
- 详情展示关键字段、状态快照、来源摘要与推荐动作
- 详情不替代 System 其它分区，只承担上下文与导流

## 7. System 内的页面与导航关系

### 7.1 与 System 现有分区关系

建议关系如下：

- `System overview`：看当前状态
- `System event center`：看最近发生了什么
- `Bootstrap / Release / Gateway / Environment / Diagnostics`：看专题细节

也就是说：

- 事件中心不是替代现有分区
- 事件中心是它们的“事件汇总视角”

### 7.2 与 Dashboard 关系

Dashboard 只提供事件摘要入口，例如：

- 最近失败事件 3 条
- 待处理审计项 2 条
- 最近升级失败 1 条

详情统一下钻到 `/system/events`。

### 7.3 与 Terminal 关系

Terminal 不承载完整事件中心。

事件中心中的某些事件只负责：

- 指向 Terminal
- 构建下一步处理入口
- 提供稳定 handoff

## 8. 演进路线

### Phase 1：轻量事件中心

- 从现有 System 状态派生事件
- 记录关键动作
- 提供 event center 页面
- 支持筛选、详情、下一步动作

### Phase 2：稳定事件存储

- 把高价值事件升级为持久化事件记录
- 明确 event id / dedupe / retention
- 支持恢复历史 timeline

### Phase 3：跨模块事件联动

- Dashboard 事件摘要更强
- Config 关键变更可选接入
- Terminal 控制权切换事件正式接入
- 更完整的 audit timeline

## 9. 第一阶段结论

本次 follow-up 的推荐方向是：

- **event center 挂在 System，Dashboard 只给摘要入口**
- **默认主视图 = 摘要卡 + 日期分组时间线**
- **第一阶段数据源 = 派生事件流 + 关键动作记录**
- **默认操作能力 = 跳转 + 下一步动作**
- **审计范围 = 关键动作 + 设备信任变更**
- **持久化先轻量，后升级为正式事件日志**

这样既能快速落地，又不会封死后续向正式 event store / audit timeline 演进的路径。
