# M6-B：Watcher Foundation 执行总结

## 状态

已完成 M6-B Watcher Foundation。

本阶段只建立最小文件事件基础：Files root/path guard 下的目录 snapshot contract、Workbench 前端 file event bus、opened editor tab 的外部 changed/deleted 安全标记，以及 watcher smoke。没有进入 Search、Problems、Output、LSP、Git 或 Debug。

## 完成内容

### 后端 Files watch snapshot contract

- 新增 `GET /api/files/watch/snapshot`。
- 复用 `apps/api/modules/files/service.ts` 既有 `resolveExistingPath` / root guard 语义。
- 只返回指定目录的有界 entry snapshot：`path`、`kind`、`size`、`modifiedAt`、`mtimeMs`。
- 不读取文件内容，不持久化敏感输出，不新建第二套 Files API。
- 当前实现是 M6-A 允许的 bounded polling fallback；后续如需要递归或原生 `fs.watch`，仍沿用同一 event contract。

### 前端 Workbench file event bus

- 新增 `apps/web/src/features/ide-workbench/watcher/useWorkbenchFileEvents.ts`。
- 轮询当前 IDE Explorer directory snapshot，diff 后生成最小事件：
  - `created`
  - `changed`
  - `deleted`
- 初始 snapshot 不发事件，避免页面恢复时误报。
- 有变更时 invalidate 当前 Explorer browse query，保证目录列表后续刷新。

### 打开 tab 安全状态

- `changed + opened file`：给 tab 标记 `externalState="changed"`，显示外部变更 banner；不会自动 reload 或覆盖 Monaco model。
- `deleted + clean opened file`：标记 `deleted`，维持现有 clean deleted 表达。
- `deleted + dirty opened file`：不设置 `deleted`，只标记 `externalState="deleted"`，保持 Monaco panel 可见，避免丢失未保存内容。
- save 成功或 clean 后会清理外部状态。

## 明确未做

- 没做 Search Foundation。
- 没做 Diff / Compare / Reload / Overwrite 完整冲突流。
- 没做 Problems / Output 数据面板。
- 没做 LSP / Git / Debug。
- 没做 recursive watcher、跨目录 rename oldPath/newPath 推断或 chokidar 依赖。
- 没做完整 VS Code watcher 行为。

## 验收

新增 smoke：

```bash
npm run smoke:ide:watcher-foundation
```

覆盖：

- 进入 `/ide/:rootId`。
- 当前 Explorer directory 的 snapshot watcher 启动。
- 外部修改 clean opened file 后 tab 标记 `changed` 并显示 banner。
- dirty opened file 被外部删除后 tab 标记 `deleted` 外部状态且 Monaco panel 仍可见。

本阶段还运行：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
npm run smoke:ide:watcher-foundation
```

## 下一步

推荐进入 M6-C Search Foundation：复用现有 `/api/files/search` 和 content-index，实现 Search Activity/View、结果列表和打开/跳转，不新增第二套搜索 API。
