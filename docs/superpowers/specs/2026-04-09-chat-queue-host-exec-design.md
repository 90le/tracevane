# Studio Chat 队列与宿主管理 Exec 设计

**日期：** 2026-04-09

## 目标

为 Studio Chat 增加两个稳定能力：

1. 每个 chat session 独立的待发送队列，支持自动 FIFO 续发，并在前端显式展示、编辑、删除。
2. Studio Chat 内对宿主管理类 `exec/shell/bash` 的放行能力，改为“全局默认关闭 + 当前 session 临时开启”的双开关模型。

## 已确认边界

- 队列作用域：每个 chat session 独立。
- 队列持久性：页面刷新保留，Studio 进程重启不保留。
- 队列发送策略：当前 run 结束后自动按 FIFO 继续发送。
- 队列展示位置：composer 上方单独的“待发送队列栏”。
- 队列操作：待发送阶段可编辑、删除；编辑后保留原顺序。
- 宿主管理 Exec：全局默认关闭。
- 宿主管理 Exec 临时开关：当前 session 手动开启，刷新后保留，直到用户手动关闭；Studio 重启失效。
- 宿主管理 Exec 真正放行条件：全局允许且当前 session 已开启。

## 约束

- 不修改 OpenClaw 宿主源码。
- 不依赖宿主版本私有实现。
- 不能把“第二条消息消失”问题继续留给前端竞态；必须收敛为明确的队列语义。
- 不能把宿主管理命令默认暴露给普通 Studio 私聊会话。

## 方案选择

### 方案 A：纯前端本地队列

- 优点：改动小。
- 缺点：刷新恢复、多个标签页一致性、实际发送时机和工具拦截都不可靠。

### 方案 B：Studio 服务端内存队列 + 前端队列栏

- 优点：刷新可恢复，重启自动清空，和当前 Studio BFF 架构一致。
- 优点：可以把排队态、自动续发、重新校验权限统一放到后端。
- 缺点：需要新增 session 状态和若干接口。

### 方案 C：磁盘持久化队列

- 优点：最强恢复。
- 缺点：和“Studio 重启后不保留队列”的要求冲突，还会引入旧命令误发风险。

**结论：采用方案 B。**

## 总体架构

### 1. Session 内存态扩展

`apps/api/modules/chat/service.ts` 中的 `StudioManagedSessionState` 增加两组扩展状态：

- `pendingQueue`: 当前 session 的待发送队列。
- `controls`: 当前 session 的临时控制开关，至少包含 `allowHostManagementExec`。

这两组状态只存在于 Studio 进程内存：

- 刷新页面时仍可通过 API 重新读取。
- Studio 进程重启后自然清空。

### 2. 显式队列接口

为 session 新增队列与控制接口：

- `GET /api/chat/sessions/:sessionKey/queue`
- `POST /api/chat/sessions/:sessionKey/queue`
- `PATCH /api/chat/sessions/:sessionKey/queue/:entryId`
- `DELETE /api/chat/sessions/:sessionKey/queue/:entryId`
- `GET /api/chat/sessions/:sessionKey/controls`
- `PATCH /api/chat/sessions/:sessionKey/controls`

### 3. 实时同步

前端已有 chat websocket/event stream 机制。新增两类事件：

- `queue.state`
- `session.controls`

用途：

- 页面刷新后先走 HTTP 拉取。
- 打开中的页面通过流式事件实时同步队列变化和当前 session 开关变化。

### 4. 发送语义

- 当前 session 没有活动 run：直接发送。
- 当前 session 有活动 run：请求进入待发送队列，不直接调用现有 `send` 路径。
- 当前 run 进入 `completed / aborted / error` 后，服务端自动取队列头部继续发送。
- 自动续发前重新校验该队列项是否仍可发送。

### 5. Exec 放行语义

宿主管理类命令的真正放行需要同时满足：

1. 全局设置 `allowHostManagementExecInStudioChat = true`
2. 当前 session `allowHostManagementExec = true`

任一条件不满足时，继续沿用当前拦截逻辑。

## 数据模型

### 待发送队列项

新增类型 `ChatQueuedMessageItem`，字段包含：

- `id`
- `sessionKey`
- `createdAt`
- `updatedAt`
- `text`
- `composerDocument`
- `fileRefs`
- `attachments`
- `previewText`
- `status`
  - `queued`
  - `blocked`
- `blockedReason`

不引入“已发送仍留在队列”的状态。真正发送成功后直接从队列中移除。

### Session 控制状态

新增类型 `ChatSessionControlState`：

- `allowHostManagementExec: boolean`
- `updatedAt: string | null`

### 全局设置

新增持久化配置项：

- `plugins.entries.studio.config.chat.allowHostManagementExecInStudioChat`

Studio Config 页从这里读写。

## 后端行为细节

### 队列入队

`send` 入口不直接承担“排队判定”。新增显式 `enqueue` 流程：

- 若当前 run 活跃，前端调用 `queue enqueue`。
- 队列项入内存后立刻广播 `queue.state`。

### 自动续发

在现有 runtime/run terminal 事件收口点统一触发 `flushQueueIfIdle(sessionKey)`：

- 仅当 `activeRunId` 为空时继续。
- 一次只发送一条。
- 发送前重新检查队列头部：
  - 若是宿主管理类命令且当前不满足双开关，改为 `blocked` 并广播。
  - 否则复用现有 `send` 内部真实发送逻辑。

### 编辑与删除

- 编辑：更新原 entry 内容和 `updatedAt`，保持队列位置不变。
- 删除：直接从队列移除。

### 阻塞态

当待发送项在真正发出前失去权限，例如 session 临时开关被关闭：

- 条目不丢失。
- 状态改为 `blocked`。
- 前端可重新编辑或删除。

## 前端交互

### 队列栏

位于 composer 上方，显示当前 session 的待发送项列表。

每项显示：

- 摘要文本
- 附件数
- 更新时间
- 状态徽标

每项操作：

- `编辑`
- `删除`

### 编辑流程

- 点击编辑时，将该条从队列进入“编辑态”。
- 内容回填到 composer。
- 用户确认发送时，更新原 entry，而不是创建新 entry。

### 发送按钮行为

- 没有活动 run：照常发送。
- 有活动 run：按钮文案与提示改为“加入队列”语义，而不是报错。

### Session Exec 临时开关

放在 chat 页头部更易发现的位置，同时在移动端保留到更多菜单里。

要求：

- 默认关闭。
- 开启时有明显状态文案。
- 首次开启弹出确认。
- 刷新恢复。

## Config 页设计

位置：`Config > 沙盒与安全`

新增一个高可见度卡片，而不是埋进普通 choice chip：

- 标题：`允许在 Studio Chat 中启用宿主管理 Exec`
- 副标题：明确说明这是“允许 chat 页显示 session 临时开关”，不是直接全局放行。
- 显眼样式：警示色描边、强调背景、状态徽标。
- 说明：
  - 默认关闭
  - 开启后，仍需要每个会话单独临时开启
  - 仅影响 Studio Chat 私聊中的宿主管理类 `exec/shell/bash`

## Hook 放行实现

`lib/studio-delivery-hooks.ts` 不再是纯静态常量判断，而是增加可注入的策略读取：

- 根据 `sessionKey` 查询当前 session 临时控制状态。
- 根据全局 Studio plugin config 查询全局允许状态。
- 只有双开关都开启时，才允许宿主管理类命令穿过。

仍然保持：

- `gateway / cron / sessions_*` 等管理工具默认阻断。
- 非宿主管理的普通工作区命令继续允许。

## 测试

### 后端

- 队列入队、编辑、删除。
- 活动 run 结束后自动 FIFO 续发。
- `blocked` 状态转换。
- 刷新可读取、重启不保留。

### Hook

- 默认关闭时阻断。
- 仅全局开启时仍阻断。
- 仅 session 开启时仍阻断。
- 双开关同时开启时放行宿主管理命令。

### 前端

- 队列栏显示、编辑回填、删除。
- run 活跃时第二条消息进入队列，不再“消失”。
- session 临时开关刷新后恢复。

## 风险与收口

- 风险：自动续发和现有 runtime 事件的 terminal 判定点分散。
  - 处理：统一在已有 terminal 收口后调用 `flushQueueIfIdle`。

- 风险：队列和 optimistic message 再次互相覆盖。
  - 处理：只有真正发出时才注入 optimistic message；排队阶段不注入主消息流。

- 风险：危险能力入口过于隐蔽或过于容易误开。
  - 处理：Config 全局开关做显眼警示卡，session 开关首次开启弹确认。

## 完成标准

- 第一条消息运行中发送第二条，不再出现“已发但线程空白”。
- 待发送项可见、可编辑、可删除，并按 FIFO 自动发送。
- 宿主管理 Exec 默认继续关闭。
- 开启全局开关后，用户能在 chat session 中明确找到临时开关。
- 双开关模型生效，且刷新恢复、Studio 重启清空临时状态。
