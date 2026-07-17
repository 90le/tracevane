# Tracevane 安装说明

本文覆盖两种情况：全新机器尚未安装 OpenClaw，以及已经有可用 OpenClaw 的机器。

## 先确认安装关系

Tracevane 当前以 OpenClaw UI 扩展形式运行，因此两种 Tracevane 模式都需要 OpenClaw：

| 模式 | 用途 | OpenClaw 要求 |
| --- | --- | --- |
| `standalone` | Tracevane 使用本机独立入口，默认端口 `3760` | 必须已经安装并初始化 OpenClaw |
| `gateway` | 挂载到现有 OpenClaw Gateway 的 `/tracevane`，同时保留 `3760` 回退入口 | 必须已有可运行的 OpenClaw Gateway |

**重要：Tracevane 安装器不会安装完全缺失的 OpenClaw。** 它会检查 `openclaw` 命令，并可升级已经存在但低于最低版本的安装；如果命令不存在，安装会停止。

## 系统要求

- Linux、macOS，或 WSL2 中的 Linux 文件系统。
- Bash、`curl` 或 `wget`、`tar`。
- 满足 OpenClaw 当前要求的 Node.js 和 npm。OpenClaw 官方目前推荐 Node 24；准确版本以 [OpenClaw Install](https://docs.openclaw.ai/install) 为准。
- 可用的模型 Provider 账号或 API key，用于 OpenClaw onboarding。
- Windows 用户应在 WSL2 的 `~/...` 目录操作，不要在 PowerShell、Git Bash 或 `/mnt/c/...` 中运行 Tracevane Bash 安装器。

## 情况 A：全新机器，没有 OpenClaw

### 1. 检查 Node.js

```bash
node --version
npm --version
```

如版本不满足 OpenClaw 官方要求，请先通过 Node.js 官方发行版或可信的系统包管理器安装受支持版本。

### 2. 安装并初始化 OpenClaw

项目选择 npm 方式，是因为命令明确、便于 Agent 审计，也避免直接管道执行远程脚本：

```bash
npm install -g openclaw@latest
openclaw --version
openclaw onboard --install-daemon
```

`onboard` 是交互式步骤，会要求选择模型 Provider 并完成账号或 API key 配置。让用户在本机输入凭据；Agent 不应读取、记录或回显密钥。

完成后验证：

```bash
openclaw doctor
openclaw gateway status
```

如果 `openclaw` 安装成功但命令找不到，检查 `npm prefix -g` 对应的 bin 目录是否已加入 `PATH`。

### 3. 继续安装 Tracevane

OpenClaw 验证通过后，执行下方“情况 B”的步骤。

## 情况 B：已经安装 OpenClaw

先检查版本和 Gateway：

```bash
openclaw --version
openclaw doctor
openclaw gateway status
```

然后下载、审阅并验证 Tracevane Release 安装器。不要使用 `curl | bash`。

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
```

### Standalone 模式

```bash
/tmp/install-tracevane.sh --mode standalone --json
```

### Gateway 模式

```bash
/tmp/install-tracevane.sh --mode gateway --json
```

安装结果 JSON 应包含：`version`、`installDir`、`configPath`、`accessUrls`、`healthChecks`、`warnings`、`degradedFeatures`。

## 安装前预演

需要先查看将发生的操作时：

```bash
/tmp/install-tracevane.sh --mode standalone --dry-run --json
```

`--dry-run` 不等于正式安装，也不能替代最后的健康检查。

## 卸载

```bash
/tmp/install-tracevane.sh --uninstall --json
```

卸载会移除 Tracevane 扩展并保留配置备份及 `~/.openclaw/tracevane` 用户数据。除非明确要求，否则不要删除 OpenClaw 或用户数据。

## 离线或私有镜像

同时指定版本、包地址和可信 SHA-256：

```bash
/tmp/install-tracevane.sh --version "$VERSION" --package-url "$PACKAGE_URL" --package-sha256 "$SHA256" --mode standalone --json
```

执行前使用 `sha256sum` 验证包文件。不要绕过 TLS、SHA-256、OpenClaw 配置校验或健康检查。

## 使用 Agent 安装

可直接复制的“全新机器”“已有 OpenClaw”“审计安装”提示词见 [Agent 安装提示词](agent-installation.md)。
