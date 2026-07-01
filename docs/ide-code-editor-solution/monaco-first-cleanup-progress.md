# Monaco-first Cleanup Progress

Status: MFC.1–MFC.2 complete
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
| 2026-07-01 | MFC.1 | Complete | Added explicit `CodeEditorProfile`, centralized Monaco construction options, enabled `largeFileOptimizations`, and added a generic `runAction` bridge while keeping Find/Replace shell conveniences. |
| 2026-07-01 | MFC.2 | Complete | Removed duplicate previous/next/case/whole-word/regex toolbar controls, removed custom `searchHighlights` decoration path, and updated smoke coverage to assert Monaco-native Find/Replace widget visibility. |
| 2026-07-01 | MFC.4 | Complete | Updated Monaco-first strategy, online editor solution, cleanup plan/progress, and final verification evidence. |

## Slice status

| Slice | Status | Evidence |
|---|---|---|
| MFC.1 — Wrapper command bridge and option profiles | Complete | `npm run typecheck:web` passed after implementation. |
| MFC.2 — Remove duplicate search UI/state | Complete | `npm run typecheck:web` passed; online editor smoke passed on isolated port 5177. |
| MFC.3 — Preferences and performance tuning | Deferred | Existing font size/theme preferences preserved; minimap/word-wrap/sticky-scroll user preferences remain future work. |
| MFC.4 — Documentation and verification closure | Complete | Documentation updated and final verification set passed. |

## Verification log

Current branch verification:

| Date | Command | Result | Notes |
|---|---|---|---|
| 2026-07-01 | `npm run typecheck:web` | Pass | Validated Monaco wrapper/profile/search UI TypeScript changes. |
| 2026-07-01 | `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-online-editor.smoke.mjs` via isolated dev server | Pass | Validated tabs, minimize/restore/maximize, Monaco-native Find/Replace widget entry, save/reload/close/conflict/capacity flows. |
| 2026-07-01 | `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-online-editor-responsive.smoke.mjs` via isolated dev server | Pass | Validated responsive online editor behavior after profile/search cleanup. |
| 2026-07-01 | `npm run typecheck` | Pass | Validated repository TypeScript project. |
| 2026-07-01 | `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-text-editor.smoke.mjs` via isolated dev server | Pass | Guarded existing File Manager text editor path. |
| 2026-07-01 | `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-file-operations.smoke.mjs` via isolated dev server | Pass | Guarded File Manager file operations. |
| 2026-07-01 | `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-mobile-layout.smoke.mjs` via isolated dev server | Pass | Guarded mobile File Manager layout. |

## Known constraints

- Do not introduce new dependencies.
- Do not use Monaco private/internal APIs.
- Do not enter standalone IDE Workbench scope.
- Keep M1.x save safety and dirty-close behavior intact.
- Port `5176` may be occupied by a long-running dev runtime; use isolated `5177` smoke verification when needed.

## Next action

1. Commit MFC.1–MFC.2 cleanup with Lore protocol.
2. Use a later branch/slice for MFC.3 preferences only if product explicitly wants minimap / word-wrap / sticky-scroll controls.
