---
name: tracevane-ide-workflow
description: Use for Tracevane File Manager Online Editor, File Surface, Mini Explorer, IDE Workbench, terminal, LSP/Git/debug, Monaco, Dockview, xterm, Problems/Output, or IDE theme implementation. Reads the stage docs first, enforces M3-M7 boundaries, and selects the right verification.
---

# Tracevane IDE Workflow

Use this skill whenever a task touches Tracevane's editor/IDE product line: File Manager Online Editor, File Surface, Mini Explorer, shared Explorer Core, IDE Workbench, Monaco, Dockview, xterm, terminal runtime, watcher/search, Problems/Output, LSP, Git, Debug, or IDE visual theme adaptation.

## 1. Classify the stage first

Read `.codex/project-context.md`, then identify the target stage:

- M3: Online Editor Mini Explorer + Shared Explorer Core.
- M4: IDE Workbench Layout Foundation.
- M5: Real Terminal Foundation.
- M5.x: Terminal Split / Group / Panel Placement.
- M6: Watcher / Search / Problems / Output.
- M7: LSP / Git / Debug.

Do not pull future-stage behavior into the current stage unless the user explicitly changes the target.

## 2. Required reading map

Read only the relevant subset, but do read it before planning/editing:

- Overall phase and risks: `docs/ide-code-editor-solution/00-README.md`, `docs/ide-code-editor-solution/08-实施阶段验收与风险.md`.
- Online Editor / File Surface: `03-文件管理器在线编辑器方案.md`, `10-monaco-first-online-editor-strategy.md`, `12-file-surface-unification-and-monaco-gap-plan.md`.
- Mini Explorer / Shared Explorer Core: `13-mini-explorer-shared-explorer-plan.md`, plus `01`, `02`, `05`, `06` as needed.
- IDE Workbench layout: `04-独立IDE工作台方案.md`, `05-前端实现方案.md`, `09-IDE参考行为与术语对照.md`.
- Terminal / LSP / Git / Debug: `07-终端运行语言服务Git方案.md`, `06-后端服务与接口方案.md`, and the matching stage in `08`.
- Visual/theme work: `14-视觉主题与设计系统适配.md`, `DESIGN.md`, `docs/界面设计守则.md`, `apps/web/src/design/theme.css`.

## 3. Boundary checks

Before editing, state the current boundary in one compact sentence:

- What this change does.
- What it explicitly does not do.
- Which shared core is reused.
- Which verification proves it.

Reject these drift patterns:

- Mini Explorer becoming IDE Explorer.
- One giant `Explorer mode="mini|ide|file-manager"` shell with many flags.
- M4 pretending to have real terminal/LSP/Git/Debug.
- xterm code executing commands in the frontend.
- Monaco treated as textarea or full content stored in React state.
- Dockview owning file IO or Monaco model lifecycle.
- VS Code/terminal default colors hardcoded into Tracevane UI.

## 4. Verification map

Use the smallest sufficient proof:

- Docs-only: markdown link check + `git diff --check`.
- Frontend editor/file surface: `npm run typecheck:web`, `npm run smoke:file-manager:online-editor`.
- Responsive/theme editor change: add `npm run smoke:file-manager:online-editor-responsive`.
- File operations: add `npm run smoke:file-manager:file-operations` or targeted API/system checks.
- Monaco internals: add the relevant Monaco highlighting/clipboard/NLS smoke.
- Media preview: add `npm run smoke:file-manager:media-preview`.
- Backend shared/files: `npm run typecheck` plus focused service/system evidence.
- Terminal runtime: prove create/input/output/resize/kill/error/disconnect and cwd/root guard.
- Theme: verify light and dark for every touched dense surface.

## 5. Output contract

For plans and final reports, include:

- Stage and scope.
- Files changed.
- Boundary preserved.
- Verification evidence.
- Known gaps or deferred future-stage work.
