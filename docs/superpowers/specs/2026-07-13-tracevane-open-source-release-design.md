# Tracevane 开源发布、Bash 安装与 GitHub Pages 设计

## 决策

Tracevane 以公开仓库 `90le/tracevane` 发布，采用 MIT License。GitHub 是源码、版本标签、发行资产、校验值和问题反馈的单一可信来源；GitHub Pages 提供纯静态 HTML 官网，首阶段使用 `https://90le.github.io/tracevane/`，不绑定自定义域名。

首阶段只承诺 Bash 安装路径，正式支持 Linux 和 macOS；WSL 按 Linux 环境处理，Git Bash 不列入正式支持范围。Windows 原生 PowerShell、MSI/EXE、macOS DMG 和 Linux AppImage/deb/rpm 属于后续独立阶段，不阻塞首次开源发布。

项目以“功能完成、进入维护模式”的口径公开：保留 Issue 接收安装和缺陷反馈，但不承诺持续扩展产品能力或提供 SLA。

## 目标

1. 让用户能够从 GitHub README、GitHub Pages 官网或 GitHub Release 找到同一条可信安装路径。
2. 让 Linux/macOS 用户通过 Bash 安装器完成版本解析、下载、完整性验证、配置、启动、健康检查和失败回滚。
3. 让 Codex、Claude Code、OpenCode、OpenClaw Agent 等 AI Agent 能通过明确 Prompt 安装，并返回结构化验收结果。
4. 让版本化源码、编译产物、安装器、元数据、校验文件和 Release Notes 由 GitHub Actions 可复现地产生。
5. 为公开协作补齐许可证、项目说明、安全说明、贡献说明、变更记录和发行说明。
6. 在公开历史或代码前完成密钥、个人数据、机器路径和不应公开资产检查。

## 非目标

- 首阶段不制作桌面安装器或原生 GUI 安装向导。
- 不在首阶段发布 npm 公共包；根 `package.json` 可继续保留 `private: true`，避免误发布。
- 不引入 GitHub Pages 静态站点生成器、CMS 或新的前端框架。
- 不建立自建更新服务器；GitHub Release 是发行资产的事实源。
- 不为开源发布继续扩展 Tracevane 的产品模块。
- 不保证 Git Bash、Cygwin、Windows 原生 Bash 或未验证的 Node ABI。

## 公共入口

| 入口 | 地址或载体 | 职责 |
|---|---|---|
| 源码 | `https://github.com/90le/tracevane` | 代码、文档、Issue、版本标签 |
| 官网 | `https://90le.github.io/tracevane/` | 产品介绍、真实图片、安装模式、Prompt、Release 入口 |
| 最新发行 | `https://github.com/90le/tracevane/releases/latest` | 最新版本说明与全部发行资产 |
| 安装器 | `https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh` | 稳定的最新 Bash 安装入口 |
| 最新元数据 | `https://github.com/90le/tracevane/releases/latest/download/tracevane-latest.json` | 版本、包地址、最低宿主版本、SHA-256 |
| 支持 | GitHub Issues | 缺陷、安装失败和安全入口分流 |

官网、README 和 Agent Prompt 必须引用这些稳定入口，不再以 `tracevane.90le.cn` 作为默认下载源。安装器仍允许通过显式参数或环境变量指定私有镜像，但镜像不是公开默认值。

## 仓库公开结构

保留现有应用结构，并补齐下列公开表面：

```text
README.md                         # 中文主 README，首屏说明、图片、安装、文档导航
README_EN.md                      # 英文 README
LICENSE                           # MIT License 正文
CHANGELOG.md                      # Keep a Changelog 风格的版本变更
CONTRIBUTING.md                   # Issue/PR、开发环境、验证命令
SECURITY.md                       # 私密漏洞报告方式和支持版本口径
DEPLOY.md                         # 维护者构建、发布和客户部署说明
docs/
  installation.md                # Bash 安装、升级、卸载、离线安装
  agent-installation.md          # Agent Prompt 与验收合同
  architecture.md                # 产品边界和运行架构
  troubleshooting.md             # 常见安装与运行故障
assets/
  brand/                         # Logo、图标、favicon
  screenshots/                   # 真实产品截图，不使用伪造能力画面
.github/
  ISSUE_TEMPLATE/                # Bug、安装问题、功能建议模板
  pull_request_template.md
  workflows/ci.yml
  workflows/release.yml
  workflows/pages.yml
```

README 首屏包含产品一句话说明、维护状态、真实截图、系统要求、快速安装、两种运行模式、文档导航、Release/Pages/Issue 链接。公开支持入口使用 GitHub Issues，官网现有个人手机号不继续公开。

## GitHub Pages 官网

现有根目录 `index.html`、`assets/brand` 和 `assets/landing` 作为静态官网基础，不引入构建框架。实现时可以增加真实产品截图和少量静态页面，但所有资源链接必须使用相对路径，以兼容 `/tracevane/` 项目站点前缀。

Pages 构建步骤生成一个独立的临时站点目录，至少包含：

- `index.html`
- 品牌图、favicon、产品海报和真实截图
- 当前 `version.json`
- 供人工审阅的 `install-tracevane.sh`
- `404.html`
- `.nojekyll`

官网展示的版本来自随站点部署的 `version.json`。安装下载仍跳转到 GitHub Release 资产，避免 Pages 文件和 Release 文件形成两个互相竞争的发行源。

官网安装区提供：

1. Standalone 模式复制命令。
2. Gateway 模式复制命令。
3. 简短 Agent Prompt。
4. 严格审计 Agent Prompt。
5. GitHub Release、SHA-256 和源码审阅入口。

页面不得声称 Windows 原生 Bash 已受支持，也不得展示未经实际验证的安装成功状态。

## 版本和发行合同

使用 SemVer 标签 `vMAJOR.MINOR.PATCH`。根 `package.json` 版本、Release 标签、安装包目录名、元数据版本和 Release 标题必须一致。首次公开发行使用实施时的下一个 patch 版本；按当前 `0.1.71` 计算，预期为 `v0.1.72`，但自动化不得把该数字硬编码为永久值。

标签是公开 Release 的触发器。CI 中的打包必须是确定性的，不允许自动修改源码或创建隐式版本提交：

1. 从 `refs/tags/vX.Y.Z` 解析版本。
2. 校验标签版本与已提交的 `package.json` 版本一致。
3. 执行依赖安装、类型检查、定向测试和正式构建。
4. 以显式版本和 `--no-source-sync` 方式调用打包逻辑。
5. 生成发行目录和校验文件。
6. 创建 GitHub Release 并上传资产。

每个 Release 至少包含：

```text
tracevane-X.Y.Z.tar.gz
install-tracevane.sh
tracevane-latest.json
tracevane-version.json
version.json
SHA256SUMS
```

`SHA256SUMS` 覆盖安装包和单独上传的安装器。GitHub 自动生成的 Source code 压缩包只是源码快照，不作为客户安装包。

Release Notes 包含产品摘要、系统要求、安装命令、升级说明、重要变更、已知限制、校验说明和完整变更链接。`CHANGELOG.md` 保存用户可见的长期变更记录，Release Notes 保存单个版本的交付说明。

## GitHub Actions

### CI

对 `main` 推送和 Pull Request 运行：

- `npm ci`
- 安装器语法检查 `bash -n`
- 安装器与 Release 元数据定向测试
- API/Web 类型检查
- API/Web 构建
- 与本次开源改动直接相关的最小测试集

完整系统测试如果耗时或依赖外部服务，可以作为独立手动工作流或定时工作流，但 Release 所需的确定性测试不得跳过。

### Release

`v*` 标签触发，工作流只使用仓库自带脚本和固定主版本的官方 Actions。它先完成与 CI 相同的验证，再构建和上传 Release 资产。任何版本不一致、构建失败、校验缺失或资产缺失都必须阻止 Release 发布。

### Pages

`main` 的官网文件或 Release 元数据变化时触发。工作流组装静态目录，上传 Pages artifact，再部署到 `github-pages` 环境。Pages 不绑定自定义域名，不提交 `CNAME` 文件。

## Bash 安装器合同

### 支持环境

- Linux x64/arm64：正式支持，但仍受 Node/OpenClaw 原生依赖支持范围约束。
- macOS Intel/Apple Silicon：正式支持。
- WSL：作为 Linux 环境支持，访问地址和后台服务行为按 WSL 实际网络环境说明。
- Git Bash/Cygwin：检测到时明确退出并提示等待 PowerShell 安装器或改用 WSL。

### 前置检查

安装器在写入前检查 `bash`、`node`、`npm`、`openclaw`、`tar`，以及 `curl`/`wget` 中至少一个。它输出检测到的 OS、架构、Node 版本、OpenClaw 版本、安装目录和安装模式。端口、配置路径和安装目录必须在修改前完成验证。

### 下载与验证

默认从 GitHub Release 的稳定 latest 资产 URL 获取 `tracevane-latest.json`，再下载版本化安装包。正式在线安装必须获得合法 SHA-256 并通过校验；元数据缺少校验值时直接失败，不再仅告警后继续。离线或私有镜像安装可以显式传入包 URL、版本和 SHA-256。

下载先进入临时目录。解压后校验目录结构、`package.json`、`openclaw.plugin.json` 和 `dist/index.js`，通过后才替换正式安装目录。

### 安装、升级和回滚

安装器保留现有 `standalone` 与 `gateway` 模式。重复执行相同版本应安全且结果一致；安装较新版本执行原位升级。替换前备份现有扩展目录和 OpenClaw 配置，安装失败时恢复两者。成功后保留有限数量的备份，并在结果中给出备份位置。

安装器继续完成生产依赖安装、`node-pty` 重建、OpenClaw 配置写入、配置验证、Gateway 安装/重启和健康检查。原生模块失败时允许核心安装完成，但必须把终端能力标记为 degraded，输出针对当前 OS 的修复建议。

首阶段提供明确的卸载命令或 `--uninstall`：备份配置、移除 Tracevane 插件条目和加载路径、保留用户数据默认不删除、重启 Gateway，并报告仍保留的数据目录。破坏性的数据删除必须使用独立显式参数，不作为默认卸载行为。

### 非交互与 Agent 输出

安装器保留 `--dry-run`、`--check-release` 和 `--skip-upgrade`，增加适合自动化的非交互确认方式及 `--json` 结果。JSON 最终结果至少包含：

- `status`
- `version`
- `mode`
- `platform`
- `installDir`
- `configPath`
- `accessUrls`
- `healthChecks`
- `backupPath`
- `warnings`
- `degradedFeatures`

日志不得打印 Gateway token、API key、OAuth 凭据或完整敏感配置。

## Agent Prompt 合同

提供两类 Prompt，但二者调用同一个安装器：

### 简短 Prompt

适合用户直接复制给 Agent，内容包括目标模式、官方仓库、下载地址、执行命令和需要返回的验收字段。Prompt 不让 Agent 自行猜测版本或拼装安装步骤。

### 严格审计 Prompt

要求 Agent：

1. 确认操作系统和 Bash 环境受支持。
2. 从 GitHub Release 下载脚本到本地文件。
3. 展示脚本来源、SHA-256 和即将修改的路径。
4. 先运行 `--check-release` 或 `--dry-run`。
5. 再执行正式安装。
6. 保存并返回安装器 JSON 结果。
7. 对访问地址执行健康检查。
8. 发生失败时停止，不隐藏错误，不手工绕过 checksum 或配置验证。

Standalone 与 Gateway 各提供一份 Prompt。README、官网和 `docs/agent-installation.md` 中的 Prompt 由测试校验关键 URL、模式参数和验收字段，避免文档漂移。

## 开源安全与历史处理

首次公开前扫描当前工作树和 Git 历史：

- 私钥、访问令牌、API key、OAuth 凭据和真实密码。
- `.env`、运行日志、数据库、缓存、用户配置和备份。
- 个人手机号、非必要邮箱、内部服务器地址和绝对本机路径。
- 第三方图片、字体、视频或代码的再分发权限。
- 过大的生成文件和不应进入 Git 的 release/build 产物。

现有 `.gitignore` 继续排除依赖、构建目录、环境变量和发行产物。扫描结果干净时保留完整 Git 历史；发现历史敏感信息时，不把问题历史直接推到公开仓库，先清理历史并重新扫描。若历史无法可靠清理，则以审计后的当前快照创建公开初始历史，同时保留本地私有历史作为内部证据。

MIT `LICENSE` 的版权主体使用仓库所有者确认的公开名称。`SECURITY.md` 不公开私人电话号码，提供 GitHub 私密漏洞报告能力可用时的入口，并给出暂不可用时的安全联系邮箱。

## 错误处理

- CI/Release：版本、构建、测试、校验或资产任一失败即终止，不创建“部分成功”的正式 Release。
- Pages：部署失败不影响既有官网；Release 下载链接仍保持可用。
- 安装下载：网络失败给出源 URL、重试建议和离线参数，不自动关闭 TLS 校验。
- SHA-256：不一致立即删除临时包并退出。
- 配置写入：先备份、原子替换、执行 `openclaw config validate`；失败则恢复备份。
- 服务启动：优先使用 OpenClaw 支持的 service 管理入口；不可用时可降级后台运行，但必须明确标记。
- 健康检查：区分 standalone、gateway 和 3760 回退入口，输出每个 endpoint 的结果。
- Agent 模式：所有失败使用非零退出码，JSON 结果保留机器可读错误代码和人工可读消息。

## 验证策略

### 静态和单元验证

- `bash -n install-tracevane.sh`
- ShellCheck（在 CI 固定版本或受控 Action 中运行）
- 现有 `install-script-release-metadata` 测试扩展到 GitHub URL、校验强制、Prompt 和 Release 资产合同
- API/Web 类型检查和构建
- README、官网和部署文档中的版本/URL 一致性测试

### 安装器集成验证

使用临时 HOME、伪造 OpenClaw 命令和本地 HTTP fixture 覆盖：

- 最新版本元数据解析
- standalone/gateway 配置
- SHA-256 成功和失败
- 重复安装
- 版本升级
- 配置验证失败回滚
- 安装目录替换失败回滚
- 健康检查失败
- `--dry-run`、`--check-release`、`--json`、`--uninstall`

Linux 在 GitHub Actions 中作为 Release 阻断验证。macOS 使用 GitHub 托管 runner 验证脚本语法、前置检测、元数据、下载/校验和 mock 安装流程；真实 OpenClaw service 行为在发布清单中记录人工 smoke 结果。

### 官网验证

- 所有静态资源在 `/tracevane/` 子路径下可加载。
- 首页在桌面和移动端可读。
- 复制命令和四份 Prompt 内容正确。
- Release、源码、文档、Issue 链接有效。
- `version.json` 可读取且与最新 Release 一致。
- reduced-motion 和基本键盘可访问性保持可用。

## 发布顺序

1. 完成开源安全和许可证资产检查。
2. 补齐文档、图片和公开仓库元数据。
3. 重构并测试 Bash 安装器与 Agent Prompt。
4. 固化确定性打包和 CI。
5. 增加 Release 工作流并在本地/临时 tag 条件下验证资产合同。
6. 增加 Pages 工作流并验证 `/tracevane/` 路径。
7. 创建公开仓库 `90le/tracevane`，推送审计后的历史或快照。
8. 启用 GitHub Pages 的 Actions 发布源。
9. 创建首次公开 tag 和 GitHub Release。
10. 验证 README、Pages、latest 下载、checksum、Bash 安装和 Agent Prompt 全链路。

## 完成条件

- `90le/tracevane` 为公开 MIT 仓库，默认分支为 `main`。
- README 和 Pages 能让新用户在不阅读源码的情况下理解产品、要求和安装模式。
- GitHub Release 包含约定资产，校验文件可复核。
- Linux/macOS Bash 安装合同通过自动化验证，至少完成一次真实受支持环境 smoke。
- Standalone/Gateway 的用户命令和 Agent Prompt 均能完成安装并返回健康检查证据。
- Pages 成功发布到 `https://90le.github.io/tracevane/`，没有 `CNAME`。
- 源码和历史的公开安全检查有记录，没有已知密钥或不应公开的个人数据。
- 失败安装能够回滚配置和旧安装，默认卸载不会删除用户数据。

