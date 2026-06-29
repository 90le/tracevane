# Workspace IDE 基座 POC 路线研究

状态：Active route research note  
日期：2026-06-29  
范围：Tracevane Workspace IDE-first 重建路线；用于修正“继续默认自研 Workbench”的隐含假设。

## 1. 用户问题

用户质疑：既然首要目标是 IDE，为什么不直接使用 Theia、code-server 或 OpenVSCode Server？

结论：这个质疑成立。当前项目不应继续默认把自研 React Workbench 当作唯一 IDE 底座。下一阶段必须先做成熟 IDE 基座 POC，再决定长期路线。

## 2. 当前外部事实

### 2.1 Eclipse Theia

- 官方定位：Eclipse Theia Platform 是用于构建现代、可定制、云端与桌面 IDE 和领域工具的可扩展框架。
- Theia IDE 基于 Theia Platform，面向桌面和浏览器代码开发体验。
- Theia 支持 Theia AI framework，可用于构建 AI-powered tools，并强调数据和能力控制权。
- 含义：Theia 是长期白标 IDE 平台候选，而不只是“嵌一个现成编辑器”。

来源：

- `https://projects.eclipse.org/projects/ecd.theia`
- `https://theia-ide.org/docs/`

### 2.2 code-server

- 官方定位：code-server 是 Coder 支持的“在浏览器中运行 VS Code”的方法。
- code-server FAQ 说明它取 VS Code 开源核心并使其在浏览器运行，但并不完全等同于微软 VS Code。
- 含义：code-server 是最快获得真实 VS Code Web IDE 能力的候选，适合作为 POC、专业模式或兼容模式。

来源：

- `https://coder.com/docs/user-guides/workspace-access/code-server`
- `https://coder.com/docs/code-server/FAQ`

### 2.3 OpenVSCode Server

- 官方仓库定位：OpenVSCode Server 让 upstream VS Code 运行在远程机器上，并通过现代浏览器访问。
- 仓库说明其架构与 Gitpod/GitHub Codespaces 这类远程开发环境同类。
- 含义：OpenVSCode Server 是“真实 VS Code Web 基座”路线的重要 POC 对象，尤其适合验证 Tracevane 项目/鉴权/反代/工作区管理能力。

来源：

- `https://github.com/gitpod-io/openvscode-server`
- `https://www.gitpod.io/docs/gitpod/editors/vscode-browser`

## 3. 三条路线重新排序

### 路线 C1：OpenVSCode/code-server 快速真实 IDE POC

优先级：最高，立即验证。

要验证：

1. 作为 Tracevane Workspace 中央 IDE 区域嵌入或反代是否可行。
2. 多 workspace/project-root 如何映射到实例、容器、用户会话。
3. 文件、Git、搜索、终端是否能满足第一阶段真实 IDE 需求。
4. 鉴权、CSRF、端口转发、dev server preview、websocket、静态资源路径如何处理。
5. 浏览器快捷键、移动端输入、手机虚拟键盘、PWA 模式的硬限制。
6. Tracevane AI evidence/context/approval 能否围绕它做外壳，而不是侵入 fork。

适用定位：

- 最快真实 IDE 能力。
- 专业桌面兼容模式。
- 与 Tracevane Native AI Shell 并行的强能力底座。

不适用：

- 不应直接承诺为最终唯一产品壳。
- 不应为了改 UI 深 fork VS Code。

### 路线 B1：Theia 长期平台 POC

优先级：第二，作为长期产品主权候选。

要验证：

1. Theia extension / widget / command / contribution 模型能否承接 Tracevane AI、证据、审批、任务上下文。
2. 现有 Node 后端文件、终端、Git、搜索、Agent Gateway 能否适配 Theia 后端模型。
3. 白标 UI、主题、顶部产品壳、移动壳是否能做到一流产品级体验。
4. VS Code extension 兼容边界、Open VSX、LSP、debug、settings sync 的真实成本。
5. 移动端是否必须另做 Tracevane shell，Theia 只提供能力层。

适用定位：

- 长期顶级 IDE 平台主线候选。
- 产品主权高于 code-server/OpenVSCode。

不适用：

- 不应在无 POC 的情况下全面迁移。
- 不应把 Theia 当作自动解决手机端体验和 AI-native UX 的银弹。

### 路线 A1：Tracevane Native Workbench 收敛为 AI-native Shell

优先级：保留，但不再默认承担完整 IDE 底座。

应继续做：

1. 统一命令中心。
2. AI 任务上下文图。
3. Evidence basket / handoff / approval。
4. 移动端 AI 编程任务流。
5. 项目、运行状态、终端/Git/搜索的产品级总控。
6. Theia/code-server/OpenVSCode 的外层编排、路由、权限和状态聚合。

不应继续做：

1. 从零复制 VS Code 全部 IDE 基础能力。
2. 把 Dockview + Monaco + xterm 当作“已经等于 IDE”。
3. 继续做说明页式视觉概念而缺少真实 IDE 能力。

## 4. 推荐架构方向

推荐采用“双轨 + 决策门”：

```text
Tracevane Product Shell
  - 项目 / workspace 管理
  - AI task context / evidence / approval
  - 统一命令中心
  - 手机任务流
  - 运行状态与审计

IDE Capability Provider
  A. OpenVSCode/code-server POC：最快真实 IDE 能力
  B. Theia POC：长期平台主权候选
  C. Native Workbench：AI-native shell 与过渡能力
```

短期不要三选一。先让 OpenVSCode/code-server 提供“真实 IDE 对照组”，再用 Theia 验证长期主权，最后用 ADR 决定主线。

## 5. 下一阶段验收项

必须产出：

1. `OpenVSCode/code-server POC ADR`：启动方式、反代、鉴权、workspace 映射、端口/终端/Git、移动端限制、产品主权风险。
2. `Theia POC ADR`：extension/backend/widget/command/AI 适配成本、移动端策略、白标能力、迁移风险。
3. `Tracevane Native Shell ADR`：哪些能力保留自研，哪些能力交给 IDE provider。
4. 运行验证：至少一个 provider 能从 Tracevane workspace 打开真实项目并完成文件编辑、终端命令、Git 状态查看、搜索。

## 6. 当前决策

当前不再把“继续自研完整 IDE”作为默认主线。当前主线改为：

> **先接入成熟 IDE 能力做 POC，再决定长期平台；Tracevane 自研层聚焦 AI-native 产品差异化。**
