# M8-A IDE stabilization and release-candidate plan

## 状态

已完成：M8-A 是 docs-only 稳定化与 release-candidate 计划，不新增运行时代码。

M8-A 承接 M7.z-J 的 LSP / Git / Debug enhancement acceptance closeout。目标是停止继续横向扩功能，先把 Tracevane IDE 已具备的 Online Editor、File Surface、Mini Explorer、IDE Workbench、Terminal、Search、Problems/Output、LSP、Git、Debug 能力整理成可回归、可验收、可发布候选的稳定化矩阵。

## M8 总目标

M8 的目标不是“更多功能”，而是让现有 IDE 能力进入 release-candidate 节奏：

1. 明确哪些能力进入 RC 范围。
2. 明确哪些问题是 release blocker。
3. 明确哪些能力后置到 post-M8 roadmap。
4. 建立分层 smoke / typecheck / docs check 必跑集。
5. 清理历史阶段文档中过期口径，避免计划和实现状态不一致。

## M8-A 不做

- 不新增 LSP / Git / Debug / Terminal / Files API。
- 不新增运行时代码。
- 不追完整 VS Code parity。
- 不把 File Manager Online Editor 和 IDE Workbench 合并。
- 不把 M8 变成新功能桶。
- 不处理 model-gateway 等非 IDE 范围漂移。

## RC 范围候选

### 1. File Manager / File Surface / Online Editor

进入 RC 候选：

- 文件管理器在线编辑器基础编辑闭环。
- Monaco-first 在线编辑器能力。
- 统一 File Surface 路由。
- 媒体预览基础。
- Mini Explorer 与 shared explorer-core / explorer-ui。

必跑候选：

```bash
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:file-surface-routing
npm run smoke:file-manager:media-preview
npm run smoke:file-manager:file-operations
npm run smoke:file-manager:monaco-highlighting
npm run smoke:file-manager:monaco-clipboard
npm run smoke:file-manager:monaco-nls
```

### 2. IDE Workbench / Editor

进入 RC 候选：

- `/ide` / `/ide/:workspaceId` Workbench 路由。
- ActivityBar / SideBar Explorer / EditorDock / Panel / StatusBar。
- Dockview editor tabs / split placeholder 与后续真实 Monaco editor panel。
- Editor dirty/save/conflict/diff 基础。
- Preview / media / hex / status bar 基础边界。

必跑候选：

```bash
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:editor-conflict-diff
```

### 3. Terminal

进入 RC 候选：

- 真实 terminal foundation。
- Terminal session lifecycle。
- split/group/panel placement。
- durable backend / persistence 基础。

必跑候选：

```bash
npm run smoke:ide:terminal-foundation
npm run smoke:ide:terminal-split-layout
npm run smoke:ide:terminal-panel-placement
npm run smoke:ide:terminal-persistence
npm run smoke:ide:terminal-manager
npm run smoke:ide:terminal-durable-backend
```

### 4. Search / Watcher / Problems / Output

进入 RC 候选：

- watcher foundation。
- search foundation。
- Problems / Output foundation。

必跑候选：

```bash
npm run smoke:ide:watcher-foundation
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
```

### 5. LSP

进入 RC 候选：

- JSON diagnostics / hover / completion / definition。
- TypeScript / JavaScript diagnostics、hover、definition、completion、references。
- WorkspaceEdit preview/apply。
- rename / formatting / code actions UI foundation。

必跑候选：

```bash
npm run smoke:ide:lsp-diagnostics
npm run smoke:ide:lsp-interaction
npm run smoke:ide:lsp-typescript-diagnostics
npm run smoke:ide:lsp-typescript-interaction
npm run smoke:ide:lsp-typescript-completion
npm run smoke:ide:lsp-typescript-references
npm run smoke:ide:lsp-workspace-edit-foundation
npm run smoke:ide:lsp-rename-format-code-actions
```

### 6. Git

进入 RC 候选：

- Git status / Source Control View。
- diff / stage / unstage / commit。
- branch / upstream status。
- remote fetch/pull/push/publish/sync guarded entry。
- branch list/create/checkout 与 stash list/save/apply/pop/drop guarded entry。

必跑候选：

```bash
npm run smoke:ide:git-status
npm run smoke:ide:git-diff
npm run smoke:ide:git-stage
npm run smoke:ide:git-commit
npm run smoke:ide:git-branch-upstream
npm run smoke:ide:git-remote-foundation
npm run smoke:ide:git-branch-stash-foundation
npm run smoke:ide:git-branch-stash-hardening
```

### 7. Debug

进入 RC 候选：

- Debug gateway / Debug View shell。
- breakpoints / editor reveal。
- minimal adapter proof。
- lifecycle / launch profile / Node inspector / controls / scopes / watch / evaluate。

必跑候选：

```bash
npm run smoke:ide:debug-foundation
npm run smoke:ide:debug-breakpoints
npm run smoke:ide:debug-adapter-proof
npm run smoke:ide:debug-lifecycle
npm run smoke:ide:debug-launch-profile
npm run smoke:ide:debug-node-inspector
npm run smoke:ide:debug-controls-scopes
npm run smoke:ide:debug-watch-evaluate
```

## 分层验证建议

### PR quick gate

适合每个 IDE PR / 阶段提交前运行：

```bash
npm run typecheck:api -- --pretty false
npm run typecheck:web -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:terminal-foundation
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:lsp-diagnostics
npm run smoke:ide:git-status
npm run smoke:ide:debug-foundation
git diff --check
```

### RC smoke matrix

适合 M8-B/M8-C 的候选发布前完整回归：运行上文各域必跑候选，并保留失败清单、失败日志、修复 commit 与复跑证据。

### Docs gate

Docs-only 阶段至少运行：

```bash
# touched docs relative link check
git diff --check
```

## Release blockers 分类

M8-B 应按以下分类登记 blocker：

- P0：IDE 入口白屏、数据破坏、越权路径访问、终端 cwd/root guard 绕过、Git/LSP/Debug 高风险命令失控。
- P1：核心 RC smoke 失败、编辑保存丢数据、terminal session 无法创建/关闭、Source Control 误操作、WorkspaceEdit 写错路径。
- P2：布局/响应式/主题明显异常、非核心 smoke 间歇失败、错误提示不可解释。
- P3：文案、轻微视觉、非阻塞体验问题。

## Post-M8 后置清单

M8 不追：

- 完整 VS Code parity。
- 完整多语言 LSP server manager。
- 完整 Debug Adapter 管理器和多语言 debug。
- Git graph / blame / credential manager / force push / merge / rebase conflict resolver。
- 完整插件市场。
- 全量 UI polish 和所有移动端高级交互。

## 下一步

M8-B：RC smoke matrix runner / documentation cleanup foundation。

建议 M8-B 做两件事：

1. 新增一个 repo script 或文档化命令组，把 PR quick gate 和 RC smoke matrix 固化为可重复执行的入口。
2. 开始清理 `docs/ide-code-editor-solution` 中已明显过期的“下一步/后置”口径，优先修正会误导后续 agent 的阶段状态。
