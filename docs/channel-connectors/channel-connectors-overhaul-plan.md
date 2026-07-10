# 消息接入全面重构计划

## 目标

把消息接入从“可编辑 binding JSON 的管理页”升级为可安全完成账号接入、路由配置、运行验证和故障恢复的运维工作台。飞书与 Octo 是当前必须完整支持的平台；未知平台仍保留高级 metadata JSON 扩展入口。

## 交付状态

- 配置已升级为 `platformAccounts[] + routes[]` v2；旧 v1 首次写入时自动备份，运行时兼容 binding 由服务端物化。
- 账号凭据只保存在账号对象，复制和编辑路由不会携带账号密钥；列表、日志和公开配置保持脱敏。
- 保存与 daemon 应用已合并为带 revision 检查的事务入口；可达 daemon 拒绝应用时自动恢复 last-known-good，daemon 原本离线时保留新配置等待启动。
- 飞书与 Octo 均提供真实默认地址、字段校验、停用草稿、不落盘连接预检、运行状态和账号级诊断；飞书支持官方授权链接的本地二维码展示与手动填写。
- 账号和路由编辑器提供字段级错误、密钥明文核对、浏览器自动填充防护、未保存关闭保护和键盘可达操作；高级 JSON 仅保留未模板化扩展字段。
- 概览、账号、路由、会话投递和诊断已重排信息层级，并为窄屏提供独立紧凑列表。
- 热重载在 Agent run/turn 全局空闲后重建平台连接，不清除持久 Agent session。飞书连接按 `App ID + API URL` 分组并共享 WebSocket、进程锁与 watchdog，因此当前不声称支持单账号无抖动重连。

## 研究结论

- 飞书官方 Node SDK 的 `registerApp` 只返回验证 URL 和过期时间；调用方负责二维码展示、轮询和结果回填。
- 飞书二维码创建获得 App ID / App Secret 后，仍需验证应用发布、机器人能力、权限、`im.message.receive_v1`、长连接和真实入站消息。
- OpenClaw 将 channel accounts 与 bindings 分开；交互式账号向导可选择是否继续绑定 Agent，非交互模式不会隐式改写路由。
- cc-connect 的飞书排障同样把权限、事件订阅、长连接、发布和卡片回调视为独立检查项。
- Octo 没有可公开验证的外部配置规范；以当前已覆盖的 `/v1/bot/register`、返回 `robot_id/im_token/ws_url` 和本地系统测试作为契约来源。

## 目标数据模型

配置 v2 采用两个一等对象：

```text
platformAccounts[]
  id, platform, displayName, enabled
  externalAccountId, botId
  credentials, settings

routes[]
  id, accountRef
  source { kind, id }
  agentProfileId, overrides
  accessPolicy, sessionPolicy
```

运行时继续接收扁平 binding，但由服务端从 v2 物化，避免 daemon 与所有 adapter 同时迁移。凭据只存在于账号对象，不复制到每条路由。

## 迁移约束

1. 读取 v1 时按 `platform + accountId + botId` 分组为账号，原 binding ID 保留为 route ID。
2. 账号字段与路由字段使用显式键集合拆分；未知 metadata 留在账号的 advanced metadata，不能丢失。
3. 写入 v2 前生成 v1 备份；迁移失败继续读取 v1，不能静默回落为空配置。
4. 迁移期 API 同时返回 v2 视图与兼容 runtime bindings；daemon 配置格式暂不变化。
5. 账号删除必须显式确认关联路由数量；路由删除不能删除账号凭据。

## 分阶段实施

### A. 防错基线

- 锁定现有配置读写、密钥脱敏、飞书二维码、Octo register、热重载和路由覆盖测试。
- 恢复真实默认地址并在前后端统一归一化。
- 增加平台必填字段和 URL 校验；停用账号允许保存为不完整草稿。
- 修复 transport 失败仍显示成功、平台切换残留凭据、浏览器自动填充和应用失败关闭编辑器。

### B. 草稿预检与账号向导

- 新增不落盘的 account draft validation / smoke API。
- 飞书提供扫码与手动两条路径，完成后显示发布、权限、长连接和入站检查清单。
- Octo 使用 API URL + Bot Token 直接 register，回填 robot ID 与 WS URL 后再保存。
- 账号默认先验证再启用；允许明确保存为停用草稿。

### C. 账号与路由分离

- 引入 v2 类型、迁移器和兼容物化层。
- 账号页只管理身份、凭据、连接和平台设置；路由页只引用账号并配置来源与 Agent。
- 重复账号创建改为“账号已存在，新增路由”。

### D. 运行时应用与恢复

- 已完成：保存使用 revision 防止多标签页覆盖。
- 已完成：应用前保留 last-known-good；可达 daemon 应用失败时自动回滚。
- 已完成：daemon 等待 Agent run/turn 空闲后重建平台连接，持久 Agent session 保留。
- 已完成：展示账号连接、入站等待、reload 状态和结构化错误。
- 后续独立阶段：先抽取 Octo binding 生命周期管理器，再把飞书连接改为 group diff 重连；未完成该结构重构前不承诺单账号无抖动重连。

### E. 全页面重新设计

- 概览以账号健康、待处理问题和最近活动为主，不用 binding 数量代替健康。
- 账号页采用平台、连接、入站、路由、最近验证五列语义；移动端删除纵向 KPI 墙。
- 路由页突出来源匹配优先级、账号引用和最终 Agent，不重复展示账号凭据。
- 会话投递把全局策略收成紧凑工具区，优先展示活动、排队和失败 session。
- 诊断页先给账号级故障与建议动作，原始配置和日志下沉到证据区。
- 所有表单提供字段级错误、键盘焦点、状态 live region、移动端可达操作和未保存保护。

## 验收门槛

- 类型检查：`npm run typecheck:api`、`npm run typecheck:web`。
- 构建：`npm run build:api`、`npm run build:web`。
- 系统测试：Channel Connectors service、web contract 和新增迁移/校验测试。
- 运行验证：现有飞书与 Octo 账号保持连接；新增账号可完成预检、保存、热重载和首条消息闭环。
- 浏览器验证：1440x1000、845x834、390x844；浅色/深色；无横向溢出、遮挡或不可见操作。
- 安全验证：明文密钥不进入列表、日志、toast、URL 或截图；私网附件访问有明确告警和范围控制。

## 暂不接受的捷径

- 不继续用 placeholder 充当默认值。
- 不用 metadata 键名推断“凭据有效”。
- 不把 HTTP 200 当作 transport 成功。
- 不在复制路由时复制新的账号凭据副本。
- 不把守护进程重启包装成热重载；当前热重载只重建平台连接并保留 Agent session，同时明确其全平台连接抖动边界。
