# Tracevane

<p align="center">
  <img src="assets/brand/tracevane-lockup.svg" alt="Tracevane" width="440">
</p>

<p align="center">
  <strong>本地优先的 OpenClaw AI Agent 控制工作台</strong><br>
  在一个界面中管理工作区、模型网关、消息渠道、CLI Agent 与运行状态。
</p>

<p align="center">
  <a href="README_EN.md">English</a> ·
  <a href="https://90le.github.io/tracevane/">官网</a> ·
  <a href="https://github.com/90le/tracevane/releases/latest">下载</a> ·
  <a href="https://github.com/90le/tracevane/issues">问题反馈</a>
</p>

<p align="center">
  <a href="https://github.com/90le/tracevane/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/90le/tracevane?display_name=tag&style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-35e69a?style=flat-square"></a>
  <a href="https://github.com/90le/tracevane/actions"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/90le/tracevane/pages.yml?style=flat-square&label=pages"></a>
</p>

> Tracevane 以 OpenClaw UI 扩展形式发布，面向已经装好 OpenClaw 的用户：粘贴一段提示词给你的 OpenClaw Agent，即可完成安装。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 工作区与文件 | 文件管理、在线编辑、预览、终端与 Git 工作流。 |
| Model Gateway | 管理 Provider、模型、路由、账号池、协议适配与用量。 |
| Channel Connectors | 将飞书、Octo 等消息入口连接到 Agent 工作流。 |
| CLI Agents | 检查并运行 Codex、Claude Code、OpenCode 等本地 Agent。 |
| 运行健康 | 查看服务、配置、设备信任和运行时状态，辅助诊断与恢复。 |

## 快速安装

支持 Linux、macOS，以及使用 Linux 文件系统的 WSL2。需要 Bash、Node.js，以及已经完成 onboarding 的 OpenClaw。还没有 OpenClaw？先看下方的「从零安装 OpenClaw」。

### 方式一：让 OpenClaw Agent 安装（推荐）

把下面整段粘贴到你的 OpenClaw 对话里。Agent 会下载安装器、校验 SHA-256、完成安装并做健康检查；令牌与凭据不会出现在对话中：

```text
这台机器已经安装并完成 OpenClaw onboarding。请先运行 openclaw --version、openclaw doctor、openclaw gateway status 验证环境；验证通过后，从 https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh 下载 Tracevane 安装器到本地并审阅脚本，运行 --check-release 确认 Release 版本与 SHA-256；确认无误后执行 --mode gateway --json，把 Tracevane 挂载到 Gateway 的 /tracevane。禁止使用 curl | bash，禁止绕过 TLS、SHA-256、配置校验或健康检查。完成后返回 JSON 中的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，并确认 /tracevane 路由和 3760 回退健康检查都通过。所有 token 与凭据必须脱敏，不要回显；访问令牌我会自己用 cat ~/.openclaw/openclaw.json 查看。
```

需要独立入口（`127.0.0.1:3760`）、全新机器或审计预演版本的提示词，见 [Agent 安装提示词](docs/agent-installation.md)。

### 方式二：手动安装

请先下载并检查脚本，不要使用 `curl | bash`。

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release

# 单口模式（推荐）：挂载到 OpenClaw Gateway 的 /tracevane
/tmp/install-tracevane.sh --mode gateway --json

# 或独立入口：http://127.0.0.1:3760
/tmp/install-tracevane.sh --mode standalone --json
```

安装器会验证 Release 元数据和 SHA-256，并返回安装目录、配置路径、访问地址与健康检查结果。详细参数见 [安装文档](docs/installation.md)。

### 从零安装 OpenClaw（仅首次需要）

**全新机器注意：** Tracevane 安装器不会安装完全缺失的 OpenClaw；它只会升级已经存在但版本过旧的 OpenClaw。如果 `openclaw --version` 提示命令不存在：

```bash
# 先确认 Node.js 满足 OpenClaw 当前要求
node --version
npm --version

# 使用 OpenClaw 官方 npm 包安装
npm install -g openclaw@latest
openclaw --version

# 交互式配置模型账号并安装 Gateway 服务
openclaw onboard --install-daemon

# 验证 OpenClaw
openclaw doctor
openclaw gateway status
```

Onboarding 会要求选择模型 Provider 并完成密钥或账号授权。不要把密钥粘贴到 Issue、日志或 Agent 对话中。OpenClaw 最新环境要求与其他安装方式以 [OpenClaw 官方安装文档](https://docs.openclaw.ai/install) 为准。验证通过后回到方式一或方式二安装 Tracevane。

## 本地开发

```bash
npm ci
npm run dev:restart
```

默认开发地址：Web `http://127.0.0.1:5176`，API `http://127.0.0.1:3761`。

常用检查：

```bash
npm run typecheck
npm run typecheck:web
npm run build
npm run test:system
```

Windows、macOS 和 Linux 均可进行开发。不要在 Windows 与 WSL 之间共用同一份 `node_modules`；切换环境后请重新执行 `npm ci`。

## 文档

- [安装与卸载](docs/installation.md)
- [故障排查](docs/troubleshooting.md)
- [Model Gateway 验收边界](docs/model-gateway/README.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

## 项目结构

```text
apps/api       后端服务与运行时模块
apps/web       React / Vite 前端
lib            OpenClaw 兼容与交付工具
types          前后端共享类型
scripts        构建、发布和 smoke 脚本
tests          系统测试与浏览器 smoke
index.ts       OpenClaw 扩展入口
```

## 参与与许可

提交问题前请先搜索现有 Issues；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。贡献代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

Tracevane 使用 [MIT License](LICENSE)。
