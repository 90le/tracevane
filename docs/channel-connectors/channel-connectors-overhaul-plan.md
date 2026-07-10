# 消息接入 v3 重构说明

## 目标

消息接入以用户可理解的三个对象组织，不再把内部 binding 当作产品模型：

1. `ChannelAccount`（渠道账号）只保存平台身份、凭据、连接参数和账号安全策略。
2. `DeliveryTarget`（Agent 工作区）保存 CLI runtime、目录、模型、权限和工作区队列配置，可被多个账号复用。
3. `DeliveryPolicy`（分发策略）为一个账号指定一个默认工作区，并提供少量来源例外。

运行时以账号为物理连接边界。一个启用账号只建立一个飞书 client 或 Octo socket；规则只在收到消息后选择工作区，不创建额外连接。

## 当前实现

### 配置与控制面

- v3 配置持久化 `accounts + targets + deliveryPolicies`，继续使用单文件原子写入、revision 和 last-known-good 回滚。
- `config/plan` 在落盘前完成结构校验、语义 diff、账号重连范围、resolver 变更、工作区变更和持久会话影响统计。
- `config/apply` 只接受未过期且 revision 匹配的 plan；daemon 拒绝应用时恢复旧配置。
- enabled 飞书账号必须提供 App ID / App Secret，enabled Octo 账号必须提供 Bot Token；平台 API URL 必须是 HTTP(S)。
- 密钥只允许位于账号 `credentials`，列表与普通配置读取保持脱敏；明文只经账号级 reveal API 返回。
- 高级 JSON 只承载尚未界面化的平台扩展字段，界面字段不再与 JSON 形成双重来源。

### 运行时投影

- 产品只持久化 v3 配置；旧版本配置、迁移器、兼容 API 和历史会话别名均已删除。
- daemon 的连接、路由选择、状态汇总、会话驱动和回复 replay 直接从 v3 资源构造短生命周期运行时映射；该映射不提供保存或编辑接口。

### 数据面

```text
平台事件
  -> 每账号一个连接
  -> IngressEnvelope 标准化
  -> 持久去重记录 + 账号队列
  -> DeliveryResolver
  -> 稳定会话身份
  -> 工作区级并发协调
  -> Agent turn
  -> Reply Outbox
  -> 原接收账号发送
```

- 飞书与 Octo 事件统一为 `IngressEnvelope`；去重优先使用账号与 event ID，缺失时回退 message ID + event type。
- 同一账号内的队列有界，不同账号可独立消费；同一真实工作目录默认只允许一个可写 turn，不同目录可并行。
- resolver 使用确定性特异性顺序：`peer + thread + sender`、`peer + thread`、精确 peer、peer kind、账号默认目标；同层冲突在保存时拒绝。
- 当前 turn 持有不可变解析快照；规则和 target 更新只影响后续事件，不取消进行中的 Agent 工作。
- 最终回复先写入 outbox，再经原账号发送；瞬时错误退避重试，永久错误进入 dead-letter，并在运行中心显示脱敏证据。

### 差量热重载

| 变更 | 动作 |
| --- | --- |
| 账号凭据、API URL、transport | 仅停止并重建该账号连接 |
| 默认目标、来源例外、访问或会话策略 | 原子刷新 resolver/runtime refs，不重连平台 |
| target 模型、权限、目录、治理 | 刷新后续 turn 使用的工作区快照，不重连平台 |
| 管理端口或 runtime 路径 | 返回 `restart-required`，不伪装成热重载 |

Octo 账号并行启动，单个慢账号不会阻塞其他账号进入状态树。飞书 group 保留独立锁、abort controller、client 与 watchdog 状态；差量 reload 只退役发生连接级变化的账号。

## 前端信息架构

顶层页面为：

1. **概览**：保存、连接、首条真实入站和异常分别显示。
2. **Agent 工作区**：管理可复用 target，显示关联账号和执行边界。
3. **渠道账号**：创建/编辑飞书与 Octo，设置默认工作区和来源例外。
4. **会话**：查看活动 driver、策略和显式重置动作。
5. **运行中心**：按账号显示连接、入站队列、去重、待恢复任务、Reply Outbox、dead-letter、热重载和日志。

顶层“绑定路由”已删除。来源例外位于账号编辑器内，普通创建流程无需理解 route 或 binding。

账号编辑细节：

- 飞书同时支持官方授权链接的本地二维码和手动填写；二维码生成不调用第三方服务。
- 密钥字段可显隐、真实回显和自由修改，不使用 `[redacted]` 作为可编辑占位值。
- 默认 API URL 是受控字段值，不依赖 placeholder，平台切换只重置平台拥有的字段。
- 保存前必须经过 plan 对话框，展示重连、分发、工作区和已有会话影响。
- 保存成功、连接成功与收到第一条真实消息是三个独立状态；飞书长连接在线不代表应用发布、事件订阅和机器人权限已经完成。
- Octo 私网附件 URL 默认关闭；开启时明确显示 SSRF 信任边界和允许域名。

## 安全边界

- 明文凭据不能进入列表、日志、toast、URL、target、policy 或来源规则。
- 配置、备份、会话、去重和 outbox 状态文件继续使用 `0600`；目录使用 `0700`。
- 来源规则只能收紧默认访问策略，不能扩大 allowlist 或撤销目标治理限制。
- target 删除、禁用或账号启用缺少默认目标时由服务端校验阻止。
- Reply Outbox 运行状态不返回回复正文、目标地址或凭据；dead-letter 只暴露账号、来源消息 ID、次数和错误摘要。

## 自动化验收

核心验证命令：

```bash
npm run typecheck:api
npm run typecheck:web
npm run build:api
npm run build:web
node --test tests/system/channel-connectors-v3-service.test.mjs
node --test tests/system/web-channel-connectors.test.mjs
node --test tests/system/channel-connectors-routing-v3.test.mjs
node --test tests/system/channel-connectors-account-connections-v3.test.mjs
node --test tests/system/channel-connectors-ingress-v3.test.mjs
node --test tests/system/channel-connectors-target-execution-v3.test.mjs
node --test tests/system/channel-connectors-reply-outbox-v3.test.mjs
node --test tests/system/channel-connectors-session-continuity-v3.test.mjs
```

浏览器验收覆盖桌面与移动端导航、飞书二维码、密钥显隐、无横向溢出和控制台无错误。

## 真实平台验收边界

自动化通过不等同于生产账号验收。发布前仍需使用授权测试账号完成：

- 飞书：应用创建、权限、机器人能力、`im.message.receive_v1`、版本发布、WebSocket、首条真实入站和回复。
- Octo：register、Wukong socket、首条真实入站、回复、附件与心跳。
- 多账号：修改 bot 2 凭据时 bot 1/bot 3 不重连，进行中的 turn 不被取消。
- 同工作区：两个账号并发消息按工作区队列串行，且回复分别从原账号发送。

生产账号的密钥、连接和正在执行的任务不能为了自动化验收被测试代码擅自修改或重启。

### 2026-07-10 实机切换证据

- 真实 daemon 已加载 3 个账号、2 个 Agent 工作区和 3 条账号策略；运行期映射由 v3 配置即时生成。
- 在 `activeRuns = 0`、`activeTurns = 0`、队列为空时完成受控重启；两个飞书账号与一个 Octo 账号均恢复 `connected`。本轮将清空历史会话状态，不以旧会话连续性作为产品约束。
- v3 应用后的两个飞书账号分别收到真实事件并完成 Agent turn，持久事件记录均为 `agentOk: true`、`replySent: true`、`replyDeliveryStatus: delivered`。
- Octo 当前 register/WuKong socket/REST heartbeat 正常；持久事件记录存在真实 `agent.run.finished` 且回复为 `delivered`。本次验收没有为制造新记录而主动向外部 Octo 会话发送消息。
- 完整服务测试前后，真实 systemd unit 的哈希、mtime 与真实 daemon reload 日志计数保持不变；测试配置的 supervisor 路径按其 `openclawRoot` 隔离，不再可能写入真实用户 unit。
