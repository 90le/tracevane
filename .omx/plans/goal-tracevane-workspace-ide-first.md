# Tracevane Workspace IDE-first 超级 Goal 任务书

创建日期：2026-06-29  
状态：Active / 当前最高执行任务书  
适用仓库：`/home/binbin/.openclaw/extensions/tracevane`  
上位蓝图：`docs/Workspace全球顶级AI编程IDE工作区Goal蓝图.md`  
验收合同：`docs/WorkspaceIDE-UIUX重设计验收.md`  
POC 规格：`docs/WorkspaceOpenVSCodeCodeServerPOC实施规格.md`  

---

## 0. 纠偏声明

本文件补回当前 Codex active goal 在工具层无法原地改写的问题。Codex goal 工具里的 objective 仍保留早期“AI 编程与写作工作区、预览、渲染”等宽泛表述；这些表述不再代表当前第一阶段执行重点。

当前第一阶段只有一个主线：

> 先完成真实 IDE 工作区，而不是写作工作区、说明文档页、渲染/预览增强或视觉概念展示。

当前所有实现、清理、测试、提交和验收必须以本文件为准；任何旧文档、旧截图、旧概念页、旧 “Season One” 展示页，如果与本文件冲突，均视为历史材料，不作为实现依据。

---

## 1. 北极星目标

Tracevane Workspace 要成为一个 **IDE-first、AI-native、可扩展、桌面/平板/手机都可用的全球顶级 Web IDE 工作区**。

它不是普通文件管理器，不是文档阅读器，不是 AI 海报页，也不是临时拼出来的 terminal + markdown 页面。它的第一性能力是：

```text
Workspace IDE
  = Project / Workspace Root
  + Files / Explorer
  + Editor / Tabs / Dirty State / Save
  + Terminal / PTY / Sessions / Resize / Mobile Input
  + Git / Changes / Diff / Stage / Commit / Branch Status
  + Search / File Search / Content Search / Jump
  + Command Palette / Keybindings / Quick Actions
  + Pane Layout System / Panels / Status Bar / Responsive Modes
  + Provider Layer / Native Workbench or VS Code Web Provider
  + AI Extension Layer / Context / Approval / Evidence / Handoff
```

AI 很重要，但 AI 必须生长在 IDE 平台上；AI 不能替代 IDE 主体，也不能把页面变成说明文档或概念展示。

### 1.1 真实 IDE 窗格系统不可降级约束

Workspace 不能只做到“界面看起来像 IDE”。第一阶段 IDE 前端重建的硬门槛是建立真实可操作的 Workbench 窗格编排系统：

1. **窗格生命周期**：Files、Search、Git、Terminal、Problems、Output、AI、Outline 等 pane 必须能打开、收起、隐藏、恢复、关闭空 Dock，并能明确显示当前激活状态。
2. **区域与组合**：pane 必须能组合成左、右、上、下 Dock 区域内的 tab group；同一区域内必须支持 primary / secondary group 或等价分组，而不是固定死的单栏卡片。
3. **拆分能力**：Dock 与 Editor 至少支持 single、vertical split、horizontal split；用户可以把当前 pane 移到另一组或另一侧，并可交换组。
4. **大小调整**：左/右/上/下 Dock、底部 Terminal、Editor split、Dock split 都必须支持鼠标/触摸拖动调整；核心 resizing 也必须有命令入口，不能只靠隐藏的 pointer handle。
5. **布局操作入口**：所有关键布局动作必须进入 Command Palette /快捷键体系，包括聚焦区域、移动 pane、拆分、切换组、最大化/恢复、收起、恢复隐藏 pane、保存/恢复 layout snapshot。
6. **拖放与重排**：pane tab 必须支持重新排序和跨 Dock/跨 group 移动；拖放失败或空区域必须有可理解的目标反馈。
7. **持久化与恢复**：pane placement、order、split mode、split ratio、active pane、hidden panes、layout preset、snapshot 必须可恢复，刷新后不能回到随机状态。
8. **响应式适配**：桌面是多 Dock 专业工作台；平板是可折叠双区/三区；手机是单任务 panel mode，但仍必须保留 pane 切换、终端、Git、搜索、文件和命令入口。
9. **可测试性**：每个布局能力都必须至少有源码级系统测试或后续浏览器 smoke 验证；没有测试的“看起来像”不算完成。

如果旧代码、旧样式或旧文档与以上约束冲突，优先删除旧实现，不为了兼容旧页面而牺牲新 IDE 架构。

---

## 2. 当前阶段目标

### 2.1 Phase 0：停止错误方向

必须停止：

1. 继续把 Workspace 做成说明文档页、概念页、宣传页或大字报。
2. 继续给旧页面换皮肤来伪装“重构”。
3. 继续把写作、渲染、预览增强作为当前主线。
4. 继续在旧 UI 上堆卡片、渐变、解释文案和 AI 展示面板。
5. 继续用没有真实 IDE 能力的静态页面回答用户对 IDE 的需求。

### 2.2 Phase 1：清理和定向

必须完成：

1. 找出并删除/隔离不恰当的旧 IDE 工作区设计、旧目标、旧验收、旧概念页、重复文档。
2. 保留必要历史入口，但明确标记为 superseded。
3. 所有权威文档归一到：本 Goal 任务书 + IDE 蓝图 + UI/UX 验收合同 + provider POC 规格。
4. 清理前写清理计划；清理后用测试证明入口和核心能力没有被破坏。
5. 每个阶段只提交本代理修改的文件，不提交其他人的并行改动。

### 2.3 Phase 2：真实 IDE provider POC

当前已经判定：单纯自研 Workbench 风险很高，成熟 IDE provider 必须进入 POC。

必须优先验证：

1. `OpenVSCode Server` / `code-server` 能否作为真实 IDE provider 嵌入 Tracevane。
2. Tracevane 是否能保留自己的全局顶栏、项目切换、AI 接管、证据、审批、任务上下文和移动端任务流。
3. Provider 进程是否只能绑定 loopback/internal network，不暴露裸端口。
4. API 是否能创建、列出、停止 provider session。
5. Proxy 是否能隐藏 provider 端口，并为后续 iframe / WebSocket 接入准备边界。

### 2.4 Phase 3：IDE UI/UX 主体重建

在 provider POC 和 native workbench 基线清楚后，开始重新设计 IDE 主体：

1. Desktop：专业 IDE 高密度布局，左 Activity Rail、Explorer/Search/Git、Editor Tabs、Bottom Terminal、Right AI/Context、Status Bar。
2. Tablet：双区/三区可折叠布局，支持触摸、分屏、外接键盘。
3. Mobile：单任务 IDE 控制台，不是压缩桌面；底部模式切换，文件/搜索/Git/终端/AI 以 sheet 或 full-screen task view 进入。
4. Terminal：一等面板，不是附属日志；移动端必须照顾键盘、输入、历史、复制、粘贴、命令插入。
5. Git：变更审查、diff、stage、commit、branch 状态必须真实可见。
6. Search：搜索结果必须能跳转，能作为 AI 上下文，能在手机上审查。
7. Command Palette：统一命令入口，不能散落按钮山。
8. Pane Layout System：布局不是固定外观，必须支持打开/收起、组合、拆分、左右上下停靠、跨区域拖放、tab reorder、大小拖动、最大化/恢复、空 dock、layout preset、snapshot、命令入口和恢复。
9. Layout State：布局、面板、session 恢复必须可靠。

---

## 3. 路线选择边界

### 3.1 路线 A：自研 Native Workbench

适合：

- Tracevane 独有 AI、证据、审批、任务、移动端任务流。
- 深度定制 UI/UX、插件/命令系统、布局系统。
- 未来与 OpenClaw、本地 agent、审计、文件管理、终端 ledger 深度融合。

风险：

- 自研完整 IDE 成本极高。
- LSP、扩展、调试、Git、搜索、编辑体验容易长期不如成熟 IDE。
- 如果只做 UI，会继续变成“像 IDE 的页面”，不是 IDE。

要求：

- 自研必须只做 Tracevane 特有外壳和扩展层，不盲目重造 VS Code 全部能力。

### 3.2 路线 B：OpenVSCode / code-server Provider

适合：

- 快速获得真实 VS Code Web 级编辑、搜索、扩展、Git、终端基础体验。
- 把 Tracevane 的 AI、证据、审批、项目/任务上下文作为外层增强。
- 避免短期在基础 IDE 能力上输给成熟产品。

风险：

- iframe / proxy / auth / WebSocket / 主题 / 移动端体验复杂。
- 深度白标和深度定制有限。
- 如果直接裸嵌，会丢掉 Tracevane 自己的产品灵魂。

要求：

- Provider 只能是能力层，不是整个产品。
- 必须保留 Tracevane 顶栏、AI 接管、证据、审批和任务上下文。
- Provider 端口必须隐藏在 API proxy 后。

### 3.3 路线 C：Theia 平台

适合：

- 长期做高度可扩展、可白标、可插件化的 IDE 产品。
- 希望比 iframe provider 更深地拥有 workbench、commands、services、extensions。

风险：

- 接入和迁移成本高。
- 与现有 React/Vite/AppShell/API 边界融合需要系统设计。
- 可能把 Tracevane 拖入 Theia 生态复杂度，短期交付慢。

要求：

- 先做研究和小 POC，不直接全量替换。
- 只有当 OpenVSCode/code-server provider POC 证明定制不足时，才进入 Theia 深评估。

### 3.4 当前执行策略

当前不押注单一路线。第一阶段采用：

```text
Native Workbench 保留为 Tracevane 外壳/移动端/AI 扩展层
+ OpenVSCode/code-server Provider POC 验证真实 IDE 能力层
+ Theia 保持研究候选，不立即迁移
```

这是最小可逆策略：既不继续纯自研空壳，也不立刻把项目完全交给第三方 IDE。

---

## 4. 必须做

1. 保持 Workspace 是 IDE 主入口。
2. 清理所有偏离 IDE-first 的旧文档、旧 UI、旧测试或兼容入口。
3. 完成 provider lifecycle：配置、启动、session registry、stop、failure。
4. 完成 provider proxy：HTTP proxy、WebSocket proxy、auth/session guard、audit。
5. 完成 provider iframe POC：Tracevane 顶栏保留，中央区域加载 provider，失败态/停止/重试明确。
6. 完成 native workbench 的 UI/UX 重新设计：Files、Editor、Terminal、Git、Search、Command、Status、Pane Layout System。
6a. Pane Layout System 是硬门槛：不能只做“像 IDE 的三栏页面”；必须有窗格打开/收起、左右上下拆分、组合、拖放、resize、maximize、snapshot、persistence 和 mobile panel mode。
7. 完成手机端 IDE 任务流：Terminal、Search、Git、File navigation、AI approval 至少可用。
8. 写清楚每个阶段的验证命令和失败原因。
9. 每次阶段性修改后提交代码。
10. 提交时只 stage 本代理修改的文件，绝不 `git add .`。

---

## 5. 不要做

1. 不做写作工作区。
2. 不做新的 Markdown/HTML/富媒体渲染增强。
3. 不做预览主题、阅读美化、文档发布流。
4. 不做 Season One 概念说明页式 UI。
5. 不做静态图或大标题来假装 IDE。
6. 不做没有真实能力的“AI 工作伙伴”展示面板。
7. 不把手机端当作桌面三栏缩小版。
8. 不直接暴露 OpenVSCode/code-server 裸端口。
9. 不深 fork VS Code 或 Theia。
10. 不引入新大型依赖，除非研究记录和验收计划都清楚。
11. 不提交其他人的 dirty 文件。
12. 不在未验证时声称完成。

---

## 6. 工程约束

### 6.1 Git 约束

1. 修改前必须看 `git status --short`。
2. 每次只 stage 自己新增或明确修改的文件。
3. 提交必须符合 Lore Commit Protocol。
4. 如有其他人改动导致测试失败，必须在提交或汇报中明确区分，不可擅自修复/提交。

### 6.2 研究约束

1. 涉及 OpenVSCode/code-server/Theia/Monaco/xterm/LSP/WebSocket proxy 等外部能力时，必须优先看官方文档或当前上游。
2. 研究记录写入相关 docs 或 goal 文档。
3. 不凭记忆实现可能变化的外部契约。

### 6.3 测试约束

阶段性验证至少包括相关范围：

```bash
npm run build:api
npm run build:web
npm run typecheck
node --test tests/system/<related>.test.mjs
node --test tests/file-manager/<related>.smoke.mjs
git diff --check -- <changed-files>
```

实际执行应根据修改范围选择，不做无关大范围破坏性验证；若全量测试被他人 dirty 文件影响，必须记录证据。

---

## 7. 当前已完成事实

截至 2026-06-29，已经完成以下 IDE provider POC 基础：

1. `apps/api/modules/workspace-ide/provider-service.ts`
   - Provider kind：native-workbench/openvscode-server/code-server/theia。
   - env 配置解析。
   - loopback URL 和 workspace root 安全检查。
   - launch plan / env / spawn runner。
   - session registry 和 lifecycle controller。
2. `apps/api/modules/workspace-ide/routes.ts`
   - provider list。
   - create session。
   - list/get session。
   - stop session。
3. `apps/api/modules/workspace-ide/service.ts`
   - provider service factory。
4. API 主服务注册。
5. `apps/api/modules/workspace-ide/proxy.ts`
   - loopback-only HTTP proxy core。
   - hop-by-hop header filtering。
   - request forwarding。
6. Tests：
   - `tests/system/workspace-ide-provider.test.mjs`
   - `tests/system/workspace-ide-provider-routes.test.mjs`
   - `tests/system/workspace-ide-provider-proxy.test.mjs`

这说明当前不是 Theia、也不是已经完整集成 code-server/OpenVSCode；当前是 **provider POC 后端骨架**，用于安全地验证是否能接入成熟 VS Code Web provider。

---

## 8. 下一步执行队列

### P0：修正目标和文档权威链

- [x] 补回本 `.omx/plans/goal-tracevane-workspace-ide-first.md`。
- [ ] 删除或降级旧 `.omx/plans/goal-tracevane-file-manager-workspace.md` 的权威性。
- [ ] 更新 README/docs 索引，让当前 IDE-first goal 成为唯一入口。

### P1：Provider proxy route wiring

- [ ] 增加 API route：`/api/workspace/ide-provider-sessions/:sessionId/proxy`。
- [ ] 使用 query/path 方式绕开当前 router wildcard 限制，或先小改 router 支持 wildcard。
- [ ] route 层查 session、检查状态、调用 proxy core。
- [ ] 保证裸 provider baseUrl 不直接暴露给前端作为主访问方式。
- [ ] 补 route test。

### P2：WebSocket upgrade proxy

- [ ] 研究当前 API server upgrade 入口。
- [ ] 为 VS Code Web provider 所需 WebSocket 加 proxy。
- [ ] 测试 upgrade path、header、failure。

### P3：前端 provider POC

- [ ] 顶栏/命令中心显示 IDE Provider 状态。
- [ ] Provider switcher：Native Workbench / VS Code Web Provider。
- [ ] iframe shell 保留 Tracevane 顶栏和 AI 接管入口。
- [ ] failure/starting/stopped states。
- [ ] 移动端限制提示。

### P4：Native Workbench UI/UX 重建

- [ ] Workbench shell 拆边界。
- [ ] Terminal first redesign。
- [ ] Git panel redesign。
- [ ] Search panel redesign。
- [ ] Files/editor tabs redesign。
- [ ] Command/status redesign。
- [ ] Desktop/tablet/mobile mode system。
- [ ] IDE Pane Layout System：open/collapse、split left/right/top/bottom、group tabs、drag/drop docking、resize、maximize/restore、empty dock、layout preset、snapshot、mobile panel mode。

---

## 9. 完成定义

本 Goal 不能因为写了文档或做了 provider 后端骨架就完成。完成至少需要：

1. 当前权威文档链清楚，旧目标不会误导。
2. Workspace 默认入口看起来和工作方式都像真实 IDE。
3. Terminal、Git、Search、Files、Editor、Command、Status 都有真实可用的 UI/UX。
4. 手机端不是坏掉的桌面，而是可用任务流。
5. IDE 窗格系统不是静态布局截图，而是可组合、可拆分、可拖动、可恢复的工作台能力。
6. OpenVSCode/code-server provider POC 至少完成安全启动、proxy、iframe、停止、失败态。
7. 是否继续 Theia 或 provider 方案有基于证据的结论。
8. 验证通过或所有失败都被明确归因。
9. 每个阶段有小而清楚的 git commit。

---

## 10. 给后续代理的强制提醒

如果用户问“为什么 IDE 页面没变化”，不要用文档解释完成。必须回答：

1. 当前完成的是哪一层：目标修正、后端 provider、proxy、前端 shell、终端/Git/Search 等。
2. 页面没变就是没完成 UI/UX 重建，不能辩解。
3. 下一步必须推进真实 IDE 页面或 provider iframe，而不是继续写概念文档。
4. 除非用户要求，否则不要转去写作、渲染、预览。
