# Workspace 前端架构（IDE-first 当前参考）

> 状态：IDE-first frontend architecture reference
> 更新：2026-06-29
> 上位目标：`Workspace全球顶级AI编程IDE工作区Goal蓝图.md`
> UI/UX 验收合同：`WorkspaceIDE-UIUX重设计验收.md`

本文描述当前 IDE-first 阶段的 Workspace 前端架构边界。写作、渲染、预览增强、富媒体阅读体验、WYSIWYG 和视觉原型不属于当前 Phase 0/1/2 前端验收。

## 1. 当前目录 owner

```text
apps/web/src/features/workspace/
  workbench/             # IDE shell, command palette, layout orchestration, responsive state
  files/                 # Explorer, file actions, upload, project search entry points
  editor/                # code editor stage, tabs, dirty buffer, diff/review entry points
  terminal/              # xterm UI, session actions, terminal evidence commands
  git/                   # changes, diff/review context, commit workflow
  shared/                # evidence/review surfaces and thin reusable UI primitives
```

Future extension boundary:

```text
  preview/               # compatibility/future document preview provider only
  document-engine/       # future writing/rendering provider only after ADR
```

## 2. Owner 边界

| owner | 负责 | 不负责 |
| --- | --- | --- |
| workbench | Activity rail、side panel shell、command palette、layout persistence、responsive mode | 真实文件/终端/Git mutation |
| files | 文件树、文件动作、搜索入口、上传下载、批量文件 UI | terminal lifecycle、Agent runtime |
| editor | code editor、tabs、dirty buffer、save/revert、diff/review entry | 文件批量管理、terminal lifecycle |
| terminal | terminal session UI、输出、session actions、terminal evidence | CLI Agent runtime 配置、文件树 |
| git | changes、diff、stage/unstage、commit、review evidence | 文件读写事实源、terminal session |
| shared | evidence/review surface、thin reusable display primitives | 拥有业务状态或后端事实源 |

## 3. 当前布局模型

```text
ActivityRail | SidePanel           | MainStage          | Inspector
             | Files/Search/Git   | Editor/Diff/Review | Evidence/Agent/FileInfo
             |                   | BottomPanel        |
             |                   | Terminal/Tasks/Logs|
```

规则：

- `Explorer / Search / Git` 是固定侧边功能，由 Activity rail 切换和收起；不要把它们恢复成 Dockview tab。
- MainStage 默认只承载 `Editor / Diff / Review`。
- Terminal 是 BottomPanel 的一等 IDE 面板，可折叠、最大化、移动端全屏。
- Inspector 默认服务 Evidence / Agent review / FileInfo / Diagnostics；不得用固定 Preview 抢占编辑空间。
- 未实现模式不显示；不可用动作必须禁用并说明原因。

## 4. 状态持久化

- Workbench state：active activity、side open/collapsed、bottom panel open/maximized、mobile mode。
- Editor state：open tabs、active path、dirty paths、view focus。
- Terminal state：active session id、dock/fullscreen mode、mobile accessory visibility。
- Command state：shortcuts/conflicts from workspace keymap。

当前不把 preview/rendering/writing view mode 作为持久化验收项。

## 5. 当前 P0 前端能力

### 5.1 Side Explorer

侧边文件管理由 `workspace/files` 拥有，当前可用能力：

- `FileTree`：lazy browse、分页加载更多、keyboard navigation、hidden file toggle、file selection。
- 文件 action menu：rename/copy/move/delete/archive/download/open/reveal。
- 上传默认进入当前 Explorer 目录，不再写死根目录。
- 批量动作必须先形成清晰目标和冲突提示。

### 5.2 Search

Workspace Search 是跨文件搜索/批量替换 owner：

- 搜索文件名和内容。
- 替换必须先形成可审查计划。
- 用户显式勾选/排除后再 apply。
- 替换结果必须形成成功/失败证据。

### 5.3 Git

Git 面板是 IDE 主线能力：

- 当前分支、变更数、stage/unstage、diff/review context、commit draft。
- Git 相关命令使用审查/证据语言，而不是泛 AI 文案。

### 5.4 Terminal

Terminal 是当前最重要的 IDE 面板之一：

- session title/cwd/status/connection state 明确。
- 输出可复制为证据。
- stale session 必须可清理或恢复，不在首屏误报系统崩坏。
- 手机端进入全屏，并提供移动输入增强栏。

### 5.5 Command Palette

Command palette 是 IDE 命令控制台：

- 命令必须映射到真实 IDE 操作。
- 不可用动作禁用并说明原因。
- 不展示“预留能力”“规划中”“说明页入口”。

## 6. 当前非主线

以下只作为未来扩展，不进入当前前端架构验收：

- Markdown/HTML/媒体预览增强；
- WYSIWYG Markdown/HTML；
- document engine；
- 独立写作工作区；
- Preview dock panel；
- 视觉概念原型和第三方截图像素复刻。
