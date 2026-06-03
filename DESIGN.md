# OpenClaw Studio Design Contract

OpenClaw Studio is an operations IDE for terminals, files, agents, routing, repair, and system control. The visual target is the current Terminal and Files workbench direction: clean, line-based, direct, compact, readable, and fast. A user should understand what they can do by scanning the first screen, without reading explanatory cards.

This document replaces the older card-heavy design direction. Future UI work should treat the Terminal maintenance workbench and the Studio file manager as the product reference.

## Core Position

Studio is not a marketing dashboard, not a card gallery, and not a decorative admin panel.

Studio is a workbench:

- A clear shell rail for global navigation.
- A compact activity rail for local work modes.
- A resizable explorer or object list when the task has hierarchy.
- A primary stage for the actual work.
- Optional inspectors, drawers, command sheets, and context menus.
- Shared preview/edit engines for files, markdown, HTML, media, logs, and terminals.

The product should feel like a web IDE crossed with an operations file manager: dense enough for repeated work, but calm enough that the next action is obvious.

## Design Principles

### 1. Row First

Rows, trees, tables, split panes, command bars, and context menus are the default. Cards are the exception.

Use rows for:

- Files and folders.
- Terminal sessions.
- Search results.
- Git changes and commits.
- Agent, channel, route, process, task, and log entries.
- Any object that users scan, compare, select, rename, open, stop, delete, stage, or move.

Use cards only when the content is truly a repeated browsable object with independent media or summary content. Do not use cards to display normal settings, diagnostics, forms, action choices, or operational state.

### 2. One Surface, One Job

Every visible region must have one clear responsibility:

- Rail: choose a product area.
- Activity bar: switch local tools.
- Explorer: browse hierarchy.
- Workbench stage: edit, preview, run, inspect, or manage.
- Inspector drawer: secondary detail.
- Context menu: object-specific actions.
- Floating sheet: temporary task, upload progress, confirmation, logs, or advanced output.

Do not stack duplicate headers, duplicate tabs, duplicate metadata strips, or repeated button rows. If two controls explain the same state, remove one.

### 3. Workbench Before Decoration

The UI should use solid surfaces, crisp borders, clear typography, and local hover/active states. Avoid decorative gradients, glow layers, bokeh, hero panels, and ornamental card shadows.

Depth should come from layout hierarchy:

- shell rail
- local rail
- resizable pane
- stage
- drawer or sheet
- menu

Not from heavy shadows or nested cards.

### 4. Tools Live Near the Thing They Affect

Toolbar actions should sit in the same area as their target:

- File actions near the file list.
- Terminal actions near terminal tabs or the active session.
- Preview actions in the preview header.
- Search and replace controls in the editor/search panel.
- Git actions near the selected repository or selected commit.

Global top bars must stay small. Do not move page-local tools into a global header just because there is empty horizontal space.

### 5. Context Menus Are Product UI

Right-click menus are first-class Studio UI for file rows, tree rows, terminal tabs, preview tabs, git entries, and session rows.

Rules:

- Open on right click or keyboard context key.
- Close on focus change, Escape, or another menu opening.
- Do not close just because the page scrolls.
- Keep browser-native media right-click behavior on real images, audio, video, PDF, and iframe content when the native menu is more useful.
- Destructive actions must be visually separated and confirmed when needed.
- Do not perform dangerous actions on a single accidental left click.

### 6. Shared Engines, Not Feature Copies

Terminal and Files must share the same preview/edit engine. If one surface can preview, edit, save, search, render markdown, render HTML, show media, or warn about unsaved files, the other surface should reuse the same behavior instead of rebuilding it.

Shared engines should include:

- Code editor.
- Markdown preview and visual editing.
- HTML preview.
- Image preview with zoom, pan, lightbox, and native image right-click.
- Video and audio preview with responsive sizing.
- PDF inline preview.
- Binary preview fallback.
- Dirty-file confirmation.
- Search and replace.
- Drag/drop and paste insertion for markdown media.

## Layout System

### Studio Shell

The shell should be flush, compact, and stable:

- Left rail is the only global navigation.
- Route pages should not introduce another route-level navigation bar.
- Fullscreen workbench mode covers non-workbench chrome and uses the full viewport width.
- Mobile mode converts side panes into sheets or bottom/side drawers instead of shrinking everything into unreadable columns.

### Workbench Grid

Preferred desktop layout:

```text
global rail | local activity rail | explorer/list pane | resizer | primary stage | optional inspector
```

Preferred mobile layout:

```text
compact top/local bar
primary stage
bottom drawer or slide sheet for explorer/actions/inspector
```

Rules:

- Use `minmax(0, 1fr)` for the main stage.
- Explorer panes are resizable and collapsible.
- The stage must never leave dead blank regions.
- Tabs must scroll, window, or collapse into a file/session switcher before they overflow.
- Button clusters should wrap or collapse into overflow menus, not compress labels into unreadable text.

### Terminal Workbench

The terminal is the reference for the rest of Studio.

Required shape:

- Session tabs at the workbench edge, not buried below repeated headers.
- Close buttons large enough to avoid accidental taps, especially on mobile.
- Rename, duplicate, open in directory, close, close others, and delete/end are tab or context actions.
- Splits and layout controls belong in a compact menu, not a permanent noisy row.
- Resource explorer can drag paths into terminal and paste paths as quoted shell paths.
- File preview/editor can appear beside, above, below, or in place of terminal depending on layout.
- Fullscreen means the IDE workbench goes fullscreen, not only a child preview pane.

Remove:

- Duplicated metadata strips.
- Placeholder inspector pages.
- Permanent session/history panels that duplicate closed/deleted terminal tabs.
- Controls that do not map to real backend behavior.
- Random telemetry or resize JSON leaking into terminal output.

### File Manager Workbench

The file manager should feel like an ops file manager and a lightweight web IDE.

Required shape:

- Multi-tab directories.
- Editable address trail: display as breadcrumb, turn into one input only while editing.
- Address segments are clickable.
- Any absolute path can be entered, not only preset roots.
- Tree/sidebar shows useful roots and current directory context without taking over the page.
- Main area is normally a row/table list.
- Grid view is optional and must truncate names cleanly.
- Toolbar is compact and grouped by frequency.
- Upload uses a dedicated modal/sheet with batch progress.
- Archive actions support common formats and allow extract to current or selected directory.
- Pagination or backend windowing is required for large directories.
- Status bar shows counts, selection, current path, and page state without becoming visual clutter.

Columns:

- Always useful: name, size, modified time, operation.
- Optional/toggleable: permissions, owner, status, notes.
- Hidden files are controlled by a clear toggle.

### Resource Explorer

The resource explorer is a tree, not a drill-down browser.

Rules:

- Folders expand and collapse in place.
- Indentation is compact and predictable.
- Folder names are not bold by default.
- Do not show child-count text unless the user asks for diagnostics.
- File icons should communicate type, not decoration.
- Selection, hover, focus, default root, dirty state, and upload/change status must be visible but quiet.
- Dragging a file or folder to terminal inserts a safe shell path.
- Copy/paste and upload must work through real file operations, not placeholder UI.

## Visual Language

### Surfaces

Use solid surfaces:

- Light mode: clean white work surfaces on a very soft off-white canvas.
- Dark mode: graphite work surfaces with clear borders and readable contrast.

Avoid:

- translucent glass panels for routine controls
- one-off colored panels
- nested cards
- heavy shadows
- large rounded rectangles everywhere
- gray fields that look disabled

### Color

OpenClaw mint/teal is the action identity. Amber/peach, red, and green are semantic only.

Rules:

- Do not introduce a new primary color for one feature.
- Do not make an entire page one hue.
- Do not use gradients as the main layout language.
- Active state should be clear through border, fill, icon, and text contrast.
- Error/warning/success states must remain legible in both themes.

### Typography

Operational UI needs compact, readable text:

- Rows use normal-weight names.
- Metadata uses smaller muted text.
- Monospace is for terminal output, paths, code, command snippets, hashes, and size/time counters.
- Hero-sized headings are not used inside workbenches.
- Buttons and tabs must not overflow their containers.

### Icons

Use familiar icons for tools, states, and file types.

Rules:

- Prefer icon buttons for frequent tools.
- Add tooltips or accessible labels when the icon is not self-evident.
- File type icons should be consistent between Terminal resource explorer and Files manager.
- Do not use decorative icons inside rows unless they convey state or type.

## Interaction Rules

### Tabs

Tabs are work objects, not decoration.

Rules:

- Support rename where it matters.
- Support context menu.
- Support close, close others, close right, and close all when useful.
- Use windowing, overflow count, or a switcher when there are many tabs.
- Do not let tab labels cover action buttons.
- On mobile, avoid tiny close targets.

### Split, Collapse, Fullscreen

Workbench layout must support:

- left/right split
- top/bottom split
- collapse explorer
- collapse inspector
- hide/show terminal panel
- fullscreen workbench

These actions should be available from one compact layout menu or nearby pane controls. Do not scatter them across unrelated headers.

### Search And Replace

Search should behave like an IDE:

- Enter jumps to next match.
- Shift+Enter jumps to previous match.
- Replace is explicit and does not accidentally type into the file.
- Workspace search results show filename, path, and match with enough spacing.
- Search panels should not create unnecessary path browser packages or duplicate navigation.

### Preview And Editing

Preview mode and source/edit mode are persistent per file type when useful:

- Markdown can open in preview or visual edit based on last preference.
- HTML can open in source or preview based on last preference.
- Media opens in preview.
- Dirty files warn before close.

Markdown preview is not chat markdown. It is document rendering:

- no chat bubble chrome
- no automatic source/tool blocks inside rendered content
- supports headings, tables, task lists, code blocks, diagrams, formulas, HTML, SVG, and media
- code blocks have copy actions
- media supports resize/alignment in visual edit mode where feasible

### Media

Media preview must be useful:

- Images support zoom, pan, reset, fit, lightbox, drag positioning, and native browser media menu.
- Videos fit inside the preview stage and preserve aspect ratio.
- Audio uses a compact player with useful metadata.
- PDF is viewed inline instead of downloaded by default.
- Unknown binaries show a clear fallback with download/open actions.

## Performance Rules

Performance is part of design.

Required:

- Virtualize, paginate, or backend-window very large directories and search results.
- Lazy-load heavy preview engines.
- Do not mount hidden terminal instances unnecessarily.
- Do not re-render terminal output on every layout drag.
- Use CSS containment where appropriate for large panes.
- Keep resize handlers throttled or requestAnimationFrame-based.
- Prefer transform-based movement for image pan/zoom.
- Avoid layout thrash from measuring many rows during drag or resize.

A UI that looks nice but stutters during pane resize, terminal output, large folder browsing, or mobile mode fails the design.

## Mobile Rules

Mobile is a real target, not a squeezed desktop screenshot.

Rules:

- Terminal font size must adapt to viewport and input density.
- Terminal output must remain visible after UA/device mode switches.
- Tab close buttons must not be easy to mis-tap.
- Activity/explorer/inspector panels collapse into sheets.
- Primary work stage gets most of the viewport.
- Toolbars collapse into icon groups or overflow menus.
- Context menus become action sheets where needed.
- Avoid automatic refresh or remount loops during viewport changes.

## CSS And Naming Rules

Class names should describe the work surface:

- `*-workbench`
- `*-stage`
- `*-rail`
- `*-activity`
- `*-explorer`
- `*-row`
- `*-tree`
- `*-table`
- `*-toolbar`
- `*-sheet`
- `*-drawer`
- `*-context-menu`
- `*-preview`
- `*-editor`

Avoid new `*-card` names unless the surface is truly a repeated content card.

CSS should be feature-owned but primitive-aware:

- Shared controls use shared primitives.
- Feature CSS owns layout, density, and feature-specific states.
- Do not solve the same control style in several feature files.
- Do not keep old cascade patches after a layout is replaced.
- Avoid raw color literals for visible chrome; use tokens.
- Keep light and dark theme behavior together.

## Deletion Rules

When improving a page, delete these patterns:

- repeated page headers
- metadata strips that duplicate tabs or status bars
- decorative cards around single controls
- placeholder buttons that do not call real behavior
- feature menus that open but do not switch content
- hidden panels that still mount heavy components
- duplicate tab systems
- browser-default context menus on product rows
- custom media context menus that remove useful browser media actions
- action rows that exist only because there is empty space

Prefer removing UI over adding another layer.

## Release Gate For UI Changes

A frontend change is acceptable only when:

- The main workflow is visible without reading explanatory text.
- The primary action is near the object it affects.
- Rows/lists/tables are readable in light and dark themes.
- Mobile mode is not a cramped version of desktop.
- Context menus, keyboard focus, hover, disabled, loading, error, and empty states are handled.
- Large lists and resize/drag interactions remain responsive.
- Terminal and Files shared behavior stays consistent.
- There is no new card wall, duplicate navigation, or dead placeholder function.

The target is simple: clear workbench, obvious tools, real behavior, fast interaction.
