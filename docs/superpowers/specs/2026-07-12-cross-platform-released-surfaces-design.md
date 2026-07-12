# 已上线功能三系统稳定性设计

## 目标与事实边界

Tracevane 已上线的消息接入、Model Gateway、文件管理/在线编辑器、IDE Workbench、终端、LSP/Git/Debug 基础能力和三类守护服务，需要在 Windows、macOS、Linux 使用同一产品契约。当前 Windows 实机已确认两条消息接入缺陷：持久 Codex session 目录达到 443 字符而创建失败；模型由 `gpt-5.6-sol` 切换为 `gpt-5.6-luna` 后仍复用旧 native thread，随后产生 `custom_tool_call` ID 类型错误。

“三系统稳定”必须由对应 OS runner 的真实结果证明。当前 Windows 可以提供实机证据；macOS/Linux 必须由各自 CI runner 执行，不能由 Windows 上的 mock 冒充。飞书账号、Codex Account、收费模型和真实外部 Provider 保持 opt-in live smoke，不进入无凭据的常规 CI。

## 方案比较

1. 只修截图问题：改动最少，但不能阻止下一处 shell、路径或 supervisor 差异。拒绝。
2. 为 Windows 复制专用实现：短期快，长期造成三套行为和测试分叉。拒绝。
3. 共享契约 + 集中 platform adapters + 三系统 release gate：保留统一业务实现，只让 supervisor、PTY、命令发现和路径边界感知平台。采用。

## A. Channel/Codex 事故修复

### 有界 session 目录

持久 session 的磁盘目录不得包含完整业务 identity。使用 SHA-256 对 session ID 生成固定 32 个十六进制字符的 opaque key；可读信息留在 `channel-sessions.json`，目录只承担隔离。这样不依赖 Windows long-path registry 或应用 manifest，也同样降低 macOS/Linux 的 component/path 风险。Microsoft 明确说明传统 Win32 `MAX_PATH` 为 260，且解除限制需要系统配置和应用 opt-in，因此项目不能把正确性建立在用户机器已启用该策略上：<https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation>。

### 模型切换建立新 native session

delivery identity 继续让账号、目标和 IM 会话保持产品连续性，但只有 `agent + model + workDir` 全部一致才允许复用 native session。任一执行身份变化时，新建 session record/thread，旧记录保留为历史，不把旧 `codexThreadId` 传入 `codex exec resume`。OpenAI Codex app-server 将 thread items 持久化并用于未来上下文，`thread/start` 创建新 thread，`thread/resume` 才继续已有 thread；因此跨执行身份变化选择新 thread 是明确边界：<https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md>。

现有已污染 session 会在下一条消息时因模型不匹配而不再续接，无需修改 rollout 或泄露其内容。

## B. 三系统 release gate

新增一个 Node 编排脚本和 GitHub Actions OS matrix。脚本只调用已有 npm/test/smoke 入口，不复制业务测试逻辑。

### Quick gate（每次提交）

- root/web typecheck 与 API/Web build；
- supervisor platform plans、command runner、service manager；
- dev-runtime、owned-command、CLI spawn/path contract；
- Model Gateway protocol/web contract；
- Channel Connectors agent runner/session/app-server/v3 contract；
- Files path/root guard、terminal service/profile contract；
- IDE RC quick dry-run，确认已上线 smoke 清单在各 OS 可解析。

### Native/full gate（按 OS 或定时）

- Windows：Task Scheduler/session supervisor、PowerShell/cmd/pwsh profiles、PTY create/input/output/resize/kill/disconnect、IDE quick RC。
- macOS：launchd/session supervisor、zsh/bash/sh profiles、同一 PTY/IDE quick RC。
- Linux：systemd user/session supervisor、bash/sh/zsh profiles、同一 PTY/IDE quick RC。

浏览器 smoke 复用 `run-browser-smoke.mjs`；外部 API live smoke 由 secrets-enabled workflow 手动触发。

## 失败与兼容策略

- quick gate 任一契约失败即失败，不静默 skip 当前 OS 应有能力。
- OS 不具备的原生 supervisor 测试必须显示明确的 platform skip，不能假装成功。
- 缺少可选 shell/LSP/外部 CLI 时显示 degraded/skip；已发现的 shell 必须通过真实创建测试。
- 不修改 Codex 本地个人配置；Channel 的隔离 CODEX_HOME 仍由 Tracevane 生成。

## 验证

- 红绿测试覆盖 443 字符 Windows 路径、固定长度/确定性目录 key、模型切换不续接、同模型仍续接。
- Windows 实机运行 quick gate、Channel/Model Gateway/IDE 关键 smoke。
- workflow 语法和 dry-run 测试验证三 OS matrix；macOS/Linux 最终状态以远端 runner 为准。
