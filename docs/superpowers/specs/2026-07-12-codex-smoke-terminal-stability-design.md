# Codex Smoke 与跨平台终端稳定性设计

## 目标与边界

本轮同时收紧两个已经存在的产品边界：

1. Codex CLI 继续使用官方账户登录和本地配置，Tracevane 不写入 `~/.codex/config.toml`，但 Codex 路由仍参与单项与“检查全部” smoke。
2. 稳定化既有 M5/M5.x 终端能力，使 Windows、macOS、Linux 上被可靠发现且验证可执行的本地 shell 都能创建、持久化和管理。

本轮不新增终端布局功能、不通过 WSL 模拟 Windows 支持、不自动结束或删除不属于当前 Tracevane 运行实例的进程。

## 方案比较

### A. 推荐：能力分离与逐项降级

- 将“Codex 配置接管能力”和“Codex 路由测试能力”分开建模。
- shell 探测逐项捕获启动错误；一个候选失败只标记该候选不可用，目录接口仍返回其余结果。
- profile 使用已验证的绝对可执行路径；默认 shell 只从当前平台已验证候选中选择。
- 开发启动在探测到未归属的端口占用时失败并给出诊断，不接受旧服务的健康响应。

优点是改动集中、复用现有 PTY/session/layout 核心，能准确修复根因。缺点是测试矩阵比简单隐藏错误更大。

### B. 隐藏失败 profile

只在前端过滤不可用项。实现较小，但后端目录仍可 500，且无法解释失败原因，不能解决真实问题。

### C. 为每个平台建立独立终端实现

分别维护 Windows/macOS/Linux 启动器。平台控制强，但会复制 PTY、生命周期和持久化逻辑，维护风险最高。

采用方案 A。

## Codex 行为

- `canApply=false` 仅表示 Tracevane 不允许把 Gateway 写入 Codex 配置，不表示 Codex 路由不可用。
- Codex 行继续显示账户直连、Provider、模型与预算。
- Codex 参与单项 smoke 和“检查全部”；批量 smoke 覆盖 Codex、Claude Code、OpenCode、OpenClaw 四个 scope。
- “批量应用客户端配置”继续跳过 Codex，只写网关托管的三个客户端。
- 任何直接应用 Codex 配置的 API 请求返回稳定的 409 保护错误，且文件字节不变。

## 终端发现与创建

- 后端探测每个 binary 时将 `ENOENT`、`EACCES`、`EPERM`、超时和非零退出转换为该 binary 的结构化不可用状态，不能使 `/api/terminal/profiles` 整体失败。
- Windows 候选包括 PowerShell 7、Windows PowerShell、Command Prompt，以及 PATH 中真实可执行的 Git Bash/sh；macOS/Linux 使用 PATH 与 `SHELL` 中真实可执行的 bash/sh/zsh/fish/pwsh。
- profile 的启动命令来自已验证路径；不可用 profile 保留用于说明，但不可点击创建。
- `local-shell` 只引用已验证默认候选。无可用 shell 时返回明确不可创建状态，而不是构造一个未经验证的命令。
- PTY 创建仍在后端执行，继续使用现有 cwd/root guard、环境清理和输出预算。

## 持久化与管理

- 复用现有 session descriptor、ledger、detach/resume、rename/end/delete 与前端 terminal layout persistence。
- 重启页面后恢复运行中或 detached session；已结束 session 可从管理器删除，活动 session 必须先结束。
- profile ID 与实际 shell 路径分离持久化：持久化稳定 ID，恢复时重新解析当前机器的已验证路径，避免把一台机器的绝对路径带到另一平台。

## 开发运行时真实性

- `dev:restart` 必须先停止自身有所有权记录的进程，再检查目标端口。
- 若端口仍被占用，立即失败并说明“端口由未归属进程占用”，不能启动重试循环，也不能用旧 HTTP 响应宣告新进程 ready。
- 不自动杀死未归属进程；用户可显式停止它或使用 `dev:fresh` 的隔离端口。

## 验收

- Codex 配置应用保护与四 scope smoke 测试同时通过。
- Windows 实机 `/api/terminal/profiles` 始终返回 200；每个 `launchable=true` 的 shell 完成 create/input/output/resize/detach-resume/end/delete。
- 平台条件测试覆盖 Windows、macOS、Linux 的候选选择与路径解析，不依赖 WSL。
- `dev:restart` 对未归属端口占用产生明确失败，对空闲端口启动的新进程完成所有权相关 readiness。
- 根类型检查、Web 类型检查、终端定向测试、IDE 终端 smoke、模型网关回归和 `git diff --check` 全部通过。
