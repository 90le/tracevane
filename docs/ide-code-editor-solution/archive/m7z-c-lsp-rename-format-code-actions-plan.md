# M7.z-C：LSP rename / formatting / code actions plan

## 状态

M7.z-C 已完成为 **docs-only 研究与安全计划**。

本阶段不实现 rename、formatting、code actions runtime，也不增加新的 LSP/Files API。目标是先把 LSP 可写能力的协议边界、WorkspaceEdit 预览/应用策略、dirty/conflict 保护和后续切片写清楚，避免在没有统一 apply 边界时直接修改文件。

下一阶段入口：**M7.z-D Git remote operations foundation plan**。

## 官方协议依据

本阶段以 LSP 3.17 specification 为主要依据：

- LSP 3.17：[`microsoft/language-server-protocol` specification.md](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)

关键协议结论：

- `textDocument/rename` 返回 `WorkspaceEdit`；客户端应先通过 `textDocument/prepareRename` 做可重命名性与占位范围确认。
- `textDocument/formatting`、`textDocument/rangeFormatting`、`textDocument/onTypeFormatting` 返回 `TextEdit[]`，属于对当前文档内容的批量文本编辑。
- `textDocument/codeAction` 可以返回 `Command` 或 `CodeAction`；`CodeAction` 可携带 `edit: WorkspaceEdit`，也可能需要后续 resolve。
- `WorkspaceEdit` 可以表达多文件 text edits，也可以通过 `documentChanges` 表达 create/rename/delete 等资源操作。

因此，Tracevane 不能把 rename / code action / formatting 当成普通 editor command 直接执行。所有可写结果都必须先规范化为可预览、可校验、可取消的编辑计划，再经由现有 Files API、Monaco model dirty/save/conflict 规则和 root guard 应用。

## 当前基础

M7.z-C 建立在以下已完成能力上：

- M7.z-B 已完成 Advanced LSP references foundation，现有 LSP gateway 已能通过 HTTP / WebSocket 返回 TS/JS references。
- TS/JS provider 当前使用 bounded TypeScript `LanguageServiceHost` / `ScriptSnapshot` / `createLanguageService` 路线，不引入完整 tsserver 进程。
- IDE Editor 已具备 Monaco model lifecycle、dirty/save、保存冲突 compare / reload / overwrite / cancel、rename/move/delete 已打开 tab 同步。
- M6 已完成 Diff / Conflict Flow、Problems / Output foundation，可承载后续 WorkspaceEdit preview 和 apply 日志。
- Files API 已有 workspace/root/path guard；未来所有跨文件写入必须复用该边界。

## M7.z-C 安全设计

### 1. 统一 WorkspaceEdit 预览模型

后续实现前应先新增一个薄的、共享的 preview/apply 计划模型，例如：

```ts
type WorkspaceEditPreview = {
  rootId: string;
  source: 'lsp.rename' | 'lsp.formatting' | 'lsp.codeAction';
  edits: WorkspaceEditPreviewItem[];
  rejected: WorkspaceEditRejectedItem[];
};

type WorkspaceEditPreviewItem =
  | {
      kind: 'text';
      path: string;
      uri?: string;
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      newText: string;
      documentVersion?: number;
      expectedModifiedAt?: number;
      expectedSize?: number;
      targetOpenState: 'open-clean' | 'open-dirty' | 'closed';
    }
  | {
      kind: 'resource';
      operation: 'create' | 'rename' | 'delete';
      path: string;
      newPath?: string;
      supported: false;
      reason: string;
    };
```

这不是新文件 API，而是 LSP response 到既有 Files/Editor/Monaco apply 规则之间的安全适配层。

### 2. root guard 和路径规范化

所有 LSP URI/path 必须转换为 Tracevane workspace 内相对路径，并执行：

- `rootId/workspaceId` 必填。
- URI/path 必须落在当前 root 内。
- 路径规范化必须复用 Files root/path guard 语义。
- root 外路径、未知 scheme、无法映射路径必须进入 `rejected`，不能静默忽略或写入。

### 3. dirty / open file 保护

应用 preview 前必须区分：

- **open clean file**：可优先应用到 Monaco model，再走现有 save/conflict metadata。
- **open dirty file**：必须弹出确认或进入 diff/preview；不能把 LSP edit 静默覆盖到 dirty model。
- **closed file**：必须先读取文件 metadata，带 `expectedModifiedAt` / `expectedSize` 或等价 hash/version 应用；失败进入 conflict。
- **deleted/moved file**：必须重新校验；不能根据旧 URI 强写。

原则：LSP 是建议来源，不是文件系统写入所有者。

### 4. resource operation 默认后置

首个实现切片建议只支持 text edits。

`WorkspaceEdit.documentChanges` 中的 create/rename/delete resource operations 先显示在 preview 中并标记 unsupported，原因：这些操作涉及 Explorer sync、opened tab sync、dirty delete/rename 保护、Git working tree 风险和 rollback 语义，不能混入第一版 rename/code action apply。

### 5. UI / UX 入口建议

后续 runtime 切片建议从以下入口开始：

- Rename Symbol：Monaco rename provider / command palette / tab 或 editor context command。
- Format Document：显式 command；第一阶段不启用 format-on-save。
- Code Actions：先 list + preview；能安全 apply 的 text edits 才允许执行。

所有入口均应：

- 展示 preview/diff 数量和目标文件列表。
- 对多文件 edit 默认要求确认。
- 对 dirty/open file 明确提示冲突风险。
- 将执行成功/失败写入 Output channel。

## 推荐后续实现切片

### LSP mutation slice 1：WorkspaceEdit preview foundation

目标：只把 LSP `WorkspaceEdit` / `TextEdit[]` 规范化为 `WorkspaceEditPreview`，不真正写文件。

验收：

- root 内路径可解析。
- root 外/未知 scheme 被拒绝。
- open dirty / open clean / closed target 能正确分类。
- preview 可在 Output 或最小 UI 中显示。

### LSP mutation slice 2：Rename preview + guarded apply

目标：实现 `prepareRename` + `rename`，只支持 root 内 text edits。

验收：

- 同文件 rename 可 preview 并应用。
- 多文件 rename 必须 preview 确认。
- dirty 目标文件不静默覆盖。
- root 外 edit 被拒绝。

### LSP mutation slice 3：Formatting explicit current document

目标：实现显式 Format Document，只作用于当前打开 Monaco model。

验收：

- 不默认 format-on-save。
- formatting edit 应用后 tab dirty 状态正确。
- 失败写 Output。

### LSP mutation slice 4：Code actions list / preview

目标：先列出 code actions；只对 `CodeAction.edit` 中的 safe text edits 走 preview，`Command` 或 resource operations 先标记 unsupported。

验收：

- code action list 不白屏。
- safe text edit 可 preview。
- unsupported action 有清晰原因。

## 本阶段明确不做

- 不实现 rename / format / code action runtime。
- 不实现 WorkspaceEdit apply。
- 不新增第二套 LSP API 或 Files API。
- 不让 LSP service / Dockview / Monaco provider 直接写磁盘。
- 不启用 format-on-save。
- 不实现 resource operations create/rename/delete apply。
- 不做 semantic tokens、signature help、auto-import details。
- 不做完整 tsserver / typescript-language-server 进程生命周期。
- 不做 Git remote / checkout / merge / rebase / stash / graph。
- 不做新的 Debug parity 工作。

## 验收记录

M7.z-C 是 docs-only 阶段，验证范围为：

- touched docs Markdown relative link check。
- `git diff --check`。

运行时代码、LSP smoke、Git smoke 和 Debug smoke 不在本阶段执行范围内。
