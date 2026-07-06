# M6-C：IDE Search Foundation 执行总结

## 状态

已完成 M6-C Search Foundation。

本阶段把 IDE Workbench 的 Search Activity 从占位升级为可用的搜索视图，复用现有 Files search API。M6-C 不新增第二套搜索 API，不做 Problems / Output / LSP / Git / Debug，也不做全量替换或完整 VS Code 搜索行为。

## 完成内容

### Search Activity / View

- ActivityBar 的 Search 入口已启用。
- SideBar 可在 Explorer 与 Search View 间切换。
- Search View 支持：
  - 搜索关键词。
  - scope path。
  - 大小写。
  - 正则。
  - 递归。
  - hidden 文件。
- 搜索结果展示文件/目录、match kind、路径和 snippet。

### 复用 Files search

- 复用 `useFilesSearchQuery` 与 `GET /api/files/search`。
- 不新增第二套搜索 API。
- 当前结果精确 range/line/column 后置；M6-C 点击结果先打开对应文件。

### 结果打开 IDE Editor

- 点击文件结果会 pin/open 到 IDE Editor Dock。
- 点击目录结果会切换 Explorer 当前目录并回到 Explorer Activity。
- Dockview 仍只负责布局，文件 IO 和内容读取仍走 editor-core / Files API。

## 明确未做

- 未做 Search Replace / Replace All。
- 未做 Monaco precise range reveal。
- 未做 Problems / Output 数据写入。
- 未做 Diff / Conflict Flow。
- 未做 LSP / Git / Debug。
- 未做完整 VS Code 搜索行为。

## 验收

新增 smoke：

```bash
npm run smoke:ide:search-foundation
```

覆盖：

- 进入 `/ide/:rootId`。
- 打开 Search Activity。
- 搜索临时文件内容。
- 结果列表出现目标文件。
- 点击结果打开 IDE Editor tab 并显示 Monaco panel。

本阶段建议验证：

```bash
npm run typecheck:web -- --pretty false
npm run smoke:ide:search-foundation
npm run smoke:ide:workbench-layout
npm run smoke:ide:watcher-foundation
```

## 下一步

推荐进入 M6-D Diff / Conflict Flow：基于 M6-B watcher 的 external changed/deleted 和现有 save 409，接入 Monaco DiffEditor 的 compare / reload / overwrite / cancel 流程。
