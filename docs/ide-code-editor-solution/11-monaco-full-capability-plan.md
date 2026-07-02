# Monaco Full Capability Plan — File Manager Online Editor

Status: Implemented / current baseline
Updated: 2026-07-01
Scope: File Manager Online Editor Monaco integration, not standalone IDE Workbench

## 1. Objective

Tracevane should use Monaco as a complete browser code editor instead of rebuilding editor-native behavior.

Target state:

```txt
Monaco owns editor capabilities.
Tracevane owns file lifecycle, tabs, persistence, safety, shell, and product constraints.
```

This means:

- enable Monaco's editor contributions as a whole;
- support all language contributions shipped by the installed `monaco-editor` package through lazy loading;
- keep rich language workers for CSS / HTML / JSON / TypeScript-family services, including Monaco rich aliases such as SCSS/LESS, Handlebars/Razor, and JavaScript;
- expose product preferences only when they map directly to Monaco options;
- do not recreate find/replace, selection, folding, hover, suggest, goto, formatting, snippets, word operations, context menu, or other Monaco-owned behavior in React;
- keep large/truncated/read-only protection stronger than user preferences.

## 2. Official / upstream evidence

Primary sources checked on 2026-07-01:

- Monaco homepage: <https://microsoft.github.io/monaco-editor/>
- Monaco API docs: <https://microsoft.github.io/monaco-editor/docs.html>
- Monaco upstream repository: <https://github.com/microsoft/monaco-editor>
- Installed package API and ESM files:
  - `node_modules/monaco-editor/monaco.d.ts`
  - `node_modules/monaco-editor/esm/vs/editor/editor.api.js`
  - `node_modules/monaco-editor/esm/vs/editor/edcore.main.js`
  - `node_modules/monaco-editor/esm/vs/editor/editor.all.js`
  - `node_modules/monaco-editor/esm/vs/basic-languages/*/*.contribution.js`
  - `node_modules/monaco-editor/esm/vs/language/*/monaco.contribution.js`

Key facts from upstream:

1. Monaco is the browser code editor generated from VS Code sources.
2. The versioned public API is `monaco.d.ts`; implementation internals can change.
3. Models, URIs, editors, providers, workers, and disposables are core Monaco concepts.
4. Providers power smart features such as completion and hover.
5. Workers are expected for heavy language services.
6. Monaco is not VS Code extension compatible in-browser; LSP/provider integration is a separate feature track.
7. Monaco's README currently lists `v0.55.1` as the latest release, matching this repo's installed `monaco-editor ^0.55.1` resolution.

## 3. Current repo state after cleanup

Current installed Monaco version:

```txt
apps/web/package.json: monaco-editor ^0.55.1
npm view monaco-editor version: 0.55.1
```

Implemented locally:

- `CodeEditor` imports `monaco-editor/esm/vs/editor/edcore.main.js` to register full editor contributions without importing every language eagerly.
- Language contributions are generated from the installed Monaco package into `monacoLanguageLoaders.ts`.
- Runtime language loading remains lazy and cached.
- Rich language contributions are preferred over basic tokenizers when available.
- Workers remain configured for editor/css/html/json/typescript.
- File-backed models use stable `file://`-style URIs through `editorModelUriPath`.
- Monaco view state is preserved across tab switching.
- File Manager toolbar keeps thin shell entries for Find / Replace / Goto, while Monaco owns the widget and actions.
- Preferences map directly to Monaco options: font size, theme, minimap, word wrap, sticky scroll.
- `large-readonly` profile overrides expensive editor UI off.

## 4. Why `edcore.main.js`, not `editor.all.js`

`editor.all.js` registers all editor contributions **and** imports all built-in language contributions. That maximizes convenience but eagerly pulls every language contribution into the main editor chunk.

Tracevane's target is stronger:

```txt
Full editor features now.
Full language coverage lazily.
```

So Tracevane should use:

- `editor.api.js` for typed public API access;
- `edcore.main.js` for full editor contribution registration;
- generated lazy language loaders for all installed Monaco language contributions.

This avoids a residual “partial editor” while preserving route-level performance and future package-version coverage.

## 5. Editor contribution coverage

`edcore.main.js` currently registers Monaco editor contributions including:

- anchor selection;
- bracket matching;
- caret operations and transpose;
- clipboard;
- code actions;
- code lens;
- color picker;
- comments;
- context menu;
- cursor undo;
- drag and drop;
- paste/drop into editor;
- find/replace;
- folding;
- font zoom;
- format actions;
- document symbols;
- inline completions;
- inline progress;
- goto symbol / definition link / goto error;
- hover;
- indentation;
- inlay hints;
- in-place replace;
- insert final new line;
- line selection;
- line operations;
- linked editing;
- links;
- long-line helper;
- middle scroll;
- multicursor;
- parameter hints;
- placeholder text;
- rename;
- section headers;
- semantic tokens;
- smart select;
- snippets;
- sticky scroll;
- suggest;
- tokenization;
- toggle tab focus mode;
- unicode highlighter;
- unusual line terminators;
- word highlighter;
- word operations;
- word-part operations;
- read-only message;
- diff editor breadcrumbs;
- floating menu.

Tracevane should not create parallel React controls for these capabilities unless there is a distinct file-manager lifecycle reason.

## 6. Language coverage model

### 6.1 Generated lazy loader

Source of truth:

```txt
scripts/generate-monaco-language-loaders.mjs
apps/web/src/features/file-manager/code-editor/monacoLanguageLoaders.ts
```

The generator scans the installed Monaco package:

- rich language contributions:
  - `node_modules/monaco-editor/esm/vs/language/*/monaco.contribution.js`
- basic language contributions:
  - `node_modules/monaco-editor/esm/vs/basic-languages/*/*.contribution.js`

Current generated coverage:

```txt
basic language contributions: 81
rich language contributions: 4
rich language aliases: 5
total language ids: 82
```

Rich contributions must compose with basic tokenizers where both exist, so CSS / HTML / TypeScript-family files keep visible Monarch syntax highlighting while also loading Monaco's richer services and workers. This is intentional for `javascript -> typescript`, `scss/less -> css`, and `handlebars/razor -> html`: the editor still opens those language ids lazily, but it loads Monaco's richer contribution instead of downgrading to the basic tokenizer.

### 6.2 File extension mapping

`apps/web/src/shared/editor-core/language.ts` maps file names/extensions to Monaco language ids.

Guardrail:

- every Monaco basic-language contribution id should be mappable from at least one file extension or exact-file rule where a conventional extension exists;
- if Monaco adds or removes packaged language ids, run `npm run generate:monaco-languages` and audit `language.ts`.

### 6.3 Unknown file fallback

Unknown files should remain safe:

- default to `plaintext`;
- keep Monaco editor features enabled;
- do not fake language services that are not present.

## 7. Capability ownership matrix

| Capability | Owner | Tracevane behavior |
|---|---|---|
| Find / Replace | Monaco | Toolbar only calls Monaco action |
| Search result count / next / previous / regex / case / whole word | Monaco | No React duplicate state |
| Multi-cursor / selection / smart select | Monaco | Native actions and keybindings |
| Undo / redo / cursor undo | Monaco | No custom edit history |
| Folding / bracket matching / indentation | Monaco | Use options/contributions |
| Hover / suggest / parameter hints / inlay hints | Monaco providers | Enable contributions; provide workers/services where available |
| Context menu | Monaco | Keep enabled; do not replace with React menu inside editor |
| Snippets / word operations / line operations | Monaco | Native actions/keybindings |
| Code actions / formatting / rename / symbols | Monaco providers | Exposed when providers exist; no fake implementation |
| Diff editor | Monaco | Use `createDiffEditor` if conflict compare is upgraded |
| Tabs / dirty state / Save All / reload / conflict detection | Tracevane | Product lifecycle logic |
| Large/truncated read-only protection | Tracevane | Profile overrides expensive Monaco options off |

## 8. Dependency/version policy

- Keep `monaco-editor` on the latest stable release compatible with this Vite/React stack.
- As of 2026-07-01, `0.55.1` is latest by `npm view monaco-editor version` and GitHub release metadata.
- Do not add third-party Monaco wrappers unless they remove more code than they add and preserve current lifecycle control.
- Do not copy Monaco internals into Tracevane.
- Use public API and documented ESM package surfaces; generated import paths should be regenerated from the installed package after upgrades.

## 9. Verification requirements

For Monaco capability changes, run:

```bash
npm run generate:monaco-languages
npm run typecheck:web
npm run typecheck
npm run smoke:file-manager:online-editor
npm run smoke:file-manager:online-editor-responsive
```

When port `5176` is occupied, use the existing isolated `5177` smoke-test pattern documented in the M1/M2 progress logs.

Add targeted smoke checks when changing:

- language loader generation;
- editor contribution import path;
- model URI identity;
- workers;
- File Manager preference persistence;
- large-readonly profile overrides.

## 10. Verification added

Implemented with this plan:

- `tests/system/monaco-language-loaders.test.mjs` verifies generated lazy language loaders cover every installed Monaco language contribution and the rich-language aliases that should not fall back to basic tokenizers.
- The same test verifies `languageForPath` can emit every installed Monaco basic language id.
- `tests/system/monaco-language-detector.test.mjs` verifies compound backup filenames and extensionless/unknown-extension content detection, including large JSON without parsing the whole file.
- `tests/file-manager/file-manager-monaco-highlighting.smoke.mjs` now opens representative rich/basic/unknown/extensionless files through the real File Surface and asserts Monaco language id plus visible syntax tokens.

## 11. Next implementation backlog

1. Consider upgrading conflict compare to Monaco Diff Editor, keeping lightweight fallback for mobile/basic mode.
2. If product wants VS Code-like automatic language detection across arbitrary files, evaluate `@vscode/vscode-languagedetection` separately for license, bundle size, lazy-loading, browser runtime cost, and false-positive behavior; do not replace the current bounded detector with full-document parsing.
3. If product wants LSP-grade features beyond Monaco's built-in providers, plan a separate provider/LSP track; do not present it as built-in Monaco support.

## 12. 2026-07-01 File Surface update

Follow-up plan: [12-file-surface-unification-and-monaco-gap-plan.md](./12-file-surface-unification-and-monaco-gap-plan.md).

Current status after M2/M2.x:

- Basic Monarch tokenizer modules and rich language contributions are composed through generated lazy loaders.
- Monaco zh-CN NLS is loaded before the main editor contribution modules.
- Language resolution combines Monaco contribution metadata, filename/extension rules, first-line/MIME hints, compound backup suffix handling, and bounded content samples. This covers files such as `openclaw.json.pre-update`, `openclaw.json.clobbered.<timestamp>`, and extensionless JSON like `123` without parsing full large files.
- File Manager no longer has two file surfaces; `FilePreviewPanel` and legacy preview tab state were removed.
- File Manager global Ctrl/Cmd+C/X/V ignores Monaco/editor descendants so editor clipboard shortcuts remain editor-owned.
- Media and binary files now open in the unified File Surface rather than a separate preview shell.

Next capability gap is not “more Monaco UI”; it is shared file navigation: M3 Online Editor Mini Explorer + Shared Explorer Core. See `13-mini-explorer-shared-explorer-plan.md`.
