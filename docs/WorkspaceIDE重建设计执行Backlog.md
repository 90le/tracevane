# Workspace IDE 重建设计执行 Backlog

> 状态：Active Execution Backlog
> 创建：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> UI/UX 合同：`WorkspaceIDE-UIUX重设计验收.md`
> 当前边界：先完成 IDE 主体、Terminal、Git、Search、Files、Editor、Command Palette、Status Bar、桌面/平板/手机响应式；不推进写作、渲染、预览增强。

---

## 0. 为什么需要这个 Backlog

用户要求的是 **全部重新设计**，不是继续在旧界面上修修补补。当前仓库已有真实 Workbench、xterm terminal、Git/Search/Files/Editor 雏形，但关键文件存在大量并行 dirty 改动，所以不能直接大改并误提交他人代码。

本 Backlog 的作用是把“重建”拆成可执行、可验证、可提交的小阶段：

- 等关键文件 clean 后，按这里的顺序改代码。
- 每个阶段都有明确 owner、交付物、不要做、验收。
- 每个阶段都必须保留全局顶栏，不再出现说明页式 Workspace。
- 每个阶段都必须只提交本代理改动。

---

## 1. 总体重建顺序

```text
Phase A  Contract Lock
  锁定目标、验收、禁止项、执行 backlog。

Phase B  Shell Architecture
  重建 Workspace 内部 IDE shell，但保留全局顶栏。

Phase C  Terminal First
  终端作为一等 IDE 面板完成桌面/手机 UX。

Phase D  Files + Editor Core
  文件树、tabs、dirty/save、code/diff/review 工作流。

Phase E  Search Core
  文件/内容搜索、跳转、替换审查计划、移动端结果流。

Phase F  Git Core
  branch、changes、diff review、stage/commit、移动端审查。

Phase G  Command + Status
  命令中心、快捷键、状态栏、布局恢复。

Phase H  Responsive Hardening
  桌面高密度、平板双态、手机单任务流、终端键盘避让。

Phase I  ADR
  Theia / code-server / OpenVSCode / 自研 Workbench 长期路线决策。
```

当前阶段只处于 Phase A；不应直接跳到 Phase H 做视觉皮肤。

---

## 2. Phase A — Contract Lock

### 目标

把当前目标锁成 IDE Core 重建，防止再次回到写作、预览、渲染或概念展示页。

### 已有交付物

- `Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
- `WorkspaceIDE-UIUX重设计验收.md`
- `WorkspaceIDE工作区现状审计与下一步清理计划.md`
- `tests/system/workspace-top-tier-goal.test.mjs`

### 仍需交付

- 本 Backlog。
- 后续 README/文档索引只允许把本 Backlog 作为执行入口，而不是把旧原型并列展示。

### 不要做

- 不改 dirty 的 Workbench/Terminal/Git 文件。
- 不引入依赖。
- 不做视觉原型页。

### 验收

- 守卫测试证明当前主线包含 IDE 主体、Terminal、Git、Search、Files、Editor、Command/Status、Desktop/Tablet/Mobile。
- 守卫测试证明写作/渲染/预览增强不属于当前主线。

---

## 3. Phase B — Workspace Shell Architecture

### 目标

重建 Workspace 内部 IDE shell，让 `/workspace` 看起来和工作起来都像真实 IDE，但 **保留全局顶栏**。

### 目标结构

```text
Global App Top Bar  <- 必须保留
Workspace IDE Shell
  Project Bar
  Activity Rail
  Primary Side Panel
  Editor Stage
  Bottom Terminal Panel
  Optional Right Evidence/AI Inspector
  Status Bar
```

### 代码候选边界

- `WorkspaceWorkbench.tsx`：拆分，不继续膨胀。
- `WorkspaceCommandPalette.tsx`：统一命令入口。
- `workbenchLayoutController.ts`：布局状态与响应式模式。
- `workspace-workbench.css`：shell token、density、breakpoints。

### 需要拆出的组件

- `WorkspaceProjectBar`
- `WorkspaceActivityRail`
- `WorkspaceSidePanelShell`
- `WorkspaceEditorShell`
- `WorkspaceTerminalDockShell`
- `WorkspaceStatusBar`
- `WorkspaceMobileModeShell`

### 不要做

- 不删除 AppShell/global top bar。
- 不把 Workspace 首屏做成说明页。
- 不把 AI/Evidence 作为默认主舞台。
- 不把 preview/rendering 放回主 stage。

### 验收

- 桌面端：Activity Rail + Side Panel + Editor + Terminal + Status Bar 清晰。
- 手机端：只显示一个 main mode；Bottom Nav 不遮挡 Terminal 输入。
- 源码测试锁定全局顶栏保留、shell 组件边界存在。

---

## 4. Phase C — Terminal First

### 目标

Terminal 是第一优先级 IDE 能力。它必须是可真实操作的 shell，而不是日志卡片。

### 必须完成

- Session roster：active/detached/archived 明确。
- Active terminal header：session name、cwd、connection、running/idle。
- Stream state：连接中、断开、重连、错误可见。
- Input：键盘、粘贴、插入路径/命令、移动端键盘避让。
- Resize：dock、fullscreen、mobile sheet 下 fit 与后端 resize 同步。
- Actions：copy visible output、clear screen、rename、delete、new session、fullscreen、dock。
- Safety：来自 AI/Search/File 的命令只能插入，不自动执行。

### 代码候选边界

- `WorkspaceTerminal.tsx`
- `terminalPanelCommands.tsx`
- `terminalSessionActions.tsx`
- `useVisualViewportKeyboardInset.ts`
- `apps/api/modules/terminal/*`（仅在后端契约确实需要时）

### 不要做

- 不把 CLI Agent runtime 生命周期并入普通 terminal。
- 不自动执行 AI 建议命令。
- 不吞掉 input/stream/resize 错误。

### 验收

- 桌面 bottom dock、fullscreen、恢复都能用。
- 手机端 terminal 输入不被 keyboard/nav 遮挡。
- 命令插入只写入输入行或 terminal pty，不自动执行危险命令。
- 有源码/系统测试锁定 terminal 是 IDE 一等面板。

---

## 5. Phase D — Files + Editor Core

### 目标

文件和编辑器是 IDE 主体。用户必须能快速定位文件、打开、编辑、保存、审查 diff。

### 必须完成

- File tree：项目根、折叠、当前文件 reveal、刷新、新建、重命名、删除、上传。
- Editor tabs：open/close/dirty/save、active file、code/diff/review mode。
- Editor stage：空状态不能是大段说明文；应是工作入口。
- Diff/review：Git/Search/AI 的审查都进入 editor/review 工作流。
- Danger confirmation：删除、覆盖、批量操作要确认。

### 代码候选边界

- `WorkspaceExplorer.tsx`
- `FileTree.tsx`
- `FileActionsMenu.tsx`
- `WorkspaceEditorStage.tsx`
- `EditorTabs.tsx`
- `CodeEditor.tsx`
- `editorTabActions.tsx`
- `editorTabCommands.tsx`

### 不要做

- 不把预览/渲染作为 editor 当前主线。
- 不新增第二套文件管理器。
- 不把文件操作交给 terminal 代替。

### 验收

- 打开文件、dirty/save、tab 切换清楚。
- File tree 与 active editor 能互相定位。
- 手机端 Files 是快速定位流，不是压缩桌面树。

---

## 6. Phase E — Search Core

### 目标

Search 是项目级定位与审查入口，不是后台表格。

### 必须完成

- 文件名搜索与内容搜索边界清楚。
- 结果按文件分组，显示路径、片段、匹配数。
- 点击结果打开 editor 并定位。
- 替换必须形成 reviewable plan；不能默认直接写所有结果。
- 搜索结果可显式进入 AI/Evidence context。
- 手机端支持输入、结果、打开、返回搜索的闭环。

### 代码候选边界

- `WorkspaceSearchPanel.tsx`
- `searchPanelCommands.tsx`
- `ReplaceDiffPreview.tsx`（只作为 diff/review，不作为 preview 主线）

### 不要做

- 不默认把全部搜索结果塞进 AI。
- 不把替换预审命名为 preview 主线。
- 不让点击结果丢失搜索上下文。

### 验收

- Search 结果打开 editor。
- Replace plan 需要审查确认。
- 手机端 Search 是单任务流。

---

## 7. Phase F — Git Core

### 目标

Git 是代码审查与提交工作流，不是静态统计卡。

### 必须完成

- Branch/current repo visible。
- Changes list：staged/unstaged/untracked/renamed/conflict。
- Diff review 快速入口。
- Stage/unstage/revert/commit 有确认边界。
- Commit message suggestion 是 AI 扩展动作，不是 Git 基础 owner。
- 手机端优先看变更、看 diff、stage/commit confirm。

### 代码候选边界

- `WorkspaceGitPanel.tsx`
- `gitPanelCommands.tsx`
- `gitChangeActions.tsx`

### 不要做

- 不把 Git 生命周期交给 CLI Agent。
- 不把 diff 遮挡在 AI 面板后面。
- 不把 release note/AI copy 当成 Git 主任务。

### 验收

- Git 面板以 review language 为主。
- Diff/commit/stage 入口明确。
- 手机端 Git 是审查流。

---

## 8. Phase G — Command + Status

### 目标

Command Palette 和 Status Bar 是 IDE 工作效率核心。

### 必须完成

- Command Palette 统一 Files/Search/Git/Terminal/Layout/AI Context 动作。
- 命令有 context 条件，不能展示无效动作。
- 快捷键与按钮行为一致。
- Status Bar 显示 branch、dirty/save、active file、terminal status、workspace root、mobile mode。
- Layout reset、focus terminal、reveal file、copy evidence 都命令化。

### 代码候选边界

- `workspaceCommands.tsx`
- `workspaceCommandShortcuts.ts`
- `workspaceKeymap.ts`
- `WorkspaceCommandPalette.tsx`
- future `WorkspaceStatusBar.tsx`

### 不要做

- 不把所有动作堆到顶栏按钮。
- 不用 Status Bar 做装饰色块。
- 不让命令和 UI 按钮分叉。

### 验收

- 低频动作在 command palette。
- 状态栏是真状态。
- 手机端 command sheet 可用。

---

## 9. Phase H — Responsive Hardening

### 目标

桌面、平板、手机分别成为可用工作流。

### 桌面

- 高密度 IDE。
- Editor 主舞台。
- Terminal bottom dock。
- Git/Search/Files 侧栏切换。
- Optional right inspector 只在需要时出现。

### 平板

- 横屏双栏：Side panel + Main stage。
- 竖屏：Main stage + sheet panels。
- 外接键盘时快捷键与 terminal 输入体验接近桌面。

### 手机

- 单任务流：Editor / Terminal / Files / Search / Git。
- Bottom mode nav。
- Terminal keyboard-safe。
- Search/Git 使用 sheet/review flow。
- 不横向滚动。

### 不要做

- 不把桌面三栏直接压缩到手机。
- 不让 terminal 输入被底栏遮挡。
- 不把 AI chat 作为默认手机首屏。

### 验收

- 响应式源码测试 + Playwright 截图 smoke。
- 手机 Terminal 输入路径可用。
- Git/Search 可完成审查/跳转。

---

## 10. Phase I — Long-term Route ADR

### 目标

在代码重建有稳定基线后，决定长期主线：Theia、code-server/OpenVSCode、自研 Workbench 或混合路线。

### 必须比较

| 路线 | 核心价值 | 最大风险 | 适用定位 |
| --- | --- | --- | --- |
| Theia | IDE 平台、扩展、白标 | 迁移和学习成本 | 长期产品壳候选 |
| code-server/OpenVSCode | 快速完整 VS Code Web | 产品主权弱、移动定制弱 | fallback/兼容专业模式 |
| 自研 Workbench | 完全可控、贴合 Tracevane | 长期补齐 IDE 成本 | 当前短中期基线 |
| 混合 | 快速可用 + 自有 AI 壳 | 架构复杂 | 需要 ADR 限定边界 |

### 不要做

- 不在没有 Spike 的情况下选型。
- 不因为当前界面差就盲目替换成 code-server。
- 不因为 Theia 强就忽略移动端和 AI/Evidence 定制成本。

### 验收

- ADR 写清推荐、反对项、迁移步骤、失败回退。
- 明确是否继续自研 Workbench、何时引入 Theia/code-server。

---

## 11. 通用提交与验证规则

每个阶段都必须：

1. 修改前检查 dirty 文件。
2. 不碰他人 dirty 文件；如必须碰，用精确 hunk 并只 stage 本代理改动。
3. 不使用 `git add .`。
4. 至少运行本阶段守卫测试。
5. 提交使用 Lore Commit Protocol。
6. 报告 changed files、验证、剩余风险。

---

## 12. 当前下一步建议

在当前工作区 dirty 状态下，最安全的下一步是：

1. 继续补充文档/测试级 contract，直到主线完全无歧义。
2. 等 `WorkspaceWorkbench.tsx`、`WorkspaceTerminal.tsx`、`WorkspaceGitPanel.tsx` 等关键文件干净后，从 Phase B/C 开始实现。
3. 第一轮实现不要追求视觉终局，先实现结构终局：全局顶栏保留、IDE shell 分层、Terminal first、Git/Search/Files/Editor owners 清楚。
