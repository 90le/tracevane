# Tracevane 发布与客户安装说明

## 当前交付口径

- 推荐 OpenClaw 主程序版本：`OpenClaw >= 2026.5.28`。
- 正式交付入口：`standalone`，默认本机/内网端口 `3760`。
- 单口入口：`gateway`，挂载到 OpenClaw Gateway 的 `/tracevane`，同时保留 `3760` 作为本机健康检查和回退入口。
- Tracevane 自身版本不手工维护：发布时由 `pack.sh` 从 `package.json` 当前版本自动递增 patch，并同步安装脚本、站点页、发布包和站点元数据。
- 官网安装脚本默认安装 `latest`，必须能读取站点元数据；离线或私有镜像安装时显式传入 `--version` 或 `--package-url`。

低于 `2026.5.28` 的 OpenClaw 不作为新安装目标；如需兼容旧版本，必须单独验证宿主 schema、插件加载、Gateway 路由和健康检查。

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

- `tracevane-<version>.tar.gz` 是客户安装包。
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

## 客户安装步骤

### 1. 检查 OpenClaw

```bash
openclaw --version
```

若版本低于 `2026.5.28`，先升级：

```bash
npm install -g openclaw@2026.5.28
openclaw gateway restart
```

### 2. 下载并检查安装脚本

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,180p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
```

### 3. 选择安装模式

可选：先只检查站点元数据和安装包 URL，不安装、不改配置：

```bash
/tmp/install-tracevane.sh --check-release
```

正式 standalone 模式：

```bash
/tmp/install-tracevane.sh --mode standalone
```

Gateway 单口模式：

```bash
/tmp/install-tracevane.sh --mode gateway
```

安装脚本会自动：

1. 从站点元数据解析最新 Tracevane 版本、下载地址、最低 OpenClaw 版本和安装包 SHA-256。
2. 必要时升级 OpenClaw。
3. 下载发布包并校验 SHA-256；metadata 未提供校验值时会明确告警。
4. 解压发布包。
5. 修正发布包元数据，确保宿主加载 `./dist/index.js`。
6. 安装生产依赖并重建 `node-pty`。
7. 写入 `plugins.entries.tracevane`、`plugins.load.paths` 和 transport 配置。
8. 备份 OpenClaw 配置，失败时尽量回滚本次安装改动。
9. 安装/重启 OpenClaw Gateway；无可用用户级 service 管理器时降级为后台 `gateway run`。
10. 执行健康检查。

## 手工安装兜底

仅在一键安装脚本不可用时使用：

```bash
cd ~/.openclaw/extensions
curl -fL https://github.com/90le/tracevane/releases/latest/download/tracevane-latest.json -o /tmp/tracevane-latest.json
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

随后确认 OpenClaw 配置中启用了 Tracevane，并包含当前安装路径：

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
            "preferredMode": "standalone",
            "standalone": { "enabled": true, "port": 3760 },
            "gateway": { "enabled": false, "basePath": "/tracevane" }
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

## 验证访问

Standalone：

```bash
curl -fsSL http://127.0.0.1:3760/api/system/health
```

Gateway：

```bash
curl -fsSL http://127.0.0.1:<gateway_port>/tracevane/api/system/health
curl -fsSL http://127.0.0.1:3760/api/system/health
```

浏览器访问：

- Standalone：`http://<host>:3760/`
- Gateway：`http://<host>:<gateway_port>/tracevane/`

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

### helper pairing / token cache 异常

如果单口环境出现 `pairing required`、`gateway closed (1006/1008)`，优先在 Tracevane System 页执行 helper token cache 修复。常见原因是 helper `paired.json` 已升级到新 operator token，但 `identity/device-auth.json` 仍缓存旧 token。

## 发布前检查

发布前至少执行：

```bash
bash -n pack.sh
bash -n install-tracevane.sh
node --test tests/system/install-script-release-metadata.test.mjs tests/system/dashboard-service.test.mjs
```

如变更了前端、API、终端或 Gateway 行为，再按对应范围补充 typecheck、build 和 smoke。
