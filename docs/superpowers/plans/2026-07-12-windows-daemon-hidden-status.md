# Windows 守护服务无窗口与确定性状态实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion for each task.

**Goal:** 让 Model Gateway、Channel Connectors 与 OpenClaw Recovery 在 Windows 持久守护模式下无可见控制台启动，并稳定显示任务与运行时真实状态。

**Architecture:** 继续复用统一 ServiceManager、Task Scheduler 与现有 watchdog。Windows 任务由隐藏的 Windows PowerShell 宿主同步托管 watchdog；每代 daemon 进入 Win32 Job Object，确保根退出时先清理后代再重启；状态通过 Task Scheduler COM 的数值 `TASK_STATE` 与 `Enabled` 获取，再由 PID、健康探针与停止后的原生状态复查确认生命周期。三业务域不增加各自的平台分支。

**Tech Stack:** TypeScript、Node child_process、Windows PowerShell 5.1、Task Scheduler 2.0、Node test。

## Constraints

- 保留 `InteractiveToken`，避免 S4U 丢失网络与加密文件访问能力。
- 不用本地化的 `schtasks` stdout/stderr 驱动状态分支。
- Task Scheduler 的 `<Hidden>` 只影响任务列表可见性，不作为窗口隐藏方案。
- 不引入第二套 daemon manager，不更改三域业务配置或 Codex 本地配置。
- `unknown` 仅用于 Task Scheduler 状态确实无法读取、输出损坏或权限/命令失败。
- PowerShell 5.1 不直接承载业务 argv；daemon entry 与参数以单个 Base64(JSON) token 交给 watchdog 解码。
- Task Scheduler `/End` 只终止受跟踪宿主；watchdog 必须监测宿主 PID，并用 Job Object 持久拥有 daemon 后代；manager 必须等旧 PID、健康端点与原生任务状态三重证明停止后才返回或重启。

### Task 1: 先锁定 Windows 任务模板与状态契约

**Files:**
- Modify: `tests/system/supervisor-platform-plans.test.mjs`
- Modify: `tests/system/supervisor-service-manager.test.mjs`

- [x] 写失败测试：Windows Task Action 不得直接执行 `node.exe`，必须包含 `-NoProfile -NonInteractive -WindowStyle Hidden` 并保持 watchdog 同步托管。
- [x] 写失败测试：`TASK_STATE` 0/1/2/3/4、损坏 JSON、not-found/permission HRESULT 均产生确定状态。
- [x] 写失败测试：Ready 即 stopped；Running 只有健康通过才是 running，健康失败为 degraded。
- [x] 写失败测试：session owner 运行时，persistent Ready 仍是 stopped，不能误用共享端口归属。
- [x] 写失败测试：PowerShell 5.1 精确保留空参数、引号、尾随反斜杠、空格、单引号与中文；宿主退出清理 daemon 及后代。

### Task 2: 实现无窗口任务宿主与机器可读状态探测

**Files:**
- Modify: `apps/api/modules/supervisor/contracts.ts`
- Modify: `apps/api/modules/supervisor/platform-plans.ts`
- Modify: `apps/api/modules/supervisor/command-runner.ts`
- Modify: `apps/api/modules/supervisor/service-manager.ts`

- [x] 用固定、UTF-16LE Base64 编码的 PowerShell 命令同步执行现有 watchdog；业务 argv 使用 Base64(JSON) 单 token，原始参数先经过 secret gate。
- [x] Windows status 用 Task Scheduler COM 输出 UTF-8 JSON `{state,enabled}`；错误保留 HRESULT，供稳定分类。
- [x] 按官方数值映射 Disabled/Queued/Ready/Running/Unknown，并在 Running 时叠加健康探针；Disabled 启动前显式启用。
- [x] watchdog 监测隐藏宿主 PID；Job runner 同时监测 watchdog 与 daemon，任一异常退出都先清空 `KILL_ON_JOB_CLOSE` 进程树；stop/restart/repair/uninstall 等待 PID、端点与原生任务状态三重停止证明。
- [x] `/Run` 后 bounded 等待 runtime PID；Ready+live runtime 显示 degraded；XML 缺失仍查询并管理原生任务。
- [x] registration/activation 分阶段执行；注册成功后的激活失败保留 native/XML 一致，注册失败按原生复查或旧模板重注册收口。
- [x] 启动证明在同一有界窗口内等待 runtime PID、归属健康与 native Running；Queued/Ready+live runtime 阻断重复启动。
- [x] active repair 对模板写入、注册、激活、readiness 失败恢复旧任务；原生任务存在但旧 XML 缺失时在停机前拒绝不可回滚修复。
- [x] native task 缺失但 runtime PID 存活时按 session PID 归因；未知孤儿阻断 takeover，合法 session 迁移须证明 PID 与端点完全停止。
- [x] installed+Ready 与 session owner 共用 runtimePath 时保持跨模式归因：session 幂等、persistent 状态不误报、切回持久模式前完整停旧 owner。
- [x] installed+Queued 与 session owner 共存时分离证明：排空 Task 只看原生非 Queued/Running，session PID 保持存活；persistent takeover 按 session → queued task → persistent 顺序收口。
- [x] stale-config 掩盖的 native Queued 复用 may-own 判定；`/End` 前后重读 runtime PID，保留 session 时等待替换 Task PID 退出且不探测共享端点，persistent takeover/repair 时完成替换 PID、端点与 native 三重停止证明。
- [x] replacement PID 只有在原生 Queued/stale-Queued 时才能归因给 Task；Ready/Disabled 下不同 live PID fail-closed，persistent takeover 在停止 session 前后重复校验，session restart 在新 owner 启动前再次校验。
- [x] 保持 systemd、launchd 与 session 行为不变。

### Task 3: 三域与 Windows 实机迁移验证

**Files:**
- Modify: `docs/研究先行开发清单.md`
- Verify: `tests/system/supervisor-windows-live.smoke.mjs`

- [x] 构建 API，运行 shared supervisor、三域 contract 与 Web panel 定向测试。
- [x] 对现有 Model Gateway、Channel Connectors 与 Recovery 任务执行 repair，并清理由旧 `/End` 行为遗留且可精确归属的 watchdog 树。
- [x] 验证任务 Action 为隐藏 PowerShell、任务 Running/Ready 与 API running/stopped 一致；运行破坏性隔离 smoke 覆盖 install/recover/restart/stop/uninstall。
- [x] 验证 18796/18797/18798 端点、host/watchdog/daemon `MainWindowHandle=0`，且 3761/5176 开发端口保持不变。
- [ ] `git diff --check`，仅提交计划内文件到 `main`。
