# M1.x Execution Plan — File Manager Online Editor Enhancements

Status: Proposed / next after verified M1  
Branch suggestion: `feat/file-manager-online-editor-m1x`  
Updated: 2026-07-01

## Objective

Continue strengthening the File Manager Online Editor after the verified M1 baseline, without entering the standalone IDE Workbench scope.

M1.x should make the online editor feel complete for everyday file-manager editing: safer saves, richer tab/window behavior, clearer file metadata, better search controls, and more entry points.

## Scope boundary

M1.x is still the File Manager Online Editor track.

### In scope

- Better editor window controls: minimize, maximize/restore, close, and optional remembered window mode.
- More complete tab operations and scalable tab strip behavior.
- Save safety around external modification, reload, overwrite, and conflict presentation.
- Better close-confirm flows that can save, discard, or cancel.
- Current-file refresh/reload flows.
- Status bar metadata expansion.
- Search/replace control surface around Monaco capabilities.
- Explicit theme mode controls.
- More File Manager entry points for editing.

### Out of scope

- Standalone `/ide` Workbench.
- Dockview editor groups and layout persistence.
- Real terminal, task runner, Git, LSP, diagnostics, debug, Problems/Output panels.
- Multi-editor split groups.
- A fake command palette that implies full IDE capability.

## Recommended delivery slices

### M1.x.1 — Window and tab ergonomics

Goal: make the Online Editor shell behave like a robust file-manager editor window.

Scope:

- Window controls:
  - minimize to resident dock,
  - maximize/restore,
  - close with dirty guard,
  - clear labels and aria names for all controls.
- Tab operations:
  - close current,
  - close other tabs,
  - close all,
  - close saved tabs,
  - dirty-aware confirmations.
- Scalable tab strip:
  - allow more than 8 open tabs,
  - tabs shrink down to a minimum readable width,
  - once minimum width is reached, horizontal scroll takes over,
  - never silently discard a dirty tab to enforce capacity.
- Active tab view state:
  - preserve cursor position,
  - preserve selection,
  - preserve scroll position,
  - restore view state on tab switch and minimize/restore.

Acceptance:

- Opening more than 8 files does not discard tabs automatically.
- Dirty tabs cannot be lost without explicit user confirmation.
- Tab strip remains usable when many files are open.
- Maximize/minimize/restore/close are keyboard and mouse accessible.
- Tab switch restores cursor/selection/scroll for at least common text files.

Suggested verification:

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
```

### M1.x.2 — Save safety and conflict contract

Goal: prevent silent overwrites when files are changed externally.

Frontend scope:

- Track read-time file metadata: `modifiedAt`, size, hash/version if available.
- Before save, compare current backend metadata against the tab's last read/saved metadata.
- If a clean tab changed externally: offer reload.
- If a dirty tab changed externally: show explicit conflict state.
- Conflict actions:
  - compare,
  - reload from disk,
  - overwrite,
  - cancel.
- Save failure should keep dirty content and remain retryable.

Backend/API scope:

- Extend write contract with an expected concurrency token, for example:
  - `expectedModifiedAt`, or
  - `expectedVersionId`, or
  - `expectedHash`.
- Backend rejects stale writes with a typed conflict error instead of allowing silent overwrite.
- Response should include current metadata for conflict UI.

Acceptance:

- External modification cannot be overwritten silently by a dirty editor tab.
- Conflict UI names the file and gives compare/reload/overwrite/cancel choices.
- Forced overwrite is explicit.
- Existing M1 save behavior remains unchanged for non-conflicting files.

Suggested verification:

```bash
npm run typecheck:web
npm run typecheck
npm run smoke:file-manager:online-editor
npm run test:files-write-conflict # focused API/service test for stale expectedModifiedAt/version rejection
```

### M1.x.3 — Reload and close-confirm improvements

Goal: turn destructive editor actions into clear decisions.

Scope:

- Current file reload button.
- Reload dirty file confirmation:
  - save first,
  - discard and reload,
  - cancel.
- Close tab/editor confirmation:
  - save,
  - do not save,
  - cancel.
- Multi-dirty close-all confirmation:
  - save all,
  - discard all,
  - cancel.
- Confirmation UI should be an app dialog, not only `window.confirm`, when multiple actions are needed.

Acceptance:

- User can cancel every destructive path.
- User can save from close/reload confirmation.
- Failed save during close keeps the editor open and dirty.

### M1.x.4 — Status bar and file metadata

Goal: make file state visible without turning the surface into a full IDE.

Scope:

- Existing status: path, language, cursor, save/read-only.
- Add:
  - line ending: LF / CRLF,
  - indentation: Spaces 2 / Spaces 4 / Tab Size N,
  - encoding when known,
  - file size,
  - permissions/mode,
  - modified time,
  - read-only reason where possible.

Acceptance:

- Status bar remains readable in light/dark themes and mobile widths.
- Unknown metadata is displayed as unknown or omitted, not guessed.
- Metadata comes from backend/read result or Monaco model inspection where appropriate.

### M1.x.5 — Search/replace control surface

Goal: expose common search options without reimplementing Monaco search internals.

Scope:

- Keep Monaco built-in find/replace as the search engine.
- Add visible controls or affordances for:
  - previous/next match,
  - match count where feasible,
  - case sensitive,
  - whole word,
  - regex.
- Keyboard paths:
  - Ctrl/Cmd+F find,
  - Ctrl/Cmd+H replace,
  - Enter / Shift+Enter next/previous where appropriate.

Acceptance:

- Search controls call Monaco APIs instead of maintaining a second search implementation.
- Regex/case/whole-word state does not desynchronize with Monaco find widget.

### M1.x.6 — Theme and preferences

Goal: make editor preferences explicit while preserving Aurora design tokens.

Scope:

- Theme mode selector:
  - auto/system,
  - light,
  - dark.
- Persist editor preferences:
  - font size,
  - theme mode,
  - optional word wrap/minimap choices if added.
- Do not introduce a second styling system.

Acceptance:

- Monaco theme follows selected editor mode.
- UI chrome remains mapped to existing design tokens.
- Preferences survive reload.

### M1.x.7 — File Manager entry points

Goal: make editing discoverable without adding IDE scope.

Scope:

- Context menu action: Edit.
- File list row action: Edit.
- Top/toolbar action: Open in editor when a text-like file is selected.
- Keyboard path: Enter or Ctrl/Cmd+Enter where it does not conflict with existing File Manager behavior.
- Optional independent `/file-editor?...` route should be planned separately if it requires routing/persistence changes.

Acceptance:

- Non-text files continue to open preview, not Online Editor.
- Edit actions are visible and touch-accessible.
- Existing File Manager operations still work.

## Recommended sequencing

1. M1.x.1 window/tab ergonomics first.
2. M1.x.2 save conflict contract second, because it may require backend API changes.
3. M1.x.3 reload/close confirmations after conflict actions are known.
4. M1.x.4–M1.x.6 metadata/search/preferences can proceed independently after tab ergonomics.
5. M1.x.7 entry points should be last in a slice, after the editor behavior is safe.

## Test strategy

Maintain the M1 verification set and add targeted smoke coverage per slice.

Baseline verification set:

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:file-operations
npm run smoke:file-manager:mobile-layout
npm run typecheck
```

Additional M1.x smoke scenarios:

- Many tabs open: 8, 12, 20 files; no silent discard; horizontal tab scroll usable.
- Dirty many-tab close all: save all / discard all / cancel.
- Maximize/minimize/restore with multiple dirty tabs.
- View state restore after tab switch and minimize/restore.
- Reload current file: clean reload and dirty reload cancel/discard/save.
- External conflict: stale expected metadata rejection and conflict UI.
- Theme preference persistence across reload.
- Context menu / row action / toolbar action entry points.

## Documentation updates required per slice

- Update this file with slice status.
- Update `m1-progress.md` verification log and known risks.
- Update `03-文件管理器在线编辑器方案.md` if product behavior changes.
- Update `06-后端服务与接口方案.md` when save conflict API changes.
- Update `08-实施阶段验收与风险.md` if scope moves between M1.x and M2.

## Open decisions

| Decision | Options | Recommendation |
|---|---|---|
| Conflict token | `modifiedAt`, version id, hash | Prefer backend-generated version/hash if available; otherwise start with `modifiedAt` plus size and document limits |
| Compare UI | Monaco diff editor in dialog, separate panel, later M4 | Use Monaco diff inside the Online Editor conflict flow; do not add Problems/Output panels |
| Confirmation UI | `window.confirm`, app modal | Use app modal for save/discard/cancel; keep `window.confirm` only for simple one-choice discard guards |
| Tab overflow | hard cap, shrink, scroll | No hard discard cap; shrink to min width then horizontal scroll |
| Independent route | include in M1.x, defer to M2 | Defer unless a direct product need appears; it may overlap with Workbench routing |
