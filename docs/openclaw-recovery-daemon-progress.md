# OpenClaw 自愈守护进程进度

> 状态：核心实现已完成；本轮完成配置漂移自愈加固；等待目标 OS smoke
> 更新：2026-06-18
> 文档规则：只保留当前状态、验证和下一步；过期细节看 git。

## 当前状态

- 独立 recovery daemon 入口、模块、状态文件、事件 jsonl、备份目录、repair lock 已实现。
- `/api/openclaw-recovery/*` 管理 API 已接入。
- daemon 健康循环使用轻量 loopback probe，持续失败超过策略阈值后才进入修复。
- 本机 loopback fallback 控制面提供 status、events、backups、manual run、backup restore，并使用本地 token。
- `/system` 已改成轻量概览。
- `/system/recovery` 已提供 daemon service、轻量探测、手动修复、事件和备份。
- 修复管线已覆盖配置 prune、插件隔离、旧 install record 清理、CLI manifest/shim/npm 重装、gateway 深探测、gateway service 托管修复、残留进程安全接管和失败回滚。
- 低优先级附带能力：当 OpenClaw Gateway 能启动但 Studio 插件 `/studio` 控制面的前端静态资源缺失时，可受控检查/重建 Studio web bundle；这只用于保证 OpenClaw 托管 Studio UI 可打开，不属于 OpenClaw 本体配置修复。
- 本轮补齐 OpenClaw `2026.6.8` 后发现的配置漂移修复：Gateway auth 会迁移到 `OPENCLAW_GATEWAY_TOKEN` env SecretRef，并同步 `.openclaw/.env` 与 `gateway.systemd.env`；重复的 `studio-local` `gatewayAuthToken` 会删除，避免多 token 来源互相覆盖。
- 本轮补齐废弃插件/渠道残留修复：只清理明确废弃的 `acpx` / `discord` `plugins.allow`、`plugins.entries`、`channels.discord`、关联 binding 和 legacy `plugins/installs.json`，不扩大删除任意第三方插件，也不删除插件源码目录。
- Recovery 备份现在会同时保存 `openclaw.json`、`.env`、`gateway.systemd.env` 和 `studio-local` secret sidecar；失败回滚会一并恢复，避免只回滚主配置而留下新的 token/env 状态。
- Recovery 中触发 Gateway 重启时优先使用 `openclaw gateway restart --safe`，当前 CLI 已确认支持；旧 CLI 不支持 `--safe` 时才回退普通 restart，降低自愈打断活跃任务的风险。

## 当前边界

- Recovery daemon 是独立专项，不属于 Studio Gateway 或 Channel Connectors。
- 当前主线开发不应把 recovery 逻辑塞进 Gateway/Channel daemon。
- 发布前仍需要真实目标 OS supervisor smoke。
- daemon 心跳仍保持轻量探测，不进入 doctor、SecretRef、插件或 schema 深检查；这些重修复只在手动 repair 或失败阈值触发的 repair 中运行。

## 最近验证

本轮已通过：

- 外部核验：OpenClaw 官方 Gateway security/secrets、Gateway runbook、Gateway CLI restart `--safe`、plugins uninstall/manage 文档；结论是 SecretRef/env 收敛、插件卸载清理 allow/entry/index、配置变更后重启 Gateway 均符合当前官方运维方向。
- `openclaw gateway restart --help` 确认当前本机 `OpenClaw 2026.6.8` 支持 `--safe`。
- `npm run build:api`
- `node --test tests/system/openclaw-recovery-daemon.test.mjs tests/system/openclaw-recovery-contract.test.mjs`，19/19 通过。
- `node --test tests/system/bootstrap.test.mjs tests/system/config-service.test.mjs`，22/22 通过。

历史已通过：

- recovery/system 隔离 TypeScript 编译。
- `tests/system/studio-web-system-runtime-shell.test.mjs`
- `git diff --check`

## 下一步

1. Linux `systemd --user`、macOS launchd、Windows scheduled task/service install/start/restart smoke。
2. 真实 gateway service 损坏样本验证。
3. 真实 CLI 缺失/包损坏样本验证。
4. 低优先级：真实 Studio 插件 `/studio` 控制面静态资源缺失样本验证。
5. `openclaw secrets audit` 提示的 agent `models.json` / SQLite auth profile 明文 key 属于 agent auth 存储风险，后续单独评估，不作为 `openclaw.json` doctor 阻断项。
