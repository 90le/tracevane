# Model Gateway IA Contract

> Updated: 2026-06-22
> Scope: Model Gateway frontend, backend API ownership, interaction boundaries

## Decision

Model Gateway is the source of truth for model routing: Provider, endpoint, model catalog, account pool, route scope, usage and client App Connection.

The page must follow the Aurora prototype contract instead of becoming a generic admin console. It is a task-first routing workbench with four primary views and focused child flows.

## Primary Views

| View | Owns | Must Not Own |
| --- | --- | --- |
| Overview | Gateway readiness, active routes, client connection summary, actionable issues | Low-value KPI walls, generic OpenClaw status, raw config dumps |
| Provider | Provider list, search/filter, common row actions, health state | Permanent two-column field dumps, full endpoint/model editing, dangerous deletes |
| Models | Cross-provider model catalog, alias edits, capability/usage inspection | Provider base configuration, account login |
| Usage | Request/token/latency summaries by model and route | Cost estimation/archive/export unless re-designed |

Primary `viewbar` stays limited to `overview / Provider / models / usage`.

## Child Flows

| Child flow | Entry | Pattern | Notes |
| --- | --- | --- | --- |
| Provider config | Provider row `配置`, overview issue `处理`, create API Provider | Subpage with section navigation and sticky save bar | Basic, endpoint, models and advanced are separate sections. Do not show all fields at once. |
| Account pool | Account-backed Provider row `账号池` | Child page | Only account-backed Providers expose this. Codex login is a dedicated flow, not ordinary API Provider creation. |
| Client App Connection | Overview summary `管理接入` | Child page | Belongs to Model Gateway because it writes routing into local clients. It does not manage Agent workspace/persona/session. |
| Delete Provider | Provider config advanced danger zone | Dialog confirmation | Never expose as a casual toolbar/list primary action. |
| Apply / rollback client config | Client App Connection child page | Preview sheet + confirmation dialog + result sheet | Every write must mention target config path and backend backup/rollback behavior. |

## Interaction Rules

- Overview answers "what will route where, and what needs attention?" It should not show decorative or unverifiable metrics.
- Provider list shows only identity, type, status and common actions. Protocol/source/latency/date strings must not pile into the row.
- Provider creation has two explicit paths:
  - API Provider: base URL, API format, auth/key and model catalog.
  - Codex Account: starts account login and account-pool creation through the Codex account API.
- Provider edit hides advanced sections by default. Endpoint/model/advanced fields are still available, but not all visible on first open.
- Account pool actions mutate only the selected account-backed Provider.
- Client App Connection is inside Model Gateway because it applies Gateway routing to Codex, Claude Code, OpenCode or other local clients.
- CLI Agents owns Agent workspace, persona, permissions, sessions and task runtime. It can link to Model Gateway route settings but must not duplicate route editing.
- OpenClaw Platform owns host/runtime support. It can report Gateway service status but must not redefine Model Gateway routing UX.

## Research Checked

- React Router routing and layout docs, 2026-06-22: nested/child views should preserve a clear parent boundary rather than creating duplicated global destinations.
- TanStack Query v5 mutation docs, 2026-06-22: server mutations should update or invalidate relevant query data after success; optimistic updates are optional and require rollback handling.
- MDN `<dialog>` reference, 2026-06-22: modal dialogs are appropriate for focused confirmation tasks.
- WAI-ARIA APG modal dialog pattern, 2026-06-22: destructive/interruptive actions must trap focus and keep the user inside the confirmation until dismissed.

## Verification

Model Gateway is not complete unless:

- The primary viewbar has only four views.
- Client App Connection is reachable from Overview but not shown as a primary tab.
- Provider rows do not expose raw protocol/source/latency/date field dumps.
- API Provider creation and Codex account login are visually and behaviorally separate.
- Provider create/edit exposes advanced fields through section navigation, not an all-fields wall.
- Delete/apply/rollback actions require confirmation and show evidence after execution.
- Desktop and mobile have no horizontal page overflow.
