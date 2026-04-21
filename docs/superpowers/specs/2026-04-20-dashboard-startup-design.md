# Dashboard Startup Design

Date: 2026-04-20
Status: Approved for planning

## Problem

The Dashboard page currently blocks the Studio startup experience and can also crash during render.

Observed issues:
- Opening Studio or navigating to Dashboard can stall for a long time before the page becomes interactive.
- Dashboard data loading currently recomputes a large summary eagerly on request and again on SSE intervals.
- The frontend assumes array-shaped payload fields always exist and crashes when one is missing, e.g. `dashboardRecoveryItems.length` in `apps/web-vue/src/views/DashboardView.vue`.

## Goals

- Make Dashboard open quickly without blocking the rest of Studio.
- Preserve the current Dashboard information density and Home positioning.
- Avoid full-page stalls during refreshes.
- Make the frontend resilient to partial or stale payloads.
- Keep the change focused to Dashboard startup/loading behavior only.

## Non-goals

- Redesign the visual layout of the Dashboard page.
- Move most Dashboard content into other pages.
- Rebuild all domain summary producers.
- Introduce a new distributed cache or persistence layer.

## Recommended Approach

Use a snapshot-first Dashboard summary model on the backend, combined with frontend payload normalization and non-blocking refresh behavior.

This keeps the current Dashboard scope intact while removing the worst startup cost from the critical path.

## Approach Options Considered

### Option A — Frontend-only split requests
Break Dashboard into multiple independent requests and lazy-load each section.

Pros:
- Faster first paint.
- Smaller per-request payloads.

Cons:
- More moving pieces and more frontend state complexity.
- Higher chance of visual popping and inconsistent partial states.
- Does not solve the expensive backend recomputation pattern by itself.

### Option B — Shrink Dashboard scope
Reduce Dashboard to a very small landing page and move heavy detail into System/Terminal/Agents.

Pros:
- Fastest path to low latency.
- Simplest technical model.

Cons:
- Changes the product role of Home/Dashboard.
- Too broad as a performance fix.

### Option C — Snapshot-first summary with frontend normalization
Return a cached in-memory summary snapshot immediately, refresh it in the background, and normalize the payload shape on the frontend.

Pros:
- Preserves the current product surface.
- Removes heavy aggregation from the critical request path.
- Gives stable startup behavior and safer rendering.
- Requires only localized Dashboard changes.

Cons:
- Dashboard can briefly show slightly stale data.
- Requires careful cache refresh orchestration.

## Chosen Design

Adopt Option C.

### Backend design

#### 1. Add in-memory dashboard snapshot state
Inside the dashboard service, maintain:
- `lastSummary: DashboardSummaryPayload | null`
- `lastUpdatedAt: number | null`
- `refreshInFlight: Promise<DashboardSummaryPayload> | null`

#### 2. Separate build vs serve responsibilities
Refactor the service so there is an internal heavy builder function that computes a fresh summary once.

Then expose snapshot-oriented behaviors:
- `getSummary()` returns the latest snapshot immediately when available.
- If no snapshot exists yet, it performs the initial build once.
- `refreshSummary()` refreshes in background and deduplicates concurrent refresh attempts.

#### 3. Make route handlers snapshot-first
`GET /api/dashboard/summary`
- Return the cached snapshot when present.
- Trigger a background refresh if the snapshot is stale.
- Only block on the first-ever build when there is no snapshot yet.

`GET /api/stream/dashboard`
- Send the current snapshot immediately.
- Stop recomputing the full summary inside the SSE response loop.
- The SSE loop should publish the latest cached snapshot, while refresh orchestration happens in the service layer.

#### 4. Keep staleness simple
Use a short in-memory staleness window only.
No disk persistence and no external cache in this iteration.

### Frontend design

#### 1. Normalize dashboard payload shape at the API boundary
Before the payload reaches view logic, guarantee stable defaults for optional collections:
- `recovery.items = []`
- `trends.points = []`
- `trends.panels = []`
- `domains = []`

This prevents render-time crashes caused by missing arrays.

#### 2. Keep previous summary during silent refresh
`useDashboardSummary()` should:
- Render immediately if a previous summary exists.
- Use silent refresh for background updates.
- Avoid clearing the page into a blocking loading state when a stale snapshot is already available.
- Preserve the last good summary if refresh fails.

#### 3. Limit error impact
If a refresh fails:
- Keep the existing summary on screen.
- Show a lightweight error banner/message.
- Do not regress to a blank or blocking state unless there has never been a successful summary.

### Rendering safety

The view layer and dashboard recipe helpers should never assume nested arrays exist without normalization.

The final rendering contract is:
- No `.length` or iteration crashes when sections are absent.
- Empty-state cards are shown instead.

## Data flow

### First visit with no snapshot
1. Dashboard mounts.
2. Frontend requests summary.
3. Backend performs one initial build.
4. Snapshot is stored in memory.
5. Frontend renders normalized summary.
6. SSE subscribes and receives the cached snapshot.

### Later visit with snapshot available
1. Dashboard mounts.
2. Backend returns cached snapshot immediately.
3. Frontend renders without blocking.
4. Backend refreshes snapshot in background if stale.
5. SSE or follow-up refresh updates the page.

## Error handling

### Backend
- If background refresh fails, keep the last valid snapshot.
- Do not clear the cache because of one failed refresh.
- Deduplicate concurrent refreshes so multiple requests do not trigger repeated heavy work.

### Frontend
- If initial load fails and there is no summary yet, show the existing full-page error banner.
- If a later refresh fails and there is already a summary, preserve the summary and show only a lightweight error state.

## Testing strategy

Add focused regression coverage for:

### Backend
- Snapshot is reused across repeated summary requests.
- Concurrent requests do not trigger duplicate heavy rebuilds.
- Stale snapshot refresh can happen without blocking the response path.

### Frontend
- Missing `recovery.items` does not crash Dashboard.
- Missing `trends.points`, `trends.panels`, or `domains` does not crash Dashboard.
- Existing summary remains visible during failed silent refresh.
- Dashboard does not return to full-page blocking loading when cached data already exists.

## Files expected to change

Backend:
- `apps/api/modules/dashboard/service.ts`
- `apps/api/modules/dashboard/routes.ts`

Frontend:
- `apps/web-vue/src/features/dashboard/api.ts`
- `apps/web-vue/src/features/dashboard/use-dashboard-summary.ts`
- `apps/web-vue/src/views/DashboardView.vue`
- `apps/web-vue/src/features/dashboard/overview-recipe.ts`

Tests:
- Existing dashboard/system tests as needed
- One or more focused Dashboard regression tests

## Risks and trade-offs

- The Dashboard may briefly show stale summary data, but this is acceptable because startup responsiveness is the higher priority.
- Keeping the fix local avoids broader architectural churn in other pages.
- In-memory snapshot state resets on server restart, which is acceptable for this iteration.

## Success criteria

- Opening Studio no longer stalls on Dashboard summary computation.
- Navigating away from Dashboard is no longer blocked by ongoing heavy summary work.
- Dashboard renders safely even when some summary arrays are absent.
- The existing Home information density remains intact.
- Silent refresh failures do not blank or crash the page.
