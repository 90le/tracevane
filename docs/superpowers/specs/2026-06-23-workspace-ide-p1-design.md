# Workspace IDE P1 设计方案（全屏 IDE 壳 + 文件管理 + CodeMirror 编辑器 + Markdown 实时预览 + 终端）

> 日期：2026-06-23
> 状态：设计已确认，进入实现计划
> 范围：P1 —— 把 `/ide` 从只读证据工作台升级为真正的本地优先 IDE 工作区；吸收 `/files` 为 IDE Explorer（真文件管理）；全屏专用壳，不使用现有 AppShell 布局。
> 后续：P2（HTML/web 预览 + 文件 watch SSE 实时重载 + 预览证据）、P3（AI diff/审批循环）、P4（运行时/任务/端口）为独立后续 spec。

## 1. 背景与已确认决策

- 产品优先级收敛：网关模型 / IM 渠道 / CLI Agent 为三个底层核心（均已全功能）；IDE + 文件管理是最核心的延伸能力，必须做。
- 现状问题：当前 `/ide`（880 行）只是只读证据工作台；`/files`（1126 行）只是只读浏览器——"根本不是文件管理"。当前 AppShell（常驻侧栏+顶栏+可滚动 main）是控制台壳，不适合 IDE。
- 已确认技术决策：
  - **编辑器内核 = CodeMirror 6**（全套已是依赖：state/view + 8 语言包 + one-dark），不再加 Monaco。
  - **终端 = node-pty + xterm.js**（已是标准栈，VS Code 同款；WebContainers 因不能跑真实宿主原生 CLI 而被排除）。
  - **IDE 结构 = 全屏专用壳**（`/ide` 占满视口，不带 app 侧栏/顶栏）；**文件管理 = IDE Explorer**（真 CRUD）；**删除独立 `/files` 页**。其余 11 个域仍用现有 AppShell。
  - 后端文件 CRUD / git 操作 / 终端 launch-stream-end **均已存在**，P1 无需新建后端。

## 2. 架构

- 新增 `IdeShell`——`/ide` 路由渲染它，占满视口，**不在 AppShell layout route 之下**（IDE 是独立壳）。
- 路由：`router.tsx` 中 `/ide` → `IdeShell`（脱离 AppShell 布局）；删除 `/files` 路由与导航项（Git 历史可恢复只读证据浏览器概念）。
- 组件分层（`apps/web/src/features/ide/`）：`IdeShell`（窗口编排）+ 各面板组件 + 复用现有 `@/shared/diff`（DiffView/CodeBlock）、`@/design/ui`、三态。
- 数据层：`lib/api/files.ts` 增加**写绑定**（PUT content、copy/move/rename/archive/unarchive/upload/delete/dirs/tree），`lib/git.ts` 增加 stage/unstage/commit/branches/checkout；`lib/api/terminal.ts` 已有 launch/end/sessions，补 stream 消费 hook。后端端点全部已存在。

## 3. 布局（IDE 窗口）

```
┌Activity┬SidePanel──────┬─── Editor area (tabs+split) ───┬─Preview─┐
│ Files  │ Explorer 树   │ tab1.md │ tab2.html │ tab3.ts   │ 渲染    │
│ Search │ (CRUD/右键/   │ ─────────────────────────────  │ MD 实时 │
│ Git    │  拖拽/多选)   │ CodeMirror 6                   │         │
│ Agent* │               │                                │         │
├────────┴───────────────┴────────────────────────────────┴─────────┤
│ Bottom: Terminal(xterm) | Logs | Problems | Ports                  │
├────────────────────────────────────────────────────────────────────┤
│ StatusBar: branch • changes • cursor • save-state • agent/model   │
└────────────────────────────────────────────────────────────────────┘
```
*Agent 面板为 P3，P1 占位。

- P1 面板：Activity Bar（Files/Search/Git/Agent 占位）+ SidePanel（Files=Explorer，Git=变更/stage/commit）+ Editor area（多 tab，最多 2 分屏）+ Preview（Markdown 实时）+ Bottom（Terminal 主，Logs/Problems/Ports 占位）+ StatusBar。
- 响应式：桌面多列；≤920px 纵向堆叠（Activity→顶图标条，SidePanel/Preview/Bottom 可折叠抽屉）。移动端不做"塞进小屏"，保证可读与可操作即可。

## 4. 文件管理（Explorer = 真文件管理）

后端全部已存在，前端接线：`/api/files/tree|browse`（树）、`POST files/files|directories`（新建）、`POST files/copy|move|rename`、`POST files/archive|unarchive`、`POST files/upload`、`GET files/download|download-archive`、`DELETE /api/files`、`PUT /api/files/content`（保存）。
- 树形：懒加载展开/折叠，工作目录根，面包屑。
- CRUD：新建文件/目录、就地重命名、拖拽移动、复制、删除（带确认+证据）、上传、下载、打包/解包。
- 交互：右键上下文菜单、多选（Shift/Cmd）、键盘（新建/重命名/删除快捷键）、空目录/错误态。
- Git 视图（SidePanel 的 Git tab）：变更文件列表、stage/unstage、commit（消息输入）、分支切换/检出——接 `/api/git/*`。

## 5. 编辑器（CodeMirror 6）

- 多 tab + 最多 2 分屏；语言高亮（已有 lang 包：js/ts/json/md/html/css/python/sql/yaml）。
- **保存语义**：脏状态跟踪，`Cmd/Ctrl+S` → `PUT /api/files/content`；保存成功后清脏、刷新 git 变更。
- diff：编辑器内置 diff 视图 + 复用 `@/shared/diff/DiffView`（Git 变更对比）。
- 关闭 tab 有未保存更改时拦截确认；只读/二进制文件明确降级（CodeBlock/不支持编辑空态）。
- 大文件保护（超阈值只读预览，不挂死编辑器）。

## 6. Markdown 实时预览

- 右侧 Preview 面板：CodeMirror 编辑 → 节流（~150ms）→ 渲染（sanitized markdown，复用 `apps/web` 已有渲染管线 `remark-parse → remark-gfm → remark-rehype → rehype-raw → rehype-stringify` + `dompurify` 脱敏 + `highlight.js`/`mermaid`）。
- 实时渲染（每次输入即更新）；非 Markdown 文件时 Preview 显示对应提示或代码预览。
- P1 基础滚动同步可选；HTML/iframe/web 预览与实时重载属 P2。

## 7. 终端（底部面板）

- xterm + addon-fit/webgl/web-links；后端 node-pty `/api/terminal/launch|end|stream`。
- 会话管理：新建/选择/关闭、resize 同步、断线重连、profile（codex/claude/opencode）。
- 底部面板可拖拽调高、可隐藏。

## 8. 错误处理与安全

- 破坏性写（删除/覆盖/移动覆盖目标）一律确认+证据；保存冲突（文件已变）提示重载/覆盖。
- 终端/预览错误诚实降级，不伪装成功。
- 仅写既有目标路径；不向前端暴露任意路径越权；密钥/敏感文件预览脱敏沿用后端约定。

## 9. 验收与测试

- `npm run typecheck:web` / `build:web` 通过。
- 新增 IDE 合同测试：断言 IdeShell 面板结构、Explorer 绑定现有文件 CRUD 端点、编辑器保存走 PUT content、删除 /files 路由与导航。
- Playwright smoke（`scripts/smoke-web-ide.py` 升级）：桌面+移动，IdeShell 全屏渲染、Explorer 树+右键菜单、新建/重命名/删除流、编辑器保存、Markdown 实时预览、终端会话——0 console error、0 横向溢出。
- 后端无变更回归：`npm run typecheck:api`/`build:api` 不受影响。

## 10. 非目标（P2-P4，独立 spec）

- P2：HTML/web iframe 预览 + 文件 watch SSE 实时重载 + 预览证据（截图/console）。
- P3：AI diff/审批循环（Agent 面板，复用 chat + gateway，diff → 审批 → 应用）。
- P4：运行时（命名任务、端口/进程检查器、dev server 编排）。
- 不复制完整 VS Code 桌面产品；不依赖 VS Code 私有 remote/server；不让浏览器存储成为项目文件唯一真相。
