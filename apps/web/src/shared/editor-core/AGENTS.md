# Shared editor-core rules

This file applies under `apps/web/src/shared/editor-core/`.

## Role

`editor-core` is shared lower-level logic for file identity, language resolution, dirty state, file metadata, save/conflict semantics and editor service contracts.

## Boundaries

- Keep this layer UI-shell agnostic. It must not import File Manager, IDE Workbench, React view components, Dockview, or xterm.
- Do not store full file contents in shared React/global state. Text buffers belong in Monaco models.
- Preserve stable document identity rules across File Surface and future IDE Workbench.
- Keep functions small, typed, and testable; avoid generic managers unless two real call sites need the boundary now.

## Required docs before changes

- `docs/ide-code-editor-solution/02-共享内核与总体架构.md`
- `docs/ide-code-editor-solution/05-前端实现方案.md`
- capability-specific docs for the caller surface.

## Verification

- `npm run typecheck:web` for frontend-only changes.
- `npm run typecheck` when shared types affect root TypeScript.
- Add or update focused tests/smokes when changing dirty/save/conflict behavior.
