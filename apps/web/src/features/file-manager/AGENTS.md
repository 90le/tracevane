# File Manager / Online Editor rules

This file applies under `apps/web/src/features/file-manager/`.

## Product boundary

- File Manager owns file browsing and file operations.
- Online Editor / File Surface owns quick file edit/preview from File Manager.
- Mini Explorer, when implemented, is a lightweight navigation aid inside File Surface. It is not IDE Explorer.
- Do not add ActivityBar, Dockview workbench layout, project terminal, Git, LSP, Debug, Problems or Output to this feature area.

## Contracts to check before changes

- `types/files.ts` for the shared file API contracts.
- `apps/web/src/shared/editor-core/AGENTS.md` for editor-core boundaries.
- `apps/web/src/design/theme.css` tokens for theme work.

## Implementation rules

- Do not create another preview/editor shell parallel to File Surface.
- Monaco owns text buffer and editor-native behaviors; React stores metadata, tabs and view state.
- Preserve dirty content on close, delete, rename, move, reload and save conflict flows.
- File operations must route through existing file APIs/mutations and respect permissions.
- Theme and dense-surface styling must use Aurora tokens, not hardcoded VS Code or terminal colors.

## Verification

Use the smallest relevant set:

- `npm run typecheck:web`
- `npm run smoke:file-manager:online-editor`
- `npm run smoke:file-manager:online-editor-responsive` for layout/theme/responsive changes
- `npm run smoke:file-manager:file-operations` for file operation behavior
- relevant Monaco/media smokes when touching editor internals or previews
