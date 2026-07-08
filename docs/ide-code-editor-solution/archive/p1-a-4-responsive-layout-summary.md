# P1-A-4 Responsive layout workflow summary

Status: Completed / verified  
Date: 2026-07-08  
Scope: IDE Workbench narrow/mobile layout hardening for the remote code editing mainline

## Outcome

P1-A-4 closes the responsive layout slice for the remote code workbench mainline. The IDE now has a focused smoke that validates the small-screen workflow instead of relying on desktop-only acceptance.

Covered workflow:

```txt
mobile/narrow viewport -> Explorer/Search/Source Control/Run sidebar -> EditorDock -> Problems/Output/Terminal panel
```

## Implementation notes

Changed surfaces:

- `apps/web/src/features/ide-workbench/IdeWorkbenchPage.tsx`
  - detects narrow workbench layouts with `matchMedia("(max-width: 720px)")`;
  - changes primary sidebar to an overlay on narrow screens so it no longer consumes grid width and crushes the editor area;
  - adds a side-bar overlay scrim so users can close the sidebar by tapping outside;
  - hides the resize handle while sidebar is in overlay mode.
- `apps/web/src/features/ide-workbench/explorer/IdeExplorerView.tsx`
  - keeps Explorer toolbar actions visible on small screens/touch instead of hover-only.
- `tests/ide-workbench/ide-responsive-mainline.smoke.mjs`
  - creates a real fixture file;
  - runs at `390x844` mobile viewport;
  - verifies Explorer overlay, file open into EditorDock, Search result open, Source Control view, Run/Debug view, Problems/Output/Terminal panel switching, and no horizontal document overflow.
- `package.json`
  - adds `smoke:ide:responsive-mainline`.

## Deliberately not done

P1-A-4 does not add:

- new Terminal, Git, LSP or Debug capabilities;
- new File API, second Explorer shell, or mobile-only product fork;
- full responsive redesign of every IDE parity panel;
- media/Hex/editor feature changes beyond preserving existing File Surface behavior.

## Verification

- `npm run smoke:ide:responsive-mainline`

Additional typecheck, existing workbench smoke, docs link check and diff validation are recorded in the implementing commit.

## Next stage

Next recommended P1-A slice: **P1-A-5 Persistence / terminal clipboard checklist** — verify layout/open-tab/terminal persistence boundaries and close the terminal clipboard/file-paste checklist without expanding into new IDE parity features.
