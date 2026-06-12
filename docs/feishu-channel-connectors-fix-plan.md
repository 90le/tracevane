# Studio 飞书渠道稳定性修复归档

> 状态：2026-06-10 9 项修复已实施；后续问题统一记录到 `feishu-long-connection-issue-tracker.md`
> 更新：2026-06-12
> 范围：`apps/api/modules/channel-connectors/daemon.ts`、`apps/api/modules/channel-connectors/feishu-transport.ts`

## 1. 定位

本文档是外部分析方案和当日实现结果的归档，不再作为当前唯一实施依据。当前 Feishu 长连接事实、复现、修复方向和验证清单以 `feishu-long-connection-issue-tracker.md` 为准。

## 2. 已实施修复

| 编号 | 目标 | 当前结论 |
| --- | --- | --- |
| 1 | `writeRuntime` 异步去抖 | 已实施；高频 runtime 写入不再同步阻塞事件处理 |
| 2 | `writeJsonLine` 批量追加与日志轮转 | 已实施；启动回填改为尾部读取，避免大文件全量读 |
| 3 | `/health` 真实健康检查 | 已实施；健康不只看进程存在 |
| 4 | shutdown 强制退出超时 | 已实施；避免退出卡死 |
| 5 | 消息队列超时 | 已实施；排队超时可记录和回调 |
| 6 | 飞书启动失败重试 | 已实施；启动失败进入重试而不是静默停摆 |
| 7 | tenant token 内存缓存 | 已实施；减少重复 token IO/请求 |
| 8 | `sendOctoTyping` rejection 捕获 | 已实施；typing 失败不带崩主流程 |
| 9 | 管理端口认证 | 已实施；本地管理 API 有 token 边界 |

## 3. 后续修正

9 项修复改善了 IO 阻塞和 daemon 稳定性，但没有单独解决“飞书长连接假在线”。后续 live 证据证明核心问题是 WS owner false-ready / ping-pong 健康判断不足，因此已继续补：

- 单 App 本机 owner lock。
- 官方 SDK `WSClient` + `EventDispatcher` owner cycle。
- lower-case `wsConfig.pingTimeout`。
- ping interval clamp。
- pong overdue / transport stale 健康门禁。
- SDK terminal state / reconnecting 超时外层重建。
- 事件 handler 快速 ACK，业务后台化。
- Feishu `create_time` 水位线跳过补投旧消息。

## 4. 验证口径

任何声称 Feishu 稳定性完成的修改，必须至少验证：

- `npm run typecheck:api`
- `npm run build:api`
- `node --test tests/system/channel-connectors-service.test.mjs`
- Channel daemon 重启后 Feishu 私聊消息可立即进入 Agent 并回复。
- runtime/health 中 Feishu 连接状态、ping/pong、transport stale、dispatcher callback 与实际官方工具状态一致。

## 5. 回滚口径

若后续需要回滚此批修复，优先按独立改动回滚，不要整块恢复旧 daemon：

1. runtime/log 异步写入。
2. health 真实状态。
3. shutdown 超时。
4. queue timeout。
5. Feishu startup retry。
6. token cache。
7. typing rejection 捕获。
8. 管理端口认证。
