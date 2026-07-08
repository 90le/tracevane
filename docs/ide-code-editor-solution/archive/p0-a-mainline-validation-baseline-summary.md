# P0-A Remote Code Editing Mainline Validation Baseline Summary

## 状态

已完成。P0-A 是 P0 Remote Code Editing Mainline Audit 的第一步：先用现有自动化 smoke 和 typecheck 建立主链路基线，确认当前工程没有明显白屏/基础流程断裂，再进入 P0-B 人工/脚本结合的真实路径缺口审计。

## 本阶段目标

验证以下远程代码工作台主链路的自动化基础证据：

```txt
/ide shell
→ editor open/edit/save dirty
→ search
→ Problems / Output
→ Git status/diff/stage/commit
→ Terminal foundation
```

本阶段不新增功能，不修复 UI，不新增 smoke；只使用现有验证入口建立 baseline。

## 验证结果

执行时间：2026-07-08 11:18:46 +08:00 至 2026-07-08 11:21:51 +08:00。

通过的验证：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:editor-save-dirty
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:git-status
npm run smoke:ide:git-diff
npm run smoke:ide:git-stage
npm run smoke:ide:git-commit
npm run smoke:ide:terminal-foundation
```

完整本地日志保存在 `.tmp/p0-audit/minimal-mainline-validation.log`（临时工作区证据，不作为长期归档文件提交）。

## 覆盖到的主链路

| 主链路能力 | 证据 | 结论 |
| --- | --- | --- |
| 进入 `/ide` / Workbench shell | `smoke:ide:workbench-layout` | 自动化基线通过 |
| 打开编辑器与 Monaco foundation | `smoke:ide:editor-foundation` | 自动化基线通过 |
| dirty / save 基础 | `smoke:ide:editor-save-dirty` | 自动化基线通过 |
| Search foundation | `smoke:ide:search-foundation` | 自动化基线通过 |
| Problems / Output foundation | `smoke:ide:problems-output` | 自动化基线通过 |
| Git status / diff / stage / commit | `smoke:ide:git-*` | 自动化基线通过 |
| Terminal create/input/output foundation | `smoke:ide:terminal-foundation` | 自动化基线通过 |
| TypeScript baseline | `typecheck:web`, `typecheck:api` | 自动化基线通过 |

## 当前未证明的内容

P0-A 没有证明以下真实产品体验，必须进入 P0-B 继续审计：

1. Explorer 当前目录、展开状态、拖拽、快捷键、复制/剪切/粘贴在真实长目录中的体验。
2. preview / pinned / multi-tab 在真实多文件工作流中的一致性。
3. 图片、视频、音频、PDF、hex/binary、大文件、readonly、deleted、权限错误的综合预览与保存边界。
4. 外部修改冲突、save failure、dirty close confirmation 的端到端人工路径。
5. Quick Open、workspace symbols、provider status/degraded reason 在真实项目中的可解释性。
6. Terminal copy/paste、文件路径插入、粘贴图片/文件降级行为。
7. 页面刷新后的 tabs/layout/session/workspace 状态恢复。
8. 手机/窄屏下主链路是否可用。

## 当前 P0 blocker 结论

基于本阶段自动化 baseline：未发现会让基础 IDE 主链路立即白屏或全局不可用的 blocker。

但这不是 P0 audit 完成结论；它只说明已有自动化覆盖的基础场景通过。P0-B 需要继续面向真实远程项目路径审计未覆盖项。

## 后续切片：P0-B Mainline Gap Audit

下一步建议进入 P0-B：

```txt
真实/准真实 workspace 路径
→ Explorer 长目录浏览与持久化
→ preview/pinned/multi-tab 高频操作
→ media/binary/large/readonly/deleted 文件边界
→ dirty/save/conflict 端到端路径
→ provider status/degraded reason 可解释性
→ terminal copy/paste/path insertion
→ refresh persistence
→ mobile/narrow layout
```

P0-B 输出应包含：

- P0 blocker list。
- P1 friction list。
- 每个 blocker/friction 对应的 targeted smoke 或人工复现步骤。
- P1 Mainline Hardening 的优先修复队列。

## 不做事项

P0-A 不做：

- 新功能实现。
- 新 provider runtime。
- clangd/Java/Go/Rust deeper rich interactions。
- Debug parity。
- Dangerous Git operations。
- Terminal advanced layout。
- 完整 RC matrix。
