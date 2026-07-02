# M3 Online Editor Mini Explorer + Shared Explorer Core 执行总结

Status: Completed
Completed: 2026-07-02
Scope: M3-A / M3-B / M3-C / M3-D / M3-E

## 1. 完成内容

M3 已完成文件管理器在线编辑器的轻量 Mini Explorer，并沉淀未来 IDE Explorer 可复用的共享层。

已完成能力：

- `apps/web/src/shared/explorer-core`
  - 目录位置、路径工具、排序、文件类型判断。
  - `useExplorerDirectory` 复用现有 files query。
  - `useExplorerTreeState` 管理展开/选中/reveal 等树状态。
  - `useExplorerCommands` 薄适配现有 `fileOperations`，不创建第二套文件 API。
- `apps/web/src/shared/explorer-ui`
  - `ExplorerTree`、`ExplorerTreeNode`、`ExplorerToolbarBase`、`ExplorerContextMenuBase`。
  - 空状态、加载状态、错误状态 primitives。
  - 使用 Tracevane Aurora token，不引入 VS Code 默认色体系。
- `apps/web/src/features/file-manager/online-editor/mini-explorer`
  - Online Editor Mini Explorer 产品壳层。
  - 桌面侧栏/悬浮展开收起，小屏抽屉。
  - 当前目录读取、上级、刷新、树展开/折叠。
  - 点击文件打开到统一 File Surface tab。
  - 新建文件/目录、重命名、删除、复制、移动、复制路径/相对路径。
- 打开中 tab 同步
  - rename / move 同步 tab path/title/document id/draft/viewState/read metadata。
  - delete 已打开 dirty tab 时保留内容并标记 deleted，不静默关闭。
  - Mini Explorer 目录不会因为打开文件或切换 tab 自动跳转；只有用户显式上级/进入目录才改变浏览目录。

## 2. 产品边界

M3 的 Mini Explorer 是在线编辑器里的轻量文件导航/操作入口，不是 IDE Explorer。

M3 不做且后置：

- IDE Workbench
- Dockview
- ActivityBar
- Terminal
- Git / LSP / Debug
- Problems / Output
- watcher 外部变更监听
- 完整 VS Code Explorer 行为

未来 M4 IDE Explorer 应复用 `explorer-core` / `explorer-ui` primitives，但必须有独立 Workbench shell。禁止把在线编辑器 Mini Explorer 和 IDE Explorer 写成一个 `<Explorer mode="mini|ide" />` 大组件路线。

## 3. 验证记录

M3-D 实现收尾时已验证：

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:file-operations
git diff --check
```

M3-E 文档收尾验证：

```bash
git diff --check
```

当前仓库没有发现 package.json 中的 markdown/link checker 脚本；如后续补充 docs 检查脚本，应把本文档包加入检查范围。

## 4. 下一阶段入口

下一阶段是 M4：IDE Workbench Layout Foundation。

M4 应从独立 IDE Workbench shell 开始：

- 独立路由 / 工作台入口。
- ActivityBar 基础版。
- SideBar Explorer：复用 `shared/explorer-core` / `shared/explorer-ui` primitives。
- Editor Area 与 Dockview 多编辑组基础。
- Panel Area 框架与占位 tabs。
- 布局持久化与 reset。

M4 的验收口径是 Workbench Layout Foundation，不是真实 Terminal、LSP、Git、Debug、Problems 或 Output 数据接入。
