# Workspace IDE UI/UX 全面重设计审计与下一步计划

> 状态：Active Phase 1 UI/UX Redesign Audit
> 创建：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> 当前主线：全面重新设计 IDE 工作区 UI/UX，优先覆盖 IDE 主体、终端、Git、搜索、文件/编辑器/命令/布局、电脑端与手机端。
> 当前非主线：写作、渲染、预览增强、富媒体阅读体验、独立文档工作区。

---

## 1. 结论

当前 `/workspace` 已经回到真实 Workbench 入口，不再是概念说明页；但这不是最终设计，只是需要被系统性重设计的现有基线：

- `apps/web/src/features/workspace/WorkspacePage.tsx` 直接渲染 `WorkspaceWorkbench`。
- `WorkspaceWorkbench` 已经具备 IDE shell 的基本形态：side panels、editor、terminal dock、command palette、layout persistence、mobile panel/nav。
- `WorkspaceTerminal` 已经是 xterm.js + 后端 `node-pty`/SSE 的真实终端前端，不是静态展示。
- 后端 `apps/api/modules/terminal` 已经有 persisted sessions、stream、input、resize、ledger、status/check 等接口。

结论不是继续给旧界面打补丁，而是以现有能力为底，重新设计 IDE 主体 UI/UX。当前不适合马上大规模改代码，因为工作区存在大量他人未提交改动，尤其是 IDE 主线最关键的文件：

- `apps/web/src/features/workspace/workbench/WorkspaceWorkbench.tsx`
- `apps/web/src/features/workspace/terminal/WorkspaceTerminal.tsx`
- `apps/api/modules/terminal/routes.ts`
- `apps/api/modules/terminal/service.ts`
- `apps/api/modules/files/routes.ts`
- `apps/api/modules/files/service.ts`
- `types/files.ts`
- `types/terminal.ts`

因此下一步必须先做 **审计驱动的 UI/UX 重设计计划**，再小步落地，避免把他人代码一起提交。

---

## 1.1 重新设计范围

这次“重新设计”不是新增一个说明页，也不是换皮。重新设计范围包括：

1. **IDE 主体 Workbench**：整体壳、Activity/Nav、Side Panel、Editor Stage、Bottom Dock、Status Bar、Command Palette、布局记忆。
2. **Terminal 前端体验**：session roster、输入区、移动端键盘、触摸滚动、命令插入、错误反馈、全屏/半屏/底栏切换。
3. **Git 面板**：变更列表、diff 入口、stage/commit、当前分支状态、移动端审查模式。
4. **搜索面板**：文件/内容搜索、结果密度、跳转、与终端/上下文证据的显式交互。
5. **文件与编辑器基础体验**：文件树、tabs、dirty/save 状态、打开/定位/分屏/移动 tab。
6. **电脑端 UI/UX**：高密度、低噪音、专业 IDE 信息架构。
7. **手机端 UI/UX**：单任务流、底部模式切换、sheet/panel、终端输入优先、Git/search 审查优先。

不在本阶段：

- 不做 preview/rendering 视觉增强。
- 不做 writing studio。
- 不做富媒体文档阅读体验。
- 不做新的 AI 海报/卡片/说明页。

---

## 2. 当前已确认的 IDE Core 事实

### 2.1 Workspace 入口

证据：`apps/web/src/features/workspace/WorkspacePage.tsx`

```text
WorkspacePage -> WorkspaceWorkbench
```

含义：

- `/workspace` 当前主入口是 Workbench，不是 Season One/概念页/说明文档页。
- 后续 UI/UX 改造应围绕 Workbench shell，而不是另起一个展示页。

### 2.2 Workbench shell 能力

证据：`apps/web/src/features/workspace/workbench/WorkspaceWorkbench.tsx`

当前已存在：

- `SidePanel = "explorer" | "search" | "git"`
- `DockPanel = "editor" | "terminal" | SidePanel`
- `DockviewReact`
- `WorkspaceEditorStage`
- lazy `WorkspaceTerminal`
- `WorkspaceExplorer`
- `WorkspaceSearchPanel`
- `WorkspaceGitPanel`
- `WorkspaceCommandPalette`
- `deriveWorkspaceLayoutMode`
- `createWorkspaceCommandRegistry`
- layout/session/panel-size localStorage keys
- mobile workbench detection：`useMediaQuery("(max-width: 768px)")`
- mobile panel/nav data attributes and snap controls
- terminal dock open/focus/maximize/fullscreen state

判断：

- 这已经是 IDE shell 雏形，不能再推倒成说明页。
- 但 `WorkspaceWorkbench.tsx` 太大，后续需要拆成 shell/layout/mobile/commands/panels 几个稳定边界。
- 当前它已经 dirty，下一步不能直接大改，必须等他人改动稳定或只做精确 hunk。

### 2.3 Terminal 前端能力

证据：`apps/web/src/features/workspace/terminal/WorkspaceTerminal.tsx`

当前已存在：

- xterm.js：`@xterm/xterm`
- fit addon：`@xterm/addon-fit`
- web links addon
- optional webgl addon
- session roster
- create/end/delete/rename session mutations
- `EventSource` stream attach
- `/input` POST
- `/resize` POST
- persisted font size
- mobile/touch scroll handling
- visual viewport keyboard inset handling
- command palette registration
- workspace directory -> new terminal cwd
- one-shot input request：其他 Workspace 模块可插入命令/路径到终端

判断：

- Terminal 是当前 IDE 主线最有价值的真实能力之一。
- 下一阶段优先级应放在 terminal UX、mobile keyboard、session reliability、workspace cwd、command insertion、error display、tests。
- 不应把终端能力和 CLI Agent runtime 混为一体。

### 2.4 Terminal 后端能力

证据：`apps/api/modules/terminal/routes.ts`、`apps/api/modules/terminal/service.ts`

当前 API 已包括：

- `GET /api/terminal/status`
- `GET /api/terminal/check`
- `GET /api/terminal/sessions`
- `POST /api/terminal/sessions`
- `GET /api/terminal/sessions/:sessionId`
- `GET /api/terminal/sessions/:sessionId/ledger`
- `GET /api/terminal/sessions/:sessionId/stream`
- `POST /api/terminal/sessions/:sessionId/input`
- `POST /api/terminal/sessions/:sessionId/resize`
- `POST /api/terminal/sessions/:sessionId/rename`
- `POST /api/terminal/sessions/:sessionId/delete`
- `POST /api/terminal/end`

后端 service 已包括：

- `@homebridge/node-pty-prebuilt-multiarch`
- session descriptor store
- session ledger
- stream subscribers
- gateway subscribers
- backlog/output buffering
- descriptor persistence
- cleanup/grace lifecycle
- resize/input validation

判断：

- 后端不是空壳，已经有较完整的 terminal runtime。
- 当前 priority 是梳理契约、测试和 UI 表达，而不是重写终端后端。
- routes/service 都是 dirty，下一步不能直接修改，除非只做精确 bug fix。

---

## 3. 当前必须暂不碰的非主线区域

根据最新 Goal：写作、渲染、预览增强不是当前主线。

以下目录/文件当前只做风险标注，不做增强：

```text
apps/web/src/features/workspace/preview/
apps/web/src/features/workspace/shared/ArchivePreview.tsx
apps/web/src/features/workspace/shared/BinaryFilePreview.tsx
apps/web/src/features/workspace/shared/CsvPreview.tsx
apps/web/src/features/workspace/shared/DocumentPreview.tsx
apps/web/src/features/workspace/shared/DocumentWorkbench.tsx
apps/web/src/features/workspace/shared/JsonPreview.tsx
apps/web/src/features/workspace/shared/ReplaceDiffPreview.tsx
apps/web/src/features/workspace/shared/TextSlicePreview.tsx
apps/web/src/features/workspace/shared/VisualDocumentEditor.tsx
apps/web/src/features/workspace/shared/vditorI18n.ts
```

特别说明：

- 如果这些文件有他人 dirty 改动，不介入。
- 如果它们阻塞 IDE 基线测试，可以做最小修复。
- 不做新的 preview/rendering 体验设计。
- 不做 writing studio。
- 不做 Vditor/富文本/Markdown 视觉增强。

---

## 4. 当前风险排序

| Rank | 风险 | Confidence | 证据 |
| --- | --- | --- | --- |
| 1 | IDE 主线关键文件存在他人 dirty 改动，直接改代码容易误提交或冲突。 | High | `git status --short` 显示 Workbench、Terminal、terminal/files API、types 均 dirty。 |
| 2 | Workbench 代码承载过多职责，后续扩展会继续变成大文件补丁。 | High | `WorkspaceWorkbench.tsx` 同时包含 shell、layout、mobile nav、terminal dock、commands、panel rendering。 |
| 3 | Terminal 是真实能力但 UX/契约需要收束，不应被 CLI Agents 或证据层污染。 | High | Terminal 前端/后端均存在真实 session/stream/input/resize/ledger 能力；Goal 要求 IDE-first。 |
| 4 | preview/rendering/writing 文件仍在 Workspace 内，容易被误认为当前主线。 | Medium | 相关 preview/document/editor 文件存在，但最新 Goal 明确暂不推进。 |
| 5 | 当前测试多为源码断言，能防回归但不能证明真实手机/终端交互体验。 | Medium | `tests/system/web-ide-shell.test.mjs`、`web-responsive-layout.test.mjs` 多以源码 regex 为主。 |

---

## 5. 下一步必须做

### 5.1 不改代码前的 UI/UX 重设计任务

1. 建立 `Workspace IDE Core UI/UX` 文件分层清单：
   - shell/layout/mobile
   - files/search
   - editor
   - terminal
   - git
   - commands/keymap
   - AI/evidence extension
   - preview/rendering/writing future extension
2. 建立 terminal contract 文档：
   - session lifecycle
   - stream attach
   - input/resize
   - cwd
   - ledger
   - canResume
   - mobile keyboard/input
3. 建立 desktop/mobile UI/UX 重新设计验收清单：
   - desktop 信息密度与 IDE 专业感
   - mobile 单任务流
   - terminal bottom dock/fullscreen/keyboard
   - Git/search/file panels 的 sheet 化
   - command palette
   - status bar
4. 记录当前 dirty 文件 owner 风险，等干净后再改。

### 5.2 可以马上做的小范围代码任务

只有在目标文件没有他人 dirty 或可精确 hunk 时才做：

1. 删除旧目标文案和死引用。
2. 给 terminal/workbench 添加不改变行为的 contract comments。
3. 给测试补充“不要渲染/预览/写作作为当前主线”的断言。
4. 修复明显 UI 文案：把“写作工作区”改为“AI 编程 IDE 工作区”。

### 5.3 暂不做

1. 不做 preview/rendering 改造。
2. 不做 writing studio。
3. 不做富文本/Markdown 视觉增强。
4. 不重写 terminal backend。
5. 不引入 Theia/code-server 依赖。
6. 不启动大规模前端重构，直到 dirty 文件收敛并完成 ADR。

---

## 6. 下一批建议提交计划

### Commit A：当前审计文档

范围：

- `docs/WorkspaceIDE工作区现状审计与下一步清理计划.md`
- 可选更新 `docs/README.md`

验证：

- `git diff --check`
- 不改代码，不跑全量 e2e。

### Commit B：IDE UI/UX 重设计验收文档

范围：

- 新建 `docs/WorkspaceIDE-UIUX重设计验收.md`
- 覆盖 IDE 主体、Terminal、Git、Search、Desktop、Mobile。
- 不碰 preview/rendering/writing。

验证：

- `git diff --check`
- 若补测试，运行对应 test。

### Commit C：Terminal contract 文档或测试保护

范围：

- 新建 `docs/Workspace终端契约与UIUX验收.md`
- 或补充源码断言测试，确保终端前端与后端契约不被 CLI Agent/preview/writing 污染。

验证：

- targeted node tests。

---

## 7. 当前执行约束

- Codex Goal 工具中已创建的 objective 正文不能在当前工具面直接编辑；本仓库蓝图是实际执行目标的覆盖说明。
- 每个阶段性修改后必须 commit。
- 不使用 `git add .`。
- 不提交他人 dirty 改动。
- 如必须修改 dirty 文件，只能用 `git add -p` 精确 stage 本代理 hunk。
- 当前不启动 subagent；只有用户明确要求或任务可并行且收益明显时再启动。

---

## 8. 当前阶段结论

下一阶段不要急着“重构前端”。正确顺序是：

1. 把目标锁死在 IDE 工作区本体。
2. 保护并理解现有 Workbench/Terminal/Files/Git/Search 能力。
3. 暂停 preview/rendering/writing 增强。
4. 等关键 dirty 文件收敛后，按 IDE Core 分层逐步拆分和清理。
5. 优先重新设计 IDE 主体、终端、Git、搜索和手机端真实可用性，而不是做新的概念界面。
