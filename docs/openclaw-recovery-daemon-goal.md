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
- 只删除已知破坏当前 OpenClaw 的字段，例如 `agents.defaults.llm`。
- 保留插件 config、provider params、channel 扩展字段和用户插件源码目录。
- 默认救援路径是静默自动修复，不要求单口远程用户打开第二个维护端口、SSH 或终端。

## 2. 边界

- 自愈不属于 Model Gateway。
- `/system` 不再作为宽泛诊断控制台。
- `/api/system/diagnostics` 可保留为手动深诊断端点，但不能进入默认渲染、轮询或事件热路径。
- System event 存储继续作为审计底座；事件视图只读持久事件，不合成 live diagnostics。
- Dreaming API 暂不迁移，避免破坏现有页面。
- npm 更新/重装只作为显式策略或人工动作，不作为默认静默修复。

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
- daemon 健康循环只做 loopback probe。
- 连续失败未超过 180 秒不触发修复。
- 修复流程有单飞锁和 cooldown。
- 修复前创建配置备份。
- 配置 prune 只删除已知坏字段，并保留插件/provider/channel 扩展域。
- recovery 事件写入 recovery jsonl，并同步进入 system event center。
- Studio 可以管理 daemon 服务，但 daemon 修复不依赖 Studio 存活。

## 5. 剩余工作

- 在目标 Linux/macOS/Windows 环境做 supervisor install/start runtime smoke。
- 根据真实故障样本扩展修复策略。
- 若本机 fallback 控制面变成正式用户工作流，再补发现入口和 token 展示 UX。
