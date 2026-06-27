# 文件管理器与 Workspace 收尾 Goal 验收清单

> 本文是当前 active goal 的执行补充，用于明确“做到什么程度就停止并完成”，避免目标无限延展。当前 Codex goal 工具不支持直接编辑 active objective 正文，因此后续执行以 active goal 原文 + 本清单共同作为验收依据。若二者冲突，以本清单中更明确的完成边界为准。

## 总体完成定义（硬停止条件）

本 Goal 不是无限优化任务。它只交付 **A-F 六组阶段性能力**。当且仅当下列条件同时满足时，必须结束本 Goal，调用 `update_goal complete`：

1. A-F 六组“必须满足”全部完成。
2. A-F 对应的“验收证据”命令全部通过，或有同等强度、已记录的替代验证证据。
3. “最终结束命令”全部通过。
4. 当前 worktree 中不存在 A-F 范围内已知阻断问题：页面空白、核心操作失败、移动端明显溢出、编辑器 hook 崩溃、上传伪成功、危险操作静默执行。
5. 研究记录、设计/边界说明、测试入口已经更新，后续维护者能看懂为什么这样实现。

一旦以上 5 条全部满足，即使仍能想到更多高级功能，也不得继续把它们塞进本 Goal；应结束本 Goal，并把后续增强写到“后续计划”。

如果只剩本文明确列出的“非本 Goal 范围增强项”，也必须结束本 Goal，不得为了追求无限完美继续延期。

## Goal 结束判定口径（必须按此执行）

为了避免 Goal 因“还能继续优化”而永远不会结束，本 Goal 的结束口径固定为：

- **完成 A-F 的阶段性交付能力，而不是完成一个终极 IDE / 终极文件管理器。**
- **完成现有验收清单，而不是持续吸收新想法。**
- **完成可验证的稳定闭环，而不是追求所有未来增强。**

### 必须结束 Goal 的情况

只要同时满足以下 4 条，就必须结束 Goal：

1. A-F 六个阶段的“必须完成项”全部具备实现。
2. A-F 对应 smoke / system / typecheck / build / diff-check 验证全部通过，或替代验证已写入本文。
3. 不存在 A-F 范围内的阻断级问题：页面空白、无法打开文件、无法保存、上传伪成功、危险操作静默执行、移动端严重溢出、React hook 崩溃。
4. 仍然想做的内容只属于“体验更强、更像某某产品、支持更多格式、进一步性能极限优化、完整富文本/插件生态”等增强项。

满足以上 4 条时，下一步不是继续开发，而是：

1. 在本文追加“Goal 关闭记录”。
2. 把未做增强移入“后续计划”。
3. 调用 `update_goal complete`。

### 不允许继续延长 Goal 的理由

以下理由不得作为继续保持 Goal active 的依据：

- “还可以做得更高级”。
- “还可以再参考某个 IDE / 云面板 / 笔记软件”。
- “还可以支持更多冷门格式”。
- “还可以继续优化动效、细节、视觉质感”。
- “未来文件更多时还可以继续极限优化”。
- “可以继续加入更多按钮、更多布局能力、更多后台任务能力”。

这些内容有价值时，只能写入后续计划，不能成为本 Goal 的新完成前置条件。

### 必须继续推进、不能结束 Goal 的情况

只要存在以下任一项，就不能结束 Goal：

- A-F 任一阶段缺少实现或缺少真实验证。
- 文件管理器核心路径、列表、选择、操作、上传、索引、预览/编辑、Workspace 文档工作台任一主链路不可用。
- 桌面或移动端仍有阻断级布局问题：页面空白、弹窗无法滚动、编辑区高度塌陷、主要操作不可达。
- 危险文件操作仍可能静默执行。
- 上传仍可能重复入队、伪成功、默认传错目录、冲突策略不可控。
- 内容索引仍以前端全量加载巨大数据作为主要方案。
- Workspace 仍依赖或恢复旧 `features/files`、旧 `features/ide`、旧 `WorkspaceShell`。

### Goal 关闭记录模板

当 A-F 全部完成时，在本文末尾追加：

```md
## Goal 关闭记录（YYYY-MM-DD）

- 完成范围：A-F 六阶段均完成。
- 最终验证：
  - `npm run smoke:file-manager:mobile-layout`
  - `npm run smoke:file-manager:list-preferences`
  - `npm run smoke:file-manager:large-directory`
  - `npm run smoke:file-manager:selection`
  - `npm run smoke:file-manager:quick-paste-upload`
  - `npm run smoke:file-manager:upload-conflicts`
  - `npm run smoke:file-manager:content-index`
  - `npm run smoke:file-manager:text-editor`
  - `npm run smoke:file-manager:preview-resilience`
  - `npm run smoke:file-manager:media-preview`
  - `npm run smoke:file-manager:markdown-visual-editor`
  - `npm run smoke:file-manager:html-editor`
  - `npm run smoke:file-manager:fallback-preview`
  - `npm run smoke:workspace:text-editor`
  - `npm run smoke:workspace:document-modes`
  - `node --test tests/system/web-file-manager-domain.test.mjs tests/system/web-ide-shell.test.mjs`
  - `npm run typecheck:web -- --pretty false`
  - `npm run build:web`
  - `git diff --check`
- 已知非阻断风险：
- 后续计划：
- 结论：当前 Goal 结束，后续增强另起 Goal。
```


## Goal 有限终止协议（本次修订）

> 目的：把当前 Goal 从“持续优化前端文件管理器”改成“完成一组可验证交付后立即结束”。Codex 当前 active goal 正文无法原地改写，因此本文作为该 Goal 的强制补充协议；若 active goal 原文更宽泛，以本节为准。

### 结束时刻

当下面 3 个条件同时成立时，本 Goal 必须结束：

1. **关闭任务完成**：A 文件管理器基础体验、B 文件操作闭环、C 上传系统、D 内容索引管理、E 文件预览/编辑弹窗、F Workspace 文档工作台一致性，六组关闭任务全部完成。
2. **最终验证通过**：本文“最终结束命令”全部退出码为 0；若某项因环境原因无法运行，必须在“Goal 关闭记录”写明原因、替代验证和剩余风险。
3. **剩余事项只属于增强**：仍想继续做的内容只属于更多格式、更多动效、更像某个产品、更极致性能、完整插件生态、完整富文本生态、终端高级能力、包体长期优化等非阻断增强。

满足以上 3 条后，不允许继续开发；必须追加“Goal 关闭记录”，调用 `update_goal complete`，把增强项放入后续新 Goal。

### 不结束的唯一理由

只有仍存在下列 A-F 范围内的阻断缺口时，Goal 才能继续保持 active：

- 文件管理器无法稳定打开、路径跳转/列表/选择/右键主链路不可用。
- 核心文件操作或上传链路真实失败、伪成功、传错目录、重复入队、冲突策略不可控。
- 内容索引仍依赖前端全量加载巨大数据。
- 文件预览/编辑仍有页面空白、React hook/useState null、高度塌陷、不可滚动、移动端严重溢出。
- Workspace 文件打开/模式切换/Monaco 渲染主链路不可用，或旧架构回归。
- 最终验证命令未运行或失败，且失败原因属于本 Goal 范围。

### 结束后的处理

结束后只允许另起新 Goal 处理增强项，不得在本 Goal 内继续追加范围。建议后续新 Goal 拆分为：

1. 高级预览格式与富文本生态。
2. 文件管理器性能/包体长期优化。
3. Workspace 高级布局与终端多路复用。
4. Git/搜索/索引独立产品化。

## Goal 关闭清单（完成这些任务后立即结束）

为了避免 Goal 永远延期，后续执行只追踪下面这些可关闭任务。所有任务完成并验证通过后，本 Goal 必须结束；不得继续追加“更高级、更完整、更像某某产品”的新要求到本 Goal 内。

### 必须完成的关闭任务

1. **A 文件管理器基础体验关闭**
   - `/file-manager` 桌面端和移动端可稳定打开。
   - 路径栏、面包屑、最近/收藏路径、路径错误恢复可用。
   - 默认列表/网格、排序、密度、列配置、列宽、隐藏文件、文件类型图标可用。
   - 大目录窗口化、键盘选择、Ctrl/⌘ 多选、Shift 范围选择、鼠标框选、右键菜单可用。
   - 移动端无顶部按钮堆积、无横向溢出、无列表高度异常。

2. **B 文件操作闭环关闭**
   - 新建文件/目录、重命名、复制、移动、删除到回收站、恢复、永久删除、下载、打包、解压均能从 UI 触发。
   - 复制/移动/打包/解压具备预检或等价保护。
   - 删除、覆盖、永久删除等危险操作必须有显式确认。
   - 批量菜单不因列出大量文件名而溢出。
   - 至少一条真实浏览器 smoke 覆盖完整文件操作链路。

3. **C 上传系统关闭**
   - 上传默认当前目录。
   - 单文件、多文件、文件夹、拖拽、资源管理器焦点粘贴、上传弹窗粘贴均可用。
   - 同一剪贴板事件不重复入队。
   - 分片/断点续传基础、进度、速率、剩余时间、取消、重试、恢复提示可用。
   - 冲突策略支持覆盖、跳过、保留两者；快捷粘贴默认保留两者。
   - 上传失败可诊断，不伪装成功。

4. **D 内容索引管理关闭**
   - 内容索引作为 `/file-manager` 内独立能力存在，不混入 Workspace。
   - 统计、健康、分页、筛选、搜索、导出当前页 CSV、扫描失效、清理失效、重建索引可用。
   - 前端不拉取巨大索引全量数据，不做全量前端过滤。
   - UI 明确表达“文件系统是事实源，索引只是缓存/检索辅助”。

5. **E 文件预览/编辑弹窗关闭**
   - 双击或右键预览/编辑打开同一个文件上下文弹窗。
   - 源码、预览、边写边预览、预览时编辑不拆成两个窗口。
   - 文本/代码、Markdown、HTML、图片、视频、音频、PDF、JSON、CSV、archive、binary fallback 均有合理体验。
   - 图片支持按钮缩放、滚轮缩放、双击缩放、自由拖动画布、适应视图。
   - Markdown/HTML 边写边预览可滚动、不塌高度；可视编辑有安全边界和源码兜底。
   - 桌面和手机端无 10px 高度、不可滚动、横向溢出、页面空白、React hook/useState null。

6. **F Workspace 文档工作台一致性关闭**
   - Workspace 文件打开进入同一文档上下文。
   - 源码/预览/边写边预览/预览时编辑属于同一标签/同一文件上下文。
   - Monaco 正常渲染。
   - 终端 session 错误不影响文件编辑。
   - 不恢复旧 `features/files`、旧 `features/ide`、旧 `WorkspaceShell`。

7. **最终验证关闭**
   - 本文“最终结束命令”全部通过，或有同等强度且已记录的替代验证。
   - 研究记录、设计边界、剩余风险、后续增强计划已写入文档。
   - 当前 worktree 不存在 A-F 范围内的已知阻断问题。

### 完成即停止规则

- 上面 7 组关闭任务全部完成后，**必须调用 `update_goal complete`**。
- 完成后仍然想做的能力，必须移入“后续计划”，不能继续扩大当前 Goal。
- 如果某项能力已经有明确 fallback 并通过验收，不得因“未来可以更强”继续阻塞 Goal。
- 如果只剩 Office/PSD/VS Code 插件生态/专业 Git 客户端/跨设备续传/完整富文本编辑器/全局后台任务中心/包体终极优化等非本 Goal 范围事项，必须结束 Goal。

## 完成判定流程

每轮结束前按以下流程判定：

1. **是否还有 A-F 任一必需项未完成？**
   - 有：Goal 保持 active，继续推进最小未完成项。
   - 无：进入第 2 步。
2. **是否还有 A-F 任一验收命令未通过或未运行？**
   - 有：Goal 保持 active，补测试/修复失败。
   - 无：进入第 3 步。
3. **是否只剩非目标增强项？**
   - 是：记录后续计划，结束 Goal。
   - 否：进入第 4 步。
4. **最终结束命令是否全部通过？**
   - 是：调用 `update_goal complete`。
   - 否：修复失败项，不得宣称完成。

## 不得用来拖延 Goal 的事项

以下事项即使没有完成，也不能阻止本 Goal 结束：

- Office/PSD/专业二进制格式完整在线编辑。
- VS Code 全量插件生态。
- 全局后台任务中心完整重构。
- 跨设备上传续传。
- 专业级 Git 图形客户端。
- 完整 Notion/思源级富文本编辑器替代 Markdown 源码。
- 终端多路复用高级增强。
- 包体彻底优化到最终状态；本 Goal 只要求不因新增依赖造成明显恶化。

---

## A. 文件管理器基础体验完成

必须满足：

- `/file-manager` 可以稳定打开，无页面空白。
- 路径栏可输入相对路径/允许的绝对路径并跳转。
- 面包屑可导航。
- 收藏路径、最近路径可用。
- 路径错误有恢复入口。
- 默认列表视图支持：排序、密度、列配置、列宽、列表/网格切换、隐藏文件、文件类型图标。
- 大目录已加载数百项时不全量渲染 DOM。
- 键盘选择、Ctrl/⌘ 多选、Shift 范围选择、框选、右键菜单可用。
- 移动端列表优先，顶部不堆按钮，无横向溢出。

验收证据：

```bash
npm run smoke:file-manager:mobile-layout
npm run smoke:file-manager:list-preferences
npm run smoke:file-manager:large-directory
npm run smoke:file-manager:selection
```

---

## B. 文件操作闭环完成

必须满足：

- UI 可触发：新建文件、新建目录、重命名、复制、移动、删除到回收站、从回收站恢复、永久删除、下载、打包、解压。
- 复制/移动/打包/解压具备 dry-run 或等价预检。
- 删除/覆盖/永久删除必须显式确认，不允许静默危险操作。
- 批量操作菜单不列出无限文件名，不导致溢出。
- 操作结果进入操作历史/事件记录，可查看必要诊断。

验收证据：

- 至少一条真实浏览器 smoke 覆盖：新建 → 重命名 → 复制或移动 → 删除 → 恢复。
- 系统测试覆盖 FileManagerActionDialog、FileActionsMenu、冲突策略和危险操作确认。

建议命令名：

```bash
npm run smoke:file-manager:file-operations
node --test tests/system/web-file-manager-domain.test.mjs
```

---

## C. 上传系统完成

必须满足：

- 上传目标默认当前目录，而不是根目录。
- 支持单文件、多文件、文件夹上传。
- 支持拖拽上传。
- 文件管理器获得焦点时支持剪贴板快捷粘贴上传。
- 上传弹窗内粘贴同一剪贴板事件不得重复入队。
- 支持分片/断点续传基础能力。
- UI 显示进度、速率、剩余时间。
- 支持取消、重试、恢复提示。
- 冲突策略支持：覆盖、跳过、保留两者/自动重命名。
- 快捷粘贴默认“保留两者”。
- 上传失败可诊断，不伪装成功。

验收证据：

```bash
npm run smoke:file-manager:quick-paste-upload
npm run smoke:file-manager:upload-conflicts
```

并至少有一个 API/service 测试覆盖分片上传、状态查询或恢复路径。

---

## D. 内容索引管理完成

必须满足：

- 内容索引管理属于 `/file-manager`，不混入 Workspace。
- 支持统计、健康状态、记录分页、状态筛选、搜索。
- 支持导出当前页 CSV。
- 支持扫描失效、清理失效、重建索引。
- 大索引场景不在前端拉全量记录，不做全量前端过滤。
- UI 明确表达“文件系统是事实源”。

验收证据：

```bash
npm run smoke:file-manager:content-index
node --test tests/system/web-file-manager-domain.test.mjs
```

---

## E. 文件预览/编辑弹窗完成

必须满足：

- 双击或右键“预览/编辑”打开同一个文件上下文弹窗。
- 源码、预览、边写边预览、预览时编辑属于同一个文件上下文，不拆成两个互相割裂的窗口。
- 文本/代码使用 Monaco 直接 ESM 集成，可打开、编辑、保存。
- 支持查找/替换、保存前 diff、草稿恢复、历史版本入口。
- Markdown 支持安全渲染、代码高亮、图片、表格、任务列表、Mermaid 或明确 fallback。
- Markdown 预览时编辑至少支持：标题、段落、引用、普通列表、任务列表、表格单元格、代码/Mermaid fence 内容、HTML 可见文字；复杂结构源码兜底。
- HTML 支持源码、安全沙箱预览、边写边预览；可视编辑仅允许安全可见文本。
- 图片支持滚轮缩放、按钮缩放、双击缩放、自由拖动画布、适应视图。
- 视频/音频/PDF/JSON/CSV/archive/binary 有合理预览、信息、打开或下载 fallback。
- 桌面弹窗可滚动、可调整/最大化。
- 手机端不出现 10px 高度、不可滚动、横向溢出、空白。

验收证据：

```bash
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:preview-resilience
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:markdown-visual-editor
npm run smoke:file-manager:html-editor
npm run smoke:file-manager:fallback-preview
```

上述 smoke 分别覆盖文本编辑、Markdown 滚动/分屏、图片缩放拖拽、Markdown 预览时编辑、HTML 沙箱/分屏/可视编辑，以及 PDF/archive/binary fallback 与移动端无溢出。

---

## F. Workspace 文档工作台一致性完成

必须满足：

- Workspace 文件双击进入 Workspace 当前文档上下文。
- 源码/预览/边写边预览/预览时编辑属于同一标签/同一文件上下文。
- Monaco 正常渲染，无 React hook/useState null。
- 终端 session 错误不影响文件编辑。
- 不恢复旧 `features/ide`、旧 `features/files`、旧 `WorkspaceShell`。
- 终端只负责进程/session/cwd handoff，不接管文件管理。

验收证据：

```bash
npm run smoke:workspace:text-editor
npm run smoke:workspace:document-modes
node --test tests/system/web-ide-shell.test.mjs
```

---

## 最终结束命令

A-F 全部满足后，运行：

```bash
npm run smoke:file-manager:mobile-layout
npm run smoke:file-manager:list-preferences
npm run smoke:file-manager:large-directory
npm run smoke:file-manager:selection
npm run smoke:file-manager:quick-paste-upload
npm run smoke:file-manager:upload-conflicts
npm run smoke:file-manager:content-index
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:preview-resilience
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:markdown-visual-editor
npm run smoke:file-manager:html-editor
npm run smoke:file-manager:fallback-preview
npm run smoke:workspace:text-editor
npm run smoke:workspace:document-modes
node --test tests/system/web-file-manager-domain.test.mjs tests/system/web-ide-shell.test.mjs
npm run typecheck:web -- --pretty false
npm run build:web
git diff --check
```

若本轮涉及 API/service 改动，还必须运行对应 `node --test` 或 `npm run typecheck:api`。

所有命令通过，且没有未解决的 A-F 范围缺口时，立即结束 Goal。

---

## 明确不属于本 Goal 的无限扩展

以下内容不作为本 Goal 完成前置条件，避免无限推进：

- Office/PSD/复杂二进制文件完整在线编辑。
- VS Code 全量插件生态。
- 全局后台任务中心重构。
- 跨设备上传续传。
- 专业级 Git 图形客户端。
- 完整富文本编辑器替代 Markdown 源码。
- 终端多路复用高级增强。
- 包体彻底优化到最终状态；只要求不因本 Goal 新增依赖造成明显恶化，已有大 chunk 警告记录为后续优化。

## 执行规则

- 如果 A-F 全部完成并验证通过：结束 Goal。
- 如果只完成某个阶段：汇报该阶段完成证据，继续下一个阶段，不标记 complete。
- 如果只剩“不属于本 Goal 的无限扩展”：结束 Goal，并把这些增强项写入后续计划。

---

## Goal 关闭记录（2026-06-27）

- 完成范围：A-F 六阶段均完成。
  - A 文件管理器基础体验：路径/列表/偏好/大目录/选择/移动端布局已通过 smoke 覆盖。
  - B 文件操作闭环：文件操作 UI 合同、真实操作 smoke、危险/冲突策略与批量菜单边界已覆盖在系统测试和文件操作 smoke 中。
  - C 上传系统：当前目录上传、快捷粘贴、弹窗粘贴去重、冲突策略、分片/续传基础与状态链路已完成；最终命令覆盖快捷粘贴与冲突策略，额外验证覆盖文件操作/续传链路。
  - D 内容索引管理：`/file-manager` 内独立索引管理、分页/统计/健康/搜索/导出/重建等能力完成，content-index smoke 通过。
  - E 文件预览/编辑弹窗：文本/代码、Markdown、HTML、图片、媒体、PDF/archive/binary fallback、移动端滚动与可视编辑链路完成，相关 smoke 通过。
  - F Workspace 文档工作台一致性：Workspace 文件打开、Monaco 渲染、同标签文档模式切换、终端边界、旧架构反回归完成。

- 最终验证（2026-06-27，全部通过）：
  - `npm run smoke:file-manager:mobile-layout`
  - `npm run smoke:file-manager:list-preferences`
  - `npm run smoke:file-manager:large-directory`
  - `npm run smoke:file-manager:selection`
  - `npm run smoke:file-manager:quick-paste-upload`
  - `npm run smoke:file-manager:upload-conflicts`
  - `npm run smoke:file-manager:content-index`
  - `npm run smoke:file-manager:text-editor`
  - `npm run smoke:file-manager:preview-resilience`
  - `npm run smoke:file-manager:media-preview`
  - `npm run smoke:file-manager:markdown-visual-editor`
  - `npm run smoke:file-manager:html-editor`
  - `npm run smoke:file-manager:fallback-preview`
  - `npm run smoke:workspace:text-editor`
  - `npm run smoke:workspace:document-modes`
  - `node --test tests/system/web-file-manager-domain.test.mjs tests/system/web-ide-shell.test.mjs`
  - `npm run typecheck:web -- --pretty false`
  - `npm run build:web`
  - `git diff --check`

- 额外验证（本 Goal 收尾过程中完成）：
  - `npm run smoke:file-manager:file-operations`
  - `npm run smoke:file-manager:upload-resumable`
  - `node --test tests/system/files-service.test.mjs`

- 已知非阻断风险：
  - `npm run build:web` 仍输出既有大 chunk 警告，主要来自 Monaco worker、Markdown/Mermaid/KaTeX、xterm、cytoscape 等已有重型能力。本 Goal 未把“包体彻底优化到最终状态”列为完成前置条件；后续应另起包体/按需加载专项 Goal。
  - Markdown/HTML 可视编辑已覆盖阶段性交付范围：标题/段落/列表/表格/代码 fence/HTML 可见文本等安全可编辑链路；完整 Notion/思源级块编辑器、Office/PSD/复杂二进制在线编辑不属于本 Goal。

- 后续计划（另起 Goal，不阻塞本 Goal 关闭）：
  1. 高级预览格式与富文本生态：Office、PSD、复杂二进制、完整块编辑器、插件化预览器。
  2. 文件管理器长期性能与包体优化：更细粒度动态加载、Monaco/Mermaid/xterm/cytoscape 分包策略、真实超大目录压测。
  3. Workspace 高级布局：更完整的多窗格/拖拽/布局快照/终端多路复用增强。
  4. Git/搜索/索引产品化：独立搜索索引、Git 图形客户端、后台任务中心。

- 结论：当前 Goal 的 A-F 有限关闭任务与最终验证均已完成；当前 Goal 结束，后续增强另起 Goal。
