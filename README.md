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

> Tracevane 当前以 OpenClaw UI 扩展形式发布，项目处于维护模式。现有功能会继续维护，但不承诺固定的新功能节奏。

## 能做什么

| 能力 | 说明 |
| --- | --- |
| 工作区与文件 | 文件管理、在线编辑、预览、终端与 Git 工作流。 |
| Model Gateway | 管理 Provider、模型、路由、账号池、协议适配与用量。 |
| Channel Connectors | 将飞书、Octo 等消息入口连接到 Agent 工作流。 |
| CLI Agents | 检查并运行 Codex、Claude Code、OpenCode 等本地 Agent。 |
| 运行健康 | 查看服务、配置、设备信任和运行时状态，辅助诊断与恢复。 |

## 快速安装

支持 Linux、macOS，以及使用 Linux 文件系统的 WSL。需要 Bash、Node.js 和已经完成初始化的 OpenClaw。

> **全新机器注意：** Tracevane 安装器不会安装完全缺失的 OpenClaw；它只会升级已经存在但版本过旧的 OpenClaw。没有 OpenClaw 时，请先执行下面的“从零安装 OpenClaw”，完成模型账号配置和 Gateway 验证后再继续。

### 1. 从零安装 OpenClaw（仅首次需要）

如果 `openclaw --version` 提示命令不存在：

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

Onboarding 会要求选择模型 Provider 并完成密钥或账号授权。不要把密钥粘贴到 Issue、日志或 Agent 对话中。OpenClaw 最新环境要求与其他安装方式以 [OpenClaw 官方安装文档](https://docs.openclaw.ai/install) 为准。

### 2. 安装 Tracevane

请先下载并检查脚本，不要使用 `curl | bash`。

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
/tmp/install-tracevane.sh --mode standalone --json
```

接入现有 OpenClaw Gateway 时，只需把最后一行改为：

```bash
/tmp/install-tracevane.sh --mode gateway --json
```

安装器会验证 Release 元数据和 SHA-256，并返回安装目录、配置路径、访问地址与健康检查结果。详细参数见 [安装文档](docs/installation.md)，让 Agent 执行安装时可直接使用 [Agent 安装提示词](docs/agent-installation.md)。

### 交给 Agent 从零安装

把下面整段复制给 Codex、Claude Code 或 OpenCode：

```text
请在这台机器上从零安装 OpenClaw 和 Tracevane。先只检查环境并报告操作系统、是否处于 WSL2、node/npm/openclaw 版本；不要立即修改系统。如果 OpenClaw 缺失，按 https://docs.openclaw.ai/install 的官方 npm 方式安装 openclaw@latest，然后运行 openclaw onboard --install-daemon。Onboarding 涉及模型账号或密钥时暂停，让我在本机交互完成，禁止读取、回显或上传密钥。随后运行 openclaw --version、openclaw doctor、openclaw gateway status；验证成功后，从 https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh 下载 Tracevane 安装器到本地，先审阅脚本并运行 --check-release，再以 --mode standalone --json 安装。禁止 curl | bash，禁止绕过 TLS、SHA-256、配置校验或健康检查。最后返回 OpenClaw 版本、Tracevane JSON 中的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，所有 token/credential 必须脱敏。
```

Gateway 模式只需把 Prompt 中的 `--mode standalone --json` 改为 `--mode gateway --json`。更短和审计版 Prompt 见 [Agent 安装提示词](docs/agent-installation.md)。

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
