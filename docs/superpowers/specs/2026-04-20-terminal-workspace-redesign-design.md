# Terminal Workspace Redesign Design

Date: 2026-04-20
Status: Approved for planning

## Problem

The Terminal page currently feels like several unrelated panels stitched together instead of one coherent IDE-style workspace.

Observed issues:
- Dark/light theme colors and surface hierarchy are inconsistent.
- Session tabs cannot be managed like IDE tabs.
- Sessions cannot be renamed from the UI.
- Ended sessions and tabs are not clearly managed.
- Recent sessions are separated into an extra right-side rail, which duplicates the tab/session model and makes the layout feel scattered.
- The terminal viewport is not visually dominant enough.

## Goals

- Make Terminal feel like one integrated workspace rather than a panel collage.
- Support clear session lifecycle management: open, switch, rename, end, close tab, and delete.
- Merge recent sessions into the main session management model.
- Improve dark/light theme consistency and status readability.
- Keep the terminal viewport as the primary stage.
- Preserve the existing terminal backend/session persistence model where possible.

## Non-goals

- Rebuild the terminal backend protocol.
- Introduce multi-split terminals in this iteration.
- Add pinned tabs, drag-reorder, or workspace folders unless they fall out naturally.
- Redesign unrelated pages.

## Recommended Approach

Adopt a unified terminal workspace made of:
- a left-side Session Explorer,
- a lightweight top Tab Strip,
- a central Terminal Stage,
- and a right-side Inspector Drawer that is closed by default.

This keeps terminal session management in one place, removes duplicated recent-session chrome, and makes the terminal itself the visual center of the page.

## Approach Options Considered

### Option A — Left Session Explorer only
Put all session management in a left explorer and remove the top tab strip.

Pros:
- Simplest information architecture.
- Strongest reduction in visual clutter.
- Recent/open/ended sessions naturally fit one column.

Cons:
- Loses fast horizontal switching for multiple actively open sessions.
- Feels less like a modern IDE tabbed workspace.

### Option B — Top tabs plus left recent list
Keep tabs on top and add a left recent/session list.

Pros:
- Familiar IDE-like top tab behavior.
- Quick switching between currently open sessions.

Cons:
- Still risks duplication between tabs and recent sessions.
- Easier to drift back into the current “many competing regions” layout.

### Option C — Unified explorer + light top tabs + on-demand drawer
Use a left Session Explorer for all session management, keep a lightweight top tab strip only for open tabs, and move actions/details into an on-demand right drawer.

Pros:
- Best balance of clarity and IDE feel.
- Unifies recent sessions into the same session model.
- Keeps the terminal stage visually primary.
- Gives a clear place for rename/end/delete actions.

Cons:
- More moving parts than a single-column explorer.
- Requires careful state ownership between explorer and tabs.

## Chosen Design

Adopt Option C.

## Information Architecture

### 1. Left Session Explorer
The left rail becomes the single source of truth for session management.

It should contain three groups:
- **Open** — currently open sessions/tabs.
- **Recent** — resumable or recently viewed sessions not currently open.
- **Ended** — ended/failed sessions that can still be inspected or deleted.

Each session row should display:
- title,
- status,
- updated time or recent activity cue,
- and a small overflow menu.

Session rows should support:
- select/open,
- rename,
- end (when running),
- delete (when ended/failed),
- close tab (when currently open).

### 2. Top Tab Strip
The top strip remains, but becomes lighter and narrower in purpose.

It represents only the current open tab set, not the full session inventory.

Supported actions:
- select tab,
- close tab,
- rename via double-click or overflow menu,
- visually distinguish running / resumable / ended states.

Closing a tab only removes it from the open tab set. It does not delete the session.

### 3. Central Terminal Stage
The terminal viewport is the dominant element on the page.

The stage includes:
- a compact session meta/header row,
- the terminal console viewport,
- optional recent output / handoff context folded into the stage header/details region.

This area should visually outweigh explorer and drawer surfaces.

### 4. Right Inspector Drawer
The current action panel should stop occupying permanent layout width.

Instead, use a drawer/panel that is:
- closed by default,
- opened via explicit trigger,
- used for:
  - built-in actions,
  - scripts/templates,
  - diagnostics,
  - session details.

This removes the current “terminal + action panel + recent rail” three-column competition.

## Session Lifecycle Model

The redesign explicitly separates **session state** from **tab state**.

### Session
A session is the durable terminal entity with:
- `sessionId`
- `title`
- `status`
- `updatedAt`
- `recentOutputSummary`
- `handoffContext`
- `canResume`
- `controlState`

### Tab
A tab is only an open-workspace view onto a session.

A tab can be:
- opened,
- selected,
- closed,
- renamed through its backing session.

### Action semantics
- **Close tab**: remove from open tabs only.
- **Rename**: update the session title.
- **End session**: terminate the running session and move it to ended/failed state.
- **Delete session**: permanently remove an ended/failed session from registry/history and any open tabs.

Delete should not be available for running sessions.

## State and Data Flow

### Workspace state extensions
The existing terminal workspace state should be extended to support:
- `openSessions`
- `recentSessions`
- `endedSessions`
- `openTab(sessionId)`
- `closeTab(sessionId)`
- `renameSession(sessionId, title)`
- `endSession(sessionId)`
- `deleteSession(sessionId)`

### Registry behavior
The session registry remains the durable source for session descriptors.

The UI layer derives grouped explorer collections from registry data and current open-tab state.

### Route behavior
Route sync should continue to track the active session, but route-driven selection should target the unified workspace model rather than a separate console-only concept.

## Visual Design

### Layout rhythm
The new layout should read as:
- left explorer,
- center stage,
- right drawer when needed.

The terminal stage should have the widest column and strongest visual weight.

### Theme cleanup
Terminal surfaces should stop relying on ad hoc fallback colors.

Use consistent theme tokens for:
- explorer background and row states,
- tab strip,
- terminal header/meta strip,
- drawer surface,
- status chips/badges,
- hover/selected/active states.

### Status clarity
Statuses should be visually distinct in both light and dark themes:
- running/controller,
- resumable,
- ended,
- failed.

These states should be readable without depending on color alone.

## Component Plan

Expected frontend units:
- `TerminalWorkspacePage.vue` — composition and layout shell.
- `TerminalSessionExplorer.vue` — unified left-side explorer.
- `TerminalTabStrip.vue` (or evolve current `TerminalTabRail.vue`) — top open-tab strip.
- `TerminalSessionPane.vue` — terminal stage.
- `TerminalInspectorDrawer.vue` — on-demand actions/details panel.

Existing components likely to be evolved or removed:
- `TerminalRecentSessionRail.vue` — absorbed into explorer.
- `TerminalActionPanel.vue` — moved inside drawer.
- `TerminalTabRail.vue` — simplified into tab-strip-only responsibility.

## Testing Strategy

Add focused regression coverage for:

### State/model
- Closing a tab does not delete the session.
- Renaming a session updates both explorer and tab display.
- Ending a running session moves it into ended/failed grouping.
- Deleting an ended session removes it from registry and open tabs.

### Layout and composition
- Terminal workspace uses explorer + tab strip + session pane + inspector drawer composition.
- Recent sessions are no longer rendered as a dedicated right rail.
- Inspector/action content is not permanently laid out as a fixed column.

### Theme/source contracts
- Terminal workspace CSS uses unified theme tokens.
- Selected/active/ended/recoverable states have explicit class/state hooks.

### UX regression
- Active session route sync still works.
- Recent output and handoff context still appear for the active session.

## Files Expected to Change

Frontend:
- `apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue`
- `apps/web-vue/src/features/terminal/TerminalTabRail.vue` or renamed replacement
- `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue` (remove or absorb)
- `apps/web-vue/src/features/terminal/TerminalActionPanel.vue`
- `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- `apps/web-vue/src/features/terminal/terminal-session-registry.ts`
- `apps/web-vue/src/features/terminal/terminal-workspace.css`
- `apps/web-vue/src/views/TerminalView.vue`

Tests:
- `tests/system/studio-web-terminal-workspace-shell.test.mjs`
- `tests/system/studio-web-terminal-route-session.test.mjs`
- additional focused terminal/system tests as needed

## Risks and Trade-offs

- Session action semantics must stay clear, or users may confuse close/end/delete.
- Moving actions into a drawer reduces clutter, but risks hiding capabilities too much if the trigger is weak.
- Renaming and delete behavior need careful persistence semantics so UI and registry do not drift.

## Success Criteria

- Terminal page feels like one coherent IDE-style workspace.
- Users can rename, end, close, and delete sessions from clear UI affordances.
- Recent sessions are integrated into the main explorer instead of a separate rail.
- The terminal viewport is clearly the main stage.
- Dark and light themes both present consistent, legible hierarchy and state styling.
