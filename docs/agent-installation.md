# Agent installation prompts

Use these prompts verbatim. They prohibit `curl | bash`, checksum/TLS/config/health bypasses, and require raw JSON fields.

## promptStandaloneShort
请从 Tracevane 官方 GitHub Release 下载 Bash 安装器并以 standalone 模式安装。先保存脚本到本地，运行 --check-release；确认来源、版本和 SHA-256 后执行 --mode standalone --json。不要使用 curl | bash，不要绕过 checksum、TLS、OpenClaw 配置校验或健康检查。原样返回 JSON 的 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures。

## promptGatewayShort
请从 Tracevane 官方 GitHub Release 下载并审阅安装器，运行 --check-release 后执行 --mode gateway --json。禁止 curl | bash，禁止绕过 checksum、TLS、配置校验或健康检查。必须返回原始 JSON 字段 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures，并单独确认 3760 fallback health 结果。

## promptStandaloneAudit
审计 standalone 安装：验证平台、审阅本地脚本，先 --dry-run 再执行；披露所有 changed paths，保留失败时的 rollback 证据，完整返回原始 JSON 字段并对 token/credential 做 redaction。禁止 curl | bash 或绕过 checksum、TLS、配置、health 校验。

## promptGatewayAudit
审计 gateway 安装：验证平台、审阅本地脚本，先 --dry-run；披露 changed paths、失败 rollback 证据，并验证 gateway health 与 3760 fallback health。原始 JSON 必须包含 version、installDir、configPath、accessUrls、healthChecks、warnings、degradedFeatures；对 token/credential redaction。禁止所有安全校验绕过与 curl | bash。
