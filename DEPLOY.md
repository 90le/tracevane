# Tracevane 客户安装说明

## 1. 适用范围

这份文档是当前应当直接发给客户的安装说明。

截至 2026-04-09，当前需要明确区分两条路径：

1. **正式支持**：`standalone :3760`
2. **预览模式**：`Gateway 单端口`

其中：

1. `standalone` 模式是当前正式可交付模式
2. `Gateway 单端口模式` 的核心链路已经完成，但当前技术形态已收敛为：
   - `terminal` 继续走扩展侧 `gateway-rpc`
   - `chat` 走 `Tracevane backend helper + HTTP/SSE`
   - `device trust` 由 Tracevane 自己管理 helper pairing / approve
   - helper 本机 `device-auth.json` token cache 漂移由 Tracevane 检测并可修复
3. 本地 `OpenClaw 2026.4.5` 环境下，核心后端 durability 已验证通过
4. 但在客户现场验证完成前，**仍只能作为预览/受限场景测试模式**
5. Tracevane 已新增 bootstrap / 引导能力
   - 新安装或配置不一致时，可由 Tracevane 自己补齐最低可用配置
   - System 页已提供“应用推荐初始化”
6. System 页入口已调整为更直接可见
   - 侧边栏名称已统一为“系统诊断”
   - System 页默认首屏就是“初始化与引导 / Bootstrap”
7. standalone 模式下，Chat realtime 已新增稳定性回退
   - 原生 `/ws/chat` 若连续重连失败，会自动切到同源 SSE 持续流
   - 目标是避免 standalone 下因 WebSocket 抖动导致“能进页面但流式中断”
8. Chat 资源下载链路已按 exposure 自动补齐路径
   - Gateway 单口下资源地址必须走 `/tracevane/api/...`
   - standalone 下资源地址继续走 `/api/...`
   - 当前前端已按运行时自动处理，无需客户手工改链接
9. Config 页已开始按真实 OpenClaw 2026.4.5 schema 对齐
   - Gateway / Browser 关键字段已对齐并通过保存回写验证
   - Tracevane 保存插件加载路径时已统一写入 `plugins.load.paths`
   - 旧配置中的 `browser.ssrfPolicy.allowPrivateNetwork` 会被兼容读取，并在保存时迁移到新字段
10. Agents 页已开始按真实 OpenClaw 2026.4.8 agent schema 对齐
   - 已补齐默认运行字段：`thinkingDefault / verboseDefault / reasoningDefault / fastModeDefault`
   - 已补齐 `identity.theme`
   - 已新增高级字段编辑区，支持 `systemPromptOverride / skills / sandbox / tools / memorySearch / humanDelay / heartbeat / groupChat / subagents / params`
   - 已新增只读 `Raw Config Snapshot`，便于客户直接核对宿主原始 agent 配置
   - 已修复对象型 `agent.model` 在 Tracevane 保存时可能被误删的问题
11. Agents 页已补齐旧数据兼容兜底
   - 历史缓存或旧接口缺失 `editor.skills` 时，不再导致前端 `join` 报错
12. Config 页已继续补齐 `agents.defaults` 的高价值字段
   - 当前已新增 `verboseDefault / systemPromptOverride / skills`
13. Config 页已继续补齐默认行为字段
   - 当前已新增 `contextInjection / userTimezone / timeFormat / typingMode / mediaMaxMb`
   - 当前已新增 `memorySearch / humanDelay / heartbeat / params` 默认 JSON 编辑
   - 当前已新增 `agents.defaults.subagents.model / thinking / runTimeoutSeconds`
14. Config 页新增字段的标题、下拉和说明文案已收口
   - 现支持中英文切换
   - 下拉选项不再显示原始对象 JSON
   - 新增字段均已补齐“作用 / 如何配置”提示
15. Config 页已继续补齐更多 `agents.defaults` 高价值字段
   - 当前已新增 `bootstrapPromptTruncationWarning`
   - 当前已新增 `envelopeTimezone / envelopeTimestamp / envelopeElapsed`
   - 当前已新增 `contextTokens`
   - 当前已新增 `elevatedDefault`
   - 当前已新增 `blockStreamingDefault / blockStreamingBreak`
   - 当前已新增 `imageMaxDimensionPx / typingIntervalSeconds`
   - 当前已新增 `pdfMaxBytesMb / pdfMaxPages`
16. Config 保存已支持清空可选默认值
   - 页面恢复为“未设置”后，不再把旧覆盖值残留在宿主配置里
17. 上述新增字段已完成浏览器回归
   - 已验证中英文切换
   - 已验证下拉展开与填写交互
18. Browser 配置页已补齐 `browser.profiles` 的常用编辑能力
   - 已支持 `id / driver / attachOnly / cdpPort / cdpUrl / userDataDir / color`
   - 已支持新增 / 删除 profile
   - 已支持清空整个 profiles 集合
19. Browser 配置页新增编辑能力已完成浏览器回归
   - 已验证 Profile 表单可见、可输入
   - 已验证中英文切换
20. 官网安装入口已同步更新
   - `index.html` 现已区分“非单口 / 单口”两套安装指引
   - 已新增网站一键安装脚本 `install-tracevane.sh`
   - 脚本支持 `--mode standalone|gateway`
   - 官网 Prompt 已改成“先下载脚本到本地，再检查并执行”，不再使用 `curl | bash`
   - 已覆盖版本检查、下载安装、依赖安装、配置写入、`gateway install --force`、重启与健康检查
21. 发布包与安装流程已补齐自愈
   - 发布包 `package.json` 现在会显式把 `openclaw.extensions` 指向 `./dist/index.js`
   - 安装脚本即使拿到旧包，也会在落盘后自动修正入口元数据
   - 已解决安装后宿主提示 `plugins.entries.tracevane: plugin not found: tracevane` 的问题
22. 安装器已继续收口旧版本残留与 service 失败场景
   - 旧版本不再备份到扩展根目录下的 `.prev/.bak/.old`
   - 现在统一迁移到 `~/.openclaw/backups/tracevane/`
   - 已解决宿主扫描到 `tracevane.prev` 后出现 `duplicate plugin id detected`
   - `openclaw gateway install --force` 在无可用 systemd/launchd user session 的环境下会降级为告警，不再直接中断安装
23. Channels 页已继续补齐字段说明
   - Provider / Account / Access / Binding 关键字段已新增“作用 / 如何配置”提示
   - 目标是让客户首次接触频道配置时，不需要回头翻宿主文档才能理解字段含义
24. Plugins 配置页已继续补齐关键真实字段
   - 已支持 `plugins.enabled`
   - 已支持 `plugins.deny`
   - 已支持 `plugins.slots.memory / plugins.slots.contextEngine`
   - 已新增 `plugins.installs` 只读追踪视图
25. ACP / Commands & Hooks / Session / Logging 配置页已继续补齐说明
   - 关键字段已补齐“作用 / 如何配置”提示
26. Channels 页已继续补齐高级宿主字段
   - Provider 现支持编辑 `dm / groups / guilds / execApprovals` JSON
   - Account 现支持编辑 `dm / groups / guilds / execApprovals` JSON
   - 适用于 `OpenClaw 2026.4.8` 下更深层的频道策略，而不是只停留在基础开关
27. 上述 Channels 高级字段已补齐系统回归
   - 已验证 summary 读取不丢字段
   - 已验证保存后能稳定写回宿主配置
28. 已补齐低版本浏览器/运行时兼容
   - 前端不再硬依赖 `crypto.randomUUID`
   - Terminal 连接与配置页动态条目在不支持 `randomUUID` 的环境下也可正常工作
29. 已补齐无 Docker 环境下的沙盒自愈
   - Config 保存时会自动收敛 Docker-backed Agent 沙盒到 `off`（仅在设备无 Docker 且全局沙盒已关闭时）
   - System bootstrap 已新增 `sandbox runtime` 检查和修复
   - 安装脚本会在安装阶段自动检测 Docker 并落盘安全默认值，避免客户再额外执行修复脚本
30. 已补齐默认 Agent 回退
   - 当宿主没有显式 `agents.list` 时，`/agents` 与 `/channels` 不再显示空 Agent 集合
   - Tracevane 会回退暴露默认 Agent（`main`），并支持后续编辑 materialize 到 `agents.list`
31. 已修复配置保存后宿主校验失败导致的网关重启异常
   - `models.providers.*` 保存时会自动保证 `baseUrl` 非空、`models` 为数组
   - 对缺失 provider 配置会自动补默认占位 `baseUrl`
   - `session.reset.idleMinutes` 已改为正整数约束，避免 `expected number to be >0`

补充：

1. 如果单口环境里看到类似 `pairing required`、`gateway closed (1006/1008)` 的工具错误，不一定是聊天主链路故障。
2. 更常见的原因是本机 Tracevane helper 的 `paired.json` 已经升级到更高 operator token，但 `identity/device-auth.json` 仍缓存旧 token。
3. 当前 Tracevane 已内置检测与修复入口，System 页可直接执行 helper token cache 修复。
4. 另一类 `pairing required` 来自宿主内建 CLI / tool 的 `metadata-upgrade`。
5. 如果日志里出现 `claimedDeviceFamily=<none> pinnedDeviceFamily=server`，说明是宿主内建 `callGateway()` 分支没有带完整 `deviceFamily`，不是 Tracevane Chat/Terminal 主链路本身坏掉。

## 1.1 单口模式的准确定义

这里的“单口模式”指的是：

1. 客户**外网**只能开放 `OpenClaw` 的启动端口
2. 设备**内网 / 本机回环**不受这个限制
3. Tracevane 的 `3760` 可以继续在设备内部存在
4. 目标是让外部用户通过一个开放端口，获得接近直接访问 `3760` 的功能体验

这不等于：

1. 外部浏览器直接访问服务器回环 `3760`
2. 必须强制关闭内部 `3760`

## 2. 版本要求

| 项目 | 要求 |
|------|------|
| Node.js | `>= 18.0.0` |
| OpenClaw | `>= 2026.3.23` |
| 操作系统 | Linux / macOS / Windows (WSL) |

### 版本兼容结论

1. `OpenClaw 2026.3.13`：**当前未正式支持**
2. `OpenClaw 2026.3.23` 及以上：**当前正式支持**
3. 当前本地已验证到：`2026.4.8`
4. 建议客户直接升级到最新稳定版本，例如：`2026.4.8`

原因有两层：

1. 当前 `tracevane` 在自身 `package.json` 中已经明确声明：`minHostVersion >= 2026.3.23`
2. 虽然从 npm 包导出检查来看，`2026.3.13` 已经带有 `openclaw/plugin-sdk` 和当前插件用到的基础注册面，但当前版本的 Tracevane 还没有对 `2026.3.13` 做正式兼容验证

因此，**客户如果还是 `2026.3.13`，当前不要直接按正式交付方案安装**。

## 3. 安装包内容

标准发布包名称：

```bash
tracevane-<version>.tar.gz
```

当前 `pack.sh` 已经移除旧的 `--base-path` 打包参数。

发布包中会同时包含：

1. `DEPLOY.md`：完整客户安装说明
2. `CUSTOMER_PROMPTS.md`：可直接转发给客户执行的升级 / 安装 Prompt

原因是部署路径现在应该由运行时配置决定，而不是在打包时把路径写死进包里。

## 4. 客户安装步骤

### 步骤 1：确认 OpenClaw 主程序版本

```bash
openclaw --version
```

要求输出版本 **不低于 `2026.4.8`**。

如果客户当前版本较低，建议直接升级到最新稳定版本，例如 `2026.4.8`，再继续安装 Tracevane。

推荐升级命令：

```bash
npm install -g openclaw@2026.4.8
openclaw gateway restart
```

### 步骤 2：下载安装脚本到本地并执行

推荐方式是不直接在线执行脚本，而是先下载到本地：

```bash
curl -fsSL https://tracevane.90le.cn/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,160p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
```

非单口模式：

```bash
/tmp/install-tracevane.sh --mode standalone
```

单口模式：

```bash
/tmp/install-tracevane.sh --mode gateway
```

脚本会自动：

1. 升级 OpenClaw 到要求版本
2. 下载并解压 Tracevane 发布包
3. 自动修正旧发布包的入口元数据
4. 安装依赖并重建 `node-pty`
5. 写入 `plugins.entries.tracevane / plugins.load.paths / transport`
6. 执行 `openclaw gateway install --force`
7. 重启 Gateway 并做健康检查

### 步骤 3：手工安装兜底

如果客户不能访问网站脚本，也可以手工安装压缩包。

常见目录：

```bash
~/.openclaw/extensions/
```

然后解压：

```bash
cd ~/.openclaw/extensions/
tar -xzvf tracevane-0.1.20.tar.gz
mv tracevane-0.1.20 tracevane
```

### 步骤 4：安装依赖

```bash
cd ~/.openclaw/extensions/tracevane
./install.sh
```

如果客户环境里没有执行权限，也可以手动执行：

```bash
npm install --production --ignore-scripts
npm rebuild @homebridge/node-pty-prebuilt-multiarch
```

### 步骤 5：修改 OpenClaw 配置

编辑：

```bash
~/.openclaw/openclaw.json
```

加入：

```json
{
  "extensions": {
    "tracevane": {
      "apiPort": 3760,
      "autoStart": true,
      "transport": {
        "standalone": {
          "enabled": true,
          "port": 3760
        },
        "gateway": {
          "enabled": false,
          "basePath": "/tracevane"
        }
      }
    }
  }
}
```

### 步骤 6：安装并重启 OpenClaw Gateway service

```bash
openclaw gateway install --force
openclaw gateway restart
```

### 步骤 7：验证访问

```bash
curl http://127.0.0.1:3760/api/system/health
```

浏览器访问：

```bash
http://HOST:3760/
```

### 步骤 7：首次打开后建议检查 System 页

首次进入 Tracevane 后，建议打开：

```bash
/system
```

常见完整地址：

```bash
# standalone
http://HOST:3760/system

# Gateway 单口预览模式
http://HOST:<gateway-port>/tracevane/system
```

如果客户现场用 `curl` 验证本机 `127.0.0.1` 地址，请注意：

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  curl http://127.0.0.1:3760/api/system/health
```

原因是部分环境会全局注入代理变量；不绕过代理时，本机地址也可能被外部代理接管，出现误导性的 `502 Bad Gateway`。

重点检查两块：

1. `初始化与引导`
   - 现在是 System 页默认首个标签页，打开后即可直接看到
   - 如果显示 `需处理`，先执行“应用推荐初始化”
2. `设备信任`
   - 如果 helper token cache 漂移，直接执行修复
   - 如果显示 metadata repair pending，则说明宿主内建 CLI / tool 仍可能报 `pairing required`，但 Tracevane 自己的 Chat/Terminal 主链路不受这个问题直接阻断

## 5. 当前推荐配置

### 当前正式推荐

```json
{
  "extensions": {
    "tracevane": {
      "apiPort": 3760,
      "autoStart": true,
      "transport": {
        "standalone": {
          "enabled": true,
          "port": 3760
        },
        "gateway": {
          "enabled": false,
          "basePath": "/tracevane"
        }
      }
    }
  }
}
```

### 当前不要给客户作为正式方案使用的配置

```json
{
  "extensions": {
    "tracevane": {
      "transport": {
        "standalone": {
          "enabled": false
        },
        "gateway": {
          "enabled": true,
          "basePath": "/tracevane"
        }
      }
    }
  }
}
```

原因：

1. 这会把页面和 HTTP API 挂到 OpenClaw Gateway
2. 当前单口方案虽然已具备：
   - `terminal` 的扩展侧 realtime
   - `chat` 的 helper + SSE 单口链路
   - helper 设备信任自愈
   但仍缺系统 Gateway 服务重载后的完整浏览器回归与客户环境验证
3. 因此暂时不适合作为正式客户交付配置

## 5.1 如果客户只有一个外部端口

如果客户**只能开放 Gateway 端口**，例如 `18789`，则安装说明必须明确区分：

### 可提供的当前模式

```json
{
  "extensions": {
    "tracevane": {
      "autoStart": true,
      "transport": {
        "standalone": {
          "enabled": false,
          "port": 3760
        },
        "gateway": {
          "enabled": true,
          "basePath": "/tracevane"
        }
      }
    }
  }
}
```

### 当前模式的可用边界

1. 页面可通过 `http://HOST:18789/tracevane/` 打开
2. HTTP API 可通过 `http://HOST:18789/tracevane/api/system/health` 访问
3. `chat` / `terminal` 已通过扩展侧 `gateway-rpc` 接入单口 realtime
4. 但当前仍应按“预览模式”对待，先做回归和现场验证再转正式口径

因此，这条路径**必须在文档和 Prompt 中标成“Gateway 单端口预览模式”**，不能和正式 `standalone` 安装说明混写。

### 关于内部 `3760`

如果客户只是**外网只能开一个端口**，并不代表必须关闭内部 `3760`。

当前建议理解为：

1. 对外只开放 `OpenClaw` 一个端口
2. 设备内部可以继续保留 `3760`
3. 但外部用户不能把内部 `3760` 当成正式依赖
4. 对客户承诺的外部入口仍然只能是 `OpenClaw` 那一个端口

## 6. 故障排查

### 6.1 Tracevane 页面打不开

检查端口监听：

```bash
lsof -i :3760
```

检查健康接口：

```bash
curl http://127.0.0.1:3760/api/system/health
```

### 6.2 安装依赖失败

通常是原生模块编译环境不足：

```bash
which g++ make python3
```

### 6.3 扩展未加载

检查日志：

```bash
openclaw logs
```

确认目录存在：

```bash
ls ~/.openclaw/extensions/tracevane/
```

### 6.4 客户机器是 `2026.3.13`

这是**当前未正式支持的版本**，不是 Tracevane 配置问题。

当前正确处理方式：

1. 优先升级 OpenClaw 到 `2026.3.28`
2. 再安装当前版本的 Tracevane

## 7. 自行打包

如需自行打包：

```bash
cd tracevane
./pack.sh 0.1.0
```

当前 `pack.sh` 不再支持旧的：

```bash
--base-path /x/tracevane/
```

## 8. 当前对客户的最终口径

截至 2026-04-08，请对客户统一使用下面这套口径：

1. 当前正式支持的 Tracevane 版本要求：`OpenClaw >= 2026.3.23`
2. 当前正式支持的部署方式：`standalone :3760`
3. 当前推荐客户升级目标：`2026.3.28`
4. `2026.3.13` 当前未正式支持，需单独评估兼容性
5. 当前不应对客户承诺的模式：`Gateway 单端口完整可用`

## 9. 长期方向

长期最合理的方向是：

1. 对外统一只暴露 `OpenClaw` 一个端口
2. 页面和 HTTP API 继续挂到 `/tracevane/*`
3. realtime 改为复用宿主已有 Gateway WS 协议
4. `3760` 仅保留为本机 / 内网维护与回退入口

这条路线不要求修改宿主源码，更适合客户未来持续升级。

## 10. 2026-04-09 安装脚本自愈更新

`install-tracevane.sh` 已补以下自动修复逻辑：

1. 自动清理 `plugins.entries.tracevane` 的异常字段（只保留 `enabled/hooks/subagent/config`），避免旧字段导致加载冲突。
2. 自动清理 `plugins.load.paths` 中旧版 `tracevane.prev/.bak/.old` 与非当前安装路径，避免 `duplicate plugin id` / `stale config entry`。
3. 自动清理 `plugins.installs.tracevane` 的陈旧安装记录（尤其是指向 `.prev` 的记录）。
4. 自动修复插件总开关和 deny 冲突（确保 `plugins.enabled=true` 且不被 `plugins.deny` 屏蔽）。
5. 写配置后自动执行 `openclaw config validate`；失败时自动尝试 `openclaw doctor --repair --non-interactive --yes`，仍失败则回滚备份。
6. 在无可用 `systemd/launchd/schtasks` 用户会话时，自动降级为 `openclaw gateway run --force` 后台启动，不再硬依赖 service 安装。
7. 健康检查支持 `curl`/`wget` 双通道。

> 目标：新机器配置不一致、旧安装残留、无 systemd、无 docker 等环境下，也能尽量自动拉起可用 Tracevane，避免把宿主配置写坏。
