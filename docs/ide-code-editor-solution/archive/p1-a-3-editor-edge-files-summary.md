# P1-A-3 Editor edge-files workflow summary

Status: Completed / verified  
Date: 2026-07-08  
Scope: IDE Editor edge-file acceptance for the remote code editing mainline

## Outcome

P1-A-3 closes the editor edge-file slice for the remote code workbench mainline. The IDE editor now has an automated smoke that verifies the important open/edit/preview boundaries instead of relying on manual inspection.

Covered workflow:

```txt
IDE Explorer -> open file in EditorDock -> correct editor/preview boundary
```

The smoke validates:

- normal text/code files open in Monaco and use the workspace file URI model identity;
- readonly files are surfaced as readonly in the IDE editor and status area;
- oversized/truncated text is not forced into an unsafe editor state;
- image files route through the shared File Surface image preview;
- binary files route through the shared File Surface Hex preview;
- Hex preview starts with a small bounded byte window and loads more only on explicit user action;
- opened files deleted from IDE Explorer are marked deleted and not silently closed.

## Binary / Hex loading decision

The Hex preview must not load a large binary slice by default. P1-A-3 changes the default binary read window to a small first page:

```txt
initial Hex read: 32 KiB
maximum manual preview window: 512 KiB
loading model: explicit “加载更多” doubles the current read limit up to the cap
```

This keeps the first paint responsive for binary files and still lets users inspect more bytes when needed. The preview remains readonly; write-capable Hex editing is intentionally not part of P1-A-3.

## Implementation notes

Changed surfaces:

- `apps/web/src/shared/file-surface/FileSurfacePreviewPanel.tsx`
  - bounded Hex first read;
  - exposes loaded/read-limit attributes for regression smoke;
  - adds explicit load-more path.
- `apps/api/modules/files/service.ts`
  - read metadata now respects writable file permission for `editable` decisions.
- `apps/web/src/shared/editor-core/files.ts`
  - frontend readonly fallback also treats symbolic no-write permissions as readonly.
- `tests/ide-workbench/ide-editor-edge-files.smoke.mjs`
  - creates text, readonly, large, image, binary and deleted fixtures;
  - validates IDE editor/File Surface edge behavior.
- `package.json`
  - adds `smoke:ide:editor-edge-files`.

## Deliberately not done

P1-A-3 does not add:

- writable Hex editing;
- arbitrary huge-file streaming editor;
- new File API or second preview shell;
- LSP/Git/Terminal/Debug changes;
- media editing beyond preview;
- full unsupported-file renderer parity.

## Verification

- `npm run smoke:ide:editor-edge-files`

Additional typecheck/diff verification is recorded in the implementing commit.

## Next stage

Next recommended P1-A slice: **P1-A-4 Responsive layout workflow** — verify and harden the main remote-code workbench path on narrow screens/mobile-size layouts without pulling in new IDE parity features.
