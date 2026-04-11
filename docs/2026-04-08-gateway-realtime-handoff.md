# Gateway Realtime Handoff

> 更新时间：2026-04-08

## 状态

这份 handoff 只保留为**废弃路线说明**。

之前尝试过的路线是：

1. 修改 `OpenClaw` 宿主源码
2. 补插件级 `registerWebSocketRoute`
3. 让插件直接接管 `/studio/ws/*`

这条路线现在已经停止，不再继续执行。

## 停止原因

1. 客户会随时升级全局 `OpenClaw`
2. Studio 不能依赖私有宿主补丁
3. 单口方案必须建立在宿主现有公开能力上

## 当前唯一有效方向

请改看：

[2026-04-08-extension-only-single-port-plan.md](/home/binbin/.openclaw/extensions/openclaw-studio/docs/2026-04-08-extension-only-single-port-plan.md)

当前项目已明确收口为：

1. 不修改宿主源码
2. 页面和 HTTP API 继续走 `/studio/*`
3. Terminal realtime 继续复用宿主现有 Gateway WS `req/res + event`
4. Chat 单口收口为 `Studio backend helper + HTTP/SSE`
5. Studio 自己管理 helper 的 pairing / approve，不再要求外部浏览器直接成为 Gateway operator 设备
6. 当前剩余工作是系统 Gateway 重载后的浏览器回归验证和交付口径收口

## 续聊提示

新对话直接从这句开始：

> 继续按 `docs/2026-04-08-extension-only-single-port-plan.md` 执行，不改宿主源码，按扩展-only 的 `gateway-rpc` 单口方案推进。
>
> Terminal 保持 `gateway-rpc`，Chat 按 helper + SSE 方向继续收尾，并同步维护 device-trust 文档与验收记录。
