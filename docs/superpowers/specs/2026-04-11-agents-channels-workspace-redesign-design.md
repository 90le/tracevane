# Studio Agents / Channels 工作台重构设计

**日期：** 2026-04-11

## 目标

为 Studio 的 `agents` 与 `channels` 管理域完成一轮真正的工作台化重构，解决以下问题：

1. 当前页面仍残留旧后台式壳层，存在重复头部、重复说明、重复入口。
2. 同一对象的概览、深度编辑、快捷动作混在一起，用户难以判断“当前到底在配置什么”。
3. `channels` 页面尤其混乱，provider、账号、权限、配对、绑定同时抢主导，配置路径不清晰。
4. `agents` 工作台壳已成形，但 `docs / bindings / sessions / advanced` 仍然沿用旧页面思路，密度和层级不统一。
5. 后续继续补字段前，必须先锁定信息架构，否则每加一项字段都会继续放大混乱。

本设计只覆盖 Studio 管理台的 `agents` 与 `channels` surface，不涉及 chat、skills、system、dashboard 的新能力扩展。

## 已确认决策

- 总体交互采用 `工作台型`，而不是继续修修补补旧标签页。
- `channels` 右侧主对象采用 `Provider 优先`，先看 provider，再进入账号或其它深页。
- `agents` 右侧默认主对象采用 `Agent 概览`。
- 概览页采用 `薄概览 + 少量快改`，不再承担大表单职责。
- 高密度、低频、风险较高的字段统一放入单任务编辑器，不再在概览页散落展示。

## 方案比较

### 方案 A：继续在现有 tabs 和卡片上做收缩

- 优点：改动较小，回归面较小。
- 缺点：根问题不在“卡片太大”，而在“多套主入口同时存在”。
- 缺点：后续每次补字段都会继续堆到同一层级里。

### 方案 B：重构为统一工作台

- 优点：可以彻底统一 `左侧索引 / 右侧当前任务 / 概览 / 深页` 语义。
- 优点：`agents` 与 `channels` 将共享一套工作台语言，后续补字段更稳定。
- 缺点：需要调整页面壳层与部分组件职责，短期改动面较大。

### 方案 C：向导式配置

- 优点：首次配置路径最清晰。
- 缺点：运维和日常编辑效率较差。
- 缺点：对已经存在的工作台壳层利用率较低。

**结论：采用方案 B。**

## 总体信息架构

### 1. 左侧只负责选对象

- `agents` 左侧只负责选择当前 Agent。
- `channels` 左侧只负责选择当前 Provider。

左侧不再承担深配置表单、复杂说明或多层操作菜单。其职责固定为：

- 找对象
- 切对象
- 看对象基础状态

### 2. 右侧只负责当前任务

右侧永远只出现一个主任务上下文：

- 默认是概览
- 进入深页后就是单任务编辑器

禁止再次出现“概览卡、编辑卡、说明卡、状态卡同时并列，且都像主区域”的布局。

### 3. 概览页只做三件事

概览页只保留：

- 当前对象摘要
- 待处理异常 / 风险提示
- 进入深页或执行高频快改的入口

概览页不负责：

- 完整高级配置
- 低频 JSON 编辑
- 长表单
- 多任务并列编辑

### 4. 快改字段必须受限

快改只允许高频、低风险、即时可理解的字段。

原则：

- 用户在概览页上看到字段时，必须能立刻理解修改后会影响什么。
- 不能把“需要上下文解释”的字段放进快改。
- 不能把大型 JSON、复杂匹配规则、权限细节塞进概览页。

## Agents 设计

### 1. 默认落点：Agent 概览

选中某个 Agent 后，右侧默认展示 `Agent 概览`。

概览结构：

- 身份快照
  - 头像
  - 名称
  - 角色
  - mission
- 运行快照
  - 模型
  - 运行时
  - 工作区
  - 启用状态
- 文档状态
  - `IDENTITY / SOUL / TOOLS` 是否存在
  - 最近更新时间
- 绑定状态
  - 绑定数
  - 最近路由
- 会话热度
  - 会话数
  - 最近活跃

### 2. Agents 概览快改边界

只允许以下快改：

- 启用 / 禁用
- 模型
- 工作区

不允许放进概览页直接编辑的项：

- runtime 细节
- sandbox / tools / params JSON
- 复杂 identity 长文本
- 绑定规则
- 文档正文

### 3. Agents 深页重构

#### Docs

- 左侧是文档导航
- 右侧是单文档编辑器
- 页面顶部不再保留旧后台式大标题栏
- 文档事实和保存动作围绕当前文档，不和其它任务混排

#### Bindings

- 默认先展示绑定摘要和已有列表
- 新增 / 编辑绑定进入同一单任务编辑区
- 去掉大段重复说明，保留必要的匹配语义说明

#### Sessions

- 只承担“监控 / 查看 / 清理”
- 不再伪装成配置页
- 将重点放在最近活跃、路由、tokens、清理操作

#### Advanced

- 重构为一个连续编辑器，内部按以下段落组织：
  - Core
  - Identity
  - Runtime
  - Behavior Defaults
  - Advanced JSON
- 避免当前“大卡片堆叠”的后台感

## Channels 设计

### 1. 默认落点：Provider 概览

选中某个 Provider 后，右侧默认展示 `Provider 概览`。

概览结构：

- provider 快照
  - 启用状态
  - 默认账号
  - 账号数
  - 绑定数
  - 策略摘要
- 待处理项
  - 缺凭据
  - 待配对
  - 权限或策略异常
- 账号索引
  - 每个账号只展示必要摘要和进入动作

### 2. Channels 概览快改边界

只允许以下快改：

- 启用 / 禁用 provider
- 默认账号
- 新建账号

不允许放进 provider 概览直接编辑的项：

- 凭据细节
- allowlist
- pairing 审批细节
- bindings 规则
- 高级 JSON

### 3. Channel Account Card 角色收缩

账号卡不再承担“全功能操作台”，而是退回为索引卡。

保留：

- 账号 ID / 类型
- 启用状态
- 凭据、白名单、待配对、绑定等摘要计数
- 进入深页的动作

压缩：

- 过多同层按钮
- 冗余 badge
- 大量重复的说明性文本

### 4. Channels 深页重构

所有深页统一为单任务面板：

- Provider Settings
- Account Detail
- Credentials
- Access
- Pairing
- Bindings

统一规则：

- 顶部保留轻量任务标题，不再重复 stage 头信息
- 保存或刷新动作进入页面主体或底部 save bar
- 页面内部围绕当前任务单点展开，不混入其它任务入口

## 路由与组件边界

### 1. 路由

保持现有主路由结构，避免无谓迁移：

- `/agents/:agentId`
- `/agents/:agentId/docs`
- `/agents/:agentId/bindings`
- `/agents/:agentId/sessions`
- `/agents/:agentId/advanced`
- `/channels/:type`
- `/channels/:type/settings`
- `/channels/:type/bindings`
- `/channels/:type/accounts/:accountId`
- `/channels/:type/accounts/:accountId/access`
- `/channels/:type/accounts/:accountId/pairing`

不新增第二套平行路由系统。

### 2. 组件职责

#### Agents

- `AgentsWorkspaceLayout`
  - 只负责左侧索引、stage header、顶层切换
- `AgentsControlPage`
  - 只负责概览与少量快改
- 深页组件
  - 只负责自己的单任务编辑器

#### Channels

- `ChannelsWorkspaceLayout`
  - 只负责左侧 provider 索引、stage header、顶层切换
- `ChannelsControlPage`
  - 只负责 provider 概览
- `ChannelAccountCard`
  - 只作为账号索引卡
- 深页组件
  - 只负责对应任务

## 状态与交互约束

### 1. 一个页面只允许一个主要保存语义

例如：

- `Provider Settings` 的保存只保存 provider settings
- `Account Detail` 的保存只保存当前账号
- `Access` 的保存只保存 allowlist

禁止在一个深页里同时混入多个保存目标。

### 2. 异常与待处理项只在概览聚合

概览页负责告诉用户：

- 哪个账号有问题
- 问题是什么
- 应该进入哪个深页处理

深页本身不再重复承担“全局待处理看板”职责。

### 3. Stage header 不再重复被子页抢主导

Stage header 是整个工作台的主上下文。

子页只能补自己的任务标题，不再重复渲染一套“大标题 + 说明 + 大按钮”的二级头部来和 stage header 竞争。

## 测试与验证

### 1. 前端契约回归

继续补充或更新系统测试，覆盖：

- `agents` 工作台概览契约
- `agents` 深页单任务结构
- `channels` provider 概览契约
- `channels` 账号索引卡契约
- `channels` 深页去重头部后的结构契约

### 2. 构建验证

每轮必须至少执行：

- `npm run typecheck --workspace=apps/web-vue`
- `npm run build --workspace=apps/web-vue`

### 3. 真实交互 QA

在源码契约回归通过后，再做浏览器侧实际验证，重点关注：

- provider 切换
- 账号进入
- 快改字段
- save bar
- 移动端与窄屏层级

## 实施顺序

1. `agents` 深页统一工作台语言
   - `Advanced`
   - `Docs`
   - `Sessions`
   - `Bindings`
2. `channels` provider 概览与账号索引卡重构
3. `channels` 深页统一单任务面板
4. 响应式与视觉收口
5. 系统测试与浏览器 QA

## 风险与控制

### 风险 1：改动面较大，容易引入样式回归

控制：

- 优先复用现有工作台壳
- 不新造第二套样式体系
- 每轮只收一组页面

### 风险 2：深页去头部后信息不足

控制：

- stage header 提供全局上下文
- 深页保留轻量任务标题
- save bar 提供当前任务状态

### 风险 3：快改边界失控

控制：

- 严格限制快改字段
- 复杂字段只能进入深页

## 结论

后续 `agents / channels` 不再继续走“旧后台页 + 新工作台壳”的混合路线，而是统一收敛为：

- 左侧选对象
- 右侧只做当前任务
- 薄概览 + 少量快改
- 深页单任务编辑器

这是当前版本下最稳、最容易持续补字段、也最能降低后续页面继续变乱的方向。
