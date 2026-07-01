# M1 Execution Plan — File Manager Online Editor

Status: Verified / ready for commit  
Branch: `feat/file-manager-online-editor-m1`  
Updated: 2026-07-01

## Objective

Ship a reliable File Manager Online Editor for quick text/code edits while creating the minimum shared editor core needed by the later Standalone IDE Workbench.

M1 implementation is now verified and ready for commit. The completed scope is tracked in `m1-progress.md`; strict external-modification conflict detection remains a documented follow-up because the current Files write API does not yet accept an expected mtime/version token.

M1 must improve the File Manager editing experience without pretending to be a full IDE.

## Non-negotiable boundaries

- Do not build the standalone IDE route in M1.
- Do not add terminal, Git, LSP, task runner, debug, or fake placeholders that imply those capabilities work.
- Do not hand-write a docking layout.
- Do not add new dependencies unless explicitly approved.
- Do not keep full file content as long-lived app state when Monaco models should own the buffer.
- Do not let File Manager components create/dispose arbitrary Monaco models directly once the shared core exists.
- Do not make `FilePreviewPanel` the permanent multi-tab editor shell.

## Recommended branch and PR shape

Primary branch:

```bash
git checkout -b feat/file-manager-online-editor-m1
```

Recommended PR slices:

1. `editor-core-foundation`
2. `online-editor-shell`
3. `online-editor-save-dirty-tabs`
4. `online-editor-search-status-mobile`
5. `online-editor-smoke-boundaries`

If using a single PR, keep commits separated by these same slices.

## Work breakdown

### Slice 1 — Baseline and editor-core foundation

Goal: understand current behavior, protect it, and introduce shared primitives without changing product behavior broadly.

Likely files:

- `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
- `apps/web/src/shared/file-editor/FileEditor.tsx`
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx`
- `apps/web/src/lib/api/files.ts`
- `apps/web/src/lib/query/files.ts`
- New: `apps/web/src/shared/editor-core/*`

Expected outputs:

- Shared editor types.
- Language resolver reusing current CodeEditor language helpers.
- Thin file/read/save adapters over existing Files API.
- Dirty state model usable by multi-tab editor.
- Monaco model lifecycle plan or first implementation.

Acceptance:

- Existing File Manager behavior still works.
- No new dependency.
- Typecheck passes.

### Slice 2 — Online Editor shell

Goal: separate Online Editor product shell from File Preview.

Likely files:

- New: `apps/web/src/features/file-manager/online-editor/FileEditorDialog.tsx`
- New: `apps/web/src/features/file-manager/online-editor/FileEditorTabs.tsx`
- New: `apps/web/src/features/file-manager/online-editor/FileEditorToolbar.tsx`
- New: `apps/web/src/features/file-manager/online-editor/FileEditorStatusBar.tsx`
- Integration: `apps/web/src/features/file-manager/FileManagerPage.tsx`

Expected outputs:

- Fullscreen-friendly Dialog or equivalent Online Editor container.
- Multi-tab state.
- Duplicate open activates existing tab.
- Dirty tab close confirmation.

Acceptance:

- Text file opens from File Manager into Online Editor.
- Multiple tabs work.
- File Preview remains bounded and does not become the main editor shell.

### Slice 3 — Save, save-all, dirty, close protection

Goal: make editing safe and predictable.

Expected outputs:

- Save current tab.
- Save all dirty tabs.
- Dirty markers in tabs/status bar.
- Save failure keeps dirty content.
- Before-unload guard for dirty tabs.
- Close editor dirty confirmation.

Acceptance:

- Save success clears dirty state.
- Save failure does not lose content.
- Unsaved close paths are guarded.

### Slice 4 — Search, goto, status, responsive UX

Goal: reach M1 usability baseline.

Expected outputs:

- Find in active file.
- Replace where editable.
- Goto line.
- Font size control.
- Status bar: path/name, language, cursor, save, read-only.
- Mobile-safe action layout.

Acceptance:

- Keyboard paths exist for major actions.
- Touch alternatives exist for actions that might otherwise require right-click/hover.
- Light and dark theme remain readable.

### Slice 5 — Boundary states and smoke coverage

Goal: verify edge cases and prevent regressions.

Expected outputs:

- Explicit non-text/binary state.
- Large/truncated read-only state.
- Read-only permission state.
- Conflict/external modification contract or explicit staged limitation.
- New or updated smoke test for Online Editor.

Likely files:

- `tests/file-manager/file-manager-online-editor.smoke.mjs`
- `package.json` script if a new smoke command is added.

Acceptance:

- Required smoke/typecheck commands pass.
- Verification evidence is logged in `m1-progress.md`.

## Suggested verification commands

Baseline / standard:

```bash
npm run typecheck
npm run typecheck:web
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:file-operations
npm run smoke:file-manager:selection
```

Expected new command:

```bash
npm run smoke:file-manager:online-editor
```

Run additional File Manager smoke commands when touched behavior overlaps upload, content index, list preferences, large directory, or mobile layout.

## Supporting agent lanes

### QA lane

Write scope:

- `tests/file-manager/*`
- package scripts only when needed for a new smoke command.

Do not edit product code unless explicitly assigned.

Deliverables:

- Online editor smoke test.
- Edge-case checklist.
- Verification notes for desktop/mobile.

### Design review lane

Default: read-only.

Review against:

- `docs/界面设计守则.md`
- `DESIGN.md`
- `docs/ide-code-editor-solution/03-文件管理器在线编辑器方案.md`

Deliverables:

- Findings grouped by blocker / should-fix / polish.
- Specific references to UI state, mobile path, theme, focus, and terminology.

### API/security lane

Default: read-only until implementation owner asks for a bounded change.

Review:

- Path/root guard.
- Write permission enforcement.
- Large/binary behavior.
- Save conflict contract: mtime/version/hash.

Deliverables:

- Minimal API recommendation.
- Any required backend changes with exact scope.

### Code review lane

Default: read-only.

Review:

- No duplicate dirty/save systems.
- No over-engineered framework abstractions.
- No new dependencies.
- No M1/M2 boundary mixing.
- Monaco model disposal and view state.
- Tests correspond to acceptance criteria.

Deliverables:

- Required fixes before merge.
- Known risks / not-tested gaps.

## Completion status

M1 has completed the planned implementation and verification scope:

- File Manager text-like files open in the Online Editor.
- Lightweight Monaco multi-tab editing works, including duplicate-open reuse.
- Current save, Save All, dirty markers, dirty close protection, and beforeunload protection are implemented.
- The Online Editor can minimize to a resident dock and restore existing tabs.
- Find, replace, goto line, font size, theme entry, and status bar are implemented.
- Boundary states cover non-text defensive reads, large/truncated read-only files, missing/deleted files, save failures, and unauthorized write guard evidence.
- Responsive/theme smoke covers mobile light and desktop dark editor surfaces.
- Final verification commands are recorded in `m1-progress.md`.

Known follow-up: strict save conflict prevention requires a backend write contract extension with expected mtime/version/hash; M1 documents this instead of presenting it as complete.

## Completion report template

Use this format when M1 or a PR slice completes:

```md
## Scope completed

- ...

## Changed files

- `path` — why changed

## Verification

- `command` — pass/fail, key output
- Manual desktop check — pass/fail
- Manual mobile/responsive check — pass/fail
- Light/dark theme check — pass/fail

## Not tested / risks

- ...

## Next step

- ...
```

## Transition to M1.x

M1 is verified and ready for commit. Further file-manager-editor work should continue in `m1x-execution-plan.md` instead of expanding the M1 baseline.

M1.x starts with window/tab ergonomics, especially maximize/restore controls and scalable tabs that shrink then horizontally scroll instead of enforcing a destructive hard cap.

## Commit message reminder

Follow the Lore Commit Protocol from `AGENTS.md`. Intent line first, then useful trailers such as:

```txt
Confidence: high
Scope-risk: narrow
Tested: npm run typecheck; npm run smoke:file-manager:online-editor
Not-tested: real external modification conflict with concurrent editor session
```
