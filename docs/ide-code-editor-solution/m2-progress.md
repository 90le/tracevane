# M2 Progress — Unified File Surface & Monaco Completion

Status: Complete
Branch: `feat/file-manager-file-surface-m2`
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
| 2026-07-01 | Preview dependency evaluation | Recorded | M2 keeps native-first preview to avoid broad viewer dependencies; candidates such as `@cyntler/react-doc-viewer`, `pdfjs-dist`, or focused Office/PDF viewers should be evaluated only for proven gaps in a later slice. |

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
| 2026-07-01 | `npm run smoke:file-manager:media-preview` | Passed | Verifies image/video/audio/PDF/binary fixtures render the new File Surface preview panels and do not open the legacy preview dialog. |
| 2026-07-01 | `node --test tests/system/web-file-manager-domain.test.mjs` | Passed | Verifies legacy preview imports/state are removed and File Surface preview selectors exist. |
| 2026-07-01 | `npm run typecheck:web` | Passed | Web TypeScript check. |
| 2026-07-01 | `git diff --check` | Passed | No whitespace errors. |

## 4. Current risks

- Do not touch local `.claude/` workspace files if they appear; M2 commits should stay inside product/docs/test scope.
- Monaco zh-CN NLS is loaded before editor contribution modules in `CodeEditor.tsx`; keep that import first if Monaco bootstrap is split later.
- Clipboard isolation has targeted smoke coverage now; keep future Monaco widgets inside `[data-editor-shortcuts="ignore"]` or equivalent editor-owned descendants.
- Native PDF rendering varies by browser; add a focused lazy PDF viewer only if smoke/user testing proves the native `<object>` fallback is insufficient.
- Office/document preview is intentionally not solved by a broad dependency in M2; evaluate candidate packages separately with bundle, license, maintenance, and lazy-loading evidence.

## 5. Next action

M2 implementation and verification are complete; next step is PR review / merge after commit is pushed.
