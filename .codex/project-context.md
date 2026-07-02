# Tracevane Codex project context

Use this as the short project brief before planning or implementing File Manager, Online Editor, File Surface, IDE Workbench, terminal, LSP/Git/debug, or theme work.

## Product target

Tracevane is building two related but separate editing products:

1. **File Manager Online Editor / File Surface**
   - Fast file open/edit/preview from File Manager.
   - Monaco for text/code; media/PDF/binary use the same File Surface preview shell.
   - May add a lightweight Mini Explorer in M3.
   - Must not grow into a full IDE: no ActivityBar, Dockview workbench, project terminal, Git, LSP, or debug.

2. **Standalone IDE Workbench**
   - Project-level VS Code/Cursor-like workbench.
   - ActivityBar, SideBar Explorer, Editor Area, Panel Area, StatusBar, Dockview editor groups, layout persistence and reset.
   - Terminal, Problems, Output, LSP, Git and Debug are staged after the layout foundation.

Both products share lower-level core services, not full product shells.

## Current stage map

- Done: M1 Online Editor base.
- Done: M1.x Online Editor window/tab/save safety/status/entry enhancements.
- Done: Monaco-first cleanup.
- Done: M2/M2.x unified File Surface and media previews.
- Done: M3 Online Editor Mini Explorer + Shared Explorer Core.
- Done: M4 IDE Workbench Layout Foundation.
- Next: M5 Real Terminal Foundation.
- Later: M5.x Terminal Split / Group / Panel Placement.
- Later: M6 Watcher / Search / Problems / Output.
- Later: M7 LSP / Git / Debug.

## Required reading by task

Always read these before changing matching scope:

- Overall editor/IDE direction: `docs/ide-code-editor-solution/00-README.md`, `08-实施阶段验收与风险.md`.
- File Manager Online Editor / File Surface: `03-文件管理器在线编辑器方案.md`, `10-monaco-first-online-editor-strategy.md`, `12-file-surface-unification-and-monaco-gap-plan.md`.
- Completed Mini Explorer / Shared Explorer Core record: `13-mini-explorer-shared-explorer-plan.md`, plus `01`, `02`, `05`, `06`.
- IDE Workbench layout: `04-独立IDE工作台方案.md`, `05-前端实现方案.md`, `09-IDE参考行为与术语对照.md`.
- Terminal / LSP / Git / Debug: `07-终端运行语言服务Git方案.md`, `06-后端服务与接口方案.md`, `08`.
- Visual/theme work: `14-视觉主题与设计系统适配.md`, `DESIGN.md`, `docs/界面设计守则.md`, `apps/web/src/design/theme.css`.

## Non-negotiable implementation rules

- Do not merge File Manager Online Editor and Standalone IDE into one mega page.
- Share `explorer-core`, file identity, file operations, Monaco model lifecycle, dirty/save/conflict logic and command semantics where appropriate.
- Do not share bloated product containers such as one giant `<Explorer mode="mini|ide|file-manager" />` with many flags.
- Monaco is not a textarea. Keep file contents in Monaco models; React state stores metadata and view state only.
- xterm.js is terminal UI only; command execution belongs to backend PTY/WebSocket with workspace/runtime guardrails.
- Dockview/layout solves workbench layout only; it does not own FileService, SaveService or Monaco models.
- Theme implementation must use Aurora tokens from `theme.css` through adapters for Monaco/xterm/Dockview/diff/Problems/Output. Do not copy VS Code/Terminal default colors.
- Every stage must state what it does not do and preserve future IDE free-layout capability.

## Verification shortcuts

Use the smallest sufficient proof for the changed surface:

- Docs-only: markdown link check + `git diff --check`.
- Type-level frontend change: `npm run typecheck:web`.
- Root type safety: `npm run typecheck`.
- Online Editor/File Surface: `npm run smoke:file-manager:online-editor`, `npm run smoke:file-manager:online-editor-responsive`, and relevant Monaco/media smokes.
- File operations: `npm run smoke:file-manager:file-operations` and targeted system tests or focused API checks.
- Theme changes: verify both light and dark on File Manager, File Surface/Monaco, and any IDE/terminal/panel surface touched.
- Terminal/backend runtime changes: include lifecycle evidence for create/input/output/resize/kill/error/disconnect and cwd/root guard.
