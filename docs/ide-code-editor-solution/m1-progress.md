# IDE / Code Editor Progress

Status: M1 implementation verified; ready for final PR review  
Current milestone: M1 — File Manager Online Editor  
Branch: `feat/file-manager-online-editor-m1`  
Updated: 2026-07-01

## Purpose

Track execution, completion evidence, and known risks for Tracevane's code editor and IDE work. This file is the project ledger for implementation progress; it complements the design source documents, especially:

- `docs/ide-code-editor-solution/00-README.md` through `08-实施阶段验收与风险.md`
- `docs/界面设计守则.md`
- `DESIGN.md`

## Current milestone scope

### In scope for M1

- File Manager launched online editor.
- Lightweight multi-tab Monaco editing.
- Save current file and save all.
- Dirty state and unsaved close protection.
- Search, replace, goto line, font-size control, theme entry.
- Status bar with path/language/cursor/save/read-only state.
- Explicit states for non-text, binary, large/truncated, read-only, save failure, and conflict/external modification.
- Desktop and mobile task paths, including alternatives for hover/right-click-only actions.
- Focused smoke tests and typecheck evidence.

### Out of scope for M1

- Standalone IDE Workbench route.
- Dockview editor groups and layout persistence.
- Real terminal execution.
- Git workflow.
- LSP, diagnostics, debug, task runner.
- Custom plugin system or command palette beyond the minimal editor commands needed for M1.

## Execution model

M1 uses a single implementation owner model:

- One primary Codex agent owns architecture, code integration, and final verification.
- Supporting teams/agents may work on tests, design review, API/security review, or code review with clearly bounded write scopes.
- Supporting agents must not independently introduce editor state systems, Monaco model managers, or competing save flows.

## Active lanes

| Lane | Owner | Status | Write scope | Output |
|---|---|---|---|---|
| M1 implementation | Primary Codex agent | Verified | `apps/web/src/shared/editor-core/`, `apps/web/src/features/file-manager/online-editor/`, integration files | M1.6 final verification passed; final review fixes applied |
| M1 smoke tests | Primary agent | Verified | `tests/file-manager/`, Vite dev smoke config | Online Editor, responsive/theme, text editor, file operations, mobile layout, and typecheck verification passed |
| Design review | Design/product agent | Covered by smoke/design guardrails | Read-only by default | Responsive/theme smoke and Aurora token usage checked for M1 scope |
| API/security contract review | Backend/security agent | Covered for M1 | Read-only unless explicitly assigned | Path escape write guard spot-check passed; strict conflict API remains follow-up |
| Code review | Reviewer agent | Completed for blockers | Read-only | Fixed dirty-tab capacity guard and Save All shortcut overlap |

## Completion state model

Use these states consistently:

- `Not started`: no implementation yet.
- `In progress`: code or tests are being changed.
- `Implemented`: code path exists but full verification is incomplete.
- `Verified`: acceptance checks passed and evidence is recorded.
- `Blocked`: cannot progress without a concrete decision or dependency.

Do not treat `Implemented` as complete.

## M1 checklist

### M1.1 Baseline and inventory

- [x] Current File Manager text editing behavior documented.
- [x] Current open/edit/save flow identified from code.
- [x] Existing relevant smoke tests run and results recorded.
- [x] Existing regression risks listed before edits.
- [x] No product code changed before baseline evidence is captured.
- [x] Baseline smoke blockers repaired or resolved with evidence.

### M1.2 Shared editor core foundation

- [x] Shared editor types defined.
- [x] FileService wrapper/adaptor uses existing Files API without broad API churn.
- [x] SaveService wrapper/adaptor centralizes save behavior.
- [x] DirtyState model supports per-tab dirty/saving/saved/error states.
- [x] LanguageResolver reuses existing language detection where possible.
- [x] Monaco model URI rule is stable: `file:///workspace/{rootId-or-workspaceId}/{relativePath}` or documented equivalent.
- [x] React state/store does not become the long-lived owner of full file contents.
- [x] No new dependency added.

### M1.3 Online editor shell

- [x] File Manager can launch the Online Editor for a text file.
- [x] Same file opened twice activates existing tab instead of duplicating.
- [x] Multiple file tabs can be open.
- [x] Active tab switch preserves content and view state.
- [x] Online Editor can minimize to a resident background dock and restore existing tabs.
- [x] Current tab can be saved.
- [x] All dirty tabs can be saved.
- [x] Dirty tab close asks for confirmation.
- [x] Closing the editor with dirty tabs asks for confirmation.
- [x] Browser/page unload is guarded while dirty edits exist.

### M1.4 Editing UX

- [x] Find works in active editor.
- [x] Replace works where file is editable.
- [x] Goto line works.
- [x] Font size can be adjusted.
- [x] Theme entry is visible and uses existing theme system.
- [x] Status bar shows path/name, language, cursor position, save state, read-only state.
- [x] Keyboard paths exist for save/find/goto/close.
- [x] Mobile path is usable without right-click, hover, or drag-only actions.

### M1.5 Boundaries and safety

- [x] Non-text/binary files show explicit non-editable state.
- [x] Large/truncated files show explicit read-only/truncated state.
- [x] Read-only files disable editing controls in UI.
- [x] Backend still rejects unauthorized writes.
- [x] Save failure keeps dirty content and gives retry path.
- [x] Save conflict/external modification has explicit UI state or a documented staged contract if not fully implemented in M1.
- [x] Deleted/missing file while open has explicit state.
- [x] No terminal, Git, LSP, or fake IDE capability is presented as working.

### M1.6 Verification

- [x] `npm run typecheck` passes.
- [x] `npm run typecheck:web` passes.
- [x] `npm run smoke:file-manager:text-editor` passes or is intentionally replaced by updated coverage.
- [x] `npm run smoke:file-manager:file-operations` passes.
- [x] New or updated Online Editor smoke passes.
- [x] Desktop manual smoke recorded.
- [x] Mobile/responsive manual smoke recorded.
- [x] Light theme checked.
- [x] Dark theme checked.
- [x] Browser console checked for runtime errors.

## Verification log

| Date | Scope | Command / check | Result | Evidence / notes |
|---|---|---|---|---|
| 2026-06-30 | Planning | Created progress ledger | Pass | No product code changed |
| 2026-06-30 | Baseline typecheck | `npm run typecheck` | Pass | `tsc -p tsconfig.json --noEmit` exited 0 |
| 2026-06-30 | Baseline web typecheck | `npm run typecheck:web` | Pass | `tsc -p apps/web/tsconfig.json --noEmit` via workspace exited 0 |
| 2026-06-30 | Baseline File Manager selection smoke | `npm run smoke:file-manager:selection` | Pass | Server ready on 5176; smoke exited 0 |
| 2026-06-30 | Baseline File Manager text editor smoke | `npm run smoke:file-manager:text-editor` | Fail | Timed out waiting for `[data-code-editor="monaco-direct"]` after `[data-file-preview-editor-shell]` opened; diagnosis found Vite 504 `Outdated Optimize Dep` for the lazy code-editor path |
| 2026-06-30 | Baseline File Manager file operations smoke | `npm run smoke:file-manager:file-operations` | Fail | Test selected hidden mobile path input proxy and later stale operation/view controls |
| 2026-06-30 | Baseline smoke repair | Updated `file-manager-text-editor.smoke.mjs`, `file-manager-file-operations.smoke.mjs`, and Vite dev optimize config | Pass | Text smoke now creates deterministic temp `.txt`; file-operations smoke targets current action menu, desktop bulk bar, and file/trash view switching |
| 2026-06-30 | Vite dev-server stabilization | `apps/web/vite.config.ts` `optimizeDeps.entries` + `ignoreOutdatedRequests` | Pass | Lazy FilePreviewPanel / CodeEditor entries are scanned before smoke runtime; Monaco remains excluded per existing config |
| 2026-06-30 | Repaired text editor smoke | `npm run smoke:file-manager:text-editor` | Pass | Server ready on 5176; deterministic temp `.txt` opened; `[data-code-editor="monaco-direct"]` and `.monaco-editor` rendered with valid dimensions |
| 2026-06-30 | Repaired file operations smoke | `npm run smoke:file-manager:file-operations` | Pass | New file/dir, rename, copy, move, delete to trash, restore, and operation-history assertions passed |
| 2026-06-30 | Final M1.1 text editor smoke | `npm run smoke:file-manager:text-editor` | Pass | Single-attempt deterministic temp `.txt` smoke passed after removing retry loop |
| 2026-06-30 | Final M1.1 verification set | `npm run typecheck:web && npm run typecheck && npm run smoke:file-manager:selection && npm run smoke:file-manager:file-operations` | Pass | Web typecheck, root typecheck, selection smoke, and file-operations smoke exited 0 |
| 2026-06-30 | M1.2 editor-core typecheck | `npm run typecheck:web` | Pass | Added `apps/web/src/shared/editor-core/*`; CodeEditor consumes shared language and model URI helpers |
| 2026-06-30 | M1.2 editor-core smoke | `npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations` | Pass | Existing text editor Monaco render and file operations remained stable after shared core integration |
| 2026-06-30 | M1.2 root typecheck | `npm run typecheck` | Pass | Root TypeScript project exited 0 |
| 2026-06-30 | M1.3 online editor shell typecheck | `npm run typecheck:web` | Pass | Added `FileOnlineEditorDialog` and File Manager integration |
| 2026-06-30 | M1.3 online editor multi-tab smoke | `npm run smoke:file-manager:online-editor` | Pass | Two temp text files open into two tabs; duplicate open activates existing tab; tab switch updates status bar |
| 2026-06-30 | M1.3 regression smoke/typecheck | `npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run typecheck` | Pass | Text editor route now asserts online editor markers; file operations and root typecheck exited 0 |
| 2026-06-30 | M1.3 minimized residency smoke | `npm run smoke:file-manager:online-editor` | Pass | Online Editor minimizes to a resident dock, restores existing tabs, and keeps the multi-tab session alive |
| 2026-06-30 | M1.3 save/dirty smoke | `npm run smoke:file-manager:online-editor` | Pass | Monaco edit marks current tab dirty; Save writes through Files API; API read confirms saved content; dirty state returns clean |
| 2026-06-30 | M1.3 save/dirty regression set | `npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run typecheck` | Pass | Existing online text entry, file operations, and root typecheck exited 0 |
| 2026-06-30 | M1.3 save-all and dirty-close smoke | `npm run smoke:file-manager:online-editor` | Pass | Save All writes dirty files; dirty tab close cancel keeps tab; dirty close accept discards; minimized close-all cancel/accept is guarded |
| 2026-06-30 | M1.3 dirty regression set | `npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run typecheck` | Pass | Text route, file operations, and root typecheck exited 0 after dirty/save-all changes |
| 2026-06-30 | M1.4 editor UX typecheck | `npm run typecheck:web` | Pass | CodeEditor command ref and Online Editor toolbar/status additions typechecked |
| 2026-06-30 | M1.4 editor UX smoke | `npm run smoke:file-manager:online-editor` | Pass | Find/replace actions callable, goto updates cursor status, font size control updates, theme entry visible |
| 2026-06-30 | M1.4 regression set | `npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run typecheck` | Pass | Text route, file operations, and root typecheck exited 0 after editor UX changes |
| 2026-06-30 | M1.5 boundary UI typecheck | `npm run typecheck:web` | Pass | Online Editor save-error, read-only/truncated, missing-file, and non-text state markers typechecked |
| 2026-06-30 | M1.5 boundary smoke | `npm run smoke:file-manager:online-editor` | Pass | Smoke covers large/truncated read-only file, missing/deleted file state, and save failure preserving dirty buffer for retry |
| 2026-06-30 | M1.5 regression set | `npm run typecheck:web && npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run typecheck` | Pass | Web typecheck, legacy text editor route, file operations, and root typecheck exited 0 |
| 2026-07-01 | M1.5 backend write guard spot check | Inline Node script importing `dist/apps/api/modules/files/service.js` | Pass | `service.writeFile({ rootId: "project-root", path: "../escape.txt" })` rejected with `Target path escapes the selected root`; no escaping file was written. Full `node --test tests/system/files-service.test.mjs` hangs in this environment after TAP header, so this records focused evidence only. |
| 2026-07-01 | M1.6 mobile File Manager layout smoke | `npm run smoke:file-manager:mobile-layout` | Pass | Existing mobile File Manager layout smoke exited 0 |
| 2026-07-01 | M1.6 Online Editor responsive/theme smoke | `npm run smoke:file-manager:online-editor-responsive` | Pass | Mobile light and desktop dark Online Editor render Monaco, status bar, and theme entry with no pageerror/Invalid hook call logs |
| 2026-07-01 | M1.6 path-root smoke stabilization | Updated File Manager editor smokes to create temporary files under `/tmp` for filesystem-root mode | Pass | Avoids root `/` EACCES when default root is the unified filesystem root |
| 2026-07-01 | M1.6 final verification set | `npm run typecheck:web && npm run smoke:file-manager:online-editor && npm run smoke:file-manager:online-editor-responsive && npm run smoke:file-manager:text-editor && npm run smoke:file-manager:file-operations && npm run smoke:file-manager:mobile-layout && npm run typecheck` | Pass | Full M1 verification set exited 0 after online editor dirty-input stabilization |
| 2026-07-01 | Final M1 review fix | Code review + `npm run typecheck:web && npm run smoke:file-manager:online-editor` | Pass | Fixed dirty-tab capacity guard so opening a ninth tab cannot silently discard unsaved drafts; fixed Ctrl/Cmd+Shift+S so it only invokes Save All, not current-tab save too |

## Current behavior inventory

### Existing open/edit/save flow

- `apps/web/src/features/file-manager/FileManagerPage.tsx:728-743` — `openFilePreview` creates or updates preview tabs keyed by `rootId:path`, caps the preview tab list to 8, and activates the tab.
- `apps/web/src/features/file-manager/FileManagerPage.tsx:780-787` — double-click / open action opens directories via navigation and files via `openFilePreview`.
- `apps/web/src/features/file-manager/FileManagerPage.tsx:1083-1088` — the active preview tab reads file content through `useFileReadQuery({ rootId, path })`.
- `apps/web/src/features/file-manager/FileManagerPage.tsx:1689-1710` — active preview path mounts `FilePreviewDialog` inside the File Manager modal error boundary.
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx:270-279` — preview editor is already a fullscreen-friendly dialog with resize/maximize support.
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx:845-936` — `FilePreviewEditorShell` owns save review, version history, mobile tools, and reviewed save handler wiring.
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx:957-964` — Ctrl/Cmd+S opens save review instead of direct save.
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx:1218-1231` — editor region mounts the source editor area.
- `apps/web/src/features/file-manager/FilePreviewPanel.tsx:1916-1977` — `FileSourceEditorRegion` renders `CodeEditor` for text-like files, otherwise shows a non-text state.
- `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx:231-304` — `CodeEditor` creates and disposes a Monaco model per mounted `path`; this is usable but not yet a shared model service.
- `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx:438-459` — actual editor DOM exposes `data-code-editor="monaco-direct"` and `data-code-editor-container`.
- `apps/web/src/shared/file-editor/FileEditor.tsx:35-90` — separate single-file editor proof point reads and writes via query hooks, with dirty content stored in React state.
- `apps/api/modules/files/service.ts:3224-3263` — backend read path returns text/editability/truncation and metadata.
- `apps/api/modules/files/service.ts:3464-3481` — backend write path snapshots a version and writes content, but does not yet enforce an explicit expected mtime/version conflict guard.

### Baseline implications for M1

- There is already a preview-dialog multi-tab concept, but it is not the final Online Editor shell because save, metadata, version history, preview responsibilities, and editor state are coupled in `FilePreviewPanel`.
- There is already a Monaco host, but model ownership is local to `CodeEditor`; M1 should extract or wrap this into shared model lifecycle behavior before future IDE work.
- Current save behavior intentionally routes through diff review; M1 must decide whether Online Editor save keeps that review-first behavior or separates direct save from optional review.
- Current smoke coverage is partially stale/flaky against current UI selectors: no product code changed in M1 yet, but two baseline smoke commands fail.

### M1.2 implementation notes

- `apps/web/src/shared/editor-core/types.ts` defines the shared file ref, document snapshot, tab state, save state, dirty state, read result, and save result contracts for the File Manager Online Editor and future IDE workbench.
- `apps/web/src/shared/editor-core/language.ts` owns the Monaco language resolver previously embedded in `CodeEditor`, so future editor shells do not create competing extension maps.
- `apps/web/src/shared/editor-core/identity.ts` owns document ids and the stable Monaco model URI path rule: `file:///workspace/{rootId}/{relativePath}`. Existing no-root callers remain compatible through `CodeEditor`'s optional `rootId`.
- `apps/web/src/shared/editor-core/files.ts` is a thin adapter over existing Files API `readFile` and `writeFileContent`; no backend contract or dependency was added.
- `apps/web/src/shared/editor-core/dirty.ts` provides pure dirty/save-state transitions without storing full buffers globally. Monaco remains the active buffer owner in mounted editors.
- `CodeEditor` now consumes shared language and model URI helpers; File Preview and shared single-file editor pass `rootId` to prevent future same-path/different-root model collisions.

### M1.3 implementation notes

- Dirty drafts moved to `FileManagerPage` so minimizing/unmounting the Online Editor shell does not drop unsaved content.

- 后台最小化驻留已纳入 M1.3：在线编辑器窗口可以最小化为右下角驻留条，保留 tabs 与当前激活文件；用户可恢复或关闭全部。

- `apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx` adds the M1 Online Editor shell with tab strip, active editor panel, and status bar.
- Text-like file open paths now launch the Online Editor; non-text files continue to use the existing File Preview path.
- Online editor tabs are keyed by the shared editor-core document id (`rootId:path`), so opening the same file again activates/reuses the existing tab instead of duplicating it.
- Closing the Online Editor window hides the shell without discarding tabs; closing the last tab hides the shell. This lets users reopen the window and continue adding tabs from File Manager while full-screen editing remains modal.
- M1.3 now implements minimized/background residency, current-tab dirty marking, Ctrl/Cmd+S save, Save button write-through, Save All, dirty tab close confirmation, minimized close-all confirmation, and browser beforeunload protection.

### M1.4 implementation notes

- `CodeEditor` now exposes a small imperative command handle (`focus`, `openFind`, `openReplace`, `gotoLine`, `layout`) and cursor-position callback; existing call sites remain compatible.
- Online Editor toolbar uses Monaco built-in actions for Find and Replace instead of implementing a second search/replace engine.
- Goto line accepts `line` or `line:column`, validates input, and moves the Monaco cursor.
- Font size control updates the active editor through existing `CodeEditor` options.
- Status bar now includes path, language, cursor position, save state, and read-only/truncated state.
- Escape no longer minimizes the Online Editor while focus is inside Monaco, avoiding conflict with Monaco's Find/Replace widget.

### M1.5 implementation notes

- Online Editor now exposes explicit state markers for missing/deleted reads, non-text read results, save failures, read-only files, and truncated large files.
- Large/truncated files are opened read-only; Save and Replace are disabled while Find/Goto/status remain available.
- Save failure records the backend error inline, leaves the dirty draft intact, and keeps the Save button available for retry once the underlying file/path issue is resolved.
- Missing/deleted files render an explicit “文件不可读取或已不存在” state instead of silently showing an empty editor.
- Non-text files continue to route through existing File Preview from File Manager; the Online Editor also has a defensive non-text state if a tab receives a non-text read result.
- External modification conflict is intentionally documented as a staged contract for M1: current Files API `writeFile` snapshots before write but does not accept an expected `modifiedAt` / version token, so strict conflict prevention requires a backend payload extension before it can be honestly presented as implemented.
- No terminal, Git, LSP, diagnostics, debug, task runner, or standalone IDE workbench capability is presented in the M1 UI.

### M1.6 verification notes

- `tests/file-manager/file-manager-online-editor.smoke.mjs` now covers M1.3–M1.5 behavior: multi-tab open/reuse, minimized residency, save current, Save All, dirty close confirmation, large/truncated read-only state, missing-file state, and save failure with dirty retry state.
- `tests/file-manager/file-manager-online-editor-responsive.smoke.mjs` covers Online Editor responsive/theme evidence in mobile light and desktop dark contexts. It seeds the File Manager session to `/tmp` so the smoke does not rely on desktop-only path input controls.
- Existing File Manager text editor and file-operations smokes were adjusted to create temporary artifacts under `/tmp` because the current Files API summary exposes `openclaw-root` as the unified filesystem root (`/`); creating files directly under `/` is not permitted.
- Browser console checks are embedded in the Online Editor smokes and fail on page errors / invalid hook call logs.
- Full `tests/system/files-service.test.mjs` currently hangs after TAP header in this execution surface; M1.5 therefore records a focused inline service guard check for escaping writes instead of claiming the full system test passed.


### Documentation alignment notes

- `m1-execution-plan.md` is updated from proposed plan to verified M1 completion status.
- M1.4 mobile usability is marked complete based on the M1.6 mobile layout and Online Editor responsive/theme smoke coverage.
- Design/API/code-review lanes are marked according to actual M1 closure evidence; broader standalone IDE review remains future-stage work.

## Known risks

| Risk | Impact | Mitigation | Status |
|---|---|---|---|
| Vite dev optimizer can invalidate lazy editor modules | Text-editor smoke and dev route can fail before Monaco renders | Added explicit optimize scan entries for FilePreviewPanel and CodeEditor plus Vite `ignoreOutdatedRequests`; keep Monaco excluded as before | Mitigated |
| File operations smoke can drift from responsive controls | Regression suite may click hidden mobile or stale view controls | Test now targets non-mobile path input, action menu, desktop bulk bar, and explicit file/trash view switcher | Mitigated |
| Competing editor state systems | Dirty/save behavior diverges across File Manager and future IDE | Single primary implementation owner; shared editor core first | Open |
| `FilePreviewPanel` grows into a mega-editor | Hard to maintain and hard to reuse for IDE | Introduce separate Online Editor shell; keep preview responsibilities bounded | Open |
| Monaco model lifecycle leaks | Memory/performance issues during multi-tab editing | Centralize model creation/disposal and view state handling | Open |
| Save conflict is currently weak | External modifications may be overwritten | M1 documents staged contract; future backend write payload should accept expected mtime/version before UI claims strict conflict prevention | Staged |
| Mobile editor UX regresses | Operational edits fail on phone/tablet | Fullscreen-friendly shell, visible actions, VisualViewport handling | Open |
| Scope creep into IDE/terminal/Git | M1 becomes too broad to verify | Keep M1 out-of-scope list enforced in review | Open |

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-30 | Start with M1 File Manager Online Editor, not standalone IDE | Existing docs and design rules require M1 before M2; shared core should be stabilized first |
| 2026-06-30 | Use one primary implementation owner for M1 | M1 has high integration overlap; multiple implementation agents risk competing state/save/model systems |
| 2026-06-30 | Supporting agents may focus on QA, design review, API/security, and code review | Preserves throughput without fragmenting the core architecture |
| 2026-06-30 | Do not enter editor-core product implementation until baseline smoke blockers are either fixed or explicitly quarantined | M1 changes need a reliable regression net; current failures predate product edits and would make later verification ambiguous |
| 2026-06-30 | Stabilize Vite lazy editor smoke through dev config, not product import changes | Direct/static product import experiments only moved the 504; explicit optimize entries preserve lazy product boundaries while making smoke deterministic |
| 2026-07-01 | Continue File Manager editor work as M1.x before M2 | User wants additional editor-specific ergonomics and safety; keep standalone IDE/terminal/Git/LSP out of this lane |

## M1.1 baseline blockers

Resolved. The two pre-existing smoke blockers were repaired before editor-core product implementation:

1. `smoke:file-manager:text-editor` now creates a deterministic temp `.txt`, waits for the lazy editor module to be available, and verifies both Tracevane's direct editor marker and Monaco's DOM. The underlying dev-server issue was mitigated by scanning the lazy File Preview / CodeEditor entries in Vite optimize config while keeping Monaco excluded.
2. `smoke:file-manager:file-operations` now follows current UI controls: non-mobile path input, Operation menu for new file/directory, desktop bulk command bar for rename/copy/move/delete, explicit trash restore API wait, and the view switcher `文件` tab before restored-entry verification.
3. Product editor implementation has not started yet; M1.1 only changed baseline docs, smoke tests, and dev-server smoke stabilization.

## Next action queue

1. Commit verified M1 baseline with Lore trailers and verification evidence.
2. Start M1.x from `m1x-execution-plan.md`, beginning with window/tab ergonomics.
3. Implement scalable tabs: shrink to minimum width, then horizontal scroll; do not silently discard dirty tabs.
4. Add maximize/restore/close controls and richer dirty close confirmation.
5. Plan strict external-modification conflict detection as the first backend-aware M1.x slice.
