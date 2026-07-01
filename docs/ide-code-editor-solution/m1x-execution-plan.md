# M1.x Execution Plan — File Manager Online Editor Enhancements

Status: M1.x.1–M1.x.7 implemented / smoke-verified  
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

Status: Implemented / targeted verification passed on 2026-07-01.

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

- [x] Opening more than 8 files does not discard tabs automatically.
- [x] Dirty tabs cannot be lost without explicit user confirmation.
- [x] Tab strip remains usable when many files are open.
- [x] Maximize/minimize/restore/close are keyboard and mouse accessible.
- [x] Tab switch stores/restores Monaco view state for active tabs.

Suggested verification:

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
```

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke now covers maximize/restore, close-other-tabs, duplicate reopen, more-than-8 tabs, and horizontal overflow.
- `npm run smoke:file-manager:online-editor-responsive` — pass; existing mobile/light and desktop/dark coverage remains stable.

### M1.x.2 — Save safety and conflict contract

Status: Core implemented / targeted verification passed on 2026-07-01.

Goal: prevent silent overwrites when files are changed externally.

Frontend scope:

- [x] Track read-time file metadata: `modifiedAt`, size.
- [x] Before active-tab save, compare current backend metadata against the tab's last read/saved metadata.
- [x] If a dirty tab changed externally: show explicit conflict state.
- [x] Conflict actions:
  - [x] compare/diff lightweight side-by-side view,
  - [x] reload from disk,
  - [x] overwrite,
  - [x] cancel.
- [x] Save failure keeps dirty content and remains retryable.

Backend/API scope:

- [x] Extend write contract with expected concurrency tokens:
  - `expectedModifiedAt`,
  - `expectedSize`,
  - `force`.
- [x] Backend rejects stale writes with typed `file_write_conflict` / HTTP 409 instead of allowing silent overwrite.
- [x] Write response returns updated `modifiedAt` and `size` for the next save token.

Acceptance:

- [x] External modification cannot be overwritten silently by a dirty editor tab.
- [x] Conflict UI names the file and gives reload/overwrite/cancel choices.
- [x] Forced overwrite is explicit.
- [x] Existing M1 save behavior remains unchanged for non-conflicting files.
- [x] Conflict compare is available as a lightweight local-vs-disk side-by-side view; Monaco Diff remains optional future polish, not required for M1.x safety.

Suggested verification:

```bash
npm run typecheck:web
npm run typecheck
npm run smoke:file-manager:online-editor
npm run test:files-write-conflict # focused API/service test for stale expectedModifiedAt/version rejection
```

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke covers backend stale expected-token 409 rejection, external modification conflict detection, dirty buffer retention, lightweight compare view, and explicit forced overwrite.
- `npm run smoke:file-manager:online-editor-responsive` — pass.

### M1.x.3 — Reload and close-confirm improvements

Status: Core implemented / targeted verification passed on 2026-07-01.

Goal: turn destructive editor actions into clear decisions.

Scope:

- [x] Current file reload button.
- [x] Reload dirty file confirmation:
  - save first,
  - discard and reload,
  - cancel.
- [x] Close tab/editor confirmation:
  - save,
  - do not save,
  - cancel.
- [x] Multi-dirty close-all confirmation:
  - save all,
  - discard all,
  - cancel.
- [x] Confirmation UI uses app UI rather than `window.confirm` for multi-action decisions.

Acceptance:

- [x] User can cancel every destructive path.
- [x] User can save from close/reload confirmation.
- [x] Failed save during close keeps the editor open and dirty.

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke covers dirty reload cancel/discard and close confirm cancel/discard/save.
- `npm run smoke:file-manager:online-editor-responsive` — pass.

### M1.x.4 — Status bar and file metadata

Status: Implemented / targeted verification passed on 2026-07-01.

Goal: make file state visible without turning the surface into a full IDE.

Scope:

- [x] Existing status: path, language, cursor, save/read-only.
- [x] Add:
  - line ending: LF / CRLF / Mixed / None,
  - indentation: Spaces N / Tabs / unknown,
  - encoding: UTF-8 for current backend text decode path,
  - file size,
  - permissions/mode,
  - modified time,
  - read-only reason where possible.

Acceptance:

- [x] Status bar remains readable in light/dark themes and mobile widths.
- [x] Unknown metadata is displayed as unknown or omitted, not guessed.
- [x] Metadata comes from backend/read result or current editor buffer inspection where appropriate.

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke asserts line ending, indentation, encoding, size, permissions, mtime, and read-only reason.
- `npm run smoke:file-manager:online-editor-responsive` — pass.

### M1.x.5 — Search/replace control surface

Status: Implemented / targeted verification passed on 2026-07-01.

Goal: expose common search options without reimplementing Monaco search internals.

Scope:

- [x] Keep Monaco built-in find/replace as the search engine.
- [x] Add visible controls or affordances for:
  - previous/next match,
  - match count via Monaco find widget/hint rather than a second search state,
  - case sensitive,
  - whole word,
  - regex.
- [x] Keyboard paths remain Monaco-native for find/replace and next/previous.

Acceptance:

- [x] Search controls call Monaco actions instead of maintaining a second search implementation.
- [x] Regex/case/whole-word controls delegate to Monaco find widget actions, avoiding duplicated state.

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke clicks find/replace, previous/next, case-sensitive, whole-word, regex controls, and count hint.
- `npm run smoke:file-manager:online-editor-responsive` — pass.

### M1.x.6 — Theme and preferences

Status: Implemented / targeted verification passed on 2026-07-01.

Goal: make editor preferences explicit while preserving Aurora design tokens.

Scope:

- [x] Theme mode selector:
  - auto/system,
  - light,
  - dark.
- [x] Persist editor preferences:
  - font size,
  - theme mode,
  - optional word wrap/minimap choices if added.
- [x] Do not introduce a second styling system.

Acceptance:

- [x] Monaco theme follows selected editor mode.
- [x] UI chrome remains mapped to existing design tokens.
- [x] Preferences survive reload.

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke persists font size/theme mode to localStorage and verifies the explicit theme mode selector.
- `npm run smoke:file-manager:online-editor-responsive` — pass; responsive smoke verifies the theme selector remains available in mobile light and desktop dark contexts.

### M1.x.7 — File Manager entry points

Status: Implemented / targeted verification passed on 2026-07-01.

Goal: make editing discoverable without adding IDE scope.

Scope:

- [x] Context menu action: Edit.
- [x] File list row action: Edit.
- [x] Top/toolbar action: Open in editor when a single text-like file is selected.
- [x] Keyboard path: Enter already opens text-like files in the editor; Ctrl/Cmd+Enter now opens the selected file in editor/preview without conflicting with Alt+Enter properties.
- [x] Optional independent `/file-editor?...` route deferred because it overlaps with future Workbench routing.

Acceptance:

- [x] Non-text files continue to open preview, not Online Editor.
- [x] Edit actions are visible and touch-accessible.
- [x] Existing File Manager operations still work.

Verification recorded:

- `npm run typecheck:web` — pass.
- `npm run typecheck` — pass.
- `npm run smoke:file-manager:online-editor` — pass; smoke covers row edit, context-menu edit, selected-file toolbar edit, Ctrl/Cmd+Enter, backend 409 conflict, and existing editor flows.
- `npm run smoke:file-manager:online-editor-responsive` — pass.

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

## Decisions resolved for M1.x

| Decision | M1.x resolution | Future note |
|---|---|---|
| Conflict token | Use `modifiedAt` + `size`, with backend 409 `file_write_conflict` and explicit `force` overwrite. | A backend version/hash can replace or supplement this later. |
| Compare UI | Provide a lightweight local-vs-disk side-by-side compare inside the Online Editor conflict flow. | Monaco Diff remains optional future polish; no Problems/Output panels in M1.x. |
| Confirmation UI | Use app UI for save/discard/cancel destructive paths. | Keep `window.confirm` only for browser unload protection. |
| Tab overflow | No hard discard cap; tabs shrink to minimum width and then horizontal scroll. | Any future performance cap must block with explanation, never auto-close dirty tabs. |
| Independent route | Defer `/file-editor?...` because it overlaps with future Workbench routing. | Revisit with M2/M3 routing and persistence decisions. |


## Final verification note

The final smoke verification was run on isolated port `5177` with `TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177` because port `5176` was already occupied by an existing dev runtime using an external API. This avoids false positives from stale API state while preserving the same dev-web-smoke server path.


## Post-M1.x direction — Monaco-first cleanup

M1.x 的功能闭环已经完成。下一阶段不应继续增加外围编辑器功能按钮，而应按 `10-monaco-first-online-editor-strategy.md` 执行 Monaco-first cleanup：

- 保留 Tracevane-owned 文件生命周期能力：tabs、dirty、save/reload/close、conflict、metadata、entry points、background residency。
- 删除或降级重复 Monaco Find widget 的外围状态和按钮。
- 引入 Monaco option profiles：`normal` / `large-readonly` / `mobile-basic`。
- 通过 Monaco actions/options/context menu/provider/diff editor 开启编辑器原生能力。
- 继续保持 M1.x smoke verification set。
