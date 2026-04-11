# Extension-Only 单口方案重分析

> 更新时间：2026-04-09
> 背景约束：`OpenClaw Studio` 必须**不修改宿主源码**；客户的 `OpenClaw` 会随时升级；单口方案必须建立在宿主**现有公开能力**上。

## 0.1 当前执行状态

截至本轮实现，已经落地：

1. 已删除 `registerWebSocketRoute` / `ws-ticket` 路线
2. Gateway runtime 已改为真实暴露 `gateway-rpc`
3. Terminal 已通过 `studio.terminal.*` 切到扩展侧 `gateway-rpc`
4. Terminal 前端已内置最小 `GatewayBrowserClient`，不依赖宿主私有 UI 文件
5. Chat 单口主线已改为 `Studio backend helper + HTTP/SSE`
6. `chat-v2` 在 Gateway 模式下已不再依赖浏览器直连 Gateway operator 会话
7. Chat 后端已提供 `/api/chat/sessions/:sessionKey/stream`
8. web dev 已固定走 `5176` 同源 API，不再并行探测 `:3760`
9. System 页已新增 `device trust` 管理能力
10. Chat backend bridge 遇到 `PAIRING_REQUIRED` 时已支持 helper 配对自愈
11. 已新增 helper token cache 漂移修复
12. Gateway / Browser 配置页已补齐到当前 OpenClaw 真实顶层配置

当前剩余主任务：

1. 收掉系统 Gateway 服务下的最终浏览器 smoke
2. 收敛正式客户口径和部署文档
3. 清理旧的 chat gateway-rpc 文案和残余死代码
4. 决定何时把 Gateway 单口从“预览模式”升为正式支持

本轮新增完成项：

1. Studio 后端 Gateway bridge 已兼容当前全局 `OpenClaw 2026.4.5`
   - one-shot request 与持久 bridge 都支持 `v2 / v3` 签名 fallback
2. 插件运行时不再依赖宿主注入的过时 Gateway 端口快照
   - 改为从 `~/.openclaw/openclaw.json` 读取实际 `gateway.port`
3. 已新增设备信任与 helper 自愈
   - `device-trust` 设置存储已落地
   - System 页面可查看 helper pairing / pending requests 并手工 approve
   - helper 遇到 `PAIRING_REQUIRED` 时可自动尝试修复
   - helper 的 `device-auth.json` token cache 若落后于 `paired.json`，Studio 现在会检测并支持同步修复
4. 已新增 Chat SSE stream 与 durability 保护
   - Gateway 模式下 Chat 前端通过 Studio SSE 接收实时事件
   - 刚发送立即刷新时，历史优先受 Studio durable mirror 保护
5. 已完成临时验收链路
   - 临时 Gateway `:31901` + 临时 Studio API `:3762`
   - `create -> send -> immediate history` 连续 5 轮通过
6. 已恢复系统 Gateway 服务重载能力
   - 已修正本机 `gateway.bind` 的旧别名配置
   - `openclaw gateway restart` 已恢复可用
   - 真实 `31879 -> /studio` 的 `create -> send -> immediate history` 连续 3 轮通过
7. 已完成配置页现实收口
   - Gateway 配置页已覆盖 `bind/customBindHost/controlUi/trustedProxies/tailscale/auth.mode`
   - Gateway 配置页已覆盖 `controlUi.enabled/basePath/root/dangerouslyDisableDeviceAuth`
   - Gateway 配置页已覆盖 `auth.trustedProxy/rateLimit.exemptLoopback/allowRealIpFallback`
   - Gateway 配置页已覆盖 `gateway.tools.allow|deny/webchat.chatHistoryMaxChars/channelHealthCheckMinutes`
   - Browser 配置页已覆盖 `enabled/evaluateEnabled/cdpUrl/remoteCdpTimeoutMs/remoteCdpHandshakeTimeoutMs/defaultProfile/attachOnly/cdpPortRangeStart/extraArgs/color/snapshotDefaults.mode/ssrfPolicy`
   - 已修正新环境空配置下 `browser.headless` 默认值，避免 Studio 保存时误写
   - 已修正插件加载路径为真实 `plugins.load.paths`
   - 已兼容旧字段 `browser.ssrfPolicy.allowPrivateNetwork`
8. 已完成聊天失败展示收口
   - 连续拼接的工具错误 JSON 会被解析成结构化 tool hints，而不是直接污染聊天正文
9. 已完成 bootstrap / 新环境引导
   - System 页面已新增“初始化与引导”
   - 可检测并补齐 `plugins.entries.studio / plugins.load.paths / gateway.auth / allowedOrigins / gateway.bind`
10. 已完成 helper metadata drift 诊断
   - 可直接识别 `claimedDeviceFamily=<none> pinnedDeviceFamily=server` 这类宿主内建 CLI/tool metadata 问题
   - 已明确与 Studio Chat/Terminal 主链路故障分层
11. 已补齐非单口模式下的 Chat realtime 降级保护
   - standalone 仍优先使用原生 `/ws/chat`
   - 若检测到连续 WebSocket 重连失败，会自动切到 Studio 同源 SSE
   - 这条回退不依赖宿主改动，适用于本机 `:3760` 模式的异常收敛
12. 已修复 Gateway 单口下的 Chat 资源 URL exposure 漂移
   - 资源卡片、Markdown 富媒体、下载链接不再固定写死根路径 `/api/...`
   - 前端现会根据运行时 exposure 自动补齐 `/studio/api/...` 或 `/api/...`
   - 本机绕过代理直测已确认：带 `/studio` 的单口资源路由命中 `401`，旧根路径命中 `404`
13. 已修复 System 页 bootstrap 首屏空白
   - 诊断数据未返回前，页面先使用默认骨架渲染
   - `health` 与 `diagnostics` 现在并行加载，避免等待深诊断时整页空白
14. 已修复频道配置 legacy 兼容漂移
   - `streaming=true|false` 现在会规范映射到 `partial|off`
   - `groupPolicy=allowall` 现在会规范映射到 `open`
   - `/channels` 前端已移除无效 streaming 枚举 `full`
15. 已补齐 Agent 配置高价值字段与保真编辑
   - 已补齐 `thinkingDefault / verboseDefault / reasoningDefault / fastModeDefault / identity.theme`
   - 已修复对象型 `agent.model` 在 Studio 保存时可能被误删的问题
   - 已新增高级字段编辑区，支持 `systemPromptOverride / skills / sandbox / tools / memorySearch / humanDelay / heartbeat / groupChat / subagents / params`
   - 已新增只读 `Raw Config Snapshot`，用于直接核对宿主原始 `agents.list[]`
   - `/agents` 页面浏览器验收已确认高级字段区与原始配置快照可见，且无新的 page error / console error
16. 已修复 Agents 页面旧数据兼容问题
   - 缺失 `editor.skills` 时不再触发前端 `join` 运行时错误
17. 已重构 Agents 配置页布局
   - 配置编辑已拆成 `Basics / Identity / Advanced / Runtime & Safety` 二级导航
18. 已继续补齐 Config 页的全局 Agent 默认值
   - 已新增 `verboseDefault / systemPromptOverride / skills`
19. 已继续补齐 Config 页的默认行为字段
   - 已新增 `contextInjection / userTimezone / timeFormat / typingMode / mediaMaxMb`
   - 已新增 `memorySearch / humanDelay / heartbeat / params` JSON 编辑
   - 已新增 `agents.defaults.subagents.model / thinking / runTimeoutSeconds`
20. 已修复 Config 页新增字段的选择器与说明文案
   - 标题现支持中英文切换
   - 下拉不再渲染原始 option JSON
   - 新增字段已补齐“作用 / 如何配置”提示
21. 已继续补齐 Config 页 `agents.defaults` 的高级默认行为字段
   - 已新增 `bootstrapPromptTruncationWarning`
   - 已新增 `envelopeTimezone / envelopeTimestamp / envelopeElapsed`
   - 已新增 `contextTokens`
   - 已新增 `elevatedDefault`
   - 已新增 `blockStreamingDefault / blockStreamingBreak`
   - 已新增 `imageMaxDimensionPx / typingIntervalSeconds`
   - 已新增 `pdfMaxBytesMb / pdfMaxPages`
22. 已修复 Config 保存时可选默认值无法真正清空的问题
   - 现在清空输入或恢复未设置，会删除宿主配置里的旧覆盖值，而不是残留历史值
23. Config 模型页浏览器回归已通过
   - 已确认 English / 中文切换后标题都正常
   - 已确认新增下拉可正常打开
   - 已确认页面不再渲染原始 option JSON
24. Browser 配置页已补齐 `browser.profiles` 编辑
   - 已支持 `id / driver / attachOnly / cdpPort / cdpUrl / userDataDir / color`
   - 已支持新增 / 删除 profile
   - 已支持保存时清空整个 profiles 集合
25. Browser 配置页浏览器回归已通过
   - 已确认新增 Profile 表单可见
   - 已确认中英文切换正常
   - 已确认未出现新的 page error / console error
26. 官网安装页与一键安装脚本已收口
   - `index.html` 已区分“非单口 / 单口”两套安装指引
   - 已新增 `install-openclaw-studio.sh`
   - 脚本已支持 `--mode standalone|gateway`
   - Prompt 已改成“先下载脚本到本地，再检查并执行”，不再使用 `curl | bash`
   - 已覆盖版本检查、下载安装、配置写入、`gateway install --force`、重启与健康检查
27. 已修复发布包入口元数据与旧包自愈
   - `pack.sh` 现在会把发布包 `package.json` 的 `openclaw.extensions` 重写为 `./dist/index.js`
   - 安装脚本落盘后会再次修正旧发布包的入口元数据
   - 已解决宿主启动时 `plugins.entries.studio: plugin not found: studio` 的安装失败
28. 已继续补齐 Channels 配置说明
   - Provider / Account / Access / Binding 关键字段已新增“作用 / 如何配置”提示
29. 已修复安装器旧目录残留与 service 降级处理
   - 旧版本不再留在扩展根目录下的 `.prev/.bak/.old`
   - 现在统一迁移到 `~/.openclaw/backups/openclaw-studio/`
   - 已解决宿主扫描旧副本时出现 `duplicate plugin id detected`
   - `openclaw gateway install --force` 失败时会降级告警并继续尝试重启现有 Gateway
30. 已继续补齐 Plugins / Session / Logging 配置页说明
   - 这些子页的关键字段已补齐“作用 / 如何配置”提示
31. 已继续补齐 Plugins 配置页真实字段
   - 已支持 `plugins.enabled`
   - 已支持 `plugins.deny`
   - 已支持 `plugins.slots.memory / plugins.slots.contextEngine`
   - 已新增 `plugins.installs` 只读追踪视图
32. ACP / Commands & Hooks 配置页已继续补齐说明
   - 关键字段已补齐“作用 / 如何配置”提示
33. 已继续补齐 `/channels` 的高级宿主字段
   - Provider 现支持编辑 `dm / groups / guilds / execApprovals` JSON
   - Account 现支持编辑 `dm / groups / guilds / execApprovals` JSON
   - 已补齐系统回归，确认 summary 读取与保存回写都稳定
34. 已修复旧浏览器下的 Terminal Gateway connect 兼容问题
   - 前端不再硬依赖 `crypto.randomUUID`
   - `GatewayBrowserClient` 与配置页动态列表均已改为兼容 UUID 生成器
35. 已补齐无 Docker 设备的沙盒自愈闭环
   - Config 保存时：若全局沙盒已设置 `off` 且设备无 Docker，会把仍依赖 Docker 的 Agent 沙盒自动收敛到 `off`
   - System bootstrap repair：新增 `sandbox runtime` 检查并自动修复 Docker-backed 配置
   - 安装脚本：新设备安装阶段会自动检测 Docker，不可用时直接落盘 `sandbox.mode=off` 收敛策略
36. 已补齐默认 Agent 无 `agents.list` 场景
   - `/agents` 与 `/channels` 在宿主未显式配置 `agents.list` 时，会回退暴露 `main` 默认 Agent
   - 默认 Agent 编辑时支持 materialize 到 `agents.list`，避免“空列表导致无法管理默认 Agent”
37. 已修复配置保存触发宿主 schema 校验失败
   - `models.providers.*` 现在会强制落盘 `baseUrl`（非空字符串）和 `models`（数组）
   - 缺失配置的 provider 会自动补默认占位 `baseUrl`
   - `session.reset.idleMinutes` 现在强制为正整数，避免 `Too small: expected number to be >0`

## 0. 单口定义

这里说的“单口模式”是：

1. **外网**只开放 `OpenClaw` 那一个端口
2. **内网 / 本机回环**不受这个限制
3. `127.0.0.1:3760` 可以继续存在
4. 目标是让外部用户通过单一开放端口，获得**功能上接近直接访问 3760** 的体验

这不等于：

1. 外部浏览器直接访问服务器回环 `3760`
2. 必须彻底关掉内部 `3760`

正确理解应该是：

1. 外部入口统一收敛到 `OpenClaw` Gateway
2. Studio 的页面、HTTP、realtime 都通过这个外部入口工作
3. 内部是否保留 `3760`，是实现和回退策略问题，不是外部口径问题

## 1. 结论先行

当前最合理的正式方向不是：

1. 改宿主补 `registerWebSocketRoute`
2. 也不是把整个 Studio 改成 `HTTP + SSE`

而是：

1. 页面和 HTTP API 继续走插件 `registerHttpRoute()` 挂到 `/studio`
2. Terminal realtime 继续复用宿主**现有** Gateway WebSocket 协议
3. Chat 在单口下改为 Studio 后端 helper 桥接，前端走同源 HTTP/SSE
4. 插件侧只使用宿主现有公开能力，不要求新宿主接口

即：

**HTTP 走 `/studio/api/*`**

**Terminal realtime 走宿主已有 Gateway WS `req/res + event`**

**Chat realtime 走 Studio 同源 SSE，写入走 Studio 后端 helper**

但需要补充一个关键实现细节：

1. 浏览器不再作为 Gateway operator 设备直接承担 Chat 写权限
2. 单口下：
   - 读侧：Studio 扩展负责历史快照、SSE 流和投影
   - 写侧：Studio 后端 helper 统一桥接 Gateway `chat.send` / `chat.abort`
   - 信任侧：helper 的 pairing / approve 由 Studio 自己管理和自愈

这是当前更稳的扩展-only 落地形态，因为：

1. 客户外部浏览器不再需要各自完成 Gateway device pairing
2. 设备信任收敛成“只管理 Studio 本机 helper”
3. Chat 的 reload / durability 可以由 Studio 本地 mirror 直接兜底
4. Terminal 仍保留更适合实时交互的 Gateway WS 模型

这条路完全属于扩展实现，不需要宿主打新接口。

补充：

1. 新环境首次安装时，不再要求用户先手工把本机配置修到和开发机一致
2. Studio 会先做最低可用 bootstrap，再由 System 页提供进一步引导

补充说明：

1. 之前单口失败的根因并不在 `gateway-rpc` 思路本身
2. 实际卡点是“宿主版本升级后，浏览器握手、后端 bridge 握手、插件运行时端口来源”三处兼容性
3. 这三处现在都已经收口到扩展侧

## 2. 为什么之前会走偏

前一条路线默认把“浏览器到插件 realtime”理解成只能有两种：

1. `/studio/ws/chat`
2. `/studio/ws/terminal`

于是得出“要补插件级 WS route”的结论。

但当前宿主其实已经有第三种能力：

1. 插件 `registerGatewayMethod()`
2. 宿主 Gateway WS 的 `req/res`
3. 宿主已有 `event` 广播/定向推送

也就是说，**插件不一定要拥有自己的 WebSocket 路由，仍然可以借宿主主连接做 realtime。**

## 3.6 对 `pairing required` 的最终拆解

当前已经明确有两类来源：

1. **Studio helper 自己的 token cache / pairing 漂移**
   - Studio 已可检测和修复
2. **宿主内建 CLI / tool 的 metadata pinning 漂移**
   - 常见表现：
     - `metadata-upgrade`
     - `claimedDeviceFamily=<none>`
     - `pinnedDeviceFamily=server`
   - 这类问题说明宿主内建 `callGateway()` 分支未携带完整 metadata
   - 在“不改宿主源码”的约束下，Studio 只能做到诊断、引导、规避，不应假装自己能彻底修掉宿主内建工具链

## 3. 当前代码里已经证明了什么

### 3.1 Gateway 挂页面和 HTTP API 已经成立

`studio` 现在已经通过 `registerHttpRoute()` 把页面和 HTTP API 挂到 Gateway：

- [index.ts](/home/binbin/.openclaw/extensions/openclaw-studio/index.ts)

### 3.2 前端已经预留了非 raw-ws transport 位

`StudioRealtimeTransportKind` 不是只有 `raw-ws`，还包括：

- `gateway-rpc`

见：

- [types/api.ts](/home/binbin/.openclaw/extensions/openclaw-studio/types/api.ts)
- [runtime-config.ts](/home/binbin/.openclaw/extensions/openclaw-studio/apps/web-vue/src/shared/runtime-config.ts)

这说明前端 transport 设计本来就允许“通过宿主 Gateway 协议做 realtime”。

### 3.3 前端已经具备 Gateway 鉴权上下文读取能力

`shared/api.ts` 已经会从浏览器存储里读取 Gateway token / password 作用域：

- [api.ts](/home/binbin/.openclaw/extensions/openclaw-studio/apps/web-vue/src/shared/api.ts)

这意味着 Studio 页面本来就准备在 Gateway 作用域下工作，不是只能吃独立 3760。

### 3.4 Chat 后端已经是“Gateway -> Studio BFF -> 前端 WS”模型

`chat` 当前不是直接浏览器打 Gateway，而是：

1. Studio 后端用 Node WebSocket 连 Gateway
2. 后端再把事件投递给前端 `/ws/chat`

见：

- [service.ts](/home/binbin/.openclaw/extensions/openclaw-studio/apps/api/modules/chat/service.ts)

所以真正要改的不是 chat 业务本身，而是**前端接收层**。

本轮之后，这个判断已经进一步收敛为：

1. **前端接收层**继续走 Studio 扩展侧 `gateway-rpc`
2. **前端写入层**在单口模式下直接使用核心 Gateway `chat.send` / `chat.abort`
3. Studio 后端不再承担单口模式下 chat 写请求的最终授权责任

### 3.5 Terminal 目前只差“实时 IO 通道”

`terminal` 已经有：

1. `status`
2. `launch`
3. `end`
4. `install/stream`

这些都走 HTTP。

当前只有：

1. `input`
2. `resize`
3. `output`
4. `session/reset/ping`

仍绑在 `/ws/terminal`。

见：

- [routes.ts](/home/binbin/.openclaw/extensions/openclaw-studio/apps/api/modules/terminal/routes.ts)
- [service.ts](/home/binbin/.openclaw/extensions/openclaw-studio/apps/api/modules/terminal/service.ts)
- [TerminalConsolePage.vue](/home/binbin/.openclaw/extensions/openclaw-studio/apps/web-vue/src/features/terminal/TerminalConsolePage.vue)

## 4. 对“以前 terminal 能用”的重新解释

“以前 terminal 不改宿主也能用”这句话，大概率成立于下面两种路径之一：

1. 页面本来就直接访问 `standalone :3760`
2. 页面虽然有路径前缀，但外部代理最终还是把页面/API/WS 全转到 `3760`

它并不能等价推出：

1. 当前 OpenClaw Gateway 单口
2. 现有插件能力
3. 不改宿主
4. 仍然天然支持 `/studio/ws/terminal`

当前代码也明确证明：

1. 页面和 HTTP API 已能挂到 Gateway
2. 但插件自有 WS route 并不存在
3. 所以“旧 terminal 能用”和“当前 Gateway-native 单口能用”不是同一个命题

## 5. 扩展-only 可选方案

### 方案 A：混合模式，页面走 `/studio`，API/WS 回退到 `HOST:3760`

优点：

1. 改动最小
2. 当前前端已经会探测 `HOST:3760`

缺点：

1. 客户只有一个外部端口时不可依赖
2. WebSocket 目前并不会自动切到绝对 `3760`
3. 本质上还是要求客户能访问 3760

结论：

只能算兼容 fallback，不是目标方案。

### 方案 B：全量 `HTTP + SSE`

优点：

1. 完全不依赖浏览器 Gateway WS 协议
2. 只用插件 HTTP route 就能做

缺点：

1. `chat` 还能接受
2. `terminal` 高频输入/resize 用 HTTP 很别扭
3. 终端交互质量会明显下降

结论：

可作为保底 fallback，不建议作为最终正式方案。

### 方案 C：扩展-only `gateway-rpc` realtime

做法：

1. 页面和 HTTP API 继续走 `/studio`
2. 前端额外建立一个到宿主 Gateway 根 WS 的连接
3. 通过插件 `registerGatewayMethod()` 暴露 Studio realtime 能力
4. 通过宿主已有 `event` 机制给浏览器定向推送

优点：

1. 不改宿主
2. 不需要客户开放 3760
3. 保留单口
4. `terminal` 仍是双向 WS 语义
5. `chat` 写权限可以直接复用浏览器当前 Gateway 会话
6. 避免 Studio 后端本机 bridge 被 `device-auth.json` 配对状态卡住
5. `chat` / `terminal` 都能继续保持实时体验

缺点：

1. 要在 Studio 前端补一个内置 Gateway 客户端
2. 要把现有 `/ws/chat`、`/ws/terminal` 的后端 fanout 抽象成 transport-neutral broadcaster

结论：

**这是当前推荐正式方向。**

## 5.1 方案排序

按“当前可落地 + 长期稳定 + 后续可维护”综合排序：

### 现阶段最优

1. **扩展-only `gateway-rpc` realtime**

原因：

1. 不改宿主
2. 外网继续单口
3. 兼容客户未来升级
4. `chat` / `terminal` 都还能保留实时语义

### 现阶段最稳 fallback

1. **`standalone :3760` + 客户自有外部反代**

原因：

1. 今天就最稳
2. 功能完整
3. 风险最低

限制：

1. 客户必须能自己做入口转发

### 不建议作为最终正式方案

1. **全量 `HTTP + SSE`**
2. **修改宿主源码补新接口**
3. **要求外部直接访问 3760**

原因：

1. `terminal` 不适合纯 `HTTP + SSE`
2. 私有宿主补丁不可持续
3. 外部直接访问 3760 不符合单口目标

## 6. 推荐实现

### 6.1 前端

新增一个 Studio 自己的轻量 `GatewayBrowserClient`：

1. 参考宿主现有实现，但不要直接依赖宿主源码路径
2. 放进 Studio 自己代码仓
3. 支持：
   - `connect.challenge`
   - `connect`
   - `req/res`
   - `event`
   - 自动重连
   - gap 检测

鉴权来源：

1. 继续复用 `shared/api.ts` 已有的 Gateway token 读取逻辑
2. 如运行环境允许，补浏览器 device identity / device token 流程
3. 不要把前端绑定到宿主私有 UI 文件路径

### 6.2 Terminal

后端新增 Gateway 方法：

1. `studio.terminal.attach`
2. `studio.terminal.input`
3. `studio.terminal.resize`
4. `studio.terminal.ping`
5. `studio.terminal.detach`

后端定向事件：

1. `studio.terminal.session`
2. `studio.terminal.reset`
3. `studio.terminal.output`
4. `studio.terminal.error`

实现建议：

1. 把 terminal 当前基于 `WebSocket` 的 client 集合抽象成“通用 sink”
2. raw-ws 和 gateway-rpc 都复用同一套 session/backlog/outputSeq 逻辑
3. 由于插件没有可靠的 conn close hook，gateway-rpc 订阅要用 heartbeat lease + TTL 清理

### 6.3 Chat

后端新增 Gateway 方法：

1. `studio.chat.subscribe`
2. `studio.chat.unsubscribe`
3. `studio.chat.ack`
4. 如需要，再补 `studio.chat.send` / `abort` / `reset`

后端定向事件：

1. `studio.chat.runtime`
2. `studio.chat.snapshot`
3. `studio.chat.message`
4. `studio.chat.run_overlay`
5. `studio.chat.error`

实现建议：

1. 不重写 chat 业务核心
2. 继续保留当前 HTTP BFF：
   - history
   - organizer
   - upload
   - create / patch / delete
3. 只把“前端 live 订阅层”从 `/ws/chat` 改成 `gateway-rpc`
4. 把 `frontendSubscribers: Map<string, Set<WebSocket>>` 抽象成统一 subscriber registry

### 6.4 运行时配置

在 gateway 模式下，把 runtime transport 改成：

1. `realtimeTransport: 'gateway-rpc'`
2. `chatRealtime: true`
3. `terminalRealtime: true`

这一步不依赖宿主新增接口。

## 7. Hook 在这条路线里的位置

Hook 仍然有价值，但不是 transport 主体。

当前保留价值：

1. `before_prompt_build`
2. `before_tool_call`

它们用于 Studio chat 的投递/约束，不用于解决浏览器单口 realtime。

因此：

1. hook 可以继续保留
2. 但不要把 hook 当成“terminal 单口传输”的解法

## 8. 风险与边界

### 主要风险

1. 需要把当前 ws fanout 逻辑抽象干净
2. 前端 Gateway 客户端要处理鉴权、重连、seq gap
3. gateway-rpc 订阅需要租约清理，不能假设宿主会给插件断线通知

### 明显收益

1. 不再依赖私有宿主补丁
2. 客户升级 OpenClaw 不会把 Studio 打回不可用
3. 单口、全功能、扩展-only 三个目标第一次真正一致

## 8.1 所谓“更好、更稳定、更完美”的方案判断

如果从**以后长期使用**看，最接近“完美方案”的不是宿主补丁，而是：

1. Studio 对外统一走 `OpenClaw` Gateway
2. 插件只依赖宿主公开稳定能力：
   - `registerHttpRoute()`
   - `registerGatewayMethod()`
   - 宿主 Gateway WS `req/res + event`
3. `standalone :3760` 只保留为：
   - 本机调试入口
   - 灰度回退入口
   - 内网维护入口

这条路线的长期好处是：

1. 外部部署模型统一
2. 升级宿主时不需要重新打补丁
3. Studio 自己可以独立演进 transport
4. 将来就算宿主内部实现变化，只要公开 Gateway 协议不破，Studio 就能继续工作

所以结论是：

1. **最稳的今天**：`standalone :3760`
2. **最好的长期方案**：扩展-only `gateway-rpc` 单口
3. **不要再投入的方案**：宿主私有改造

## 9. 下一步执行顺序

1. 停止继续宿主源码改造路线
2. 补 `chat` / `terminal` 单口 transport 的浏览器回归
3. 验证断线重连、session 切换、abort/reset、tool-event 链路
4. 最后更新：
   - `DEPLOY.md`
   - `docs/反向代理部署指南.md`
   - `docs/当前进展.md`

## 10. 新对话续接提示

新对话可以直接从这句开始：

> 继续按 `docs/2026-04-08-extension-only-single-port-plan.md` 执行，不改宿主源码，基于扩展-only 的 `gateway-rpc` 单口方案继续做回归验证和交付收口。

## 11. 2026-04-09 执行增量

本轮已落地四项与“扩展-only、客户环境自适应”直接相关的增强：

1. 安装脚本自愈增强（不改宿主源码）
   - 自动清理 Studio 的陈旧插件路径和旧安装记录（含 `.prev/.bak/.old`）。
   - 无用户级 service 管理器时自动降级为后台启动 `openclaw gateway run --force`。
   - 写配置后自动校验并尝试 `doctor --repair`，失败回滚备份，降低“配置写坏导致宿主不可用”风险。
   - 2026-04-09 继续增强：
     - 默认优先解析站点最新版本和安装包地址。
     - 安装失败时自动回滚旧版 Studio 安装与 `openclaw.json` 备份。
     - 未显式指定时保留已有合法 `gateway.bind`，避免覆盖客户现场已有网络策略。

2. Channels 字段继续对齐 `OpenClaw 2026.4.8`
   - Provider/Account 新增并贯通：
     - `contextVisibility`
     - `responsePrefix`
     - `configWrites`
     - `healthMonitor.enabled`
   - 已补对应系统回归测试，覆盖 summary 映射与保存写回。

3. Dashboard 已切到真实后端摘要
   - 新增 transport / release / bootstrap / device trust / runtime CLI 汇总。
   - 页面可直接判断当前是单口还是非单口、升级是否运行中、bootstrap 是否仍有错误、以及本地 helper 是否待配对。

4. 版本链路和移动端兼容继续收口
   - workspace 版本已与根包统一，前端版本角标会回退到构建注入版本，不再显示 `v--`。
   - `pack.sh` 新增站点版本清单输出，供 `studio.90le.cn` 升级检测使用。
   - chat mobile header / composer / preview modal / markdown table 已做进一步压缩与防溢出。
