# M2 Progress — Unified File Surface & Monaco Completion

Status: Complete, including M2.x media preview enhancement
Branch: `feat/file-manager-file-surface-m2` → `feat/file-manager-media-preview-m2x` → merged to `main`
Created: 2026-07-01
Plan: `m2-execution-plan.md`

## 1. Starting point

M2 starts after the following branches were merged into `main` locally:

| Branch | Merge commit on main | Scope |
|---|---:|---|
| `feat/file-manager-online-editor-m1` | `c05bc640` | M1 online editor foundation |
| `feat/file-manager-online-editor-m1x` | `d9051a15` | M1.x safety, tabs, window, save/reload/conflict enhancements |
| `feat/file-manager-online-editor-monaco-first-cleanup` | `b2b61865` | Monaco-first cleanup, lazy language coverage, File Surface analysis docs |

Current M2 branch was created from updated `main`:

```txt
feat/file-manager-file-surface-m2
```

## 2. Work log

| Date | Slice | Status | Notes |
|---|---|---|---|
| 2026-07-01 | M2.0 planning | Complete | Created M2 execution/progress docs from File Surface analysis. |
| 2026-07-01 | M2.1 clipboard shortcut isolation | Complete | File Manager shortcuts now ignore Monaco/editor-owned descendants; added clipboard smoke covering file-list copy/paste and editor Ctrl/Cmd+C/V isolation. |
| 2026-07-01 | M2.2 Monaco zh-CN localization | Complete | Loads Monaco zh-CN NLS bundle before editor API/contributions; added smoke asserting global zh-cn messages and visible Find widget labels. |
| 2026-07-01 | M2.3 unified File Surface routing | Complete | All primary file-open/edit/check routes now enter `openFileSurface` and use the online editor tab lifecycle; text/code remains Monaco-backed. |
| 2026-07-01 | M2.4 media/binary panels | Complete | Added image/video/audio/PDF/binary panels inside `FileOnlineEditorDialog` using native browser primitives and the existing download endpoint. |
| 2026-07-01 | M2.5 legacy preview removal | Complete | Removed `LazyFilePreviewDialog`, `previewTabs`/`activePreviewTabId`, active preview query state, and deleted obsolete `FilePreviewPanel.tsx`. |
| 2026-07-01 | M2.6 diagnostics/language sampling | Complete | Added Monaco supported-action diagnostics on the editor root and expanded highlighting smoke across ts/html/css/json/md/python/yaml/shell/sql. |
| 2026-07-02 | M2.6 follow-up bounded language detection | Complete | Language resolver now uses generated Monaco metadata plus bounded content samples for unknown/extensionless/backup-style files; covers `openclaw.json.pre-update`, `openclaw.json.clobbered.<timestamp>`, and extensionless JSON such as `123` without full-document JSON parse. |
| 2026-07-01 | Preview dependency evaluation | Recorded | M2 keeps native-first preview to avoid broad viewer dependencies; candidates such as `@cyntler/react-doc-viewer`, `pdfjs-dist`, or focused Office/PDF viewers should be evaluated only for proven gaps in a later slice. |
| 2026-07-01 | M2.x image canvas | Complete | Added wheel zoom, pointer drag pan, zoom controls, rotate, and reset/fit inside File Surface. |
| 2026-07-01 | M2.x video/audio controls | Complete | Added 10s skip controls and playback speed selectors around native media players. |
| 2026-07-01 | M2.x PDF container | Complete | Wrapped native PDF object/iframe fallback in a dedicated File Surface viewer container. |

## 3. Verification log

| Date | Command | Result | Notes |
|---|---|---|---|
| 2026-07-01 | `npm run smoke:file-manager:monaco-clipboard` | Passed | Verifies file-list Ctrl/Cmd+C/V still opens copy flow, while real and bubbled Monaco Ctrl/Cmd+C/V do not open File Manager dialogs or unmount editor. |
| 2026-07-01 | `npm run smoke:file-manager:online-editor` | Passed | Existing M1/M1.x online editor regression remains green. |
| 2026-07-01 | `npm run smoke:file-manager:online-editor-responsive` | Passed | Responsive editor window controls still pass after unified File Surface changes. |
| 2026-07-01 | `npm run build:web` | Passed | Production web build completes; Vite emits existing large chunk warnings only. |
| 2026-07-01 | `node --test tests/system/monaco-language-loaders.test.mjs` | Passed | Generated Monaco lazy language loaders still cover installed Monaco basic language contributions. |
| 2026-07-01 | `npm run smoke:file-manager:monaco-nls` | Passed | Verifies Monaco zh-CN NLS globals and Find widget labels are Chinese. |
| 2026-07-01 | `npm run smoke:file-manager:monaco-highlighting` | Passed | Confirms lazy highlighting for ts/html/css/json/md/python/yaml/shell/sql and verifies Monaco exposes built-in action diagnostics. |
| 2026-07-01 | `npm run smoke:file-manager:file-surface-routing` | Passed | Verifies context-menu inspect, Ctrl/Cmd+Enter text routes, and non-text binary routes use the unified online File Surface instead of the legacy preview dialog. |
| 2026-07-01 | `node --test tests/system/web-file-manager-domain.test.mjs` | Passed | Verifies legacy preview imports/state are removed and File Surface preview selectors exist. |
| 2026-07-01 | `npm run typecheck:web` | Passed | Web TypeScript check. |
| 2026-07-01 | `git diff --check` | Passed | No whitespace errors. |
| 2026-07-01 | `npm run smoke:file-manager:media-preview` | Passed | M2.x verifies image wheel/button zoom, drag pan, reset, media control selectors, PDF viewer container, and no legacy preview dialog. |
| 2026-07-02 | `node --test tests/system/monaco-language-detector.test.mjs` | Passed | Verifies compound backup filenames, extensionless/unknown-extension code detection, large extensionless JSON, and JS object-literal non-JSON fallback. |
| 2026-07-02 | `npm run typecheck:web` | Passed | Web TypeScript check after bounded language detector. |
| 2026-07-02 | `npm run smoke:file-manager:monaco-highlighting` | Passed | Real File Surface smoke covers Monaco language id and syntax tokens for known, unknown, backup-style, and extensionless files. |
| 2026-07-02 | `git diff --check` | Passed | No whitespace errors after detector/docs updates. |

## 4. Current risks

- Do not touch local `.claude/` workspace files if they appear; M2 commits should stay inside product/docs/test scope.
- Monaco zh-CN NLS is loaded before editor contribution modules in `CodeEditor.tsx`; keep that import first if Monaco bootstrap is split later.
- Clipboard isolation has targeted smoke coverage now; keep future Monaco widgets inside `[data-editor-shortcuts="ignore"]` or equivalent editor-owned descendants.
- Native PDF rendering varies by browser; add a focused lazy PDF viewer only if smoke/user testing proves the native `<object>` fallback is insufficient.
- Office/document preview is intentionally not solved by a broad dependency in M2; evaluate candidate packages separately with bundle, license, maintenance, and lazy-loading evidence.
- Content-based language detection is intentionally sample-bounded. Do not reintroduce full-document parsing for large files; if VS Code-like ML detection is needed, evaluate `@vscode/vscode-languagedetection` as a separate lazy-loaded dependency with bundle/runtime evidence.

## 5. Next action

M2/M2.x implementation and verification are complete and merged. At M2 close, the next candidate was M3 Online Editor Mini Explorer + Shared Explorer Core; M3 is now completed and recorded in `13-mini-explorer-shared-explorer-plan.md` and `archive/m3-execution-summary.md`.
