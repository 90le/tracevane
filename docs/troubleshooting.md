# 故障排查

- **校验和不匹配：** 停止安装，重新下载元数据并核对 SHA-256；任何情况下都不要绕过校验。
- **Bash / 平台不受支持：** 使用 Linux 或 macOS 的 Bash；WSL 必须使用 Linux 侧的 Node 和文件系统，不要在 `/mnt/c/...` 下运行安装器。
- **OpenClaw 版本过低：** 升级到 `>= 2026.5.28`，然后运行 `openclaw config validate`。
- **页面提示 Unauthorized / 401：** Gateway 入口确认 URL 带有正确的 `?token=`（见 `~/.openclaw/openclaw.json`）；standalone 入口在解锁页输入 `~/.openclaw/tracevane/auth.json` 中的访问令牌。
- **node-pty 降级：** 安装编译环境（Debian/Ubuntu：`sudo apt install build-essential cmake`）后执行 `npm rebuild`；`degradedFeatures` 会记录受限能力。
- **服务管理器降级：** 无用户级 systemd 时安装器会降级为后台 `gateway run`，日志见 `~/.openclaw/logs/tracevane-gateway-fallback.log`。
- **健康检查地址：** standalone `http://127.0.0.1:3760/api/system/health`；gateway `/tracevane/api/system/health`，外加 3760 回退入口。
- **离线安装 / 卸载：** 离线安装显式传入版本、包地址和校验和；`--uninstall` 会保留备份以便回滚。
- **提交 GitHub Issue：** 附上平台、版本号、变更路径和脱敏后的 JSON/日志；务必移除 token 和凭据。

更完整的 Gateway 单口模式排查（自启、端口占用、helper pairing 等）见 [DEPLOY.md](../DEPLOY.md) 的「故障排查」一节。
