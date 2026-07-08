# 历史执行记录归档

本目录保存已经完成阶段的执行计划、进度日志、验证证据和决策记录。

这些文件不是当前方案主线入口。当前入口按以下顺序读取：

1. [`../00-README.md`](../00-README.md)：文档索引与当前阶段。
2. [`../15-远程代码工作台产品聚焦与长期执行机制.md`](../15-远程代码工作台产品聚焦与长期执行机制.md)：M13-I 之后的产品聚焦覆盖层和长期执行机制。
3. [`../../../.codex/project-context.md`](../../../.codex/project-context.md) 与 [`../../../.codex/ide-long-term-goal.md`](../../../.codex/ide-long-term-goal.md)：Codex 执行上下文与长期 goal。
4. 对应阶段的主线方案文档：`../01` 到 `../14`。

## 归档原则

- `m*-plan.md`、`m*-summary.md`、`m*-decision.md`、`m*-progress.md` 均视为历史证据，不再作为当前产品方向的唯一来源。
- 已完成阶段的计划、验收和决策不删除，除非确认是重复、错误或已迁移到更准确的归档文件。
- 当前方向变更不回写每个旧阶段文件的历史语境；旧文件里的“下一步”代表当时决策，不代表今天的下一步。
- 如果旧文件与当前主线冲突，以 `../00-README.md`、`../15-远程代码工作台产品聚焦与长期执行机制.md`、`.codex/project-context.md` 和 `.codex/ide-long-term-goal.md` 为准。
- 新阶段完成后，只在本目录新增对应的 plan/summary/decision 归档；不要把新进度继续追加到旧阶段文件。


## 当前处置结论

- `.codex/ide-long-term-goal.md` 与 `.codex/project-context.md` 已作为长期 goal 和当前阶段指针的权威文件；阶段切换时更新它们，不重建每个短阶段的 runtime goal。
- `docs/ide-code-editor-solution/00`–`15` 暂不删除：它们仍是当前主线入口。
- 已完成阶段的 `m*`、`p*` 计划、总结、验收和决策继续归档在本目录；旧文件中的“下一步”只代表当时语境，不覆盖当前阶段。
- 新增阶段总结时优先添加到本目录，并在 `00-README.md`、`.codex/project-context.md` 和 `.codex/ide-long-term-goal.md` 指向新的当前入口。

## 当前归档结构

- `m1*`–`m2*`：File Manager Online Editor 与 Unified File Surface 初期执行记录。
- `m3*`–`m5y*`：Mini Explorer、IDE Workbench、Terminal、IDE Editor Foundation 记录。
- `m6*`–`m7z*`：Watcher/Search/Problems/Output、LSP/Git/Debug 记录。
- `m8*`–`m10*`：RC 稳定化、Git 历史能力、semantic tokens / workspace symbols 记录。
- `m11*`–`m13*`：多语言 provider、external language server、toolchain provider 与 rich interaction 记录。
- `p0*`：M13-I 产品 pivot 之后的远程代码工作台主链路验证、缺口审计与 P1 hardening 输入。
- `p1*`：主链路 UX hardening 计划、验收和后续修复记录，包括 Explorer、Editor edge-files 与 Responsive layout 自动化验收。

## 删除 / 归档判断

当前不建议删除 `docs/ide-code-editor-solution` 下的主线文档 `00`–`15`：它们分别承载产品边界、架构、前后端、验收、主题和长期聚焦。

可以归档或删除的对象仅限：

1. 根目录或主线目录中已经完成的临时执行计划、进度日志、一次性验收记录。
2. 与当前主线重复且内容已被更准确文件完全覆盖的旧文档。
3. 明确错误、会误导阶段边界、且没有历史证据价值的文件。

执行删除前必须先确认：

- `00-README.md` 不再链接该文件作为当前入口。
- 该文件不是某个阶段的唯一验收证据。
- 删除不会让历史 commit / PR / 阶段总结失去可追溯性。
- [p1-a-3-editor-edge-files-summary.md](./p1-a-3-editor-edge-files-summary.md) — P1-A-3 Editor edge-files workflow: Monaco text/readonly/large/deleted/media/binary Hex edge-file acceptance.

- [p1-a-4-responsive-layout-summary.md](./p1-a-4-responsive-layout-summary.md) — P1-A-4 Responsive layout workflow: narrow/mobile Explorer overlay, Editor/Search/Git/Run/Panel no-overflow acceptance.
