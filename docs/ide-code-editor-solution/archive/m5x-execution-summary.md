# M5.x Terminal Split / Group / Panel Placement 执行总结

Status: Completed
Completed: 2026-07-03
Scope: M5.x-A / M5.x-B / M5.x-C acceptance
Next: M5.y / M5.5 IDE Editor Foundation

## 1. 完成状态

M5.x 已从“下一步 / 进行中”收口为 **已完成 Terminal Split / Group / Panel Placement**。本阶段在 M5 真实终端基础上完成 Workbench Terminal 的布局层能力：多 terminal tab、多 pane split、pane focus/resize/close/kill、Panel bottom/right placement、终端 profile/shell 选择、服务端 layout metadata 持久化、基础 session reattach、tmux optional durable backend 边界，以及浏览器剪贴板文件/图片上传为路径。

M5.x 不是完整 VS Code Terminal，也不表示 Terminal 可以作为 editor-like tab、全局 View Movement、Secondary SideBar、Problems/Output、watcher、LSP、Git 或 Debug 已接入。

## 2. 完成内容

### Terminal layout model

- 新增 terminal tab / group / pane 布局模型。
- 支持 `terminalId`、`groupId`、`paneId`、`activeTerminalId`、`activePaneId`。
- 支持 Split Right / Split Down，split 后每个 pane 关联独立 xterm session。
- 支持 pane focus、pane close/kill、terminal tab close/kill。
- 支持 terminal tab 拖拽排序和标签右键菜单。
- split/resize 不保存完整终端输出，只保存可恢复的 UI/session metadata。

### Terminal persistence / durability

- Workbench layout persistence 纳入 terminal tabs/groups/panes、active tab/pane、Panel placement/size。
- 服务端 layout API 是跨刷新/跨浏览器上下文恢复来源；localStorage 只是快速缓存。
- 无 tmux 时，API 进程存活期间可 reattach node-pty session；close/kill 才结束 session。
- tmux 是 optional durable backend，不是 shell/profile，也不是硬依赖；可用时用于后端 dev/API 进程重启后的 pinned terminal 尽量恢复。
- session 无法恢复时 UI 必须显示 disconnected/lost，不伪造 running。

### Terminal profile / shell selection

- New Terminal 通过后端 `/api/terminal/profiles` 读取可用 profile。
- shell/profile 菜单只展示后端确认可用且 allowlist 允许的本地 shell：bash/sh/zsh/fish/pwsh/powershell/cmd。
- tmux 不作为 shell 选项。
- Split Right / Split Down 继承当前 pane 的 `profileId` / `shell`，避免同一个 tab 内分屏意外切换 shell。

### Panel bottom/right placement

- Workbench Panel 支持 bottom / right placement。
- bottom/right placement、bottom height、right width、collapsed/maximized 状态纳入 layout persistence。
- Reset layout 恢复默认 bottom placement。
- Terminal split/group 在 bottom/right 两种 placement 下均可用。
- Problems / Output / Debug Console 仍保持 M4 placeholder，不接真实数据。

### Clipboard / file path bridge

- 浏览器剪贴板文件/图片可上传到 workspace-scoped terminal temp 目录，并把路径写入终端。
- 文件从 IDE Explorer 拖入终端或右键插入路径时，写入 shell 可消费的路径文本。
- 这条链路不依赖终端内 CLI 读取后端系统剪贴板；浏览器 xterm 无法透明转交用户桌面图片剪贴板给后端进程。

### IDE Explorer 联动补强

- IDE Explorer 文件/目录复制、剪切、粘贴、拖拽移动复用共享文件操作逻辑。
- 未选中文件时不拦截普通 Ctrl/Cmd+C/X/V。
- 资源管理器右键菜单与顶部悬浮按钮重新划分职责：新建/上传类入口在顶部，右键菜单聚焦对象操作。
- 资源管理器路径、拖拽到终端、剪贴板上传能力为 M5.x 终端路径桥接提供输入来源。

## 3. 明确未做并后置

后置到 M5.y / M6 / M7 或更晚：

```txt
- 真实 IDE Monaco Editor 内容与保存/dirty/conflict（M5.y）。
- Terminal 作为 editor-like tab。
- Terminal View 全局 docking / 完整 View Movement。
- Secondary SideBar。
- Problems / Output 真实数据接入。
- watcher。
- Search。
- LSP。
- Git。
- Debug。
- 插件市场。
- 完整 VS Code terminal behavior。
```

## 4. 验收证据

M5.x 相关验证覆盖：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:terminal-foundation
npm run smoke:ide:terminal-persistence
npm run smoke:ide:terminal-panel-placement
npm run smoke:ide:terminal-split-layout
npm run smoke:ide:terminal-durable-backend
git diff --check
```

本次 M5.x-C 文档收口执行：

```bash
git diff --check
# 临时 markdown 相对链接检查覆盖本次 touched docs
```

## 5. 下一阶段入口

下一阶段进入 **M5.y / M5.5 IDE Editor Foundation**。

目标：把独立 IDE Workbench 中间 EditorDock 从 Dockview placeholder 升级为真实 Monaco 文件编辑器基础。

M5.y 的关键原则：

- 不复用 File Manager Online Editor 产品壳。
- 复用 `shared/editor-core`、Files API、Monaco-first 底层能力、文件 identity/title/language/dirty/save/conflict 规则。
- IDE Editor 使用独立 Workbench editor shell，承载 Dockview editor group/tab/split/preview/pinned 行为。
- Dockview 只负责布局；不拥有 FileService、SaveService、Monaco model lifecycle。
- M5.y 不做 M6 watcher/search/problems/output，也不做 M7 LSP/Git/Debug。
