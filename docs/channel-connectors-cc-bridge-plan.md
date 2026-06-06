# Channel Connectors / CC Bridge 方案确认稿

> 状态：待用户确认，确认前不实现
> 更新：2026-06-06
> 参考源：`release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`

## 1. 结论草案

短期不重写 IM 协议栈。先把 cc-connect 作为 **Studio 托管的 CC Bridge daemon** 运行起来：

```text
Octo(dmwork) / 飞书 / 微信 / IM
  -> CC Bridge daemon (managed cc-connect)
  -> local agent CLI (Codex / Claude Code / OpenCode)
  -> Studio Gateway daemon
  -> upstream provider
```

关键前提：

- CC Bridge 是独立守护进程，不属于 Studio Gateway，也不放进 App Connections。
- Studio / OpenClaw 崩溃时，CC Bridge 仍继续运行。
- CC Bridge 运行期不依赖 Studio API；Studio 只负责配置、安装、启停、日志和可视化管理。
- Agent CLI 使用 Studio Gateway daemon endpoint 和本地 Gateway key；真实 upstream key 仍留在 Studio Gateway secret store。

## 2. 为什么先托管 cc-connect

release 副本里的 cc-connect 已经具备：

- 多平台：`dmwork`(Octo)、飞书、企业微信、微信个人号、钉钉、Telegram、Slack、Discord、QQ 等。
- 多 Agent：Codex、Claude Code、OpenCode、Gemini、Kimi、ACP 等。
- 平台能力：文本、图片、文件、流式预览、群聊、mention、allowlist、rate limit。
- 运行能力：daemon install/start/stop/restart/status/logs，Linux systemd user、macOS launchd、Windows task/service。
- 管理接口：Unix socket API、Management API、Bridge WebSocket、hooks、relay。
- Octo(dmwork) 细节：WuKongIM WebSocket、REST 注册、COS 文件上传、群成员 mention 解析、session key 重建。

所以第一阶段应复用成熟协议栈，避免重新实现 IM WebSocket、文件上传、mention、ack/retry 和平台限制。

## 3. 源码与产物策略

建议采用“托管 fork + 小补丁层”，不是恢复旧 Codex Stack 路径。

- 新路径：`resources/channel-connectors/cc-connect-source` 或等价新资源路径。
- 不使用：`resources/codex-stack/**` 作为生产路径。
- 初期只做必要补丁：
  - service name 与数据目录改为 Studio 管理域，避免覆盖用户自己的 `cc-connect.service`。
  - config 生成指向 Studio Gateway endpoint/key。
  - 可选加入 Studio 管理 API 所需的健康检查和状态输出。
- 不修改平台协议实现，尤其不重写 `platform/dmwork`。
- 后续如果上游 cc-connect 可直接满足需求，优先同步上游而不是扩大 fork。

## 4. 守护进程方案

Studio 管理自己的 service，不直接占用用户全局 `cc-connect.service`：

- Linux: `openclaw-studio-cc-bridge.service` under `systemd --user`
- macOS: `openclaw-studio-cc-bridge` LaunchAgent
- Windows: `openclaw-studio-cc-bridge` scheduled task/service

建议路径：

- config: `~/.openclaw/studio/channel-connectors/cc-bridge/config.toml`
- state: `~/.openclaw/studio/channel-connectors/cc-bridge/state`
- logs: `~/.openclaw/studio/channel-connectors/cc-bridge/logs/cc-bridge.log`
- runtime: `~/.openclaw/studio/channel-connectors/cc-bridge/runtime.json`

必需能力：

- install / reinstall / enable auto-start
- start / stop / restart / status / logs
- ensure-running：必须等 CC Bridge 管理接口或健康检查 ready 后才算成功
- Studio / OpenClaw 进程退出后，CC Bridge 和 Studio Gateway daemon 均保持在线

## 5. Studio 管理面范围

新建独立 **Channel Connectors** 管理面，不塞进 Studio Gateway 页面。

推荐 tabs：

- Runtime：CC Bridge 状态、安装/启用、启动/停止/重启、日志、健康。
- Projects：项目目录、默认 Agent、默认模型、权限模式、工作目录、App profile。
- Platforms：Octo(dmwork)、飞书、微信/企业微信等平台账号配置、allowlist、连接测试。
- Sessions：当前 IM 会话、session key、绑定项目、最近消息、手动发送测试。
- Advanced：cc-connect 原生配置预览、导入/导出、hook/relay/cron 等低频能力。

UI 原则：

- 不复制 cc-connect Web UI 的全部复杂度。
- 普通用户先看到“运行状态、平台账号、项目绑定、测试消息”。
- `relay`、hooks、cron、speech/TTS、run_as_user 放进高级区。

## 6. 配置生成策略

Studio 生成 cc-connect config，而不是让用户手写完整 TOML。

核心映射：

- Studio Gateway endpoint -> cc-connect provider / agent 环境
- Gateway client key -> cc-connect secret/env
- App profile model -> cc-connect project model
- Project workdir -> cc-connect `[[projects]]`
- Platform credentials -> `[[projects.platforms]]`

用户仍可进入高级配置查看原生 TOML preview，但默认不直接编辑。

## 7. 与 Studio Gateway 的关系

两者是并列 daemon：

```text
CC Bridge daemon -> agent CLI -> Studio Gateway daemon -> upstream
```

不是：

```text
CC Bridge -> Studio API -> Studio Gateway
```

原因：

- 用户明确要求 Studio / OpenClaw 崩溃时仍能通过 IM 与 Codex/Claude 对话。
- 如果 CC Bridge 运行期依赖 Studio API，则 Studio 崩溃会切断 IM 链路。
- Studio Gateway daemon 已经是独立模型 relay，适合作为 agent CLI 的稳定 endpoint。

后续 native Channel Connectors 可以在 Studio 在线时进入 Studio Chat / Agent，但必须保留 daemon 直连 fallback。

## 8. 分阶段计划

| 阶段 | 目标 |
| --- | --- |
| F0 | 方案确认：确定守护边界、源码策略、首批平台和 UI 范围 |
| F1 | 引入 Studio-managed CC Bridge service/config/status/logs，不接真实平台 |
| F2 | 生成最小 cc-connect config：单项目 + Codex/Claude/OpenCode agent + Studio Gateway provider |
| F3 | 接入 Octo(dmwork) 配置和连接测试，完成文本往返 smoke |
| F4 | 补图片/文件、mention、群聊 session key、allowlist、rate limit |
| F5 | 加飞书、微信/企业微信等平台；开始抽象 Studio Channel Connector contract |
| F6 | 逐步 native 化优先平台，减少对 cc-connect fork 的依赖 |

## 9. 验收标准

最低验收：

- Studio 能安装、启用自启动、启动、停止、重启 CC Bridge。
- CC Bridge active 且健康检查 ready。
- Studio API / Studio UI 停止后，CC Bridge 仍 active。
- OpenClaw 停止或单口 gateway 不可用时，CC Bridge 仍能调用 local agent CLI。
- local agent CLI 通过 Studio Gateway daemon 完成一次 Codex 或 Claude 对话。
- Octo(dmwork) 文本消息可进入 agent，并将回复发回原会话。
- 日志可从 Studio 查看，敏感 token 脱敏。
- 停止 CC Bridge 不影响 Studio Gateway daemon。

增强验收：

- 群聊 mention 正确解析和回传。
- 图片/文件收发通过。
- allowlist 和 rate limit 生效。
- CC Bridge service 重启后能恢复会话和 reply context。
- 崩溃后由 OS/user supervisor 自动拉起。

## 10. 待确认点

建议默认选择：

1. 首批平台：先 Octo(dmwork)，再飞书，微信/企业微信后置。
2. 首批 Agent：Codex + Claude Code；OpenCode 跟随 App Connections 已有配置。
3. Runtime 链路：CC Bridge 运行期直接调用本地 Agent CLI，Agent CLI 走 Studio Gateway daemon；不依赖 Studio API。
4. 源码策略：把 release 副本迁移到新的 `channel-connectors` 资源路径，作为托管 fork，小补丁层维护。
5. UI 范围：先做 Runtime / Projects / Platforms / Sessions 四块，Advanced 后置折叠。

确认后才能开始 F1 实现。
