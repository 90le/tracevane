# M3 Online Editor Mini Explorer + Shared Explorer Core 方案

Status: Completed / M3 acceptance closed
Created: 2026-07-01
Scope: 文件管理器在线编辑器的轻量文件侧边栏、轻量文件操作，以及未来独立 IDE Explorer 的共享层

阶段命名统一口径：本文件只覆盖 **M3：Online Editor Mini Explorer + Shared Explorer Core**。M3 已完成；下一阶段是 **M4：IDE Workbench Layout Foundation**。M3 不做独立 IDE Workbench、不做 Dockview、不做 ActivityBar、不做 Terminal、不做 Git/LSP/Debug、不做 Problems/Output、不做 watcher 外部变更监听、不做完整 VS Code Explorer；它只交付在线编辑器轻量导航/轻量文件操作和未来 IDE Explorer 可复用的 Explorer Core / Explorer UI primitives。

## 1. 结论

在线编辑器已完成一个可选的 **Mini Explorer**，但它不是完整 IDE 资源管理器，也不应继续膨胀成 IDE SideBar。

最终采用的架构是三层复用，而不是强行共用一个巨大的 Explorer React 组件：

```txt
Level 1：共享 Explorer Core（必须唯一）
├─ 目录读取 / 刷新 / 父级导航
├─ 树节点模型 / 展开状态 / 选中状态
├─ 文件操作命令：新建、重命名、删除、复制、移动
├─ 文件类型、图标、排序、过滤、权限判断
└─ 路径规范化、根目录/rootId 上下文

Level 2：共享 Explorer UI primitives（可组合）
├─ ExplorerTree / ExplorerTreeNode
├─ ExplorerToolbarBase
├─ ExplorerContextMenuBase
├─ ExplorerEmptyState / LoadingState / ErrorState
└─ 不绑定文件管理器、在线编辑器或 IDE 容器

Level 3：产品容器 Shell（分别实现）
├─ Online Editor Mini Explorer：轻量侧栏 / 小屏抽屉
├─ IDE Explorer：Workbench SideBar / ActivityBar / Dockview 集成
└─ File Manager：文件管理主页面 list/grid、批量操作、上传下载等
```

这样既满足“在线编辑器左侧有文件树”的轻量体验，也避免未来做独立 IDE 时重复实现树、文件操作和状态管理。

核心原则：

```txt
共享数据、命令、状态模型和基础树 UI primitives。
不共享完整产品容器，不用一个大 Explorer 组件靠 mode 参数硬撑所有场景。
```

## 2. 为什么要共享层

当前实现已经有较多可复用资产：

- `apps/web/src/features/file-manager/FileManagerPage.tsx`：目录位置、打开 File Surface、上传、选择、导航等页面级状态。
- `apps/web/src/features/file-manager/FileManagerList.tsx`：文件列表、图标、排序、选择、虚拟化、打开/右键入口。
- `apps/web/src/features/file-manager/file-tools/fileOperations.ts`：新建、重命名、复制、移动、删除、上传、写入等 mutation 封装。
- `apps/web/src/features/file-manager/file-tools/FileActionsMenu.tsx`：文件操作 UI 流程。
- `apps/web/src/lib/query/files.ts`：browse/read/write/rename/copy/move/delete/upload 等 API hooks。
- `apps/web/src/shared/editor-core/*`：editor document id、language resolver、dirty/files 等编辑器共享基础。

如果 Mini Explorer 直接复制 FileManagerList 的逻辑，未来 IDE Explorer 又再复制一遍，会形成三套文件树/文件操作。共享层应先把“数据、命令、状态模型和基础树 UI primitives”抽出来，UI 壳分别适配文件管理器、在线编辑器和 IDE。

不推荐的实现：

```tsx
<Explorer
  mode="mini"
  enableActivityBar={false}
  enableDockview={false}
  enableBatchSelection={false}
  enableUpload={false}
  enableSplitOpen={false}
/>
```

这种“大而全组件 + 大量开关”的方式会让三种产品形态互相污染。正确做法是共享 `explorer-core` 和 `explorer-ui` 的可组合能力，再由各自 shell 装配。

## 3. 产品边界

### 3.1 Mini Explorer 已做

- 首次打开时固定 Mini Explorer 当前目录；打开文件或切换 tab 不会自动跳目录。
- 支持向上返回父目录、刷新当前目录、树型展开/折叠目录。
- 点击文件打开到同一个 `FileOnlineEditorDialog` / File Surface tab；文本、代码、媒体、PDF、二进制都进入统一 File Surface。
- 支持桌面悬浮侧边展开/收起按钮；小屏默认收起并以抽屉覆盖编辑区。
- 支持新建文件、新建目录、重命名、删除、复制、移动。
- 支持复制路径、复制相对路径。
- active tab 只在当前树范围内高亮或 reveal；找不到时不自动切换 Mini Explorer 目录。
- rename/move/delete 已打开 tab 时同步 path/title/document id/draft/viewState/read metadata；dirty 内容保留，delete 标记 deleted 而不是静默关闭。

### 3.2 Mini Explorer 不应该做

- 不做 ActivityBar。
- 不做 Dockview。
- 不做多编辑组拆分。
- 不做 Terminal。
- 不做 Git / LSP / Debug。
- 不做 Problems / Output。
- 不做 watcher 外部变更监听。
- 不做全局搜索、Run、Extensions 面板。
- 不做完整 VS Code Explorer 行为或 VS Code 级工作区管理。
- 不让文件树状态污染 Monaco model 或 dirty/save 状态。

### 3.3 独立 IDE Explorer 后续增强

独立 IDE 复用同一个 Explorer Core，但 UI 和能力更完整：

- Workbench SideBar 持久化宽度、展开状态、滚动位置。
- reveal active file。
- 多编辑组打开策略：当前组、侧边打开、拆分打开。
- 文件 watcher 驱动增量刷新。
- Git 状态徽标、Problems 徽标。
- 与 Command Palette、快捷键、Dockview 布局协同。

## 4. 推荐前端模块

```txt
apps/web/src/shared/explorer-core
├─ types.ts                 # ExplorerNode、ExplorerLocation、ExplorerCommand 等
├─ path.ts                  # rootId/path 规范化、parent/base/join
├─ fileType.ts              # 图标/媒体/text-like/code-like 判断的共享入口
├─ sort.ts                  # 目录优先、自然排序、过滤
├─ useExplorerDirectory.ts  # browse query + refresh + loading/error 封装
├─ useExplorerTreeState.ts  # expanded/selected/focused/reveal 状态
├─ useExplorerCommands.ts   # create/rename/delete/copy/move/refresh/open command adapter
└─ index.ts

apps/web/src/shared/explorer-ui
├─ ExplorerTree.tsx
├─ ExplorerTreeNode.tsx
├─ ExplorerToolbarBase.tsx
├─ ExplorerContextMenuBase.tsx
├─ ExplorerEmptyState.tsx
├─ ExplorerLoadingState.tsx
├─ ExplorerErrorState.tsx
└─ index.ts

apps/web/src/features/file-manager/online-editor/mini-explorer
├─ OnlineEditorMiniExplorer.tsx
├─ MiniExplorerToolbar.tsx
└─ index.ts

apps/web/src/features/ide-workbench/explorer
├─ IdeExplorerView.tsx
├─ IdeExplorerToolbar.tsx
└─ IdeExplorerContextMenu.tsx
```

M3 已把核心共享层放在 `shared/explorer-core`，把稳定的树、节点、基础工具栏、上下文菜单、空/加载/错误状态沉淀到 `shared/explorer-ui`；现有文件管理器继续保持原实现，不强行一次性重构 FileManagerList。Mini Explorer 已复用 API hooks、`fileOperations`、核心状态模型和基础树 UI primitives。

## 5. UI/响应式建议

```txt
Desktop / 宽屏
┌────────────────────────────────────────────┐
│ Editor Header                               │
├──────────────┬─────────────────────────────┤
│ MiniExplorer │ Tabs + File Surface          │
│ 240–320px    │ Monaco / Preview             │
└──────────────┴─────────────────────────────┘

Tablet / 窄屏
- Mini Explorer 默认折叠成左侧图标按钮。
- 点击后以侧边抽屉覆盖编辑区，不挤压 Monaco。

Mobile
- 默认隐藏 Mini Explorer。
- 顶部或操作菜单提供“文件列表”入口。
- 打开后全高抽屉，选择文件后自动收起并打开 tab。
```

设计要求：

- 使用 `docs/界面设计守则.md`、`theme.css` 的现有 token。
- 深色/浅色都要清晰，不引入第二套文件树视觉系统。
- 树节点点击区域要满足触摸尺寸。
- 右键菜单必须有小屏替代入口。

## 6. 数据与命令契约

```ts
type ExplorerLocation = {
  rootId: string;
  path: string;
};

type ExplorerNode = {
  id: string;
  rootId: string;
  path: string;
  name: string;
  kind: "file" | "directory";
  ext?: string;
  size?: number;
  modifiedAt?: string | null;
  permissions?: string;
  textLike?: boolean;
  imageLike?: boolean;
  childrenLoaded?: boolean;
  children?: ExplorerNode[];
};

type ExplorerOpenTarget =
  | { mode: "online-editor"; rootId: string; path: string }
  | { mode: "ide-current-group"; rootId: string; path: string }
  | { mode: "ide-side-group"; rootId: string; path: string };
```

命令边界：

- `openFile` 只发出打开意图，不直接操作 Monaco。
- `rename/delete/move/copy` 使用文件服务 mutation，并通知调用方刷新目录和同步打开 tab 的路径状态。
- `refresh` 只刷新目录 query，不重读 dirty 编辑内容；编辑区 reload 仍由 Editor/File Surface 负责。
- Mini Explorer 的按钮、右键菜单、小屏更多菜单都调用 CommandService 的 explorer/file 命令，不直接写业务逻辑。

### 6.1 文件操作与打开中 Tab 同步

Mini Explorer、未来 IDE Explorer 和文件管理器必须复用同一套文件操作服务。文件操作成功后，不只刷新树，还要向共享 EditorService 发出路径事件：

```ts
type FilePathChangedEvent =
  | { type: "renamed" | "moved"; rootId: string; oldPath: string; newPath: string }
  | { type: "deleted"; rootId: string; path: string };
```

同步规则：

```txt
- rename / move：未 dirty 的已打开 Tab 自动更新 path/title；dirty Tab 也同步 path/title，并保留未保存内容。
- rename / move：Monaco model key 和 dirty/save/conflict 状态迁移到 newPath；同一 rootId + path 的多个 IDE group Tab 一起更新。
- delete：未 dirty 的已打开 Tab 可关闭或标记 deleted，但同一产品壳层内要一致。
- delete：dirty Tab 必须保留内容并标记 deleted，明确提示文件已删除，不能静默丢失；另存为/重新创建可作为后续增强。
- directory delete / move：对所有命中子路径的打开 Tab 批量应用同一规则。
- 外部 watcher 后续接入；M3 已保证 Mini Explorer 发起的本应用内操作同步正确，M4 IDE Explorer 继续复用同一规则。
```

外部变化接入原则：

```txt
- watcher changed 不由 Explorer 直接 reload dirty 编辑内容；交给 Editor/File Surface 冲突流程。
- watcher deleted 复用 delete 同步规则。
- watcher renamed 只有拿到 oldPath/newPath 才复用 rename 同步规则；delete+create 不猜测 rename。
- 保存 409 file_write_conflict 复用 compare / overwrite / reload / cancel，不能在 Explorer 层自行覆盖。
```

## 7. 与当前已完成能力的关系

### 已完成，不重复做

- Monaco 多 Tab 编辑、保存、关闭保护、外部修改冲突。
- Monaco 原生搜索/替换/命令面板入口。
- 全语言懒加载高亮与 zh-CN NLS。
- 统一 File Surface：文本 Monaco，媒体/二进制预览。
- 图片/视频/音频/PDF 基础预览增强。
- 旧 FilePreviewPanel 路由删除。

### M3 Mini Explorer 已新增

- 在线编辑器内部快速浏览相邻文件。
- 在线编辑器内执行常见文件操作。
- active tab 在当前树范围内高亮/定位，但不驱动 Mini Explorer 自动跳目录。
- 小屏文件列表抽屉。
- 复用 `shared/explorer-core` 与 `shared/explorer-ui` primitives，不复制文件树和文件操作逻辑。
- rename/move/delete 打开中 tab 时同步路径状态并保留 dirty 内容。

### 未来 IDE 复用

- Explorer Core 类型、查询、操作、排序、图标、权限判断。
- Explorer UI primitives：基础树、节点、加载/空/错误状态和基础菜单项。
- 不复用在线编辑器的弹窗/抽屉布局。
- IDE 自己实现 Workbench SideBar 与 Dockview 集成。

## 8. 实施切片完成记录

### M3-A — Explorer Core 基础（已完成）

- 抽 `ExplorerLocation` / `ExplorerNode` / path utils / sort utils。
- 封装 `useExplorerDirectory`，内部复用 `useFilesBrowseQuery`。
- 封装 `useExplorerCommands`，内部复用 `fileOperations`。
- 增加系统测试或静态测试，保证核心不依赖在线编辑器 UI。

### M3-B / M3-C — Explorer UI primitives 与 Online Editor Mini Explorer 壳层（已完成）

- `FileOnlineEditorDialog` body 改为 `MiniExplorer + EditorArea` 可选布局。
- 增加侧栏展开/收起状态。
- 桌面端侧栏宽度固定 240–320px；小屏抽屉化。
- 点击文件打开到当前 File Surface tab。
- active tab 在 Mini Explorer 中高亮。
- 使用 `shared/explorer-ui` primitives 组装，不新增一套独立树组件体系。

### M3-D — 文件操作与打开中 Tab 同步（已完成）

- 新建文件/目录、重命名、删除、复制、移动入口。
- 操作成功后刷新相关目录。
- 重命名/移动已打开文件时，同步所有命中的 Tab path/title/document id/draft/viewState/read metadata。
- 删除已打开 dirty 文件前必须二次确认，并保留内容为 deleted Tab，不静默关闭。

### M3-E — 文档与验收收尾（本次）

- smoke：展开/折叠、刷新、上级、新建、重命名、删除、打开文件、移动端抽屉。
- typecheck + file-manager domain tests。
- 更新 03/05/08/13 进度。

## 9. 验收状态

M3 已完成并进入收尾状态，验收口径如下：

- 在线编辑器可以显示/隐藏 Mini Explorer。
- Mini Explorer 能加载当前目录并返回上级、刷新、新建文件/目录。
- 点击文本/代码文件会进入当前在线编辑器 tab；点击媒体/二进制文件进入同一 File Surface 预览 tab。
- 重命名/删除/复制/移动复用现有文件操作服务，不新建第二套 API。
- 小屏下侧栏不会挤压导致 Monaco 不可用；抽屉选择文件后可自动收起。
- 未来 IDE Explorer 可复用共享类型、目录 query、文件操作命令、树状态、基础树 UI primitives 和排序/图标逻辑。
- Mini Explorer 与 IDE Explorer 不共享完整产品 shell，不采用 `<Explorer mode="mini|ide" />` 大组件路线。
- M3 未交付且后置：IDE Workbench、Dockview、ActivityBar、Terminal、Git/LSP/Debug、Problems/Output、watcher 外部变更监听、完整 VS Code Explorer 行为。

## 10. M4 下一步入口

M4 从 **IDE Workbench Layout Foundation** 开始，而不是继续扩展 Online Editor Mini Explorer。M4 应读取：

- `04-独立IDE工作台方案.md`
- `05-前端实现方案.md`
- `08-实施阶段验收与风险.md` 的 M4 章节
- `09-IDE参考行为与术语对照.md`
- `14-视觉主题与设计系统适配.md`

M4 可以复用 `shared/explorer-core` 与 `shared/explorer-ui` primitives，但必须创建独立 Workbench shell：ActivityBar、SideBar Explorer、Editor Area、Panel Area、Dockview 和布局持久化属于 M4+，不能回塞到在线编辑器 Mini Explorer。

## 11. 风险

| 风险 | 影响 | 控制 |
|---|---|---|
| Mini Explorer 膨胀成完整 IDE | 在线编辑器变重，边界混乱 | 明确不做 ActivityBar/Dockview/终端/Git/LSP |
| 一个大 Explorer 组件靠 `mode` 参数硬撑所有场景 | mode/enable flags 持续膨胀 | shared explorer-core + explorer-ui primitives 复用，Mini/IDE/FileManager shell 分离 |
| 复制 FileManagerList 大量逻辑 | 未来维护三套文件树 | 先抽共享数据/命令层，UI 小步实现 |
| Mini Explorer 绕过 CommandService | 右键、toolbar、快捷键行为不一致 | 所有文件操作入口调用 CommandService explorer/file 命令 |
| 文件操作影响 dirty tab | 数据丢失 | 删除/移动/重命名打开文件时必须和 tab/dirty 状态协同 |
| 小屏布局遮挡编辑器 | 手机不可用 | 默认收起 + 抽屉化 + 触摸尺寸 |
| 树加载性能 | 大目录卡顿 | 懒加载子目录，保留虚拟化作为后续优化 |
