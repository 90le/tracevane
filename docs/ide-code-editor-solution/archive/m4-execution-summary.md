
# M4 IDE Workbench Layout Foundation 执行总结

Status: Completed
Completed: 2026-07-02
Scope: M4-A / M4-B / M4-C / M4-D
Next: M5 Real Terminal Foundation

## 1. 完成状态

M4 已从“当前 / 进行中”收口为 **已完成**。本阶段完成的是 IDE Workbench Layout Foundation：独立 Workbench 路由、基础布局、Dockview placeholder editor area、底部 Panel 占位、布局持久化/恢复和 IDE Explorer 文件操作闭环。

M4 不是完整 IDE，也不表示真实 Monaco 编辑内容、真实终端、语言服务、Git、Debug、Problems 或 Output 已接入。

## 2. 已完成能力

已完成：

- `/ide` / `/ide/:workspaceId` 独立路由。
- `apps/web/src/features/ide-workbench` 独立 Workbench shell。
- ActivityBar。
- SideBar Explorer。
- Editor Dock / Dockview placeholder tabs。
- preview / pinned 基础状态。
- Split Right / Split Down placeholder。
- Panel Area 固定底部 placeholder tabs：Terminal / Problems / Output / Debug Console。
- StatusBar。
- sidebar / panel resize、collapse、panel maximize / restore。
- `layoutVersion` + localStorage persistence + fallback / reset。
- IDE Explorer 文件操作：新建文件、新建目录、重命名、删除、复制、移动、复制路径。
- 已打开 Dockview placeholder tab 在 rename / move / delete 时同步 path/title/document id/deleted 状态。
- Dockview serialized layout metadata 在路径同步时同步更新，避免只改 React metadata。
- `smoke:ide:workbench-layout` 最小验证脚本。

## 3. 架构边界

M4 复用：

- `shared/explorer-core`：目录、路径、排序、树状态、文件操作命令基础。
- `shared/explorer-ui`：树节点、状态和基础菜单 primitives。
- `shared/editor-core`：文件 identity、标题和 document id。
- 现有 `fileOperations.ts` 与 Files API；没有新建第二套文件 API。

M4 不复用 Online Editor Mini Explorer 产品壳。IDE Explorer 是 Workbench shell 自己的 ExplorerView；两者共享底层 core/primitives，不共享一个 `mode="mini|ide"` 大组件。

Dockview 只负责 Workbench Editor Area 布局与 placeholder panel metadata；它不拥有 FileService、SaveService、Monaco model lifecycle、dirty/save/conflict 语义。

## 4. 明确未做并后置

后置到 M5+ 或后续阶段：

- 真实 Monaco 编辑内容与保存/dirty 冲突。
- Terminal / xterm / PTY。
- Terminal split/group。
- LSP。
- Git。
- Debug。
- Problems / Output 数据接入。
- watcher 外部变更监听。
- Panel right placement。
- Secondary SideBar。
- 完整 VS Code 行为。
- 插件市场。

## 5. 验收证据

M4-C 已建立并运行：

```bash
npm run typecheck:web
npm run smoke:ide:workbench-layout
git diff --check
```

M4-D 文档收口验证：

```bash
git diff --check
# 本地 markdown 相对链接检查覆盖本次触达文档
```

## 6. M5 下一步入口

下一阶段是 **M5 Real Terminal Foundation**。

M5 只做真实终端基础：

- Terminal Panel bottom placement 内的真实 xterm 内容。
- WebSocket Terminal Gateway。
- node-pty session lifecycle。
- create / input / output / resize / close / kill。
- cwd guard、shell whitelist、canOpenTerminal。
- disconnected / exited / error 状态。
- xterm theme adapter 使用 Tracevane Aurora token。

M5 不做 terminal split/group、Panel right placement、Terminal View 全局 docking、LSP、Git 或 Debug。terminal split/group 与 bottom/right placement 放到 M5.x。
