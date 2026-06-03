# OpenClaw Studio Design Contract

OpenClaw Studio is a light operations workbench for terminals, files, agents, routing, repair, and system control. It should feel clean, flat, fast, and obvious: users see the current object, current state, and next action without reading long explanations or scanning a wall of cards.

Terminal and Files are the current reference examples because they are clear and tool-focused. They are not templates to copy everywhere. Other pages should translate the same discipline: fewer boxes, tighter hierarchy, real controls near the object they affect, and advanced detail folded until needed.

## Direction

The product direction is **light operations workbench**.

Use:

- compact rows, forms, tables, task rails, toolbars, sheets, drawers, and inspectors
- solid surfaces with subtle borders and little or no shadow
- one primary action per screen or active task
- visible but quiet hover, focus, loading, empty, disabled, and error states
- short labels and direct status copy
- responsive layouts that prioritize the active work surface

Avoid:

- card walls
- equal-weight two-column or three-column information dumps
- repeated headers, metadata strips, ribbons, and action rows
- long route introductions explaining implementation
- first-screen diagnostics that are not the current task
- decorative gradients, glow, glass, oversized radius, and heavy shadows
- placeholder actions or menus that do not perform real work

The goal is not "everything must be rows." The goal is lower cognitive load.

## Page Shapes

Choose one shape before inventing a new layout.

### Workbench

Use for Terminal, Files, Codex Stack, Git, logs, and live repair.

```text
local task rail or tabs | object list or step rail | primary stage | optional inspector/sheet
```

The workbench is for switching tools, selecting an object, running commands, previewing output, or repairing state.

### List Detail

Use for Agents, Channels, Plugins, repositories, scheduled tasks, and model lists.

```text
search/filter row
object rows
selected detail drawer or stage
```

Rows beat cards for scan, sort, select, batch, and compare.

### Settings

Use for configuration, credentials, provider settings, and model routing.

```text
section heading
grouped form rows
inline validation
save/apply strip
advanced section collapsed
```

Settings should not be one card per field.

### Status Console

Use for diagnostics, install/repair, service health, gateway state, and runtime checks.

```text
current status
recommended next action
compact facts
checklist or service rows
logs in sheet/drawer
```

If the page is about fixing something, the repair path is more important than the chart.

### Summary

Use only for the main dashboard.

```text
readiness strip
pending actions
recent events
important shortcuts
```

Summary cards must be few, thin, and actionable.

## First-Screen Budget

Every page starts with a budget:

- one title or selected object identity
- one status summary
- one primary action
- one local navigation control when needed
- one active work surface

Everything else must justify why it is visible before the user chooses a task.

If two regions explain the same state, remove one. If an advanced detail is useful but not immediately actionable, collapse it. If a control is rare, move it to a menu, drawer, or advanced section.

## Card Policy

Cards are allowed only for true repeated browsable objects or small dashboard summaries. They are not the default layout primitive.

Replace:

- setting cards with sectioned form rows
- status cards with compact status strips and row details
- action cards with command rows
- diagnostic cards with checklist rows and output sheets
- feature grids with list-detail workbenches when the user selects one object and edits it

Do not nest cards. Do not use cards to make a sparse page look full.

## Codex Stack

Codex Stack needs the most visual reduction. It is an operations console for route state, install/repair, Agent bridge, model routing, and logs. It must not feel like five dashboards merged into one page.

Default first screen:

- route health
- one recommended next action
- only the facts needed to trust that action
- deep chain maps, service matrices, model catalogs, environment references, smoke details, and raw logs collapsed or in sheets

Preferred structure:

```text
task rail
current task status strip
recommended action row
task-specific stage
advanced diagnostics collapsed
floating output sheet
```

Dashboard:

- single runtime strip
- one next-action block
- service state as rows, not big service cards
- model source as a compact fact unless model state is the active problem
- chain map, service grid, component health, network policy, smoke matrix, and diagnostics inside one advanced status section

Install and repair:

- start with the recommended action
- keep reinstall, base install, force/skip flags, and component strategy behind advanced controls
- show steps as a checklist or step rail
- command output always opens in a floating output sheet

Agent bridge:

- project/provider rows plus one editor stage
- presets as compact chips or rows, not a card gallery
- raw config in source/advanced mode
- save/finalize in a sticky local action strip

Route models:

- one primary model selector
- one route ledger
- environment references and catalog details collapsed
- avoid four-column fact grids on first screen

Logs:

- one toolbar for service, line count, auto-refresh, copy, and open output
- output is a console sheet, not permanent dashboard space

Copy should be short: "Route healthy", "Repair recommended", "Model source", "Open logs", "Run check", "Save route".

## Terminal

Terminal remains the clearest workbench reference.

Required:

- session tabs at the workbench edge
- rename and context actions on tabs
- close targets large enough for mobile
- splits and fullscreen in one compact layout menu
- resource explorer drag/paste paths into terminal safely
- file preview/editor can sit beside, above, below, or in place of terminal
- fullscreen means the whole workbench, not a child preview

Remove duplicate metadata strips, placeholder inspector pages, permanent panels duplicating closed sessions, and random telemetry leaking into terminal output.

## Files

Files is the reference for operations file management.

Required:

- multi-tab directories
- editable address trail that becomes one input only while editing
- clickable path segments
- arbitrary absolute path entry
- compact toolbar grouped by frequency
- row/table list as the default view
- optional grid view with reliable truncation
- batch upload sheet with progress
- archive/extract actions with current or target directory
- backend pagination or windowing for large directories
- status bar for counts, selection, path, and page state

Columns should default to name, size, modified time, and operation. Permissions, owner, status, and notes are optional/toggleable.

## Other Feature Directions

Agent management:

- searchable Agent rows
- selected Agent workbench stage
- persona, runtime, sessions, routing, and advanced JSON as local tasks or drawers
- no agent card wall or nested side rails

Channels:

- provider/account rows
- selected object owns the editor
- credentials and advanced payloads in drawers
- user-facing copy says route/routing, not binding

Config:

- quiet form rows
- visible labels and helper text
- inline validation
- save/reset strip
- advanced groups collapsed

Diagnostics:

- current status
- recommended check
- checklist rows
- repair action
- output sheet

Plugins, tasks, and repositories:

- rows by default
- context menu for object actions when useful
- detail drawer for changelog, config, history, branch, or advanced operations

## Visual Rules

Surfaces:

- Light mode: clean white work surfaces on soft off-white canvas.
- Dark mode: graphite work surfaces with visible borders.
- Main work surfaces use subtle borders and little or no shadow.
- Inner controls should not sit inside another framed box unless task context changes.
- Section separators can be lines, spacing, or small headings.
- Radius stays modest; large rounded blocks feel bulky.

Color:

- OpenClaw mint/teal is the action identity.
- Amber/peach, red, and green are semantic only.
- Do not introduce a new primary color for one feature.
- Do not make an entire page one hue.
- Do not use gradients as layout language.

Typography:

- Rows use normal-weight names.
- Metadata uses smaller muted text.
- Monospace is for terminal output, paths, code, command snippets, hashes, and counters.
- Workbench headings stay compact.
- Buttons and tabs must not overflow.

Copy:

- Prefer labels over explanation.
- First-screen copy says what is true and what to do next.
- Long explanations move to tooltip, help text, drawer, or docs.
- Do not teach implementation unless the active task requires it.

Icons:

- Use familiar icons for tools, states, and file types.
- Icon buttons need accessible labels and tooltips when unclear.
- Icons communicate state or type; they are not decoration.

## Interaction Rules

Tabs:

- support rename where useful
- support context menu
- support close, close others, close right, and close all when useful
- use overflow/windowing/switcher before labels collide
- avoid tiny close targets on mobile

Context menus:

- product rows, tree rows, terminal tabs, preview tabs, git entries, and session rows may use Studio context menus
- close on focus change, Escape, or another menu opening
- do not close just because the page scrolls
- keep browser-native media right-click on real images, audio, video, PDF, and iframe content when native actions are more useful
- destructive actions are separated and confirmed when needed

Search:

- Enter moves to next match
- Shift+Enter moves to previous match
- Replace is explicit and never accidentally types into the file
- Workspace results show filename, path, and match without overlap

Preview:

- Terminal and Files share the same preview/edit engine
- Markdown, HTML, image, audio, video, PDF, code, and binary fallback should behave consistently across both surfaces
- Dirty files warn before close
- Preview/source/visual preferences persist when useful

Media:

- images support zoom, pan, reset, fit, lightbox, and native image menu
- videos fit inside the stage and preserve aspect ratio
- audio uses a compact player
- PDFs view inline by default

## Performance Rules

Performance is design.

Required:

- virtualize, paginate, or backend-window large directories and result lists
- lazy-load heavy preview engines
- avoid mounting hidden terminals and heavy panels
- do not re-render terminal output on every resize/drag
- throttle resize, scroll, and drag handlers
- use transform-based movement for media pan/zoom
- use containment where large panes can isolate layout work

A UI that looks clean but stutters during resize, terminal output, large folder browsing, or mobile mode fails.

## Mobile Rules

Mobile is a real target.

- primary stage gets most of the viewport
- panels collapse into sheets or drawers
- toolbars collapse into icon groups or overflow menus
- terminal font size adapts to viewport and input density
- terminal output remains visible after UA/device mode changes
- tab close buttons are not easy to mis-tap
- context menus become action sheets when needed
- avoid automatic refresh/remount loops during viewport changes

## CSS Rules

Prefer names that describe the work surface:

- `*-workbench`
- `*-stage`
- `*-rail`
- `*-row`
- `*-table`
- `*-tree`
- `*-toolbar`
- `*-sheet`
- `*-drawer`
- `*-context-menu`
- `*-preview`
- `*-editor`

Avoid new `*-card` names unless the surface is truly a repeated content card.

CSS rules:

- shared controls use shared primitives
- feature CSS owns layout, density, and feature-specific state
- do not solve the same control style in multiple feature files
- remove old cascade patches after replacing a layout
- avoid raw color literals for visible chrome; use tokens
- check light and dark themes together

## Release Gate

A UI change is acceptable only when:

- the main workflow is visible without explanatory text
- primary action is near the affected object
- light and dark themes are readable
- mobile is not a cramped desktop
- hover, focus, disabled, loading, empty, and error states are handled
- large lists and resize/drag interactions remain responsive
- Terminal and Files shared behavior stays consistent
- no new card wall, duplicate navigation, or dead placeholder function appears

The target is simple: clear workbench, obvious tools, real behavior, fast interaction.
