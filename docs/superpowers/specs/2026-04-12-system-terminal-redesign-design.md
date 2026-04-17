# OpenClaw Studio System / Terminal 重构设计文档

## 1. 背景与目标

Studio 已完成 foundations、management domain、chat / sessions runtime 的阶段化重构。接下来的 System / Terminal redesign 不是简单页面翻新，而是要在 Studio 总蓝图之下，重新定义 **Dashboard / Config / System / Terminal** 之间的边界、System 的总控职责，以及 Terminal 的跨设备连续工作台模型。

本设计的目标是建立一套清晰、可持续扩展的 System / Terminal 结构，使其：

- 不与 Dashboard 重叠
- 不与 Config 混淆
- 保持 System 与 Terminal 的双主模块地位
- 支持 Terminal 会话在刷新、重进、网络抖动、跨设备切换时持续存在
- 为后续实施计划提供清晰模块边界、交互规则与测试基线

## 2. 设计结论概览

本次设计最终采用以下定位：

- **Dashboard**：全局总览与入口，不承载系统内部控制细节
- **Config**：治理与配置中心，承载规则、参数、策略与信任设置
- **System**：系统运行总控与诊断中心，提供有限直控与问题判断
- **Terminal**：多标签终端中心 + 预置运维动作面板，承载真实执行与深度排障

System 与 Terminal **继续独立**，不合并；但两者通过“发现问题 → 下沉执行 → 回写结果”的动作链路形成协同。

## 3. 模块边界

### 3.1 Dashboard

Dashboard 只回答：

- 平台整体是否正常
- 当前有什么待处理项
- 哪些模块值得进入

Dashboard 展示：

- 全局健康摘要
- 关键告警摘要
- 模块入口卡片
- 最近重要事件摘要

Dashboard 不承载：

- 详细系统诊断
- 深度服务控制
- 终端执行过程

### 3.2 Config

Config 回答：

- 当前系统规则是什么
- 哪些参数可调整
- 治理策略是否正确

Config 保持治理与配置中心定位，不吸收运行时诊断、实时控制和终端执行功能。

### 3.3 System

System 回答：

- 当前系统为什么这样
- 哪个子系统异常
- 可以执行哪些有限直控动作
- 最近发生了哪些关键系统事件

System 的主职责是：

- 系统健康与状态
- 诊断与告警
- 服务与控制
- 升级 / 修复 / 环境

System 允许少量高价值动作，例如：

- 刷新诊断
- 重启服务
- 触发安全修复
- 查看关键日志入口
- 跳转 Terminal 做深度操作

System 不变成：

- 第二个 Dashboard
- 第二个 Config
- 图形化终端壳

### 3.4 Terminal

Terminal 回答：

- 当前要执行什么命令或动作
- 当前打开了哪些终端标签
- 最近做过哪些维护动作
- 某次操作输出了什么结果
- 是否可以从当前或另一台设备继续会话

Terminal 承载：

- 多标签终端工作区
- 预置运维动作面板
- 近期历史与结果摘要
- 跨设备可恢复 terminal session

Terminal 不承载：

- 系统总览式诊断中心
- 平台治理或配置编辑

## 4. System 模块设计

### 4.1 首页结构

System 首页采用“状态摘要 + 分区入口”的混合结构，而不是单页堆叠大杂烩。

首页分为三层：

1. **系统运行摘要带**
   - 系统总体健康状态
   - Gateway / API / Web / 关键依赖连接状态
   - 最近诊断时间
   - 当前升级 / 修复任务状态
   - 关键告警数量

2. **主分区入口卡**
   - 健康与状态
   - 诊断与告警
   - 服务与控制
   - 升级 / 修复 / 环境

3. **系统事件摘要区**
   - 最近修复成功/失败
   - 最近升级启动/完成
   - 最近系统诊断异常
   - 关键服务断开/恢复
   - 设备信任与环境异常摘要

### 4.2 二级页面划分

建议至少拆为以下子页：

- `/system/health`
  - 服务状态矩阵
  - 连接链路状态
  - 健康检查项
  - 最近状态变化

- `/system/diagnostics`
  - 诊断结果列表
  - 风险等级
  - 异常详情
  - 建议动作
  - 进入 Terminal 深度排障入口

- `/system/control`
  - 重启/刷新/重新加载
  - 触发安全修复动作
  - 明确操作确认与结果反馈

- `/system/upgrade`
  - 当前版本
  - 升级状态
  - 修复任务
  - 操作记录

- `/system/environment`
  - 本地环境能力
  - 依赖检查
  - 设备信任
  - 宿主连接信息

### 4.3 交互原则

System 的动作规则：

- 允许有限直控，不允许吞并 Terminal
- 每个动作必须有：
  - 操作对象
  - 风险等级
  - 执行结果
  - 成功/失败反馈
  - 下一步建议
- 诊断项必须至少对应：
  - 重新检查
  - 查看详情
  - 安全修复
  - 进入 Terminal 深度操作

## 5. Terminal 模块设计

### 5.1 首页结构

Terminal 首页采用三块组合结构：

1. **主工作区：多标签终端**
2. **动作面板：预置运维动作 + 脚本/模板入口**
3. **辅助区：近期历史与结果摘要**

Terminal 首页默认优先展示 **标签 + 动作**，而不是历史优先或只显示空终端。

### 5.2 多标签模型

每个标签不是单纯 UI 标签，而是绑定一个 **可恢复 terminal session**。

标签来源分三类：

- 手动标签：用户主动打开的普通终端会话
- 动作标签：由预置运维动作触发生成的会话
- 关联标签：由 System 或其它模块跳转带上下文进入的会话

每个标签至少展示：

- 标题
- 来源模块
- 运行状态
- 最近活动时间
- 当前 attach 状态
- 是否可恢复

### 5.3 动作面板分层

预置运维动作面板采用分层混合结构：

#### 第一层：Studio 内置安全动作

例如：

- 健康检查
- 收集诊断
- 查看关键日志
- 重启服务
- 触发修复
- 升级相关动作

特征：

- 有明确名称
- 有风险等级
- 有结果反馈
- 可产品化

#### 第二层：项目脚本 / 命令模板

例如：

- 常用项目脚本
- 调试命令
- 可编辑命令模板
- 环境检查命令

特征：

- 面向高级用户
- 灵活
- 允许修改后执行

两层必须分开展示，避免“安全动作”和“自由命令入口”混成一个按钮墙。

### 5.4 辅助区：近期历史与结果

Terminal 不做全量审计系统，但必须保留工作连续性。

建议展示：

- 最近标签
- 可恢复会话
- 最近执行动作
- 最近失败结果
- 最近完成结果
- 最近打开的命令模板/脚本

## 6. Terminal 连续性与跨设备模型

### 6.1 基本原则

Terminal 的硬要求是：

- 页面刷新不能断
- 重新进入不能断
- 网络抖动不能断
- 浏览器休眠恢复不能断
- 设备切换后可以继续同一个 terminal session

因此设计上必须区分：

- **浏览器标签**：前端视图壳
- **terminal session**：真正的远端会话本体

浏览器是否在线，与 terminal session 是否存在，必须解耦。

### 6.2 会话模型

每个 terminal session 至少具备：

- `terminalSessionId`
- 来源模块与动作上下文
- 执行状态
- 输出缓冲与增量游标
- 最近 attach 时间
- 是否可恢复
- 当前控制端信息
- 观察端信息

### 6.3 控制权模型

默认采用：

- **单控制端 + 多观察端**
- 任意时刻只有一个设备拥有输入控制权
- 其它设备可以只读观察、查看输出、请求接管

跨设备继续同一个 Terminal 会话时：

- 默认不自动抢占
- 新设备可以：
  - 只读观察
  - 请求接管
  - 新开会话
- 接管必须显式进行
- 一旦接管：
  - 原控制端失去输入权
  - 原控制端转为观察态
  - System 事件流记录一次控制权切换

### 6.4 会话状态

建议将 terminal session 状态至少分成：

- `running`
- `detached`
- `completed`
- `failed`
- `lost`

其中：

- `detached` 表示前端断开，但后端会话仍活着，可恢复
- `lost` 表示真正不可恢复，而不是简单断线

### 6.5 恢复行为

#### 页面刷新
- 自动恢复最近 attach 的 terminal session
- 补拉断线期间输出
- 恢复标签顺序与 active session
- 显示已恢复提示

#### 路由切换 / 重新进入
- 优先恢复最近活跃 session
- 若 session 已结束，则以完成态打开

#### 网络抖动
- 前端进入 `reconnecting`
- 后端 session 保持运行
- 恢复后补拉增量输出
- 若恢复失败，提供手动 reattach

#### 浏览器关闭 / 设备切换
- session 继续存活直到命令结束或超时淘汰
- 其他已授权设备可重新 attach
- 最近会话列表仍可见该 session

## 7. System ↔ Terminal 联动

System 与 Terminal 的标准链路为：

1. **System 发现问题**
2. **用户选择动作**
3. **动作在 System 内直接执行，或下沉到 Terminal**
4. **Terminal 承载真实过程与输出**
5. **关键结果回写到 System 事件层**

### 7.1 System 内动作类型

System 中的动作分为：

- 直接动作
  - 刷新诊断
  - 重启服务
  - 触发修复
  - 查看日志摘要

- 下沉动作
  - 进入 Terminal 深度排障
  - 打开带上下文的 terminal 标签
  - 预填命令 / 动作模板 / 目标对象

### 7.2 Terminal 的上下文会话

从 System 进入 Terminal 时，不是简单跳到 `/terminal`，而是：

- 新建 terminal session
- 或 attach 到已有相关 session
- 携带来源模块、动作类型、目标对象与执行上下文

### 7.3 结果回写

- **Terminal 本地层**保留执行过程与近期结果
- **System 事件层**只沉淀关键事件：
  - 修复成功/失败
  - 升级开始/完成
  - 控制权切换
  - 关键服务恢复/异常

Dashboard 仅消费高层摘要，不展示终端过程流。

## 8. 路由与信息架构建议

建议最终页面层级如下：

### 8.1 System

- `/system`
- `/system/health`
- `/system/diagnostics`
- `/system/control`
- `/system/upgrade`
- `/system/environment`

### 8.2 Terminal

- `/terminal`
- `/terminal/:sessionId`

其中：

- `/terminal` 是工作台入口
- `/terminal/:sessionId` 是稳定深链接，用于刷新恢复、跨设备继续和上下文分享

## 9. 记录模型

### 9.1 Terminal 保留

- 最近标签
- 最近命令
- 最近动作结果
- 可恢复会话引用
- 最近输出摘要
- 控制权切换信息

### 9.2 System 保留

- 关键系统事件
- 高价值控制动作
- 修复/升级/重启结果
- 终端关键控制事件摘要

### 9.3 不做的事情

- 不把 Terminal 做成全量审计平台
- 不把所有终端输出都沉进 System
- 不让 Dashboard 承接终端过程流

## 10. 测试策略

System / Terminal redesign 的测试分 4 层：

### 10.1 结构与契约测试

验证：

- System 首页只承载摘要与分区入口
- Terminal 存在多标签模型
- 动作面板分层清晰
- terminal session 具备可恢复标识、控制权状态与来源上下文

### 10.2 状态与选择器测试

验证：

- System 首页摘要如何从状态/诊断派生
- Terminal 标签状态如何从 session 状态派生
- 单控制端 / 多观察端 / 接管请求状态机
- 刷新后恢复最近 session
- 跨设备 attach 的状态可见性

### 10.3 路由与会话恢复测试

验证：

- `/terminal/:sessionId` 刷新后仍能恢复
- 路由切换回来后仍可 attach
- 网络抖动后能补拉输出
- 已结束 session 重新进入时显示 completed
- 被其它设备接管后本设备转为 observe-only

### 10.4 系统级交互测试

验证：

- 从 System 诊断项进入 Terminal 是否携带上下文
- 从 System 触发动作后是否创建正确 terminal session
- 修复结果是否回写到 System 事件层
- Dashboard 只看到摘要，不泄漏终端过程流

## 11. 实施切分建议

本设计建议拆成两个后续子计划：

### Phase A：Terminal session model + workspace shell

优先解决最关键的连续性与工作台问题：

- 多标签模型
- 可恢复 session identity
- attach / reattach / takeover 规则
- 动作面板分层
- `/terminal` 与 `/terminal/:sessionId` 路由

### Phase B：System runtime control center

随后实现：

- System 首页
- Health / Diagnostics / Control / Upgrade / Environment 子页
- 与 Terminal 的动作下沉链路
- 关键事件回写模型

先做 Terminal，再做 System，能优先解决你最强调的“不中断、可跨设备继续”的核心问题。

## 12. 结论

本次设计的最终结论是：

- **System 与 Terminal 继续独立，不合并**
- **System = 系统运行总控与诊断中心**
- **Terminal = 多标签终端中心 + 预置运维动作面板**
- **Dashboard 不与 System 重叠，Config 不被 System 吞并**
- **Terminal 会话必须支持刷新恢复、重进恢复、网络抖动恢复与跨设备继续**
- **System 负责判断与有限直控，Terminal 负责真实执行与深度排障**

这套结构既能保持双主模块，也能在 Studio 总蓝图下形成清晰、可维护、可扩展的后续实施边界。
