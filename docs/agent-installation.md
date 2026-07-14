# Agent 安装提示词

以下 Prompt 可直接复制给 Codex、Claude Code 或 OpenCode。选择与你的环境对应的一段，不需要自己补命令。

## 选择哪一个

| 当前环境 | 使用的 Prompt |
| --- | --- |
| OpenClaw 尚未安装，希望 Tracevane 使用独立 `3760` 入口 | `promptFreshMachineStandalone` |
| OpenClaw 尚未安装，希望 Tracevane 挂载到 Gateway | `promptFreshMachineGateway` |
| OpenClaw 已安装，只安装 Tracevane standalone | `promptStandaloneShort` |
| OpenClaw 已安装，只安装 Tracevane gateway | `promptGatewayShort` |
| 需要先预演并记录变更 | 对应的 Audit Prompt |

> Onboarding 涉及模型账号或 API key 时，Agent 必须暂停，让用户在本机交互完成。不要把密钥粘贴给 Agent，也不要允许 Agent 在日志中回显凭据。

## promptFreshMachineStandalone

```text
请在这台机器上从零安装 OpenClaw 和 Tracevane，并将 Tracevane 配置为 standalone 模式。严格按以下顺序执行：

1. 先只读检查并报告操作系统、CPU 架构、是否处于 WSL2、当前目录所在文件系统，以及 node、npm、openclaw 的版本；此阶段不要修改系统。
2. Tracevane Bash 安装仅支持 Linux、macOS 或 WSL2 的 Linux 文件系统。如果是原生 Windows、Git Bash、MSYS/Cygwin 或位于 /mnt/c 等 Windows 挂载目录，先停止并告诉我应如何进入 WSL2 的 ~/ 目录，不要强行继续。
3. 以 https://docs.openclaw.ai/install 为 OpenClaw 安装依据。如果 Node.js 缺失或不满足官方当前要求，使用 Node.js 官方发行版或可信系统包管理器安装官方支持版本；不要使用来历不明的镜像或脚本。
4. 如果 openclaw 命令缺失，执行 npm install -g openclaw@latest，然后运行 openclaw --version。如果 npm 全局目录权限不足，不要直接 sudo；优先配置当前用户拥有的 npm global prefix，并确保其 bin 目录加入 PATH。
5. 运行 openclaw onboard --install-daemon。出现模型 Provider、账号登录、OAuth 或 API key 输入时立即暂停，让我在本机完成；禁止读取、复制、记录、上传或回显任何 token/credential。
6. Onboarding 完成后运行 openclaw --version、openclaw doctor、openclaw gateway status。任一检查失败都先停止并说明原因，不要安装 Tracevane。
7. 从 https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh 下载安装器到 /tmp/install-tracevane.sh。禁止 curl | bash。
8. 展示脚本来源和文件 SHA-256，审阅脚本，再运行 chmod +x 和 /tmp/install-tracevane.sh --check-release；确认 Release 版本、包 URL 和 SHA-256 后，运行 /tmp/install-tracevane.sh --mode standalone --json。
9. 不得绕过 TLS、SHA-256、OpenClaw 配置校验或健康检查，不得使用 --skip-upgrade 掩盖版本问题。
10. 最后原样返回 OpenClaw 版本，以及 Tracevane JSON 的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures。所有路径中的用户名可以保留，所有 token/credential 必须脱敏。
```

## promptFreshMachineGateway

```text
请在这台机器上从零安装 OpenClaw 和 Tracevane，并将 Tracevane 挂载到 OpenClaw Gateway。先只读报告操作系统、是否为 WSL2、node/npm/openclaw 版本。若 OpenClaw 缺失，按 https://docs.openclaw.ai/install 的官方 npm 路径安装：确认受支持的 Node.js 后执行 npm install -g openclaw@latest，再执行 openclaw onboard --install-daemon。涉及 Provider 登录、OAuth 或 API key 时暂停，让我在本机交互完成，禁止读取、记录或回显凭据。随后必须通过 openclaw --version、openclaw doctor、openclaw gateway status。

OpenClaw 验证通过后，从 https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh 下载脚本到本地，展示来源和 SHA-256，审阅脚本，运行 --check-release，然后执行 --mode gateway --json。禁止 curl | bash，禁止绕过 TLS、checksum、配置校验或健康检查。最后返回 OpenClaw 版本、Gateway 状态，以及 Tracevane JSON 的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，并单独确认 /tracevane 路由和 3760 fallback health；所有凭据必须脱敏。
```

## promptStandaloneShort

```text
OpenClaw 已经安装并完成 onboarding。请先运行 openclaw --version、openclaw doctor、openclaw gateway status；验证通过后，从 Tracevane 官方 GitHub Release 下载 Bash 安装器到本地并审阅，运行 --check-release，确认来源、版本和 SHA-256 后执行 --mode standalone --json。不要使用 curl | bash，不要绕过 checksum、TLS、OpenClaw 配置校验或健康检查。原样返回 JSON 的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，所有凭据脱敏。
```

## promptGatewayShort

```text
OpenClaw 已经安装并完成 onboarding。请先验证 openclaw --version、openclaw doctor、openclaw gateway status；通过后从 Tracevane 官方 GitHub Release 下载并审阅安装器，运行 --check-release，再执行 --mode gateway --json。禁止 curl | bash，禁止绕过 checksum、TLS、配置校验或健康检查。必须返回原始 JSON 字段 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，并单独确认 /tracevane 路由和 3760 fallback health；所有凭据脱敏。
```

## promptStandaloneAudit

```text
审计 standalone 安装：先只读检查平台、WSL/文件系统、Node.js、npm、OpenClaw 版本和 Gateway 状态。如果 OpenClaw 缺失，停止并使用 promptFreshMachineStandalone，不要跳过前置安装。OpenClaw 可用时，审阅本地 Tracevane 安装脚本，先执行 --check-release 和 --mode standalone --dry-run --json，再正式安装；披露 changed paths 和失败 rollback 证据，完整返回原始 JSON 字段并对 token/credential 做脱敏。禁止 curl | bash 或绕过 checksum、TLS、配置、health 校验。
```

## promptGatewayAudit

```text
审计 gateway 安装：先只读检查平台、WSL/文件系统、Node.js、npm、OpenClaw 版本，并验证 openclaw doctor 与 openclaw gateway status。如果 OpenClaw 缺失或 Gateway 未初始化，停止并使用 promptFreshMachineGateway。随后审阅安装器，执行 --check-release 和 --mode gateway --dry-run --json，再正式安装；披露 changed paths、失败 rollback 证据，并验证 /tracevane 与 3760 fallback health。完整返回原始 JSON 字段 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures；所有凭据脱敏。禁止绕过任何安全校验或使用 curl | bash。
```
