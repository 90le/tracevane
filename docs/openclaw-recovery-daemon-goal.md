# OpenClaw 自愈守护进程目标

> 状态：核心实现已完成；独立专项，非当前 Gateway/Channel 主线
> 更新：2026-06-18
> 文档规则：只保留目标、边界、架构和验收；进度写到 `openclaw-recovery-daemon-progress.md`。

## 1. 目标

OpenClaw Recovery Daemon 是独立守护进程。Studio 健康时负责安装、启动、重启和展示它；OpenClaw gateway 或 Studio 单口入口不可达时，daemon 继续由 OS 用户级 supervisor 托管并尝试保守修复 OpenClaw。

核心要求：

- 健康循环只做本机轻量探测，不频繁 spawn OpenClaw CLI。
- 持续失败超过阈值后才进入修复流程。
- 修复前备份 `openclaw.json`。
- 修复前备份 `openclaw.json` 以及会被本轮修复触碰的 runtime sidecar：`.env`、`gateway.systemd.env`、`studio-local` secret 文件。
- 根据 `openclaw config validate --json` 的 issue path 动态删除安全域里的违规字段。
- 保留插件 config、provider params、channel 扩展字段和用户插件源码目录。
- 对已确认废弃的插件/渠道残留做保守清理，只处理 `acpx` / `discord` 这类已废弃 residue，不扩大到任意第三方插件源码。
- Gateway auth token 收敛到 SecretRef/env 单一权威来源，避免明文配置、`.env`、systemd env 和本地 secret 文件互相漂移。
- 修复历史和配置备份支持分页浏览。
- `/system/recovery` 提供手动配置修复、事件、备份和 daemon service 管理。
- daemon 修复不依赖 Studio API/UI 存活。

## 2. 边界

- 自愈不属于 Studio Gateway。
- 自愈不属于 Channel Connectors。
- `/system` 是轻量系统总览，不恢复宽泛 diagnostics 默认面。
- `/api/system/diagnostics` 可保留为手动深诊断端点，但不能进入默认渲染、轮询或事件热路径。
- npm 重装只按 recovery install manifest 受控恢复同一记录包，不做盲目 latest 更新。
- Agent `models.json` / SQLite auth profile 明文 key 不由 Recovery 自动改写；这类凭据迁移必须走 OpenClaw secrets 官方交互/计划能力，避免破坏 agent auth 存储。

## 3. 架构

| 模块 | 职责 |
| --- | --- |
| `apps/api/openclaw-recovery-daemon.ts` | 独立 daemon 入口 |
| `apps/api/modules/openclaw-recovery/*` | 状态、事件、备份、探测、修复、supervisor service 管理 |
| `/api/openclaw-recovery/*` | Studio 健康时的管理 API |
| `/system` | 轻量系统总览 |
| `/system/recovery` | 自愈管理页 |

本地 loopback fallback 控制面只给本机操作者使用，使用本地 token 保护。它不是单口远程用户的主要救援路径。

## 4. 验收

- System 首屏不调用 `openclaw gateway status`、`openclaw status` 或 `openclaw doctor`。
- Recovery status 读取状态文件和 service 快照，不执行 OpenClaw CLI。
- daemon 健康循环只做 loopback probe。
- 连续失败未超过阈值不触发修复。
- 修复流程有单飞锁、cooldown 和 stale lock 识别。
- 修复前创建配置备份。
- 配置 prune 从 OpenClaw validation issue 动态获取路径。
- 插件层优先禁用坏 entry 或移除缺失绝对 path，不删除插件源码目录。
- 低优先级：Studio 插件 `/studio` 控制面静态资源缺失时可受控执行 `npm run build:web` 重建；该项只保证 OpenClaw 托管 Studio UI 可打开，不作为 OpenClaw 本体配置修复的核心验收。
- Gateway 修复后深探测端口和 Studio 控制 UI 路径。
- Gateway 服务托管修复优先使用 OpenClaw CLI 的 gateway status/install/start/restart。
- Gateway service 修复或重启后要 bounded wait 到控制面真正 ready，避免 systemd `active` 但 Gateway 仍启动中时误判失败。
- CLI recovery shim 必须按 manifest 入口类型执行：JS/MJS 才用 Node，shell/native wrapper 直接 exec。
- 回滚层在修复后配置仍无效或流程异常时恢复本次修复前备份。
- 回滚层同时恢复 runtime sidecar，避免 SecretRef/env 修了一半后留下不一致 token。
- Gateway 重启优先使用 `openclaw gateway restart --safe`，旧 CLI 不支持时才回退普通 restart。
- Recovery events/backups 支持分页 payload。

## 5. 剩余工作

- macOS launchd、Windows scheduled task/service install/start/restart smoke。
- 低优先级验证 Studio 插件 `/studio` 控制面静态资源缺失样本。
- 若 fallback 控制面变成正式用户工作流，再补发现入口和 token 展示 UX。
