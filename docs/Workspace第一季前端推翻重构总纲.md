# Workspace 第一季前端推翻重构总纲

日期：2026-06-29

## 结论

当前 Workspace / IDE 界面不能继续以“小修小补”方式推进。第一季的首要任务是推翻现有前端框架惯性，建立新的产品级 Workspace Frame：以任务为中心、以主舞台为核心、以证据/AI/终端/Git 为上下文层，而不是继续堆叠资源管理器、编辑器、终端、悬浮按钮和局部补丁。

本阶段不是视觉换皮，而是重新定义产品结构、响应式规则和后续代码落点。

## 研究先行记录

- VS Code User Interface（https://code.visualstudio.com/docs/getstarted/userinterface）：成熟 IDE 使用 Activity Bar、Primary/Secondary Side Bar、Editor Groups、Panel、Status Bar 等稳定区域，但每个区域服务明确任务。Tracevane 不能照搬旧三栏，而应保留“区域职责清晰”的原则。
- VS Code UX Guidelines Overview（https://code.visualstudio.com/api/ux-guidelines/overview）：扩展 UI 应服务用户工作流，避免过度创建重复 views/actions。Tracevane 第一季必须统一入口、减少重复面板、把 evidence/AI handoff 作为一等工作对象。
- Apple Human Interface Guidelines（https://developer.apple.com/design/human-interface-guidelines）：跨设备体验应适配尺寸等级、触控、导航层级与内容优先级。Tracevane 必须将 PC、平板、手机作为同一产品框架的三种形态，而不是桌面缩放版。

## 第一季北极星

Tracevane Workspace Season One = **AI Coding + Writing Studio**。

一句话：用户打开 Tracevane 后看到的不是“文件树 + 编辑器 + 黑终端”的旧 IDE，而是一个清晰的任务工作台：左侧是任务与资源，中央是主舞台，右侧是上下文/证据/AI，底部是运行与终端；移动端变为主舞台 + bottom task switcher + sheets。

## 新前端框架原则

1. **Primary Stage first**：中央主舞台是产品核心，文件树、终端、证据都不得抢主舞台。
2. **Context over chrome**：少导航 chrome，多上下文内容。右侧 rail 只显示当前任务相关 AI / evidence / outline。
3. **One adaptive frame**：PC、平板、手机复用同一 frame contract，而不是三套页面。
4. **Evidence is first-class**：AI 任何写作/编码建议都必须能引用 evidence packet，不再隐藏在聊天气泡里。
5. **No legacy card walls**：禁止信息卡堆、解释型空态、局部玻璃拟态堆叠。
6. **No global floating clutter**：悬浮按钮必须归入 frame slot；禁止在内容区域边缘随机漂浮入口。
7. **Touch parity**：右键、hover、快捷键动作必须有触控替代入口。
8. **Commit after each phase**：每个阶段修改后提交，只提交自己管理的文件。

## PC / 平板 / 手机布局

### Desktop ≥ 1280

```text
Global Topbar: workspace switcher | task title | command/search | layout controls
Left Activity Rail: files/search/git/run/agents/evidence
Resource Column: current activity list/tree
Primary Stage: editor/preview/writing canvas/diff
Context Rail: AI context, evidence review, outline, approvals
Bottom Panel: terminal, logs, tests, agent runs
Status Bar: branch, save, encoding, runtime, task state
```

### Tablet 768–1279

```text
Topbar remains global
Activity Rail compact
Resource Column becomes collapsible drawer
Primary Stage remains dominant
Context Rail becomes right sheet / split overlay
Bottom Panel becomes resizable bottom sheet
```

### Phone < 768

```text
Topbar: task title + command
Main Stage: one surface at a time
Bottom Task Switcher: Files / Stage / AI / Evidence / Run
Sheets: file picker, evidence review, terminal, command palette
No persistent multi-column layout
```

## 第一季实施分层

### Layer 0：设计契约与验收锚点

- 新 frame contract 文档。
- 新 shared prototype component，不直接挂旧 Workbench。
- 结构测试锁定“不能继续旧三栏补丁”。

### Layer 1：Frame shell

- `WorkspaceSeasonOneFrame`：未挂载原型。
- slot：topbar、activity、resources、stage、context、bottom、status、mobile switcher。
- responsive class contract。

### Layer 2：真实接入

- 等当前 `WorkspaceWorkbench.tsx` 并发修改收敛后替换旧 shell。
- Evidence Responsive Launcher 接入 context rail / mobile sheet。
- Terminal 进入 bottom panel，禁止占据主舞台默认空间。

### Layer 3：产品体验闭环

- AI context basket / evidence basket / handoff / review surface 串入真实任务流。
- Writing canvas 与 code editor 共享 evidence 和 approval。
- PC、平板、手机截图验收。

## 非目标

- 不继续给旧 Workbench 局部加按钮。
- 不把文件管理器、Agent 会话、CLI Agents 混成一个页面。
- 不在并发修改中的 AppShell / Workbench 上强行大改。
- 不宣称 goal 完成；第一季只是重构起点。

## 下一步

本阶段先新增 `WorkspaceSeasonOneFrame` 原型和结构测试；后续在并发改动收敛后迁移真实 Workbench。
