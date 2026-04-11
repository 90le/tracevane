# Agents / Channels 产品级前端优化计划

> 日期：2026-04-11
> 范围：`apps/web-vue/src/features/agents`、`apps/web-vue/src/features/channels`、相关路由、共享样式与系统测试。

## 目标

把 `Agents` 和 `Channels` 从“后台字段编辑器”继续推进到“可理解、可配置、可维护的产品工作台”。

核心标准：

- 新用户第一次进入页面时，能看出先选对象、再做什么配置、每个按钮会去哪里。
- 高频操作不被低频 JSON / runtime / sandbox / binding 字段淹没。
- `Agents` 与 `Channels` 的绑定关系可被看懂：Agent 负责执行，Channel/Account 负责入口，Binding 负责路由。
- 手机和平板不再出现按钮堆叠、横向溢出、抽屉看不清、保存栏遮挡字段的问题。
- 浅色和深色主题都使用明确表面，不依赖过度透明玻璃层。

## 已完成的 P0 修复

### P0-1. 账户列表“绑定”按钮无反应

根因：

- `ChannelAccountCard` 会发出 `bindings`。
- `ChannelAccountIndex` 会继续转发为 `open-bindings`。
- 旧链路在 `ChannelProviderOverview` / `ChannelsControlPage` 缺少转发与监听，运行中的旧 dist 会在这里断链。

本轮修复：

- `ChannelProviderOverview` 增加 `@open-bindings` 透传。
- `ChannelsControlPage` 增加 `openBindingsPage(accountId)`。
- 跳转到 `/channels/:type/bindings?accountId=...&intent=create`，让 `ChannelBindingsPage` 自动聚焦账号并打开新增绑定表单。

验收：

- 点击账号卡 `绑定` 后进入当前 provider 的 `bindings` 页面。
- 页面显示当前聚焦账号。
- 新增绑定表单自动打开，账号字段预填当前账号。

### P0-2. 凭据抽屉布局混乱、浅色模式看不清

根因：

- 早期抽屉使用未定义的 `var(--panel)`，在 portal 场景下容易退成透明或不可控背景。
- 凭据字段复用通用 `form-grid`，字段多时缺少字段卡片和空态，手机端布局也不稳定。

本轮修复：

- `ChannelCredentialDrawer` 使用明确的 `shell-stage-fill-strong` / light theme 背景。
- 新增 `credential-field-grid` 和 `credential-field-card`，把凭据字段收成稳定的两列卡片，手机端降为单列。
- 增加空凭据字段提示、footer 分隔线、移动端按钮伸展、输入框浅色边框兜底。

验收：

- 浅色主题下抽屉、输入框、字段 hint、摘要 chip 可读。
- 390px 宽度下抽屉不横向溢出，底部取消/保存按钮可点击。
- 无凭据字段时显示明确空态。

## 阶段 1：Channels 信息架构收口

目标：把 Channels 从“入口堆叠”改成“Provider 概览 + Account 索引 + 深页单任务”。

### CH-1. Provider 概览首屏减噪

问题：

- `ChannelsWorkspaceLayout` 顶部已有 5 张任务卡。
- `ChannelProviderOverview` 又展示 summary、quick edit、issues、account index。
- 平板和窄屏首屏会形成“任务卡 + 快改 + 账号卡”的长列表，新用户不知道从哪里开始。

建议：

- 顶部 stage actions 降级为“主要下一步”区域，最多保留 1 个主 CTA 和 2 个轻量 secondary link。
- Provider 概览保留 `summary / issues / quick edit / account index`，不再同时在 header 再铺 5 个入口。
- `默认账号权限 / 待配对` 这类快捷入口移动到默认账号卡或 issue list，而不是顶层所有 provider 都显示。

当前实现：

- 顶部 stage actions 已先从 5 个任务卡压到 4 个，移除了重复的 `新建账号`。
- `新建账号` 入口统一放在账号索引区，和账号列表、默认账号/命名账号分组保持同一语义层级。
- Provider 快改区只保留启用状态、默认账号和删除 provider，复杂配置继续进入 Settings。
- Provider Settings 已拆成 `常用默认值 / Thread 绑定运行态 / 高级 JSON`；常用区补齐 `domain / responsePrefix / configWrites / healthMonitor`，Thread 区补齐 `spawnSubagentSessions / spawnAcpSessions`。

涉及文件：

- `ChannelsWorkspaceLayout.vue`
- `ChannelProviderOverview.vue`
- `ChannelIssueList.vue`
- `ChannelAccountIndex.vue`
- `style.css`

验收：

- `/channels/:type` 首屏能明确看到 provider 状态和账号列表。
- 顶部不再出现 5 个平级任务卡。
- 平板 1024px 下首屏不超过两组主要区域。

### CH-2. Account Card 动作降噪

问题：

- 每张账号卡当前仍有 `账号详情 / 凭据 / 权限 / 配对 / 绑定 / 启停` 六个动作。
- 多账号场景会变成按钮矩阵，手机端命中和扫读都差。

建议：

- 保留 `账号详情` 作为主入口。
- 根据账号状态展示一个问题驱动 CTA，例如“补凭据”“处理配对”“补绑定”。
- 低频动作收进 `更多` 或一个轻量任务菜单；如果短期不做菜单，至少压成第二行小型文本动作。
- `启用/禁用` 作为状态动作放到卡片右上或 footer 末端，避免和配置动作混在一起。

涉及文件：

- `ChannelAccountCard.vue`
- `ChannelAccountIndex.vue`
- `tests/system/studio-web-channels-account-cards.test.mjs`

验收：

- 同层可见主按钮不超过 2 个。
- 手机 390px 下单张账号卡高度可控，不出现 3 行以上按钮堆叠。
- 凭据/权限/配对/绑定入口仍可达。

当前增量：

- 命名账号已补 `删除` 入口。
- Provider 已补 `删除频道` 入口。
- 默认账号不显示删除入口，因为后端不允许删除默认账号配置档。
- 删除命名账号会二次确认，并走现有后端逻辑同时清理该账号相关 bindings。
- 删除 provider 会二次确认，并走现有后端逻辑同时清理该 provider 的账号和 bindings。
- 账号卡操作已拆成三层：`账号详情` 主入口、`配置任务` 分组、`启停 / 删除` 管理动作，避免 6 个按钮平铺造成移动端挤压。

### CH-3. 凭据编辑边界统一

问题：

- `ChannelAccountDetailPage` 内嵌凭据字段。
- `ChannelCredentialDrawer` 又作为 credential-only 快捷抽屉。
- 用户不清楚凭据到底应该在详情页保存，还是在抽屉保存。

建议：

- 推荐选择 `Credential Drawer` 作为“凭据快路径”。
- `Account Detail` 中将凭据区域改为摘要 + “打开凭据抽屉”，不再直接内嵌 credential input。
- 如果保留详情页内嵌凭据，必须在文案中说明两个入口保存同一批配置，但这会增加认知成本。

涉及文件：

- `ChannelAccountDetailPage.vue`
- `ChannelCredentialDrawer.vue`
- `ChannelsWorkspaceLayout.vue`
- `tests/system/studio-web-channels-drawers.test.mjs`

验收：

- 一个配置项只有一个主要编辑入口。
- 保存成功消息能明确说明写入的是账号凭据。
- 详情页和抽屉不会出现两套互相竞争的凭据表单。

当前实现：

- `ChannelAccountDetailPage` 只显示凭据状态摘要和“打开凭据抽屉”入口，不再内嵌 credential input。
- 账号详情保存使用 `buildAccountDetailFieldPayload` 排除 credential fields，避免把凭据值通过详情页保存或写空。
- 凭据读写继续由 `ChannelCredentialDrawer` 统一承接。

### CH-3A. Account ID / 显示名边界

当前结论：

- 当前 Studio `ChannelAccountSummary / ChannelAccountInput` 没有独立 `displayName / description` 字段。
- OpenClaw 账号目前以 `accounts.<accountId>` 作为稳定身份，很多绑定、日志、doctor warning、路由和 provider runtime 都围绕 account id 工作。
- 中文或带空格的 account id 在 JSON 配置和 Studio 路由层技术上可用，但不同 provider 会有自己的规范化逻辑；因此 Studio 应推荐短、稳定、便于日志排查的 ID。

建议：

- 短期：在新建账号表单明确说明“账号 ID 就是显示身份和配置键”，不要做一个保存后会丢失的假 `name` 字段。
- 中期：如果确实要显示名/描述，先扩展后端契约：`ChannelAccountSummary.displayName / description`、`ChannelAccountInput.displayName / description`、服务端读写、宿主 config validate 兼容测试。
- UI：账号卡可以先用 `id` 作为主标题，后续若契约完成再把 `displayName` 作为主标题、`id` 作为技术副标题。

验收：

- 新建账号抽屉必须解释 account id 的用途和建议格式。
- 在后端契约完成前，前端不得提供会被丢弃的 name/description 输入框。

### CH-4. Bindings 页任务化

问题：

- Binding 是 Agent 和 Channel 的关键连接点，但当前字段仍偏后台表单。
- 从账号卡进入时虽然能聚焦账号，但页面需要更明确地说明“正在给这个账号创建绑定”。

建议：

- 聚焦账号时顶部文案改成用户目标语言：`为账号 xxx 绑定 Agent`。
- 新增表单首字段顺序调整为 `目标 Agent -> 匹配范围 -> 高级 ACP`。
- 账号字段在聚焦模式下显示为锁定摘要或默认预填，减少误改。

涉及文件：

- `ChannelBindingsPage.vue`
- `ChannelProviderOverview.vue`
- `ChannelsControlPage.vue`
- `tests/system/studio-web-channels-overview.test.mjs`

验收：

- 从账号卡 `绑定` 进入后，不需要用户再理解 query 参数。
- 创建表单一眼能看出绑定目标 Agent 和当前账号。

当前实现：

- 新增/编辑绑定已拆成 `基础路由 / 命中条件 / ACP 路由` 三段。
- 账号聚焦进入时标题直接显示“为账号 xxx 新增绑定”，不再只显示泛化的“新增绑定”。
- 列表中当前编辑的 binding 会高亮，避免用户不知道正在修改哪一条。

## 阶段 2：Agents 配置体验收口

目标：让 Agent 页面能看出“身份 / 模型 / 工作区 / 工具 / 沙盒 / 绑定 / 会话”的关系。

### AG-1. Quick Config 边界重定

问题：

- Overview 的快改区只保留启用、模型、工作区。
- `AgentQuickConfigDialog` 又暴露 runtime、role、avatar、sandbox、workspace access、tools、fsWorkspaceOnly。
- 用户会困惑哪些是快改、哪些是高级设置。

建议：

- 方案 A：删除 Quick Config Dialog，把所有高级项放回 `Advanced`。
- 方案 B：保留 Dialog，但只允许 `enabled / model / workspace` 三项。
- 推荐方案 A，减少双入口维护债。

涉及文件：

- `AgentsControlPage.vue`
- `AgentQuickConfigDialog.vue`
- `AgentAdvancedPage.vue`
- `tests/system/studio-web-agents-*.test.mjs`

验收：

- Overview 只出现高频快改。
- Advanced 承接 runtime、sandbox、tools、identity 等低频配置。

### AG-0. 默认入口 Agent 与 agents.defaults 拆分展示

当前结论：

- `defaultAgentId / agent.isDefault` 是真实 Agent 实体，决定未指定目标的会话默认进入哪个 Agent。
- `agents.defaults` 是全局配置模板，决定模型、工作区、沙盒、工具等字段未显式配置时如何继承。
- 如果用户新建了 `main`，并且它绑定了自己的 workspace，同时 `agents.defaults.workspace` 也存在，两者容易被误解成同一个“默认”。

已完成：

- 左侧 Agent rail 改成 `默认入口 Agent / 其它 Agent` 分组。
- 概览页已移除 `默认入口 vs 全局默认配置` 大卡，避免首页继续堆叠说明卡。
- 概览首页第一张卡改为全宽主卡，身份和快改不再和会话、绑定、文档卡片混排。
- `文档状态` 卡已从概览移除，文档管理继续由文档页承接。
- 概览页已继续移除重复的身份指标网格，首屏只保留身份、快改、会话热度和绑定总览。
- App route staging 已移除 `AnimatePresence + motion.section`，切换页面不再走 motion wait/unmount；页面级 presets 继续保持零时长、零位移、零透明度变化，并移除全局背景循环动画。

后续建议：

- 在 Advanced 页继续把“当前 Agent 覆盖值”和“继承默认值”做成并排摘要。
- 若配置编辑页支持 `agents.defaults`，入口文案应统一使用“全局默认配置模板”，不要再简称“默认 Agent”。

### AG-2. Bindings 页瘦身

问题：

- `AgentBindingsPage` 混入 sessions、tokens、recent sessions、打开会话等信息。
- 绑定页任务语义被会话监控稀释。

建议：

- Bindings 页只保留绑定列表、绑定编辑、跳转到 Channels 的交叉入口。
- 会话、tokens、recent activity 移到 `Sessions` 或 `Overview`。
- 当前实现已按此收口：`AgentBindingsPage` 不再展示 sessions、tokens、recent sessions，也不再提供“打开会话”的跨任务入口。
- 当前实现保留绑定摘要条、绑定列表、`打开频道 / 频道绑定 / 修改 / 删除` 四类和绑定直接相关的动作。

涉及文件：

- `AgentBindingsPage.vue`
- `AgentSessionsPage.vue`
- `AgentsControlPage.vue`

验收：

- Binding 页不再展示 session/tokens 监控指标。
- Sessions 页承接运行态信息。

### AG-3. Advanced 页面继续拆薄

问题：

- `AgentAdvancedPage` 已拆到 `Core / Identity / Runtime / Overrides / Raw JSON`，但 runtime 与 JSON 仍可能对普通用户过重。

建议：

- `Core`：启用、模型、工作区、工作目录。
- `Identity`：name、role、mission、avatar。
- `Runtime`：sandbox、tools、exec、workspace access。
- `Media / Models`：image/video/music/pdf model。
- `Raw JSON`：默认折叠，带“高风险”说明。
- 当前实现已把 `Runtime / Overrides / Raw JSON` 改成 collapsible 分段，其中 Runtime 默认展开，Overrides 与 Raw JSON 默认折叠，避免高级页首屏一次性铺满。
- `Sessions` 页已同步改成摘要条 + 会话卡片，承接从 Bindings 页移出的运行态信息。

涉及文件：

- `AgentAdvancedPage.vue`
- `tests/system/studio-web-agents-advanced*.mjs`

验收：

- 每个分段能回答“这个区域配置什么”。
- Raw JSON 不在首屏抢注意力。

## 阶段 3：共享视觉系统与响应式

### UI-1. Channels / Agents 表面统一

任务：

- 统一 `panel-card / stage header / task head / save bar / drawer` 的浅色与深色表面。
- 减少直接使用半透明黑灰，浅色主题不要出现暗色污染。
- 删除旧的 `channel-tile / account-tile / channels-detail-layout` 残留样式，避免测试固化旧结构。

验收：

- 浅色主题下所有主要面板背景接近白色或浅灰蓝，不透明度足够。
- 深色主题保留层次但不穿透。

### UI-2. 断点矩阵

必须覆盖：

- `1440x900` 桌面
- `1024x768` 横向平板
- `768x1024` 竖向平板
- `390x844` 常见手机
- `360x640` 小屏手机

验收：

- 无水平滚动。
- 顶部按钮不超过两行。
- 抽屉可关闭、可保存、底部按钮不被遮挡。
- sticky save bar 不遮挡最后一个字段。

## 阶段 4：文案与测试

### COPY-1. 产品态文案清理

要清理的文案类型：

- `现在先展示`
- `这里仍保留`
- `参考历史版本`
- `不再重复`
- 过多实现迁移说明

替代方向：

- 说明用户目标：`选择账号后配置凭据、权限和绑定`
- 说明保存影响：`保存后会写入当前账号配置`
- 说明风险边界：`高级 JSON 会覆盖宿主配置，请确认字段结构`

### TEST-1. 静态契约测试

建议新增或更新：

- Channels workspace 不再要求 5 个 task card。
- Account card 同层主按钮不超过 2 个。
- Credential drawer 不使用未定义 `var(--panel)`。
- Channel binding shortcut 必须透传 `open-bindings` 并带 `accountId / intent=create`。
- Agent Quick Config 不再暴露 advanced-only 字段，或组件被移除。

### TEST-2. 浏览器 QA

路径：

- `/agents`
- `/agents/:agentId`
- `/agents/:agentId/docs`
- `/agents/:agentId/bindings`
- `/agents/:agentId/sessions`
- `/agents/:agentId/advanced`
- `/channels`
- `/channels/:type`
- `/channels/:type/settings`
- `/channels/:type/accounts/:accountId`
- `/channels/:type/accounts/:accountId/access`
- `/channels/:type/accounts/:accountId/pairing`
- `/channels/:type/bindings?accountId=:accountId&intent=create`

## 推荐执行顺序

1. 先收 Channels 概览首屏和账号卡动作，因为这是用户最高频路径。
2. 再统一 Credentials 边界，避免同一配置两处保存。
3. 再做 Bindings 页任务化，明确 Agent / Channel / Account 的连接关系。
4. 然后处理 Agents Quick Config 与 Bindings 瘦身。
5. 最后清理旧 CSS / 旧文案 / 测试契约，并跑断点 QA。

## 每轮完成条件

- 更新对应系统测试。
- `npm run typecheck --workspace=apps/web-vue` 通过。
- 相关 `node --test tests/system/studio-web-*.test.mjs` 通过。
- 每轮结束运行 `npm run build && npm run dev:restart`。
- 每次提交使用中文提交信息。
