# Monaco-first Cleanup Plan — File Manager Online Editor

Status: MFC.1–MFC.4 complete
Branch: `feat/file-manager-online-editor-monaco-first-cleanup`
Created: 2026-07-01
Source strategy: `10-monaco-first-online-editor-strategy.md`

## Objective

Simplify the File Manager Online Editor so Monaco owns editor-native behavior while Tracevane owns file lifecycle and product shell behavior.

The cleanup should reduce duplicated editor UI/state, improve performance profiles, and keep all M1.x save safety and multi-tab behavior intact.

## Product principle

```txt
Monaco owns editing behavior.
Tracevane owns files, tabs, persistence, conflicts, and product shell.
```

## Scope boundary

### In scope

- Remove duplicated single-file search/replace state and toolbar controls that Monaco already provides.
- Keep thin shell entry points for Monaco Find / Replace / Goto.
- Add explicit editor profiles:
  - `normal`
  - `large-readonly`
  - `mobile-basic`
- Centralize Monaco editor option construction.
- Keep Monaco language contributions lazy-loaded.
- Keep worker configuration intact.
- Keep stable file-backed model URIs.
- Preserve tab view state, dirty state, save/reload/close/conflict flows.
- Update tests to assert Monaco-native widgets/actions rather than Tracevane-owned duplicate toggles.
- Keep M1.x verification set green.

### Out of scope

- Standalone `/ide` Workbench.
- Dockview editor groups or split editor groups.
- Terminal, Git, LSP, debug, Problems/Output panels.
- VS Code extension compatibility.
- New dependencies.
- Monaco private/internal APIs.
- Full desktop Monaco behavior guarantee on mobile browsers.

## Current cleanup candidates

### CodeEditor wrapper

Current files:

- `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
- `apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx`

Candidates:

- Replace per-find-toggle methods with a generic `runAction(actionId)` bridge.
- Keep convenience helpers only for shell-level actions:
  - `openFind`
  - `openReplace`
  - `gotoLine`
  - `saveViewState`
  - `restoreViewState`
  - `layout`
- Remove `searchHighlights` unless a cross-file search result feature explicitly needs it.
- Remove custom search decoration collection if only used for local find/replace duplication.
- Build options through a single `buildMonacoEditorOptions` helper.

### Online Editor toolbar

The toolbar previously had transitional controls for Monaco Find widget toggles.

Cleanup target:

Keep:

- Save
- Save All
- Reload
- Find
- Replace
- Goto
- Font size
- Theme mode
- Monaco option preferences: minimap, word wrap, sticky scroll

Remove / delegate to Monaco widget:

- Previous match
- Next match
- Case sensitive
- Whole word
- Regex
- Custom match count hint

### Conflict compare

Current M1.x lightweight compare is acceptable.

Future enhancement path:

- If richer diff is needed, use `monaco.editor.createDiffEditor`.
- Do not build a custom diff renderer.
- Keep lightweight compare as fallback for mobile/basic mode.

## Delivery slices

### MFC.1 — Wrapper command bridge and option profiles

Status: Implemented 2026-07-01.

Goal: make `CodeEditor` an explicit Monaco host instead of a growing custom editor abstraction.

Tasks:

- Add `CodeEditorProfile = "normal" | "large-readonly" | "mobile-basic"`.
- Add `buildMonacoEditorOptions(...)`.
- Include `largeFileOptimizations: true` in all profiles.
- Move existing Monaco construction options into the helper.
- Add `runAction(actionId: string)` to `CodeEditorHandle`.
- Keep `openFind`, `openReplace`, `gotoLine` as thin conveniences.
- Ensure editor/model/listener disposal remains unchanged or simpler.

Acceptance:

- Typecheck passes.
- Existing editor render smoke passes.
- Normal profile keeps Monaco native editing features enabled.
- Large-readonly profile disables expensive UI such as minimap/custom decorations.
- Mobile-basic profile remains compatible with existing responsive smoke.

### MFC.2 — Remove duplicate search UI/state

Status: Implemented 2026-07-01.

Goal: rely on Monaco’s Find/Replace widget for single-file search.

Tasks:

- Remove toolbar buttons for previous/next/case/whole-word/regex.
- Remove custom match-count hint.
- Remove `searchHighlights` prop/path if not used elsewhere.
- Remove custom search decoration code if no remaining caller needs it.
- Keep Find and Replace buttons that call Monaco actions.
- Update smoke tests to assert Monaco Find/Replace widgets open rather than duplicate Tracevane controls.

Acceptance:

- Monaco Find opens from toolbar and Ctrl/Cmd+F.
- Monaco Replace opens from toolbar.
- No Tracevane-owned local-find state exists for single-file search.
- Save/reload/close/conflict smoke still passes.

### MFC.3 — Preferences and performance tuning

Status: Implemented 2026-07-01.

Goal: expose only preferences that map directly to Monaco options and are worth product ownership.

Tasks:

- Keep existing font size and theme mode preferences.
- Add persisted Monaco option preferences for:
  - minimap
  - word wrap
  - sticky scroll
- Default conservatively for File Manager density.
- Disable expensive options in large-readonly profile.
- Document preference storage shape if changed.

Acceptance:

- Preferences survive reload.
- Large/truncated files remain protected.
- No new styling system is introduced.
- Light/dark/auto remains readable.

### MFC.4 — Documentation and verification closure

Status: Complete.

Goal: leave repo docs aligned with Monaco-first implementation.

Tasks:

- Update `10-monaco-first-online-editor-strategy.md` with implementation status.
- Update this plan with completed checkboxes.
- Update `monaco-first-cleanup-progress.md` with verification evidence.
- Update `03-文件管理器在线编辑器方案.md` if toolbar behavior changes.
- Update smoke docs if selectors change.

Acceptance:

- Documentation reflects actual UI behavior.
- Verification set passes.
- No unreviewed scope creep into Workbench/IDE.

## Verification set

Run after each meaningful slice:

```bash
npm run typecheck:web
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
```

Run before final commit:

```bash
npm run typecheck:web
npm run typecheck
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:file-operations
npm run smoke:file-manager:mobile-layout
```

If port `5176` is occupied, use isolated port verification:

```bash
python /home/binbin/.agents/skills/webapp-testing/scripts/with_server.py \
  --server "TRACEVANE_WEB_PORT=5177 exec bash scripts/dev-web-smoke.sh" \
  --port 5177 \
  -- env TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-online-editor.smoke.mjs
```

## Risk controls

| Risk | Control |
|---|---|
| Removing custom search UI hides discoverability | Keep Find / Replace toolbar entries and Monaco-native shortcuts |
| Monaco action ids differ by version | Use public API and smoke-test widgets/actions; avoid private internals |
| Large files become slow | Use `largeFileOptimizations`, profile-specific minimap/decorations limits |
| Mobile regressions | Keep responsive smoke and mobile-basic profile |
| Save safety regression | Keep M1.x conflict 409 and dirty-close smoke coverage |
| Monaco model leaks | Keep stable URI + explicit dispose; do not mount editors for every background tab |

## Initial implementation order

1. [x] MFC.1 option profile helper + `runAction` bridge.
2. [x] MFC.2 remove duplicate search controls/state.
3. [x] MFC.3 preference/performance profile tuning.
4. [x] MFC.4 docs + full verification.
