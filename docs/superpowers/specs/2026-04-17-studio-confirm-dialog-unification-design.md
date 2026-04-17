# OpenClaw Studio 确认对话框全量收口设计

## 1. 背景与目标

当前 OpenClaw Studio 前端仍有多处页面直接使用浏览器原生 `window.confirm`。这些确认入口分散在不同模块中，视觉样式、交互质感和可扩展性都与 Studio 现有界面体系不一致，也无法与后续整体 UI 布局优化自然衔接。

本轮工作的目标不是重做页面结构，也不是顺手抽象整套全局弹窗系统，而是以最小成本完成一次“全量页面 / 全量路由确认交互收口”：

- 将现有前端页面中的原生 `window.confirm` 全部替换为 Studio 自有确认对话框
- 保持各页面原有业务流程、触发时机、文案语义不变
- 允许为此新增一个最小公共确认组件和轻量调用层
- 为下一阶段前端 UI 布局规划留出统一交互底座

## 2. 范围

### 2.1 纳入范围

本轮纳入当前扫描到的所有旧确认入口，共 17 处，覆盖以下页面 / 路由：

- `apps/web-vue/src/App.vue`
- `apps/web-vue/src/features/agents/AgentSessionsPage.vue`
- `apps/web-vue/src/features/agents/AgentBindingsPage.vue`
- `apps/web-vue/src/features/channels/ChannelBindingsPage.vue`
- `apps/web-vue/src/features/channels/ChannelAccessControlPage.vue`
- `apps/web-vue/src/features/channels/ChannelProviderSettingsPage.vue`
- `apps/web-vue/src/features/channels/ChannelAccountDetailPage.vue`
- `apps/web-vue/src/features/channels/ChannelsControlPage.vue`
- `apps/web-vue/src/features/chat-v2/ChatShellPage.vue`
- `apps/web-vue/src/features/cron/CronControlPage.vue`
- `apps/web-vue/src/features/dreaming/DreamingControlPage.vue`
- `apps/web-vue/src/features/system/SystemControlPage.vue`

确认类型分为两类：

1. 普通动作确认
   - 删除账号 / provider / binding / 会话 / cron
   - 升级 Studio
   - Dreaming grounded destructive actions
   - Chat 中删除文件夹、批量删除会话、删除单个会话
2. 离页确认
   - `ChannelAccessControlPage.vue`
   - `ChannelProviderSettingsPage.vue`
   - `ChannelAccountDetailPage.vue`

### 2.2 不纳入范围

本轮不做以下事项：

- 不调整页面布局、导航或信息架构
- 不重写各业务页的状态模型
- 不扩展为完整的全局 Modal / Overlay 平台
- 不修改后端接口或错误处理链路
- 不顺手统一 `window.alert`
- 不开始前端 UI 布局规划，仅为下一阶段铺平确认交互底座

## 3. 设计原则

### 3.1 只统一承载层，不改变业务语义

本轮的核心是把“确认结果来自哪里”从浏览器原生弹窗替换为 Studio 对话框，而不是改变危险操作的语义。各页面原有的确认文案、触发时机、确认后执行的 API、取消后的分支都保持不变。

### 3.2 用最小公共能力解决全量问题

虽然用户原先选择的是 A 档（只替换现有确认交互，不额外扩大战线），但在“全量所有页面一次性处理”的前提下，允许采用一个最小公共组件与轻量调用层。这个公共能力只服务于本轮确认交互替换，不额外承载更重的全局弹窗职责。

### 3.3 与现有 Studio 视觉模式对齐

Studio 当前已经存在一套自有确认对话框模式，典型实现位于 `apps/web-vue/src/features/skills/SkillsControlPage.vue`。本轮新实现应吸收这套模式的优点：遮罩、对话框容器、标题 / 正文 / detail、取消 / 确认按钮分层，以及与整体界面一致的样式语言。

### 3.4 为后续 UI 布局规划保留演进空间

本轮不做 UI 大改，但确认组件本身应放在共享层，形成后续布局与交互统一时可继续沿用的基础件，避免本轮替换完、下一轮又整体推翻。

## 4. 现状观察

### 4.1 图谱与模块分布

根据 `graphify-out/GRAPH_REPORT.md`，Studio 仓库已具备明显的模块社区结构，Channels、Dreaming、Chat、System、Agents 等模块边界清晰；确认入口散落在多个业务域中，但不构成单独社区。这说明“确认交互”更适合收口到共享 UI 层，而不适合继续散落在各模块中重复实现。

### 4.2 现有可参考实现

- `apps/web-vue/src/features/skills/SkillsControlPage.vue` 已有本地确认对话框状态与模板
- `apps/web-vue/src/features/agents/AgentBindingsPage.vue`、`AgentsWorkspaceLayout.vue` 等页面已经有 Studio 自有模态层样式
- 现有危险动作逻辑大多已清晰地写成“先 confirm，再执行异步操作”的简单分支，适合最小替换

### 4.3 当前问题

- 原生 `window.confirm` 视觉风格脱离 Studio
- 离页确认仍依赖浏览器原生框，无法与统一界面语言对齐
- 多页面重复内联确认逻辑，后续要做 UI 规划时仍需再次收口

## 5. 方案对比

### 5.1 方案 A1（采用）

新增一个最小公共确认组件，并提供轻量 `confirm()` 调用层，把所有旧 `window.confirm` 迁移到这套能力上。

优点：

- 一次性收口全部页面 / 路由
- 视觉和交互完全统一
- 业务侧改动最小，原有分支基本保持不变
- 后续做 UI 布局规划时可直接复用

代价：

- 需要增加一个共享组件和一个轻量调用层
- 离页确认需要适配异步确认流

### 5.2 方案 A2（不采用）

每个页面各自内嵌本地确认弹窗，不提取共享能力。

问题：

- 17 处入口会复制大量遮罩、对话框模板和状态字段
- 后续 UI 布局阶段仍需要再统一一轮

### 5.3 方案 A3（不采用）

仿照 `SkillsControlPage.vue` 的状态模式分别拷贝到各页面，但不抽公共组件。

问题：

- 比 A2 好一些，但仍然大量重复
- 只是把重复模式标准化成“复制粘贴”，长期维护价值有限

## 6. 目标架构

本轮新增两层最小公共能力：

### 6.1 共享确认组件

放置在共享组件层，例如：

- `apps/web-vue/src/shared/components/ConfirmDialog.vue`

组件职责：

- 展示确认对话框外壳
- 接收标题、正文、可选 detail
- 提供取消 / 确认按钮
- 处理遮罩点击、Esc、关闭时的默认行为
- 支持确认按钮 busy / disabled 呈现
- 保持双语文案由调用方通过 `text(...)` 提前生成

组件不负责：

- 决定业务动作
- 发起 API
- 管理全局队列
- 处理页面级错误提示

### 6.2 轻量调用层

增加轻量 composable，例如：

- `apps/web-vue/src/shared/composables/useConfirmDialog.ts`

调用方式保持简单：

- 页面发起 `await confirm({ ... })`
- 返回 `boolean`
- 页面继续沿用原有 `if (!confirmed) return` 分支

调用层职责：

- 持有当前唯一的确认状态
- 打开 / 关闭共享确认组件
- 通过 Promise 向调用页返回确认结果
- 在组件卸载或异常关闭时默认回落为 `false`

## 7. 数据流设计

### 7.1 普通动作确认

普通动作确认的数据流如下：

1. 页面准备执行危险操作
2. 页面调用 `await confirm({ title, message, detail, confirmLabel })`
3. 共享确认状态打开
4. 共享确认组件渲染
5. 用户取消或关闭 → Promise resolve `false`
6. 用户确认 → Promise resolve `true`
7. 页面继续执行原有删除 / 升级 / 清理逻辑
8. 原有成功提示与错误处理继续由页面负责

### 7.2 离页确认

离页确认的数据流如下：

1. `onBeforeRouteLeave` 检测到未保存更改
2. 页面调用同一套 `confirm()`
3. 等待确认结果
4. `false` → 阻止离开当前路由
5. `true` → 放行导航

离页确认与普通动作确认共用同一对话框壳层，但仍由各页面自己判断是否存在未保存改动。

## 8. 页面接入策略

### 8.1 普通动作确认页面

以下页面直接把现有 `window.confirm(...)` 替换为 `await confirm(...)`：

- `App.vue` Studio 升级确认
- `AgentSessionsPage.vue` 清空全部会话 / 删除单条会话
- `AgentBindingsPage.vue` 删除绑定
- `ChannelBindingsPage.vue` 删除 binding
- `ChannelsControlPage.vue` 删除账号 / 删除 provider
- `ChatShellPage.vue` 删除文件夹 / 批量删除会话 / 删除单会话
- `CronControlPage.vue` 删除任务
- `DreamingControlPage.vue` grounded destructive actions
- `SystemControlPage.vue` Studio 升级确认

### 8.2 离页确认页面

以下页面继续保留当前“有未保存改动才阻拦”的逻辑，只把承载层改为共享确认对话框：

- `ChannelAccessControlPage.vue`
- `ChannelProviderSettingsPage.vue`
- `ChannelAccountDetailPage.vue`

## 9. 交互与样式要求

### 9.1 一致性要求

- 标题、正文、detail、按钮区结构统一
- 取消和确认按钮层级清晰
- 遮罩与对话框层级与现有 Studio modal 风格一致
- 中英文文案继续由页面现有 `text(...)` 生成，不在确认组件内部做文案逻辑

### 9.2 关闭规则

- 点击取消：返回 `false`
- 点击遮罩：返回 `false`
- 按 Esc：返回 `false`
- 点击确认：返回 `true`
- 若组件在等待期间被销毁：默认返回 `false`

### 9.3 运行约束

- 同一时刻只允许一个确认对话框
- 不实现队列
- 不实现多层嵌套确认
- 不实现跨页面状态保留

## 10. 异常与边界处理

本轮只补最基本的安全边界：

- 任何非确认关闭路径默认视为 `false`
- 页面销毁后不再继续执行后续危险动作
- 确认层不吞掉业务错误，业务错误仍由原页面 `catch` 处理
- 离页确认只决定导航是否放行，不修改草稿本身

## 11. 测试与验收

### 11.1 功能验收

需要逐个验证已扫描的 17 处确认入口都已迁移：

- 取消时不执行危险操作
- 确认时继续执行原有逻辑
- 现有成功 / 失败提示仍正常显示
- 离页确认能正确阻止或放行导航

### 11.2 重点回归点

- `App.vue` / `SystemControlPage.vue` 升级确认
- Channels 全部删除与离页确认
- Agents 删除与清空确认
- `ChatShellPage.vue` 三处 destructive actions
- `CronControlPage.vue` 删除任务
- `DreamingControlPage.vue` 两处 grounded destructive actions

### 11.3 非功能验收

- 所有确认 UI 样式一致
- 文案语义未改变
- 不引入新的页面结构回归
- 不引入新的后端接口依赖

## 12. 实施结果约束

本轮完成后的结果应满足：

- Studio 前端不再保留原生 `window.confirm`
- 所有现有确认动作都切到同一套 Studio 自有确认 UI
- 共享确认能力保持最小，不演变成重型弹窗平台
- 下一阶段可直接基于这套确认交互进入前端 UI 布局规划
