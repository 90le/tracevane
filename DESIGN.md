# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-07-02
- Primary product surfaces:
  - File Manager (`/files`): workspace/root scoped directory and file operations.
  - File Manager Online Editor: lightweight Monaco multi-tab text editing launched from File Manager.
  - Standalone IDE Workbench: project-level IDE surface with explorer, editor groups, panels, terminal, problems/output, layout persistence and future LSP/Git/tasks/debug.
  - CLI Agents, Model Gateway, Channel Connectors, Platforms, Recovery and Dashboard remain separate product domains.
- Evidence reviewed:
  - `docs/ide-code-editor-solution/00-README.md` through `14-视觉主题与设计系统适配.md`
  - `docs/界面设计守则.md`
  - `apps/web/src/design/theme.css`
  - `apps/web/src/features/file-manager/*`
  - `apps/web/src/features/file-manager/code-editor/CodeEditor.tsx`
  - `apps/web/src/shared/file-editor/FileEditor.tsx`
  - `apps/api/modules/files/service.ts`, `apps/api/modules/terminal/service.ts`
  - `package.json`, `apps/web/package.json`
- External contracts checked on 2026-06-30:
  - Monaco Editor project/API surface for browser code editing, models and ESM worker integration.
  - Dockview/Dockview React documentation for IDE-like dock panels, split groups, drag/drop and serializable layouts.
  - xterm.js documentation for terminal rendering plus fit/addon integration; execution remains a backend PTY/WebSocket concern.

## Brand

- Personality: local-first industrial studio; calm, precise, operational, evidence-oriented.
- Trust signals: explicit workspace boundary, visible save/dirty/conflict state, recoverable layout reset, clear permission/safety messages, no fake terminal or fake IDE capability.
- Avoid: marketing hero screens in the workspace, decorative glass over dense editors/logs, fixed three-column IDE mockups, explanation pages pretending to be tools, hidden destructive writes, platform-specific chat concepts leaking into terminal/file surfaces.

## Product goals

- Goals:
  - Make File Manager a reliable file operations surface, not a read-only artifact wall.
  - Add a lightweight online code editor for quick edits without dragging in IDE complexity.
  - Build a standalone IDE workbench that can grow toward VS Code/Cursor-like project development through real docking layout and shared editor services.
  - Reuse one file/editor/save/dirty core across the two editing forms while keeping their product boundaries separate.
- Non-goals:
  - Do not merge File Manager editor and standalone IDE into one mega page.
  - Do not implement full Git/LSP/debug in M1.
  - Do not hand-write a custom docking system or lock the IDE into fixed flex columns.
  - Do not expose host shell execution without workspace/runtime guardrails.
- Success signals:
  - Users can identify whether they are managing files, quickly editing a file, or doing project-level development.
  - Dirty state, save, conflict and close-confirm behavior are predictable across editor surfaces.
  - IDE layout can split, drag, persist, restore and reset.
  - Desktop and mobile both provide complete task paths, including alternatives for hover/right-click/drag actions.

## Personas and jobs

- Primary personas:
  - Local AI developer/operator managing Tracevane/OpenClaw files, runs and evidence.
  - Power user quickly fixing config, scripts, Markdown, JSON/YAML or code from File Manager.
  - Project developer who needs editor groups, terminal, output/problems and later Git/LSP/tasks.
- User jobs:
  - Browse, upload, download, rename, delete, restore and inspect files safely.
  - Open one or more text files, edit, search/replace, save and close with dirty protection.
  - Open a workspace, split editors, run terminal/tasks, inspect output/problems and resume prior layout.
  - Hand off context or evidence to Agent workflows without confusing Agent runtime management with terminal/file editing.
- Key contexts of use:
  - Desktop long-running development sessions.
  - Tablet/phone operational edits and incident response.
  - Local filesystem and possible remote/container workspace runtimes.

## Information architecture

- Primary navigation:
  - Global Aurora navigation remains product-level: Dashboard, Workspace/File Manager/IDE, CLI Agents, Model Gateway, Channel Connectors, Platforms, Recovery/System.
  - Standalone IDE owns its internal Activity Bar: Explorer, Search, Source Control, Run/Debug, Extensions, Settings.
  - File Manager Online Editor does not use IDE Activity Bar.
- Core routes/screens:
  - `/files`: File Manager.
  - File editor container: full-screen dialog/page/route launched from File Manager.
  - `/ide/:workspaceId` or equivalent: standalone IDE workbench.
  - Existing domain pages remain separate: CLI Agents, Model Gateway, Channel Connectors, Platforms, Recovery.
- Content hierarchy:
  - File Manager: path/root controls → file list/tree → selection/actions → contextual properties/search/upload/trash/history.
  - Online Editor: title/tabs/actions → Monaco editor → status bar → search/goto/save affordances.
  - IDE Workbench: top/menu commands → Activity/Side Bar → Editor Dock → Panel Area → Status Bar.

## Design principles

- Principle 1: Product boundary before visual ambition. A quick editor must stay quick; an IDE must have real workbench behavior.
- Principle 2: Shared core, separate shells. Reuse FileService, EditorService, MonacoModelService, DirtyState and SaveService; do not reuse the same layout or tab chrome when the user job differs.
- Principle 3: Dense surfaces are solid and legible. Editors, terminals, tables, logs and diffs use real panels, fine borders and restrained shadows.
- Principle 4: Every powerful action has recovery evidence. Save conflicts, deletes, terminal kills, Git operations and layout resets need clear state, confirmation where appropriate and toast/log evidence.
- Tradeoffs:
  - Full Dockview-style IDE behavior adds dependency and layout-state complexity, but avoids an expensive fixed-layout rewrite later.
  - File Manager editor intentionally omits terminal/Git/LSP so it can ship a reliable M1.

## Visual language

- Color: Aurora tokens from `apps/web/src/design/theme.css`; off-white/blue-gray light theme, graphite dark theme, Tracevane blue primary, teal for connection/recovery, semantic green/amber/red/cyan.
- Typography: system sans for UI, monospace for paths, code, terminal and logs. Dense but readable type scale; avoid oversized hero text inside operational routes.
- Spacing/layout rhythm: compact workbench rhythm, clear hairline separators, stable row heights, no hover-induced layout shift.
- Shape/radius/elevation: controls 8px, panels 12px, cards/tables/code blocks 14px, floating layers 16px. Dense editor/terminal panels use lower radius/elevation.
- Motion: functional and brief; respect reduced motion. Docking/resize feedback must be clear but not theatrical.
- Imagery/iconography: use simple operational icons. File icons may use existing `pretty-file-icons`; icons support scanning but never replace accessible labels.

## Components

- Existing components to reuse:
  - `CodeEditor` for Monaco host until a shared `MonacoEditorHost/MonacoModelService` is extracted.
  - `FileEditor` as a single-file editing proof point, not the final multi-tab M1 shell.
  - File Manager list, chrome, action menu, upload, trash and properties components.
  - Shared Aurora UI primitives: button, dialog, sheet, tabs, table, command, tooltip, toast.
- New/changed components:
  - `FileEditorDialog` or `FileEditorPage` with multi-tab editing and save-all.
  - `FileEditorTabs`, `FileEditorStatusBar`, `MonacoEditorHost`.
  - Shared editor core services: `EditorService`, `MonacoModelService`, `DirtyStateService`, `SaveService`, `LanguageResolver`, `CommandService`.
  - `IdeWorkbench`, `IdeActivityBar`, `IdeSideBar`, `EditorDock`, `EditorGroup`, `PanelArea`, `TerminalView`, `ProblemsView`, `OutputView`, `IdeStatusBar`.
- Variants and states:
  - Loading, editable, read-only, non-text, binary, too-large, truncated, dirty, saving, saved, conflict, externally modified, deleted, permission denied, offline/slow network.
  - Editor tabs: active, inactive, preview, pinned, dirty, saving, conflict, read-only.
  - IDE layout: normal, maximized group, collapsed side/panel, restored, reset-needed/fallback.
- Token/component ownership:
  - `theme.css` owns base visual tokens.
  - `docs/界面设计守则.md` owns cross-product UI rules.
  - `docs/ide-code-editor-solution/` owns editor/IDE capability boundaries and stage acceptance.
  - `docs/ide-code-editor-solution/14-视觉主题与设计系统适配.md` owns IDE/editor/terminal/diff/problem/output token mapping details.

## Accessibility

- Target standard: WCAG 2.2 AA for text, focus, keyboard and pointer targets.
- Keyboard/focus behavior:
  - `Cmd/Ctrl+S`, save all, close tab, goto line, find/replace and command palette must be keyboard reachable.
  - Shortcut ownership must respect focus boundaries between inputs, Monaco and terminal.
  - Docking, panel toggles and layout reset need non-drag keyboard/menu alternatives.
- Contrast/readability: editor, terminal, log and diff text must remain readable in both themes; avoid translucent text backgrounds over aurora effects.
- Screen-reader semantics: tabs, tree, toolbar, menu, dialog, sheet, status and toast roles must be explicit; dirty/save/conflict state should be announced where practical.
- Reduced motion and sensory considerations: no required motion-only cues; terminal/editor animations remain minimal.

## Responsive behavior

- Supported breakpoints/devices: desktop, tablet and phone.
- Layout adaptations:
  - File Manager: desktop list/detail; mobile single list with bottom/action sheets for operations/properties/search/upload/trash.
  - Online Editor: desktop modal/fullscreen dialog or route; mobile fullscreen editor with bottom/top actions and safe visual-viewport keyboard handling.
  - IDE Workbench: desktop docking; mobile mode navigation between Explorer, Edit, Terminal, Problems/Output and Agent/Evidence context. Mobile does not attempt full visible docking.
- Touch/hover differences:
  - Every right-click menu action must also exist in toolbar, kebab menu, action sheet or command palette.
  - Drag/drop editor grouping must have split/open-to-side commands as fallback.

## Interaction states

- Loading: skeletons or panel-local spinners; do not block the entire app shell unless the workspace cannot load.
- Empty: explain the next operational step, not architecture manifest copy.
- Error: state the failing boundary (file read, save, workspace, terminal, layout restore), likely cause and recovery action.
- Success: toast plus persistent state update for saves, uploads, restores and layout reset.
- Disabled: show permission/runtime reason when actionable.
- Offline/slow network: keep unsaved editor content local in Monaco, show save pending/failure clearly, avoid silent close.

## Content voice

- Tone: concise, operational, calm.
- Terminology:
  - “File Manager” for file operations.
  - “Online Editor” for quick file editing.
  - “IDE Workbench” for project-level development.
  - “Terminal” for workspace shell/process sessions.
  - “CLI Agents” for Codex/Claude/OpenCode runtime readiness and Agent Runs.
- Microcopy rules:
  - Dirty/unsaved copy must be explicit: “未保存”, “保存中”, “已保存”, “外部已修改”, “保存冲突”.
  - Never say an unavailable terminal/Git/LSP feature is working; mark it as unavailable, planned or read-only.

## Implementation constraints

- Framework/styling system: React 19, React Router, TanStack Query, Tailwind v4/Aurora tokens.
- Current dependencies available: `monaco-editor`, `dockview`, `dockview-react`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`, `pretty-file-icons`.
- Design-token constraints: use `theme.css` variables and existing primitives before adding component styling systems.
  - Monaco, xterm, Dockview, diff, Problems and Output themes must be adapter-mapped from Aurora CSS variables; no component-local hardcoded VS Code/terminal color systems.
- Performance constraints:
  - File contents live in Monaco models, not long-lived React state/store.
  - Large files need thresholds, read-only/truncated fallback and explicit messaging.
  - Monaco models require reference counting/disposal to prevent leaks.
  - Layout persistence needs schema versioning and reset fallback.
- Security/compatibility constraints:
  - Frontend passes only workspace/root id plus relative path; backend enforces root guard.
  - File writes carry version/mtime or equivalent conflict detection.
  - Terminal execution is backend PTY/WebSocket with cwd/runtime guardrails; xterm.js is rendering only.
  - Git/LSP/debug are staged capabilities, not M1 requirements.
- Test/screenshot expectations:
  - M1/M1.x/M2: File Manager Online Editor / File Surface smoke for open/edit/save/save-all/dirty/close/search/goto/read-only/large-file/media preview and light/dark responsive coverage.
  - M3: Mini Explorer + Shared Explorer Core smoke for tree navigation, file operations, File Surface open behavior, responsive drawer and light/dark readability.
  - M4: IDE Workbench Layout Foundation smoke for Explorer, editor split, Dockview drag/open-to-side, Panel collapse/maximize, persist/restore/reset, mobile mode navigation and token-mapped light/dark surfaces.
  - M5/M5.x: terminal PTY smoke, resize/kill cleanup, xterm light/dark theme, terminal split/group and bottom/right panel placement as those stages land.
  - M6/M7: watcher/search/diff/problems/output/Git/LSP/debug checks as each stage lands, including semantic token readability in both themes.

## Open questions

- [ ] Final route naming for standalone IDE (`/ide/:workspaceId`, `/workspace/:id`, or another route) / owner: product+frontend / impact: navigation, deep links and tests.
- [ ] First M1 container choice for Online Editor (fullscreen dialog vs route) / owner: frontend / impact: mobile behavior and browser refresh recovery.
- [ ] Workspace identity model (`workspaceId` vs current File Manager `rootId`) / owner: API+frontend / impact: shared services and path contracts.
- [ ] Terminal runtime boundary for user projects (local, container, remote, or configurable) / owner: API/security / impact: M3 safety and permissions.
- [ ] First LSP language for M5 / owner: product+engineering / impact: gateway shape and Problems acceptance.
