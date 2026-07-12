# Codex Smoke 与跨平台终端稳定性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保持 Codex 官方账户直连且参与路由测试，并使三系统所有可靠发现的本地 shell 可稳定创建、持久化和管理。

**Architecture:** 分离配置写入能力与路由 smoke 能力；终端沿用现有 PTY/session/layout 核心，在 binary 探测边界逐项降级并用已验证路径启动；开发运行时用端口所有权前置检查阻止旧服务假就绪。

**Tech Stack:** Node.js/TypeScript、node-pty、React/xterm.js、Node test、Playwright smoke。

## Global Constraints

- Codex CLI 的 `~/.codex/config.toml` 不得由 Tracevane 写入。
- Codex 必须参与单项与批量路由 smoke。
- 不使用 WSL 作为 Windows 兼容层。
- 不自动终止未归属的端口占用进程。
- 复用既有 M5/M5.x PTY、session ledger、layout persistence 和终端管理能力。

---

### Task 1: 修正 Codex 配置与 smoke 能力边界

**Files:**
- Modify: `apps/web/src/features/model-gateway/views/OverviewView.tsx`
- Modify: `apps/web/src/features/model-gateway/views/AppConnectionsView.tsx`
- Modify: `tests/system/model-gateway-service.test.mjs`
- Modify: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- Consumes: `ModelGatewayAppConnection.canApply`, `ModelGatewayActiveRouteStatus.verification`
- Produces: Codex 配置保护不变、四 scope smoke 集合

- [ ] 写失败测试：Codex `canApply=false`，批量应用跳过 Codex，但 Overview 的 `checkableRoutes` 包含 Codex。
- [ ] 运行模型网关定向测试，确认因 Codex 被 smoke 过滤而失败。
- [ ] 删除 Codex smoke 过滤，仅在配置应用入口保留保护；更新文案与统计口径。
- [ ] 运行模型网关与 Web 定向测试确认通过。

### Task 2: 让 shell 探测逐项降级

**Files:**
- Modify: `apps/api/modules/terminal/service.ts`
- Modify: `types/terminal.ts`
- Modify: `tests/terminal/terminal-session-summary.test.mjs`

**Interfaces:**
- Consumes: `runOwnedCommand`, `TerminalBinaryStatus`
- Produces: `checkBinary()` 永不因候选 spawn 错误拒绝整个目录请求；profile 包含可解释的不可用原因

- [ ] 写失败测试：一个 verify 命令抛出 `EPERM` 时，其 binary 不可用而其他 profile 仍返回。
- [ ] 运行定向测试并确认未捕获拒绝。
- [ ] 在单 binary 边界捕获 spawn/超时错误并标准化诊断，目录继续构建。
- [ ] 运行定向测试确认通过。

### Task 3: 用已验证路径解析跨平台 shell

**Files:**
- Modify: `apps/api/modules/terminal/service.ts`
- Modify: `tests/terminal/terminal-session-summary.test.mjs`

**Interfaces:**
- Consumes: binary status 的 `path` 与 `installed`
- Produces: `buildProfileCatalog()` 的 launchable profile 使用当前平台已验证命令

- [ ] 写 Windows/macOS/Linux 平台矩阵失败测试，覆盖默认 shell、PowerShell、cmd、bash/sh/zsh/fish 和缺失候选。
- [ ] 确认现有 bare command 与未验证默认回退使测试失败。
- [ ] 从 binary status 解析 profile command；Windows cmd 使用已验证路径/ComSpec；无候选时 local-shell 不可创建。
- [ ] 运行平台矩阵和终端类型测试确认通过。

### Task 4: 防止开发运行时旧服务假就绪

**Files:**
- Modify: `scripts/dev-runtime.mjs`
- Modify: `tests/system/dev-runtime.test.mjs`

**Interfaces:**
- Consumes: `portIsFree()`, managed process metadata
- Produces: refresh 启动前端口所有权检查与明确冲突错误

- [ ] 写失败测试：停止已管理进程后端口仍占用时，不启动 supervisor，并报告未归属占用。
- [ ] 运行定向测试确认当前逻辑会启动并接受旧 readiness。
- [ ] 在 supervisor 启动前检查最终端口；restart 不杀未归属进程，fresh 继续选择隔离空闲端口。
- [ ] 运行 dev-runtime 测试确认通过。

### Task 5: 终端生命周期与持久化实机矩阵

**Files:**
- Modify: `tests/ide-workbench/ide-terminal-foundation.smoke.mjs`
- Modify: `tests/ide-workbench/ide-terminal-manager.smoke.mjs`
- Modify: `docs/研究先行开发清单.md`

**Interfaces:**
- Consumes: `/api/terminal/profiles`, session create/input/resize/end/delete/stream
- Produces: 对所有 `launchable=true && kind=shell` profile 的真实生命周期证明

- [ ] 扩展 smoke：枚举可启动 shell，逐个创建并验证输入输出与 resize。
- [ ] 验证 detach/resume、页面恢复、rename、end、delete 和活动 session 删除保护。
- [ ] 运行 Windows 实机 smoke；记录 macOS/Linux 的 CI 条件矩阵。
- [ ] 更新研究清单，记录 Node child-process、node-pty 与各系统 shell 契约。

### Task 6: 完整回归与交付

**Files:**
- Verify only

- [ ] 运行 `npm run typecheck` 与 `npm run typecheck:web`。
- [ ] 运行终端、dev-runtime、模型网关定向测试。
- [ ] 运行 IDE terminal foundation/manager/persistence smoke。
- [ ] 用隔离端口启动 Windows 实例，验证 Codex 配置 SHA-256 不变、终端目录 200、所有 launchable shell 生命周期通过。
- [ ] 运行 `git diff --check`，审查仅包含计划内文件并提交。
