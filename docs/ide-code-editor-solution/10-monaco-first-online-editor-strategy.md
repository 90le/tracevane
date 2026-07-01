# Monaco-first Online Editor Strategy

Status: MFC.1–MFC.4 cleanup implemented
Updated: 2026-07-01
Scope: File Manager Online Editor, not standalone IDE Workbench

## 1. Decision summary

The File Manager Online Editor should be **Monaco-first**.

Tracevane should not rebuild editor-native capabilities that Monaco already provides. The product should treat Monaco as the code-editing engine and keep Tracevane-owned code focused on file lifecycle, tab/window shell, save safety, and performance boundaries.

In short:

> Monaco owns editing behavior. Tracevane owns files, tabs, persistence, conflicts, and product shell.

This changes the post-M1.x direction from “add more custom editor controls” to “expose Monaco fully, simplify duplicated UI, and tune performance profiles.”

## 2. Research basis

Primary sources:

- Monaco homepage: <https://microsoft.github.io/monaco-editor/>
- Monaco API docs: <https://microsoft.github.io/monaco-editor/docs.html>
- Monaco GitHub repository / README: <https://github.com/microsoft/monaco-editor>
- Local installed API surface: `node_modules/monaco-editor/monaco.d.ts`
- Current Tracevane wrapper: `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`

Relevant official facts and implications:

1. Monaco is the browser editor generated from VS Code sources and is intended as a fully featured code editor.
2. The public API contract is the versioned API declaration surface (`monaco.d.ts`). Internal implementation details should not be used as product contracts.
3. Monaco’s core concepts are `Model`, URI, editor views, providers, actions/commands, and disposables.
4. Model URI identity matters. A model represents opened content and should use stable URI identity for file-like editing.
5. Editors and models must be disposed correctly to avoid leaks.
6. Monaco language services use Web Workers. They should be configured and allowed to load for rich languages.
7. VS Code extensions do not directly run in Monaco. LSP/provider integration is a separate feature track.
8. Mobile browser support is not Monaco’s main target; Tracevane should offer a graceful basic mobile surface rather than promising full desktop editor behavior.

## 3. Ownership boundary

### Monaco should own

Use Monaco-native behavior wherever available:

- Find and replace widget.
- Previous/next match.
- Case-sensitive / whole-word / regex search toggles.
- Selection behavior and multi-cursor editing.
- Undo / redo and edit history.
- Clipboard editing inside the model.
- Goto line / symbol-like editor actions where provided.
- Context menu inside the editor.
- Folding.
- Bracket matching and bracket pair colorization.
- Indentation detection, tab size, insert spaces.
- Word wrap.
- Minimap.
- Sticky scroll where useful.
- Hover, suggestions, diagnostics-like language features that come from Monaco language contributions/providers.
- Diff editor where a real diff surface is required.
- Editor actions and keybindings exposed through `getAction`, commands, and options.

Tracevane may expose small shell buttons that call Monaco actions, but should not maintain a second search/replace state machine or duplicate Monaco widgets.

### Tracevane should own

Keep custom product logic where Monaco has no filesystem/product context:

- File Manager entry points.
- Multi-tab state and active tab selection.
- Minimize / restore / maximize shell.
- Dirty state across tabs.
- Save current / Save All.
- Reload current file.
- Close confirmations: save / discard / cancel.
- Backend read/write API contract.
- External modification conflict detection.
- Expected-token write safety and explicit force overwrite.
- Version/mtime/size/permissions display.
- Large file read-only/truncated behavior.
- Resident background editor dock.
- Mobile fallback shell around the editor.
- Product telemetry/toasts/errors.

## 4. Current Tracevane state

Current installed Monaco dependency:

- `apps/web/package.json`: `monaco-editor ^0.55.1`

Current wrapper already does several Monaco-aligned things well:

- Uses ESM editor API: `monaco-editor/esm/vs/editor/editor.api.js`.
- Configures editor/css/html/json/typescript workers.
- Uses file-like model URIs through `editorModelUriPath`.
- Lazily loads rich language contributions for CSS/HTML/JSON/JS/TS.
- Lazily loads many basic language contributions.
- Enables bracket pair colorization.
- Saves/restores Monaco view state for tabs.
- Disposes editor, model, and subscriptions on unmount.
- Centralizes Monaco construction options behind explicit editor profiles.
- Imports Monaco Find contribution and opens native Find/Replace from thin shell buttons.

MFC.1–MFC.2 cleanup already simplified:

- Toolbar-level previous/next/case/whole-word/regex buttons were removed because Monaco Find owns those affordances.
- `searchHighlights` and custom decoration handling were removed from `CodeEditor`; a cross-file search result feature can reintroduce a product-level path only when it has a concrete caller.
- `CodeEditorProfile = "normal" | "large-readonly" | "mobile-basic"` now makes performance intent explicit.
- `runAction(actionId)` is available as the generic Monaco action bridge, with `openFind` / `openReplace` kept as shell conveniences.
- File Manager editor preferences now persist Monaco-direct options for minimap, word wrap, and sticky scroll alongside font size and theme mode.
- The large-readonly profile overrides minimap, sticky scroll, and word wrap off even if user preferences enable them.

Remaining future work:

- Theme selector is acceptable as product preference, but should only select Monaco’s theme/profile rather than become a separate styling system.
- Conflict compare currently uses lightweight pre blocks. That is acceptable for M1.x safety; if richer compare is needed, use Monaco Diff Editor rather than a custom diff renderer.

## 5. Target editor profiles

Do not use one heavy option set for every file. Use profiles.

### 5.1 Normal editable profile

Default for ordinary text-like files under the current size limit.

Recommended Monaco options:

- `contextmenu: true`
- `largeFileOptimizations: true`
- `detectIndentation: true`
- `trimAutoWhitespace: true`
- `bracketPairColorization: { enabled: true }`
- `folding: true`
- `links: true`
- `find: { seedSearchStringFromSelection: "selection", loop: true }`
- `quickSuggestions: true` or language-sensitive default
- Keep suggestion options inside the installed Monaco public option surface; avoid stale/private option names.
- `minimap` controlled by user preference, default can be off for File Manager density
- `wordWrap` controlled by user preference, default can be `on` for text/doc files and `off` for code if product prefers
- `stickyScroll` optional preference

### 5.2 Large / truncated / read-only profile

For large files, truncated reads, or permission-readonly files.

Recommended behavior:

- `readOnly: true`
- `largeFileOptimizations: true`
- `minimap: { enabled: false }`
- Disable or reduce expensive decorations.
- Prefer no custom search decorations.
- Keep Monaco Find available.
- Keep copy/select/goto basic operations.
- Block save with clear readonly/truncated reason.

### 5.3 Mobile basic profile

Because Monaco does not officially target mobile browsers as a full desktop-equivalent editor, Tracevane should provide a constrained mobile contract.

Recommended behavior:

- Basic view/edit/save when feasible.
- Fullscreen-friendly shell.
- Reduced toolbar complexity.
- Avoid relying only on hover/right-click/desktop keybindings.
- Keep fallback actions outside Monaco for save/reload/close.
- Do not promise full Monaco desktop shortcut parity on mobile.

## 6. Simplification plan

### Phase A — Documentation and boundary reset

- Add this Monaco-first strategy document.
- Update Online Editor docs to say Monaco owns editing capabilities.
- Mark custom search/replace UI as simplification candidate, not a desired direction.

### Phase B — Wrapper API simplification

Status: Implemented for MFC.1.

Refactor `CodeEditor` toward a small Monaco command bridge:

```ts
type CodeEditorHandle = {
  focus(): void;
  runAction(id: string): Promise<void> | void;
  gotoLine(line: number, column?: number): void;
  saveViewState(): CodeEditorViewState | null;
  restoreViewState(state: CodeEditorViewState | null | undefined): void;
  layout(): void;
};
```

Keep convenience helpers only for actions the shell truly needs (`openFind`, `openReplace`) and avoid one wrapper method per Monaco Find widget toggle.

### Phase C — Remove duplicated search state

Status: Implemented for MFC.2.

- Remove custom `searchHighlights` unless cross-file search result navigation explicitly requires it.
- Remove toolbar buttons for case/whole-word/regex/previous/next if they only duplicate Monaco Find widget.
- Keep one or two entry buttons:
  - Find
  - Replace
- Let Monaco widget expose count, toggles, previous/next, regex, whole-word, and case sensitivity.

### Phase D — Option profiles and preferences

Status: Implemented for MFC.3.

Add explicit profile construction, for example:

```ts
type CodeEditorProfile = "normal" | "large-readonly" | "mobile-basic";
```

Centralize Monaco options in one function:

```ts
function buildMonacoEditorOptions(input: {
  profile: CodeEditorProfile;
  theme: "vs" | "vs-dark";
  fontSize: number;
  readOnly: boolean;
  preferences: EditorPreferences;
}): monaco.editor.IStandaloneEditorConstructionOptions;
```

This keeps performance and UX decisions visible and testable.

### Phase E — Diff through Monaco, not custom diff

If conflict compare needs rich diff behavior:

- Use `monaco.editor.createDiffEditor`.
- Original model = disk content.
- Modified model = local dirty draft.
- Dispose diff editor and models correctly.
- Keep the M1.x lightweight compare as fallback for small implementation or mobile.

## 7. Performance rules

1. Keep language contributions lazy.
2. Keep workers configured and avoid breaking worker loading.
3. Use stable model URIs for file-backed models.
4. Dispose editor/model/listeners/decorations when not needed.
5. Do not keep every tab mounted as a full editor unless there is evidence that it is necessary.
6. Save Monaco view state before unmounting or tab switch.
7. Avoid custom decorations for large files.
8. Enable Monaco’s `largeFileOptimizations`.
9. Avoid duplicating Monaco Find matches in React state.
10. Use user preferences for minimap/word wrap/sticky scroll, but default conservatively in dense File Manager surfaces.

## 8. Product UX after simplification

The Online Editor toolbar should become smaller:

Keep:

- Save
- Save All
- Reload
- Find
- Replace
- Goto
- Font size
- Theme mode
- Optional preferences menu

Remove or move into Monaco-native widget:

- Find previous
- Find next
- Case sensitive
- Whole word
- Regex
- Custom match count hint
- Custom search decorations

Status bar should remain Tracevane-owned because it combines Monaco state and filesystem metadata:

- path
- language
- cursor position
- dirty/save state
- readonly/truncated reason
- EOL
- indentation
- encoding assumption
- size
- permissions
- mtime

## 9. Acceptance criteria for Monaco-first cleanup

- Editor-native features are available through Monaco widgets/actions/context menu.
- Tracevane does not maintain duplicate find/replace state for single-file editing.
- Save/reload/close/conflict flows remain unchanged and verified.
- Monaco workers still load for CSS/HTML/JSON/TS/JS.
- Basic language highlighting remains lazy-loaded.
- Large/truncated files remain protected.
- Mobile smoke still passes with the basic editor contract.
- No standalone IDE scope is introduced.

## 10. Verification plan

Run after Monaco-first cleanup:

```bash
npm run typecheck:web
npm run typecheck
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
npm run smoke:file-manager:text-editor
npm run smoke:file-manager:file-operations
npm run smoke:file-manager:mobile-layout
```

When port `5176` is occupied by an existing dev runtime, run smokes on an isolated port and pass `TRACEVANE_WEB_SMOKE_URL`, for example:

```bash
TRACEVANE_WEB_PORT=5177 bash scripts/dev-web-smoke.sh
TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5177 node tests/file-manager/file-manager-online-editor.smoke.mjs
```

## 11. Non-goals

- Do not build a fake VS Code command palette in M1.x cleanup.
- Do not introduce Dockview or multi-editor split groups.
- Do not add terminal/Git/LSP/debug panels in this lane.
- Do not depend on Monaco private internals.
- Do not promise VS Code extension compatibility.
- Do not promise full desktop Monaco behavior on mobile browsers.

## 12. Recommended next implementation ticket

Create a focused follow-up branch:

```txt
feat/file-manager-online-editor-monaco-first-cleanup
```

Ticket goal:

> Simplify File Manager Online Editor to rely on Monaco-native editing features, remove duplicate search UI/state, and introduce explicit Monaco option profiles for normal, large-readonly, and mobile-basic surfaces.

Suggested first code changes:

1. Add `CodeEditorProfile` and centralized `buildMonacoEditorOptions`.
2. Replace per-toggle find methods with a generic `runAction` bridge plus `openFind/openReplace` conveniences.
3. Remove `searchHighlights` from `CodeEditor` unless another active feature still needs it.
4. Reduce Online Editor search toolbar to Find / Replace / Goto.
5. Update smoke tests to assert Monaco Find/Replace opens, not custom toggle buttons.
