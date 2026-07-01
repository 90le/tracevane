# M2 Execution Plan — Unified File Surface & Monaco Completion

Status: Ready to implement
Branch: `feat/file-manager-file-surface-m2`
Created: 2026-07-01
Base: `main` after merging M1, M1.x, and Monaco-first cleanup
Source: `12-file-surface-unification-and-monaco-gap-plan.md`

## 1. Objective

M2 turns the File Manager file-opening experience into one unified File Surface.

```txt
All file-open intents use one window and one tab lifecycle.
Text/code -> Monaco.
Media/binary/unsupported -> preview/inspect panels inside the same surface.
No second legacy preview/editor window remains on the primary path.
```

M2 also closes the highest-priority Monaco gaps discovered after M1:

- Ctrl/Cmd+C/X/V in Monaco must not be stolen by File Manager shortcuts.
- Monaco UI should default to Chinese through zh-CN NLS loading.
- Monaco capability should be diagnostic and provider-aware, not overclaimed.
- Common Monaco languages should have sampled runtime highlighting coverage.

## 2. Scope

### In scope

- Fix editor clipboard shortcut isolation.
- Add smoke coverage for Monaco copy/paste staying inside the editor.
- Load Monaco zh-CN NLS before editor contributions.
- Add or update smoke coverage for Monaco localization.
- Introduce a unified File Surface routing model.
- Route double-click, right-click edit/check, row action, keyboard open, secondary dock, and content-index open through the same surface.
- Add media preview panels for image/video/audio/PDF using native browser primitives first.
- Add binary/unsupported inspector fallback.
- Remove old `FilePreviewPanel` from active file-open routes after migration.
- Update docs/tests to reflect one file window.

### Out of scope

- Standalone IDE workbench.
- Split editor groups / Dockview integration.
- Full LSP server integration.
- VS Code extension compatibility.
- Heavy media dependencies unless native preview is demonstrably insufficient.
- Promise that every Monaco action works in every language; provider availability remains language-specific.

## 3. Delivery slices

### M2.1 — Clipboard shortcut isolation

Priority: P0

Tasks:

- Extend File Manager shortcut ignore logic to treat Monaco/editor descendants as editor-owned.
- Cover at least:
  - `[data-editor-shortcuts="ignore"]`
  - `[data-code-editor="monaco-direct"]`
  - `.monaco-editor`
  - `.find-widget`
  - `.suggest-widget`
  - `.context-view`
- Add `smoke:file-manager:monaco-clipboard`.
- Verify Ctrl/Cmd+C then Ctrl/Cmd+V inside Monaco does not close/remount the editor or open copy/move dialogs.

Acceptance:

- Monaco text copy/paste works.
- File Manager file clipboard still works when focus is on the file list.
- `npm run smoke:file-manager:online-editor` still passes.

### M2.2 — Monaco zh-CN localization

Priority: P0

Tasks:

- Load `monaco-editor/esm/nls.messages.zh-cn.js` before Monaco editor modules/contributions.
- Keep fallback safe if locale bundle loading fails.
- Add `smoke:file-manager:monaco-nls` or extend existing online-editor smoke.

Acceptance:

- Monaco UI surfaces such as Find widget/context labels use Chinese where Monaco provides translations.
- Build and dynamic import behavior remain stable.

### M2.3 — Unified File Surface routing

Priority: P1

Tasks:

- Introduce `FileSurfaceTab` / `FileSurfaceMode` / `openFileSurface`.
- Replace `textLike ? openFileOnlineEditor : openFilePreview` branches on primary routes.
- Make all user file-open intents route to the same surface:
  - double-click/open;
  - right-click edit;
  - right-click check/inspect;
  - row action;
  - Ctrl/Cmd+Enter;
  - Space;
  - SecondaryDock open;
  - ContentIndex open;
  - bulk single-file edit/open.
- Keep text/code panel backed by Monaco.

Acceptance:

- There is one active file window lifecycle.
- Non-text files no longer open legacy preview from primary routes.
- Existing Monaco save/reload/conflict behavior remains intact for text files.

### M2.4 — Media and binary panels inside File Surface

Priority: P1

Tasks:

- Implement file classification for text/image/video/audio/pdf/binary/unsupported.
- Use native browser primitives first:
  - image: `<img>`;
  - video: `<video controls>`;
  - audio: `<audio controls>`;
  - PDF: `<object>` / `<iframe>` fallback;
  - binary: metadata/download/copy path/unsupported-safe message.
- Add `smoke:file-manager:media-preview`.

Acceptance:

- Common image/video/audio/PDF/binary fixtures open without frontend errors.
- Text/code still open Monaco and remain editable when safe.

### M2.5 — Remove legacy preview/editor conflict

Priority: P1

Tasks:

- Remove `LazyFilePreviewDialog` from File Manager active render path.
- Remove `previewTabs` / `activePreviewTabId` state after migration.
- Delete or quarantine obsolete `FilePreviewPanel` code once no route references it.
- Update smoke tests that previously asserted old preview behavior.

Acceptance:

- `grep FilePreviewPanel` shows no active File Manager runtime import.
- There is no separate legacy text/binary/file preview editor window.

### M2.6 — Monaco capability diagnostics and language sampling

Priority: P2

Tasks:

- Add a dev/test-only way to inspect `editor.getSupportedActions()` for the active Monaco instance.
- Add sampled highlighting smoke for common languages:
  - ts/html/css/json/md/python/yaml/shell/sql.
- Keep generated language loader tests.

Acceptance:

- Monaco action availability is observable in tests/debugging.
- Common language highlighting does not regress.

## 4. Verification plan

Run during slices:

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:monaco-highlighting
```

New target smokes:

```bash
npm run smoke:file-manager:monaco-clipboard
npm run smoke:file-manager:monaco-nls
npm run smoke:file-manager:file-surface-routing
npm run smoke:file-manager:media-preview
```

Before M2 completion:

```bash
npm run typecheck:web
npm run build:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:monaco-highlighting
npm run smoke:file-manager:monaco-clipboard
npm run smoke:file-manager:file-surface-routing
npm run smoke:file-manager:media-preview
node --test tests/system/monaco-language-loaders.test.mjs
```

## 5. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| FilePreviewPanel contains useful hidden preview behavior | Feature regression | migrate useful panels before deleting old shell |
| Monaco NLS import order is wrong | UI remains English | isolate Monaco bootstrap and test rendered labels |
| Clipboard shortcut fix blocks file-list copy/paste | File operations regression | smoke both editor focus and file-list focus |
| Media preview requires authenticated/blob URL | media cannot render | reuse/download endpoint first; add safe blob endpoint only if needed |
| PDF native preview inconsistent across browsers | partial support | document fallback; evaluate `pdfjs-dist` only after native gap is proven |

## 6. Definition of done

M2 is complete when:

- all file opening/editing/checking routes use one File Surface;
- Monaco is the only text/code editor;
- old preview/editor conflict is removed from active routes;
- Ctrl+C/V inside Monaco is stable;
- Monaco UI defaults to Chinese where Monaco provides translations;
- media/binary files have safe panels inside the same surface;
- verification commands pass with evidence recorded in `m2-progress.md`.
