# OpenClaw 自愈守护进程目标

> 状态：核心实现已完成
> 更新：2026-06-05
> 文档规则：本文件只保留目标、边界、架构和验收；进度写到 `openclaw-recovery-daemon-progress.md`。

## 1. 目标

新增独立 OpenClaw Recovery Daemon。Studio 在健康时负责安装、启动、重启和展示它；OpenClaw gateway 或 Studio 单口入口不可达时，daemon 继续由 OS 用户级 supervisor 托管并自动修复 OpenClaw，恢复原来的单一公网入口。

核心要求：

- 健康循环只做本机轻量探测，不频繁 spawn OpenClaw CLI。
- 持续失败超过阈值后才进入保守修复流程。
- 修复前备份 `openclaw.json`。
- 根据 `openclaw config validate --json` 返回的 issue path 动态删除安全域里的违规字段。
- 保留插件 config、provider params、channel 扩展字段和用户插件源码目录。
- 默认救援路径是静默自动修复，不要求单口远程用户打开第二个维护端口、SSH 或终端。
- 自愈能力要逐步覆盖配置、进程、端口、服务托管、依赖完整性和安装损坏，优先复用 OpenClaw CLI 的 status/doctor/validate/fix 结果。
- 修复历史和配置备份必须支持多条记录与分页浏览。
- daemon 安装/启动时记录 CLI install manifest；当 `openclaw` 命令缺失时，可先恢复本地 shim，再按 manifest 受控执行 npm 全局重装。
- Gateway restart 后仍不可达时，允许发现端口监听者；只有确认监听进程是 OpenClaw gateway 时才自动接管，非 OpenClaw 进程只记录并跳过。
- Gateway 修复后必须做深探测：不只确认端口有响应，还要确认 Studio 控制 UI 路径不是 404/5xx。
- Gateway 服务托管修复优先使用 `openclaw gateway status --json` 的状态判断，再调用 OpenClaw 自己的 `gateway install/start/restart`，不在 Studio 里硬编码 systemd/launchd/schtasks 细节。

## 2. 边界

- 自愈不属于 Model Gateway。
- `/system` 不再作为宽泛诊断控制台。
- `/api/system/diagnostics` 可保留为手动深诊断端点，但不能进入默认渲染、轮询或事件热路径。
- System event 存储继续作为审计底座；事件视图只读持久事件，不合成 live diagnostics。
- Dreaming API 暂不迁移，避免破坏现有页面。
- npm 重装只按 recovery install manifest 受控恢复同一记录包，不做盲目 latest 更新。

## 3. 架构

| 模块 | 职责 |
| --- | --- |
| `apps/api/openclaw-recovery-daemon.ts` | 独立 daemon 入口 |
| `apps/api/modules/openclaw-recovery/*` | 状态、事件、备份、探测、修复、supervisor service 管理 |
| `/api/openclaw-recovery/*` | Studio 健康时的管理 API |
| `/system` | 轻量系统总览，只读取 health、recovery status、upgrade status |
| `/system/recovery` | 自愈管理页，展示 daemon、策略、事件、备份和手动动作 |

daemon 本地 loopback fallback 控制面只给本机操作者使用，使用本地 token 保护，当前提供 status、events、backups、manual run、backup restore。它不是单口远程用户的主要救援路径。

## 4. 验收

- System 首屏不调用 `openclaw gateway status`、`openclaw status` 或 `openclaw doctor`。
- System 首屏不加载旧 diagnostics tab、原始命令输出或宽泛诊断面板。
- System runtime summary、event list、event summary 不调用 `getDiagnostics()`。
- Recovery status 读取状态文件和 service 快照，不执行 OpenClaw CLI。
- Recovery status 复用最近一次 service action 的 active/enabled 快照，避免按钮状态被轻量刷新覆盖。
- daemon 健康循环只做 loopback probe。
- 连续失败未超过 180 秒不触发修复。
- 修复流程有单飞锁和 cooldown。
- 修复前创建配置备份。
- 配置 prune 从 OpenClaw validation issue 动态获取路径，并保留插件/provider/channel 扩展域。
- 插件层优先禁用有问题的 `plugins.entries.<id>`，或移除明显不存在的绝对 `plugins.load.paths`，不删除插件源码目录。
- 安装层先做 CLI/update 状态检查；CLI 缺失时只根据 recovery manifest 恢复 shim 或重装同一记录包。
- Gateway 复验使用深探测：端口不可达才进入进程接管；端口可达但控制 UI 路径失败时归类为服务/路由问题。
- Gateway 服务托管层读取 `openclaw gateway status --json`，在服务未加载、失败、路径缺失、端口不匹配或 config audit 失败时使用 OpenClaw CLI 重建/启动服务。
- 运行时发现层识别 gateway 端口监听者和进程命令行；接管仅限 `openclaw gateway` 残留进程。
- 回滚层在修复后配置仍无效或修复流程异常时恢复本次修复前备份。
- Recovery events/backups 支持分页 payload，同时保留旧数组响应兼容无分页调用。
- recovery 事件写入 recovery jsonl，并同步进入 system event center。
- Studio 可以管理 daemon 服务，但 daemon 修复不依赖 Studio 存活。

## 5. 剩余工作

- 在目标 Linux/macOS/Windows 环境做 supervisor install/start runtime smoke。
- 根据真实故障样本继续扩展非端口类启动冲突和服务托管异常。
- 用真实 CLI 缺失、包损坏和系统服务损坏样本验证受控重装/服务重建兜底。
- 若本机 fallback 控制面变成正式用户工作流，再补发现入口和 token 展示 UX。
