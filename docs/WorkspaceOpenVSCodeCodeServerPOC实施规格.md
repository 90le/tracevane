# Workspace OpenVSCode / code-server POC 实施规格

状态：Active implementation spec  
日期：2026-06-29  
归属：Tracevane Workspace IDE-first 重建 Goal  
前置研究：`docs/WorkspaceIDE基座POC路线研究.md`

## 1. 目标

用最小可逆实现验证：Tracevane 是否可以把 OpenVSCode Server 或 code-server 作为真实 IDE 能力 provider，同时保留 Tracevane 自己的 AI-native 外壳、证据、审批、任务上下文和移动端任务流。

本 POC 不是最终产品定型，也不是深 fork VS Code。它只回答一个问题：

> 成熟 VS Code Web 基座能否成为 Tracevane Workspace 的真实 IDE 能力层？

## 2. 非目标

当前 POC 不做：

1. 不把 OpenVSCode/code-server 直接定为唯一长期路线。
2. 不深度修改 VS Code UI 或维护 fork。
3. 不迁移现有 Workspace 全部功能。
4. 不把写作、预览、渲染作为 POC 主线。
5. 不绕过 Tracevane 权限、审计、workspace root 管理。
6. 不在没有鉴权/反代设计的情况下暴露 provider 端口。
7. 不要求手机端达到最终体验，只验证硬限制和可行交互。

## 3. Provider 抽象

新增概念：`WorkspaceIdeProvider`。

候选 provider：

```ts
type WorkspaceIdeProviderKind =
  | "native-workbench"
  | "openvscode-server"
  | "code-server"
  | "theia";
```

POC 阶段只需要实现 `openvscode-server` 或 `code-server` 之一，另一个保留同构配置槽位。

Provider 必须暴露：

```ts
interface WorkspaceIdeProviderSession {
  id: string;
  kind: WorkspaceIdeProviderKind;
  workspaceRoot: string;
  baseUrl: string;
  status: "starting" | "ready" | "failed" | "stopped";
  createdAt: string;
  lastSeenAt?: string;
  failureReason?: string;
}
```

## 4. 架构边界

```text
Tracevane AppShell / Workspace Shell
  ├─ 顶栏、项目选择、AI 接管、证据、审批、命令中心
  ├─ Provider Switcher
  │   ├─ Native Workbench
  │   └─ VS Code Web Provider iframe/proxy
  └─ Mobile Task Shell

Tracevane API
  ├─ workspace root resolver
  ├─ provider session registry
  ├─ reverse proxy / signed launch URL
  ├─ audit log
  └─ lifecycle control

IDE Provider Process
  ├─ openvscode-server or code-server
  ├─ bound to loopback/internal network
  └─ receives only allowed workspace root
```

## 5. 后端最小接口

POC API 草案：

```text
GET  /api/workspace/ide-providers
POST /api/workspace/ide-providers/:kind/sessions
GET  /api/workspace/ide-provider-sessions/:sessionId
POST /api/workspace/ide-provider-sessions/:sessionId/stop
ALL  /api/workspace/ide-provider-sessions/:sessionId/proxy/*
```

约束：

1. Provider 进程只监听 `127.0.0.1` 或内部容器网络。
2. 浏览器不得直接访问裸 provider 端口。
3. Proxy 必须支持 WebSocket。
4. Proxy 必须保留路径、query、upgrade headers。
5. Session 必须绑定 user/project/workspace root。
6. Session stop 必须可回收进程。
7. 所有 provider launch/stop/proxy failure 必须进入审计日志。

## 6. 前端最小界面

POC 前端只需要一个 provider 切换入口，不重做全部 Workspace：

1. 顶栏或命令中心出现 `IDE Provider` 状态。
2. 中央工作区可打开 provider iframe：
   - Native Workbench
   - OpenVSCode/code-server Provider
3. Provider iframe 外层保留 Tracevane 全局顶栏。
4. iframe 区域必须有失败态、重试、复制 provider URL、停止 session。
5. 移动端必须显示“此 provider 桌面优先 / 手机限制”提示，不伪装成已解决手机 IDE。

## 7. 验收场景

POC 必须至少验证：

1. 从 Tracevane Workspace 打开当前 `project-root`。
2. 在 provider 内打开文件并编辑保存。
3. 在 provider 内打开终端并运行 `pwd` / `git status`。
4. 在 provider 内搜索文件内容。
5. Tracevane 外层仍保留全局顶栏、项目状态、AI/证据入口。
6. 刷新页面后能恢复或重新连接 provider session。
7. 停止 session 后 provider 进程被回收。
8. 手机端能进入 provider 页面，但明确标注限制并保留返回 Native Shell 的路径。

## 8. 风险检查清单

### 安全

- [ ] Provider 端口不直接暴露公网。
- [ ] Proxy 校验 session 与 workspace root。
- [ ] 禁止任意路径作为 workspace root。
- [ ] WebSocket upgrade 经过同样鉴权。
- [ ] Provider token/password 不写入前端 bundle。

### 产品主权

- [ ] Tracevane 顶栏保留。
- [ ] Provider 不取代 AI/evidence/approval 外壳。
- [ ] 命令中心能启动/聚焦/停止 provider。
- [ ] 用户知道当前处于 VS Code Web provider，而不是 Native Workbench。

### 手机端

- [ ] 虚拟键盘不遮挡 Tracevane 返回路径。
- [ ] 横屏/竖屏基本可退出。
- [ ] 不把桌面 VS Code Web 伪装为顶级手机体验。

### 运维

- [ ] Provider 进程生命周期可观测。
- [ ] 单 workspace 多 session 策略明确。
- [ ] 端口冲突有恢复机制。
- [ ] 日志不泄露 token。

## 9. 推荐第一实现顺序

1. 新增 provider 配置读取：`TRACEVANE_IDE_PROVIDER_KIND`、`TRACEVANE_IDE_PROVIDER_COMMAND`、`TRACEVANE_IDE_PROVIDER_BASE_PORT`。
2. 后端实现 provider session registry，不接 UI。
3. 实现本地 loopback proxy + WebSocket upgrade smoke。
4. 前端增加 provider switcher 和 iframe 容器。
5. 加系统测试锁定路由、配置、文案和安全边界。
6. 手动 smoke：打开真实项目、编辑文件、终端、Git、搜索。
7. 形成 ADR：继续 / 放弃 / 转 Theia。

## 10. 成功/失败判定

成功：

- 1 天内可以从 Tracevane 打开真实 VS Code Web provider，并完成文件编辑、终端、Git、搜索基本路径。
- 不破坏 Tracevane 顶栏与 AI/evidence 外壳。
- 安全边界清晰，没有裸端口公网暴露。

失败：

- Provider 嵌入需要深 fork 才能满足基本产品壳。
- 反代/WebSocket/鉴权成本过高。
- 手机端无法保留可用返回路径。
- 与 Tracevane workspace root/session 模型冲突严重。

失败不代表回到盲目自研；失败后进入 Theia POC。
