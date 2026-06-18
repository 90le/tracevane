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
- 本轮真实损坏样本验证后补齐两个边界：Gateway service repair 后会 bounded wait 到控制面真正 ready，避免 service 刚 active 但 Gateway 仍启动中时误判失败；CLI recovery shim 会区分 JS/MJS 入口和 shell/native wrapper，避免把 `/home/binbin/bin/openclaw` 这类 bash wrapper 交给 Node 执行。
- `openclaw secrets audit` 风险已单独评估：当前仍有 28 个 BigModel 明文 key finding，覆盖 14 个 agent 的 SQLite auth profile 和 14 个 `models.json`；另有 1 个 OpenAI OAuth legacy residue。已将 8 个原本 `0644` 的 `models.json` 收紧为 `0600`，当前扫描到的 `models.json` / SQLite 文件权限均为 `0600`，但明文 SecretRef 迁移仍需后续交互式 `openclaw secrets configure` 或官方非交互迁移能力。

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
- `node --test tests/system/openclaw-recovery-daemon.test.mjs tests/system/openclaw-recovery-contract.test.mjs`，20/20 通过。
- `node --test tests/system/bootstrap.test.mjs tests/system/config-service.test.mjs`，22/22 通过。
- 真实 Gateway service 损坏样本：将 `~/.config/systemd/user/openclaw-gateway.service` 的 `ExecStart` 改成失败命令并 restart 成 `failed`，Recovery full repair 成功执行 `gateway install --force --port 31879 --json` 和 `gateway start`，最终 service `active`、RPC `ok=true`、plugin drift 为空。
- 真实 CLI 包损坏样本：删除全局包 `openclaw.mjs` 后 `openclaw --version` 返回 127，Recovery full repair 通过 install manifest 执行 `npm install -g openclaw@2026.6.8`，最终 CLI 版本恢复为 `OpenClaw 2026.6.8 (844f405)`、RPC `ok=true`、plugin drift 为空。
- `openclaw secrets audit --json` / `--check --json`：`status=findings`、`plaintextCount=28`、`legacyResidueCount=1`；非交互 `openclaw secrets configure --json --skip-provider-setup --plan-out ... --yes` 当前失败，原因是需要 interactive TTY。

历史已通过：

- recovery/system 隔离 TypeScript 编译。
- `tests/system/studio-web-system-runtime-shell.test.mjs`
- `git diff --check`

## 下一步

1. macOS launchd、Windows scheduled task/service install/start/restart smoke；Linux `systemd --user` 本机真实损坏样本已通过。
2. 低优先级：真实 Studio 插件 `/studio` 控制面静态资源缺失样本验证。
3. `openclaw secrets audit` 明文 key 后续迁移：优先等待/使用官方 `secrets configure` 交互式迁移到 SecretRef；没有非交互 plan/apply 证据前不由 Recovery 自动改写 agent SQLite 或 models.json。
