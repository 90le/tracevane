# Workspace 前端 IDE 与文件管理重构阶段目标

> 状态：Active execution goal
> 创建：2026-06-25
> 适用范围：`apps/web` Workspace/IDE/Files 前端重构，以及必要的 API adapter、测试和文档更新。
> 上游目标：`整体目标.md`、`Workspace目标.md`、`Workspace设计文档.md`、`Workspace前端架构.md`、`文件管理设计.md`、`终端能力设计.md`。

## 0. 长目标描述

本重构要把当前半成品 `/ide` 与只读 `/files` 改造成一个真正可用、响应式、Agent 工作流优先的 Workspace 前端。最终用户在 PC 上应获得专业 IDE 级多栏工作台，在手机上应获得单栏任务控制器，而不是压缩桌面布局；文件管理应是真实可操作的本地文件管理，不再通过“本页只读，去 IDE 操作”的说明暴露产品割裂；终端作为 Workspace 的 shell/process 工具保持独立，不和 CLI Agents 混淆；CLI Agents 只负责 Codex / Claude Code / OpenCode runtime readiness 与 Agent Runs。

本轮重构的前端目标不是快速把旧功能堆回来，而是建立一套可以长期演进的 Workspace 架构：共享 workspace state、统一 command registry、桌面/平板/手机分层布局、统一文件操作系统、可审查的 diff/preview/evidence 链路，以及以后可以接入 Agent plan/patch/approval 的清晰边界。

## 1. 总约束

### 1.1 绝对边界

- Terminal 属于 Workspace，不属于 CLI Agents。
- CLI Agents 不管理普通 terminal tabs、PTY、shell 输入输出、terminal resize、terminal split 或 terminal delete。
- Workspace 不管理 Provider secret、IM bot token 或 OpenClaw 平台原生配置写入。
- 文件管理属于 Workspace；`/files` 如果保留，只能作为 Evidence/Artifacts，不作为只读文件管理器。
- 手机端必须是单栏任务流，不得把 PC 多栏强行压缩进 390px 宽度。
- 未实现能力不得以用户可见的“P1 占位”“规划中”占据首屏。
- 所有危险写动作必须有明确确认、影响范围和结果反馈；能回滚的要保留回滚证据，不能回滚的要明确不可逆。

### 1.2 技术约束

- 不新增依赖，除非单独提出并记录必要性、替代方案和验证计划。
- 优先复用现有 `apps/web/src/design` UI primitives、TanStack Query hooks、Files/Git/Terminal API。
- 先通过 adapter/facade 收敛前端结构，不急于大改后端路径。
- 所有阶段必须保持 `npm run typecheck:web` 通过。
- 涉及 API 类型或后端调用时必须同步运行相关 API typecheck/test。
- 每个阶段完成后必须更新本文“进度记录”，再提交 git。

### 1.3 设计约束

实现前必须参考并遵守：

- `DESIGN.md`
- `docs/界面设计守则.md`
- `docs/prototypes/Aurora设计体系.md`
- `docs/prototypes/app.html`

设计基线是轻量工作台 / Industrial Studio，不允许出现夸张、营销式、失控玻璃、巨大圆角、卡片墙或与现有 Aurora 体系割裂的视觉。

- PC：多栏、高密度、可折叠/可扩展；不做卡片墙。
- Tablet：抽屉/双栏混合；保留完整能力。
- Mobile：底部模式导航 + 全屏文件/编辑/终端/diff/preview + action sheet。
- 信息密集区域使用实色面板、清晰边界、低阴影。
- 文件列表、日志、终端、diff、代码必须在容器内部滚动，不撑破页面。

## 2. 可以做

- 新建 `features/workspace` 目录并逐步迁移 `features/ide` / `features/files` 能力。
- 新建 Workspace route，并让旧 `/ide` 重定向或兼容挂载到 Workspace。
- 抽出 workspace store/context。
- 抽出文件 command registry，统一 toolbar/context menu/mobile sheet。
- 改造 `/files` 为 Workspace 内 file manager 或 Evidence/Artifacts 入口。
- 隐藏未实现的 IDE tabs，避免假功能。
- 修复 stale terminal 首屏错误体验。
- 增加响应式 Playwright smoke。
- 增加系统/静态测试保护“Terminal != CLI Agents”。

## 3. 不能做

- 不能把 CLI Agents 页面改成终端管理页。
- 不能在 Workspace 里新增 Provider secret 编辑。
- 不能在文件管理里绕过后端 root allowlist。
- 不能用前端 localStorage 当文件事实源。
- 不能为了移动端删掉核心文件/终端能力；只能换交互方式。
- 不能把旧文档/旧 Vue/旧原型当直接实现权威；只能作为能力覆盖参考。
- 不能只做视觉壳而保留“文件管理不可用”的产品问题。

## 4. 阶段计划

### Phase 0 — 执行合同与安全基线

目标：建立可执行的阶段目标、边界、验收和提交纪律。

任务：

1. 创建本文。
2. 更新 `docs/README.md`，把本文列为 Workspace 重构执行入口。
3. 更新 `docs/文档整理记录.md`，记录 Phase 0。
4. 检查旧阶段文档引用无残留。
5. 提交 git。

验收：

- `git diff --check` 通过。
- 旧删除文档无 active 引用。
- 本文明确边界、可以做、不能做、阶段和提交纪律。

### Phase 1 — Workspace Shell 骨架替换

目标：建立新 Workspace route/shell，先解决“半成品 IDE 壳”和响应式骨架问题。

任务：

1. 新建 `apps/web/src/features/workspace/` 基础目录。
2. 新建 `WorkspacePage` / `WorkspaceShell` / layout mode hook。
3. 桌面布局：Activity / Explorer / Editor Stage / Inspector / Bottom Panel。
4. 移动布局：Top Bar / Main Stage / Bottom Mode Nav / Action Sheet seam。
5. 将旧 `/ide` 迁移到 Workspace shell 或兼容 redirect。
6. 隐藏 Search/Agent/Problems/Output 等未实现可见占位；只显示真实可用或明确 disabled 且不占主舞台的入口。
7. Inspector 替代固定 Preview；无可预览内容时 Inspector 可隐藏。
8. 建立 no-horizontal-overflow smoke。

验收：

- PC 1440×900 无横向溢出。
- Mobile 390×844 无横向溢出。
- `/ide` 或 `/workspace` 首屏没有用户可见 P1 占位。
- `npm run typecheck:web` 通过。
- 更新本文进度并提交。

### Phase 2 — Workspace 文件管理闭环

目标：把文件管理从“只读证据页 + IDE 右键局部写操作”升级为真实 Workspace 文件管理。

任务：

1. 抽出 `workspace/file-commands`：create file/dir、rename、copy、move、delete、download、upload、archive、unarchive。
2. PC 支持 toolbar + context menu + command palette seam。
3. Mobile 支持 action sheet，不依赖右键。
4. 建立 File Manager mode：路径栏、表格/树切换、排序、筛选、批量选择、状态栏。
5. `/files` 改为 redirect 到 Workspace file manager，或改名/文案为 Evidence Files，不能继续叫完整文件管理。
6. 上传 sheet：进度、覆盖策略、失败逐项反馈。
7. 批量删除/移动/压缩确认列出 affected paths。
8. 文件操作成功/失败都产生 toast 和可选 evidence record seam。

验收：

- 基础 CRUD 和 archive/download 路径可用。
- Mobile 可完成新建、重命名、删除、上传入口操作。
- 危险动作有确认。
- `/files` 不再显示“只读，去 IDE 操作”的产品割裂横条。
- `npm run typecheck:web` 通过；涉及 API 则跑相关系统测试。
- 更新本文进度并提交。

### Phase 3 — Editor Stage 与 Diff/Preview 基础闭环

目标：让编辑器从“能打开文本”升级为可审查、可预览、可恢复的工作舞台。

任务：

1. 多 tab 状态迁移到 workspace store。
2. Save、Save All、Revert、Close dirty guard。
3. Git diff 文件从 Git panel 打开到 Diff Editor，而不是只保存状态。
4. Markdown split preview 和 Inspector preview 统一。
5. 二进制/图片/大文件 preview 策略。
6. Editor dirty 状态进入 status bar 和 file tree marker。
7. 移动端 editor full-screen。

验收：

- Git changed file 可打开 diff。
- dirty tab/save/revert 行为受测试保护。
- Markdown preview 不固定占空右栏。
- Mobile editor 无横向页面溢出。
- 更新本文进度并提交。

### Phase 4 — Terminal Runtime 前端稳定化

目标：先从前端体验和合同上修复终端不稳、不适配移动端、不应混入 CLI Agents 的问题。

任务：

1. stale session 不再首屏红字；显示可清理/新建/重连的结构化状态。
2. terminal tabs 支持 rename/close/kill/reconnect/clear/copy/search seam。
3. 移动端 terminal full-screen。
4. 移动输入增强栏：Esc、Ctrl、Tab、↑、↓、/、-、_、Enter、Ctrl+C、Paste。
5. 输出选择/复制/发送到 evidence/context seam。
6. 增加静态或系统测试确保 CLI Agents 不导入/管理 terminal UI。

验收：

- terminal_session_not_found 不以裸错误污染首屏。
- mobile terminal 可输入特殊键。
- CLI Agents 文案和代码不出现普通 terminal 管理入口。
- 更新本文进度并提交。

### Phase 5 — Workspace Evidence 与 Agent Handoff 基础

目标：建立后续 Agent 协作的前端骨架，但不把 CLI Agents 混进 Workspace。

任务：

1. Evidence basket UI：文件、diff、terminal output、preview screenshot seam。
2. Agent context builder：选择文件/片段/terminal output/preview evidence。
3. Workspace 发起 Agent task 的 request seam。
4. CLI Agents run link：仅链接，不接管 run 管理。
5. Agent result review placeholder 只在有真实数据时显示，不做空占位。

验收：

- Workspace 可构造 context bundle。
- CLI Agents 仍是 Agent Run owner。
- Evidence 可从文件/终端/Git 进入 basket。
- 更新本文进度并提交。

## 5. 每阶段提交规则

每个阶段或阶段内可验证 slice 完成后必须：

1. 更新本文“进度记录”。
2. 更新相关目标/架构/设计文档。
3. 运行最小必要验证。
4. `git diff --check`。
5. 提交 git。

提交信息必须遵守 Lore Commit Protocol，至少包含：

```text
<为什么做这个阶段>

Constraint: <边界/外部约束>
Rejected: <拒绝方案> | <原因>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Tested: <验证>
Not-tested: <缺口>
```

## 6. 进度记录

### 2026-06-25 Phase 0 started

- 创建 Workspace 前端 IDE 与文件管理重构执行合同。
- 目标：先提交文档目标，再进入 Phase 1 Workspace Shell 实现。

### 2026-06-25 Phase 1 slice A completed

- 新增 `features/workspace` 与 `/workspace` 全屏路由。
- 旧 `/ide` 兼容跳转到 `/workspace`。
- 导航入口从 “IDE” 改为 “工作区”。
- 新 Workspace shell 区分 PC 多栏与 mobile 单栏模式导航。
- Phase 1 只暴露真实可用的 Files / Git / Editor / Preview / Terminal，不再展示 Search / Agent / Problems / Output 的用户可见占位。
- Inspector 替代固定 Preview；未选择文件时只显示轻量说明。
- 明确实现必须参考 `DESIGN.md`、`docs/界面设计守则.md` 和 Aurora 原型体系，避免夸张割裂设计。
- 验证：`npm run typecheck:web`；Playwright smoke `/workspace` desktop 1440×900 与 mobile 390×844，无横向溢出。
