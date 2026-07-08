# P0-B Mainline Gap Audit Summary

## 状态

已完成。P0-B 承接 P0-A 自动化 baseline，不新增功能代码，而是用现有 smoke、源码审计和产品主线口径，把“远程项目在线改代码”主链路的阻塞项、体验摩擦和 parking lot 明确分层。

下一阶段进入 **P1-A Mainline UX Hardening Plan**：先修正主链路体验与文案/验证缺口，再决定是否继续做新能力。

## 审计结论

本轮没有发现已被自动化覆盖路径中的 P0 release blocker：Workbench 入口、真实 Monaco 编辑、dirty/save、外部修改冲突、Search、Problems/Output、Git 最小闭环、Terminal 基础、Terminal persistence、Provider Status 和 Command Palette 的现有 smoke 均通过。

但仍存在若干 P1 体验/验证缺口，不能直接宣布“产品完整可发布”。这些缺口集中在真实长目录 Explorer 体验、窄屏/移动布局、文件边界组合场景、终端真实桌面剪贴板/拖拽，以及少量旧阶段文案残留。

## 已验证主链路

P0-A baseline 已验证：

- `npm run typecheck:web -- --pretty false`
- `npm run typecheck:api -- --pretty false`
- `npm run smoke:ide:workbench-layout`
- `npm run smoke:ide:editor-foundation`
- `npm run smoke:ide:editor-save-dirty`
- `npm run smoke:ide:search-foundation`
- `npm run smoke:ide:problems-output`
- `npm run smoke:ide:git-status`
- `npm run smoke:ide:git-diff`
- `npm run smoke:ide:git-stage`
- `npm run smoke:ide:git-commit`
- `npm run smoke:ide:terminal-foundation`

P0-B supplemental validation 已验证：

- `npm run smoke:ide:editor-conflict-diff`
- `npm run smoke:ide:watcher-foundation`
- `npm run smoke:ide:terminal-persistence`
- `npm run smoke:ide:terminal-manager`
- `npm run smoke:ide:lsp-provider-status`
- `npm run smoke:ide:lsp-workspace-symbols`
- `npm run smoke:ide:command-palette`

## P0 blocker list

当前基于自动化和源码审计，未确认新的 P0 blocker。

P0 blocker 定义仍保持严格：会导致远程改代码主链路无法完成、白屏、数据丢失、误覆盖、越权访问、信任边界绕过或保存/提交不可解释的问题。后续 P1-A 如果复现这类问题，必须立即升级为 P0 修复，不再继续扩功能。

## P1 friction list

### 1. Explorer 真实长目录 / 键盘 / 拖拽 / 上传组合验证不足

现有 IDE Explorer 已复用 `shared/explorer-core`、`shared/explorer-ui` 和文件操作/上传能力，但 P0 smokes 主要证明 shell、基本打开和文件操作路径，没有把长目录滚动、焦点快捷键、文件拖拽、上传 dialog、剪贴板上传组合到一个真实工作流里。

P1-A 建议：新增或扩展一个 mainline Explorer smoke / manual checklist，覆盖长目录滚动、copy/cut/paste、drag move、UploadManagerDialog 调用、拖文件到终端插入路径。

### 2. IDE Editor deleted-state 文案残留旧阶段口径

`IdeEditorFilePanel` 的 deleted-state 空态仍包含类似 “M5.y-B 只显示读取边界；dirty 内容保护和恢复流程将在 M5.y-C/M5.y-D 接入” 的历史文案。当前 dirty/save/external/deleted 能力已经推进到更后阶段，这类工程阶段文案会让用户误以为功能未完成。

P1-A 建议：删除阶段名文案，改成用户可理解的恢复/另存/关闭说明。

### 3. readonly / large / deleted / media / binary 组合边界缺少一个集成验收

现有 smokes 分别覆盖 binary preview、dirty/save、conflict、watcher deleted/changed，但没有一个“打开多种边界文件并验证状态栏/预览/保存保护”的集成验收。

P1-A 建议：新增 `smoke:ide:editor-edge-files` 或维护一份手动 QA checklist，优先覆盖只读、大文件、deleted dirty、binary/hex、media preview 和 unsupported fallback。

### 4. Terminal 桌面剪贴板 / 文件图片粘贴仍需真实浏览器手测

`smoke:ide:terminal-foundation` 已覆盖终端路径插入、file/image paste upload 的模拟路径，但浏览器无法完全模拟用户从系统文件管理器复制图片/文件后粘贴到 xterm 的所有平台差异。Codex CLI / TUI 的图片粘贴失败也属于浏览器剪贴板格式传递限制与终端程序能力叠加问题，不能只靠单元或 smoke 证明。

P1-A 建议：保留自动 smoke，同时新增跨平台手测矩阵：Linux/WSL、Chrome/Edge、系统剪贴板图片、文件复制、拖拽到终端、右键菜单粘贴/复制。

### 5. 窄屏 / 手机端 IDE 主链路未进入 P0 baseline

File Manager Online Editor 有响应式 smoke；IDE Workbench 主链路当前 P0 主要是桌面宽屏。用户已多次反馈右侧溢出、按钮被挤出、菜单不易用，因此窄屏是产品质量缺口。

P1-A 建议：新增 IDE responsive smoke，至少覆盖 Explorer + Editor tabs + Panel/Terminal + action menu 在窄屏下不横向溢出。

### 6. Explorer active tab 自动 reveal 行为需要产品复核

IDE Explorer 当前会根据 active editor path 触发 reveal。这对完整 IDE 可能合理，但会影响“用户正在浏览某个目录”的稳定上下文。Online Editor Mini Explorer 已明确不能随 tab 自动跳目录；IDE Explorer 是否自动 reveal 需要产品确认和可关闭策略。

P1-A 建议：先不直接删除，补设计决策：IDE Explorer 默认 reveal active 是否保留、是否仅在命令触发、是否需要“跟随当前文件”开关。

### 7. 跨 surface 刷新恢复没有单条端到端验证

已有 layout、terminal persistence、editor/save 等分散验证，但缺少“打开多个文件 + dirty + terminal sessions + source control + reload page”的单条持久化主链路测试。

P1-A 建议：新增 `smoke:ide:mainline-persistence` 或手动 checklist，避免 reset layout / reload / route enter 误清工作上下文。

## Parking lot list

继续停车，除非后续主链路证明必要：

- 浏览器版 VS Code 全面 parity。
- Git force push / merge / rebase / 复杂 conflict wizard。
- Debug parity 与复杂 launch workspace 管理。
- Terminal 高级 view movement、terminal-as-editor、完整 VS Code terminal 行为。
- Go/Rust/clangd/Java 更深 rich interactions、installer/discovery 自动化。
- 新的 Files/LSP/Git/Terminal API 或巨型 mode-shell 组件。

## P1-A 推荐切片

P1-A 不应做新大能力，建议作为 **Mainline UX Hardening Plan**：

1. 修正文案：删除用户界面里的历史阶段名和工程提示。
2. Explorer 真实工作流验收：长目录、焦点快捷键、复制/剪切/粘贴、拖拽移动、上传 dialog、终端路径插入。
3. IDE responsive 验收：窄屏不溢出、操作入口可用、tabs 可滚动/收缩。
4. Editor edge-files 验收：readonly / large / deleted / media / binary / hex / unsupported fallback。
5. Persistence 主链路验收：reload/reset layout 不误关文件、终端或工作上下文。
6. Terminal clipboard 手测矩阵：把自动 smoke 无法覆盖的平台剪贴板差异列为 release checklist。

## 本阶段不做

P0-B 不做功能实现、不修 UI、不新增 provider、不扩 Debug/Git/Terminal 高级能力。它的交付是主链路风险分层和 P1-A 修复队列。

