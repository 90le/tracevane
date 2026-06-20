# Codex 主导：Tracevane 前端原型重新设计（交接 prompt）

> 当前状态：V8 已收敛为设计基线。把下面整段复制给 Codex CLI 即可继续后续页面原型。

---

## 任务

主导 **Tracevane 前端原型重新设计**。当前仍是原型阶段，**先充分对齐 HTML 原型，再讨论是否落 React 代码**。如果需要设计执行能力，使用 `$frontend-design` skill。

## 项目背景

- **项目根**：`/home/binbin/.openclaw/extensions/tracevane`
- **产品定位**：Tracevane 是本地优先的 AI Agent 控制工作台，不是 OpenClaw 管理后台，也不是通用 Chat UI。
- **核心问题**：让本地 AI Agent 工作流可连接、可观察、可恢复、可证明。
- **关注对象**：模型、Provider、endpoint、CLI Agent、IM 渠道、文件、工具、审批、长任务、自愈和证据链。
- **现有前端**：`apps/web-vue` 是旧壳，当前原型阶段不要修改它。
- **后端**：现有 API 是能力来源，但原型不要被旧前端路由或旧模块主页限制。必要的聚合数据可以先在原型中设计，后续再补后端。
- **未来实现方向**：React + TypeScript + Vite + shadcn/ui + Tailwind CSS。当前不要运行 shadcn CLI 初始化项目。

## 必读文档

1. `docs/产品需求.md` —— 当前产品目标和边界。
2. `docs/系统架构.md` —— 后端、前端、daemon、store 和 runtime 边界。
3. `docs/界面设计守则.md` —— 设计宪法；V8 durable shell + 层次化原则是硬约束。
4. `DESIGN.md` —— 页面形态模板和工作台布局规则。
5. `docs/prototypes/tracevane-v8-design-baseline.md` —— 当前应用壳基线。
6. `docs/prototypes/react-frontend-direction-research.md` —— React + shadcn/ui 方向调研。
7. `docs/prototypes/reference-design-audit.md` —— 参考设计审计和已拒绝方向。

## 当前基线

唯一保留的原型基线：

- `docs/prototypes/dashboard-v3-balanced-workbench-theme-v8-durable-shell.html`

V8 定义的是应用壳气质：左侧分组导航、轻顶栏、柔和整体背景、实色主面板、低阴影、克制材质、对象 Sheet / Drawer / Inspector 分层。后续页面从 V8 延展，不回到 V2-V7，也不恢复 V9 的全页面尝试。

## 页面组织

后续原型按 Tracevane 新定位组织为五组：

- **总览**：仪表盘。
- **运行**：会话任务、工作区 IDE、Agent Chat、长任务。
- **连接**：CLI Agents、模型网关、Providers、IM 渠道。
- **证据**：文件证据、审批、可观测性。
- **系统**：自愈守护、安全配置。

不恢复 Dreaming、旧插件管理、通用 OpenClaw CRUD、旧模型链路诊断矩阵或安装修复复杂页。

## 工作方式

1. 只在 `docs/prototypes/` 产出独立 HTML/CSS/JS 原型。
2. 每次改原型都从当前基线复制新版本，除非用户明确要求直接修正文档。
3. 原型界面中文为主；库名、命令、协议名、路径保留英文。
4. 每个页面都支持深浅主题和基础交互：导航折叠、命令面板、对象 Sheet / Drawer、右键菜单或等价操作。
5. 主页不写成介绍页；界面内不解释设计理念，只显示真实状态、对象和动作。
6. 保留层次化：主对象在主舞台；关联信息进检视器、Sheet、Drawer 或子页面；低频配置默认不可见。
7. 不修改 `apps/web-vue`，不提交旧壳代码，不提前落 React 实现。

## 下一步

基于 V8 设计后续页面原型。优先顺序建议：

1. 仪表盘：回答现在能不能工作、下一步做什么、从哪里继续。
2. 工作区 IDE：IDE 级文件 / 编辑 / 终端 / Git / 预览 / 证据工作台。
3. 会话任务 / Agent Chat：运行状态、工具调用、审批、文件和证据上下文。
4. 连接页面：模型网关、CLI Agents、Providers、IM 渠道。
5. 证据和系统页面：审批、可观测性、自愈守护、安全配置。
