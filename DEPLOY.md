# Tracevane 发布与客户安装说明

## 当前交付口径

- 推荐 OpenClaw 主程序版本：`OpenClaw >= 2026.5.28`。
- 正式交付入口：`gateway` 单口模式，Tracevane 挂载到 OpenClaw Gateway 的 `/tracevane`，与 OpenClaw 共用同一个端口。
- 单口模式下仍保留本机 `3760` standalone 入口，用于健康检查和回退直连。
- Tracevane 自身版本不手工维护：发布时由 `pack.sh` 从 `package.json` 当前版本自动递增 patch，并同步安装脚本、站点页、发布包和站点元数据。
- 官网安装脚本默认安装 `latest`，必须能读取站点元数据；离线或私有镜像安装时显式传入 `--version` 或 `--package-url`。

低于 `2026.5.28` 的 OpenClaw 不作为新安装目标；如需兼容旧版本，必须单独验证宿主 schema、插件加载、Gateway 路由和健康检查。

## 客户安装（Gateway 单口模式，推荐）

以下步骤在 Linux 上从干净环境到可用全流程可复制执行。

### 1. 前置要求

- OpenClaw `>= 2026.5.28`（低于该版本时安装脚本会自动用 `npm install -g openclaw@2026.5.28` 升级；传 `--skip-upgrade` 可禁止自动升级）。
- Node.js `>= 18` 和 `npm`。
- `tar`，以及 `curl` 或 `wget` 之一。
- 终端功能（node-pty 原生模块）如无法使用预编译二进制，需要系统编译环境：`sudo apt install build-essential cmake`（Debian/Ubuntu）。
- 推荐使用带 systemd 用户会话的环境（SSH 登录即满足）；无用户级服务管理器时安装脚本会降级为后台 `openclaw gateway run`。

检查版本：

```bash
openclaw --version
node --version
```

若 OpenClaw 低于 `2026.5.28`，先升级：

```bash
npm install -g openclaw@2026.5.28
openclaw gateway restart
```

### 2. 下载安装脚本

```bash
curl -fsSL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
```

可选：先只检查站点元数据和安装包 URL，不安装、不改配置：

```bash
/tmp/install-tracevane.sh --check-release
```

### 3. 一键安装（gateway 单口模式）

```bash
/tmp/install-tracevane.sh --mode gateway
```

安装脚本会自动：

1. 校验本机 Node.js 版本（>= 18）、`tar`、`curl`/`wget` 和 `openclaw` 命令。
2. 从站点元数据解析最新 Tracevane 版本、下载地址、最低 OpenClaw 版本和安装包 SHA-256。
3. 必要时升级 OpenClaw。
4. 检查 standalone 端口（默认 `3760`）是否被其它进程占用；已有运行中的 Tracevane 时按升级处理。
5. 下载发布包并校验 SHA-256；metadata 未提供校验值时会明确告警。
6. 解压发布包到 `~/.openclaw/extensions/tracevane`（旧版本自动备份到 `~/.openclaw/backups/tracevane/`）。
7. 修正发布包元数据，确保宿主加载 `./dist/index.js`。
8. 安装生产依赖并重建 `node-pty`。
9. 写入 `plugins.entries.tracevane`、`plugins.load.paths` 和 transport 配置（gateway 启用、standalone 保留回退）。
10. 备份 OpenClaw 配置，失败时尽量回滚本次安装改动。
11. 安装/重启 OpenClaw Gateway；无可用用户级 service 管理器时降级为后台 `gateway run`（日志：`~/.openclaw/logs/tracevane-gateway-fallback.log`）。
12. 对 gateway 入口和 3760 回退入口执行健康检查。

常用可选项：

```bash
# 指定版本（离线或私有镜像）
/tmp/install-tracevane.sh --mode gateway --version <x.y.z> --package-url <url> --package-sha256 <sha256>
# 只监听本机回环（默认 lan，允许局域网访问）
/tmp/install-tracevane.sh --mode gateway --gateway-bind loopback
# 修改 standalone 回退端口 / gateway basePath
/tmp/install-tracevane.sh --mode gateway --api-port 3761 --base-path /tracevane
# 只打印动作不落盘
/tmp/install-tracevane.sh --mode gateway --dry-run
```

### 4. 验证

Gateway 端口和访问 token 由安装器写入 `~/.openclaw/openclaw.json`：保留已有 `gateway.port`，未配置时默认 `31879`；`gateway.auth.mode` 为 `token` 且未配置 token 时自动生成。安装结束输出会打印完整的访问地址和健康检查结果。

读取端口和 token：

```bash
node -p "JSON.parse(require('node:fs').readFileSync(require('node:os').homedir() + '/.openclaw/openclaw.json', 'utf8')).gateway?.port ?? 31879"
node -p "JSON.parse(require('node:fs').readFileSync(require('node:os').homedir() + '/.openclaw/openclaw.json', 'utf8')).gateway?.auth?.token ?? ''"
```

健康检查（把 `<gateway_port>`、`<token>` 替换为上面的值）：

```bash
curl -fsSL "http://127.0.0.1:<gateway_port>/tracevane/api/system/health?token=<token>"
curl -fsSL http://127.0.0.1:3760/api/system/health
```

两条都应返回包含 `version`、`nodeVersion` 等字段的 JSON。

### 5. 浏览器访问

```txt
http://<host>:<gateway_port>/tracevane/?token=<token>
```

首次访问带 `?token=` 用于写入鉴权 Cookie，之后同一会话内可省略。standalone 回退入口为 `http://<host>:3760/`。

## 访问认证（密码 / 访问令牌）

Gateway 单口模式由 OpenClaw 宿主负责鉴权。除此之外，Tracevane 自带的 standalone 入口（生产环境默认 3760）**默认启用访问认证**：

- 首次启动自动生成随机**访问令牌**，保存在 `~/.openclaw/tracevane/auth.json`（0600 权限，Jupyter 同款模式）。浏览器打开 standalone 入口会出现解锁页，输入令牌即可；验证成功后写入 HttpOnly Cookie，30 天内免登录。
- 查看令牌：`cat ~/.openclaw/tracevane/auth.json`（取 `token` 字段）。
- 令牌同时覆盖页面、全部 `/api/**` 接口和 WebSocket 升级请求；未认证一律返回 401。
- standalone 入口**默认只监听 `127.0.0.1`**。确需局域网访问时，显式设置 `TRACEVANE_BIND_HOST=0.0.0.0`（或在插件配置 `security.bindHost` 中指定），并务必先设置密码。
- 设置/修改密码（可选，设置后可用密码代替令牌解锁）：

```bash
curl -X POST http://127.0.0.1:3760/api/auth/password \
  -H 'Content-Type: application/json' \
  -H 'Cookie: tracevane_session=<解锁后获得的 cookie>' \
  -d '{"currentCredential":"<访问令牌>","newPassword":"<新密码>"}'
```

- 关闭认证（仅限可信本机开发环境）：`TRACEVANE_AUTH=off`；强制开启：`TRACEVANE_AUTH=on`。

## 升级

重新执行一键安装即可，安装器幂等：保留既有配置，旧安装目录自动备份到 `~/.openclaw/backups/tracevane/`。

```bash
curl -fsSL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --mode gateway
```

安装到指定版本（含降级）：

```bash
/tmp/install-tracevane.sh --mode gateway --version <x.y.z>
```

## 卸载

```bash
# 1. 从 OpenClaw 配置中移除 Tracevane 插件条目和加载路径
node - <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const configPath = process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
const installDir = path.join(os.homedir(), '.openclaw', 'extensions', 'tracevane');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.plugins?.entries) delete config.plugins.entries.tracevane;
if (Array.isArray(config.plugins?.allow)) {
  config.plugins.allow = config.plugins.allow.filter((item) => item !== 'tracevane');
}
if (Array.isArray(config.plugins?.load?.paths)) {
  config.plugins.load.paths = config.plugins.load.paths.filter((item) => path.resolve(String(item)) !== installDir);
}
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE

# 2. 删除安装目录（历史备份在 ~/.openclaw/backups/tracevane/，可按需清理）
rm -rf ~/.openclaw/extensions/tracevane

# 3. 校验配置并重启 Gateway，使插件卸载生效
openclaw config validate
openclaw gateway restart --safe || openclaw gateway restart
```

卸载只移除 Tracevane，不会改动 `gateway.port`、`gateway.auth` 等 OpenClaw 自身配置。

## Standalone 模式（可选）

standalone 是直连调试入口，UI 直接监听 `3760`；插件仍由 OpenClaw Gateway 托管加载，Gateway 需保持运行。

```bash
/tmp/install-tracevane.sh --mode standalone
```

验证：

```bash
curl -fsSL http://127.0.0.1:3760/api/system/health
```

浏览器访问 `http://<host>:3760/`。

## 手工安装兜底

仅在一键安装脚本不可用时使用：

```bash
cd ~/.openclaw/extensions
curl -fsSL https://github.com/90le/tracevane/releases/latest/download/tracevane-latest.json -o /tmp/tracevane-latest.json
PACKAGE_URL="$(node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('/tmp/tracevane-latest.json','utf8')); console.log(m.packageUrl)")"
VERSION="$(node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('/tmp/tracevane-latest.json','utf8')); console.log(m.version || m.latestVersion)")"
SHA256="$(node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('/tmp/tracevane-latest.json','utf8')); console.log(m.sha256 || m.packageSha256 || m.checksum?.sha256 || '')")"
curl -fL "$PACKAGE_URL" -o "tracevane-${VERSION}.tar.gz"
node -e "const crypto=require('node:crypto'); const fs=require('node:fs'); const expected=process.argv[2]; if (expected) { const actual=crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'); if (actual !== expected) throw new Error('sha256 mismatch: '+actual); }" "tracevane-${VERSION}.tar.gz" "$SHA256"
tar -xzf "tracevane-${VERSION}.tar.gz"
rm -rf tracevane
mv "tracevane-${VERSION}" tracevane
cd tracevane
npm install --production --ignore-scripts
npm rebuild @homebridge/node-pty-prebuilt-multiarch || true
```

随后确认 OpenClaw 配置中启用了 Tracevane，并包含当前安装路径（gateway 单口模式示例）：

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "tracevane": {
        "enabled": true,
        "config": {
          "autoStart": true,
          "apiPort": 3760,
          "transport": {
            "preferredMode": "gateway",
            "standalone": { "enabled": true, "port": 3760 },
            "gateway": { "enabled": true, "basePath": "/tracevane" }
          }
        }
      }
    },
    "load": {
      "paths": ["/home/<user>/.openclaw/extensions/tracevane"]
    }
  }
}
```

然后执行：

```bash
openclaw config validate
openclaw gateway install --force
openclaw gateway restart --safe || openclaw gateway restart
```

## 故障排查

### 页面打不开

检查：

```bash
openclaw --version
openclaw config validate
openclaw gateway health
openclaw logs
ls ~/.openclaw/extensions/tracevane/
```

确认 `~/.openclaw/openclaw.json` 中 `plugins.entries.tracevane.enabled` 为 `true`、`plugins.load.paths` 包含安装目录、`transport.gateway.enabled` 为 `true`。

### 健康检查 401 / 浏览器提示 Unauthorized

gateway 入口启用了 token 鉴权。确认 URL 带上了正确的 `?token=`（见上文“验证”一节），或使用安装结束时打印的完整访问地址。

### 服务器重启后 Gateway 没有自启

systemd 用户级服务默认只在用户会话存活期间运行。无头服务器上为用户开启 lingering：

```bash
sudo loginctl enable-linger "$USER"
openclaw gateway install --force
openclaw gateway restart
```

无 systemd 用户会话时安装脚本会降级为后台 `openclaw gateway run`，该进程不会随重启恢复；日志见 `~/.openclaw/logs/tracevane-gateway-fallback.log`。

### 安装报端口被占用

安装器会预检 standalone 端口（默认 `3760`）：被其它进程占用时会报错退出。释放该端口，或用 `--api-port <port>` 指定其它端口；若是旧 Tracevane 实例异常残留，先 `openclaw gateway restart` 再重试。

### 版本过低

如果 OpenClaw 低于 `2026.5.28`，先升级后再安装 Tracevane。不要把低版本兼容问题当作 Tracevane 配置问题处理。

### 依赖或终端功能异常

在安装目录执行：

```bash
cd ~/.openclaw/extensions/tracevane
npm install --production --ignore-scripts
npm rebuild @homebridge/node-pty-prebuilt-multiarch
```

如果 `node-pty` 无法加载，终端能力可能不可用；需补齐系统编译环境或切换到支持的 Node ABI。

### 守护服务无法启动 / is-enabled 报 bad-setting

三个守护（`tracevane-model-gateway.service`、`tracevane-channel-connectors.service`、`tracevane-recovery.service`）启动失败时，先在 Tracevane 界面上对对应守护执行一次「修复/重新安装」：

- 如果 `~/.config/systemd/user/default.target.wants/` 里残留失效符号链接（unit 文件已被回滚删除，systemd 报 `bad-setting`），安装与卸载流程现在都会自动清理这些坏链。
- 启动前会自动检测守护端口（默认 `18796`/`18797`/`18798`）占用：占用者若是残留的 Tracevane 守护进程（例如 Gateway 直接拉起的孤儿子进程），会被自动终止后再启动；若是无关进程，不会强行结束它，错误信息会给出 pid 和命令行，需要手动停止该进程或改守护端口。

手动排查命令：

```bash
systemctl --user is-enabled tracevane-channel-connectors.service
systemctl --user is-active tracevane-channel-connectors.service
ls -l ~/.config/systemd/user/default.target.wants/
ss -ltnp | grep -E '18796|18797|18798'
```

### helper pairing / token cache 异常

如果单口环境出现 `pairing required`、`gateway closed (1006/1008)`，优先在 Tracevane System 页执行 helper token cache 修复。常见原因是 helper `paired.json` 已升级到新 operator token，但 `identity/device-auth.json` 仍缓存旧 token。

## 发布包内容

`./pack.sh` 生成的发布目录包含（维护者发布到 GitHub Releases）：

```txt
tracevane-<version>/
tracevane-<version>.tar.gz
install-tracevane.sh
index.html
tracevane-latest.json
tracevane-version.json
version.json
```

其中：

- `tracevane-<version>.tar.gz` 是客户安装包，内含 `dist/`（插件运行时，`dist/index.js` 为入口）、`apps/web/dist/`（前端静态资源）、`package.json` 和 `openclaw.plugin.json`。
- `install-tracevane.sh` 是官网下载后执行的一键安装脚本。
- `index.html` 是官网安装页。
- `tracevane-latest.json`、`tracevane-version.json`、`version.json` 是安装器和系统升级检查读取的发布元数据，包含安装包 URL、最低 OpenClaw 版本和安装包 SHA-256。

## 发布流程

正式发布：

```bash
./pack.sh
```

行为：

1. 读取 `package.json` 当前版本。
2. 自动递增 patch 版本，例如 `<major>.<minor>.<patch> -> <major>.<minor>.<patch+1>`。
3. 同步 root/workspace package、lockfile、fallback 版本、installer 和官网页。
4. 构建 API 与 Web。
5. 生成发布包、安装包 SHA-256 和站点元数据。

指定版本发布：

```bash
./pack.sh 1.2.3
```

本地发布烟测，不修改源码版本：

```bash
./pack.sh --no-source-sync --output-dir /tmp/tracevane-release-test
```

只查看下一次自动版本号，不构建、不改源码：

```bash
./pack.sh --print-version
```

`pack.sh` 不再支持旧的 `--base-path` 参数。部署路径由运行时配置决定，不在打包阶段写死。

## 发布前检查

发布前至少执行：

```bash
bash -n pack.sh
bash -n install-tracevane.sh
node --test tests/system/install-script-release-metadata.test.mjs tests/system/dashboard-service.test.mjs
```

如变更了前端、API、终端或 Gateway 行为，再按对应范围补充 typecheck、build 和 smoke。

## Maintainer-only GitHub Release publication

以下步骤仅供仓库维护者使用，不是终端用户安装流程。先确认版本、测试和工作树，再生成确定性 Release 资产：

```bash
VERSION=0.1.72
bash pack.sh --no-source-sync --output-dir ".tmp/release-${VERSION}" "${VERSION}"
test -s ".tmp/release-${VERSION}/tracevane-${VERSION}.tar.gz"
test -s ".tmp/release-${VERSION}/install-tracevane.sh"
test -s ".tmp/release-${VERSION}/SHA256SUMS"
git tag "v${VERSION}"
git push origin "v${VERSION}"
gh release create "v${VERSION}" \
  ".tmp/release-${VERSION}/tracevane-${VERSION}.tar.gz" \
  ".tmp/release-${VERSION}/install-tracevane.sh" \
  ".tmp/release-${VERSION}/SHA256SUMS" \
  ".tmp/release-${VERSION}/tracevane-latest.json" \
  ".tmp/release-${VERSION}/tracevane-version.json" \
  --title "Tracevane v${VERSION}" --generate-notes
```

检查 Release 必须同时包含 tarball、Bash 安装器、`SHA256SUMS` 和两个 metadata JSON；发布前核对 SHA-256 与 metadata 中的 `packageUrl`、`sha256` 一致。
