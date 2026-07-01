# Monaco-first Cleanup Progress

Status: Initialized  
Branch: `feat/file-manager-online-editor-monaco-first-cleanup`  
Created: 2026-07-01

## Objective

Track implementation and verification progress for the Monaco-first cleanup after M1.x.

The cleanup goal is not to add more editor surface area. It is to simplify Tracevane-owned code and let Monaco own editor-native behavior.

## Starting point

- Base branch state includes completed M1.x commit: `72cc4d4f Complete safe File Manager editor M1.x`.
- Strategy document exists: `10-monaco-first-online-editor-strategy.md`.
- Plan document exists: `monaco-first-cleanup-plan.md`.
- Current implementation still includes transitional custom search controls and custom local search highlight path from M1.x.

## Work log

| Date | Slice | Status | Notes |
|---|---|---|---|
| 2026-07-01 | Planning | Complete | Created cleanup plan/progress docs on `feat/file-manager-online-editor-monaco-first-cleanup`. |

## Slice status

| Slice | Status | Evidence |
|---|---|---|
| MFC.1 — Wrapper command bridge and option profiles | Not started | Pending implementation |
| MFC.2 — Remove duplicate search UI/state | Not started | Pending implementation |
| MFC.3 — Preferences and performance tuning | Not started | Pending implementation |
| MFC.4 — Documentation and verification closure | Not started | Pending implementation |

## Verification log

No implementation verification has been run on this branch yet after creating the cleanup plan docs.

Baseline evidence inherited from M1.x final verification is recorded in `m1-progress.md`, but must not be reused as proof for cleanup implementation changes.

## Known constraints

- Do not introduce new dependencies.
- Do not use Monaco private/internal APIs.
- Do not enter standalone IDE Workbench scope.
- Keep M1.x save safety and dirty-close behavior intact.
- Port `5176` may be occupied by a long-running dev runtime; use isolated `5177` smoke verification when needed.

## Next action

Start MFC.1:

1. Add `CodeEditorProfile`.
2. Add centralized `buildMonacoEditorOptions`.
3. Add generic `runAction` bridge.
4. Keep existing behavior passing before removing duplicate search UI.
