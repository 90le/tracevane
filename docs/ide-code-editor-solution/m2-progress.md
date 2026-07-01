# M2 Progress — Unified File Surface & Monaco Completion

Status: In progress
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
| 2026-07-01 | M2.2 Monaco zh-CN localization | Pending | Needs Monaco bootstrap/import-order care. |
| 2026-07-01 | M2.3 unified File Surface routing | Pending | Replace textLike split routes. |
| 2026-07-01 | M2.4 media/binary panels | Pending | Native preview primitives first. |
| 2026-07-01 | M2.5 legacy preview removal | Pending | Delete after route/panel migration. |
| 2026-07-01 | M2.6 diagnostics/language sampling | Pending | Provider-aware Monaco action diagnostics. |

## 3. Verification log

| Date | Command | Result | Notes |
|---|---|---|---|
| 2026-07-01 | `npm run smoke:file-manager:monaco-clipboard` | Passed | Verifies file-list Ctrl/Cmd+C/V still opens copy flow, while real and bubbled Monaco Ctrl/Cmd+C/V do not open File Manager dialogs or unmount editor. |
| 2026-07-01 | `npm run smoke:file-manager:online-editor` | Passed | Existing M1/M1.x online editor regression remains green. |
| 2026-07-01 | `npm run typecheck:web` | Passed | Web TypeScript check. |
| 2026-07-01 | `git diff --check` | Passed | No whitespace errors. |

## 4. Current risks

- Do not touch local `.claude/` workspace files if they appear; M2 commits should stay inside product/docs/test scope.
- Old `FilePreviewPanel` should not be deleted before media/binary useful behavior is migrated.
- Monaco zh-CN NLS must load before editor contribution modules.
- Clipboard isolation has targeted smoke coverage now; keep future Monaco widgets inside `[data-editor-shortcuts="ignore"]` or equivalent editor-owned descendants.

## 5. Next action

Start M2.2 Monaco zh-CN localization:

1. identify Monaco NLS bootstrap/import order;
2. load zh-CN messages before editor/contribution modules;
3. add localization smoke without regressing lazy language loading.
