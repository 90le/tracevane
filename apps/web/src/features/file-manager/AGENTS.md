# File Manager / Online Editor rules

This file applies under `apps/web/src/features/file-manager/`.

## Product boundary

- File Manager owns file browsing and file operations.
- Online Editor / File Surface owns quick file edit/preview from File Manager.
- Mini Explorer, when implemented, is a lightweight navigation aid inside File Surface. It is not IDE Explorer.
- Do not add ActivityBar, Dockview workbench layout, project terminal, Git, LSP, Debug, Problems or Output to this feature area.

## Required docs before changes

- `docs/ide-code-editor-solution/03-文件管理器在线编辑器方案.md`
- `docs/ide-code-editor-solution/10-monaco-first-online-editor-strategy.md`
- `docs/ide-code-editor-solution/12-file-surface-unification-and-monaco-gap-plan.md`
- For Mini Explorer work: `docs/ide-code-editor-solution/13-mini-explorer-shared-explorer-plan.md`
- For theme work: `docs/ide-code-editor-solution/14-视觉主题与设计系统适配.md`

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
