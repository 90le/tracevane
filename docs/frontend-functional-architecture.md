# Tracevane Frontend Functional Architecture

> Updated: 2026-06-21
> Scope: React frontend rebuild, real functionality migration, OpenClaw runtime management boundary

## Decision

The frontend reset is not a visual-only migration. Aurora prototypes are the visual and interaction contract, but the production frontend must move to real React pages backed by existing Tracevane APIs.

The durable structure is:

1. **Tracevane Workbench**: task-first surfaces for AI Agent sessions, Workspace IDE, Model Gateway, IM Channels, long tasks, approvals, files/evidence and recovery.
2. **OpenClaw Runtime Admin**: a secondary subdomain under `/runtime-admin` for OpenClaw support operations that Tracevane depends on.
3. **API Data Layer**: TanStack Query hooks consume existing backend APIs first. Backend changes require a separate contract note and tests.
4. **Aurora Design System**: visual tokens, shell behavior, density and interaction patterns remain the design baseline.

## Research Checked

- React Router nested/layout routing docs: `https://reactrouter.com/start/declarative/installation`
- TanStack Query React docs: `https://tanstack.com/query/latest/docs/framework/react/overview`
- Tailwind CSS v4 + Vite docs: `https://tailwindcss.com/docs/installation/using-vite`
- shadcn/ui Vite and Tailwind v4 docs: `https://ui.shadcn.com/docs/installation/vite`, `https://ui.shadcn.com/docs/tailwind-v4`
- Local OpenClaw 2026.6.8 CLI help:
  - `openclaw dashboard` opens the Control UI.
  - `openclaw config` supports `get/set/patch/unset/file/schema/validate`.
  - `openclaw doctor` supports read-only lint and repair flows.
  - `openclaw gateway` supports status, diagnostics, start/stop/restart and service install.
  - `openclaw plugins`, `openclaw skills`, `openclaw agents`, `openclaw channels`, `openclaw secrets` already own generic runtime CRUD.

## Product Boundary

Tracevane must not become a duplicate OpenClaw web console.

Keep in the main Tracevane workbench:

- Model Gateway provider/protocol/client connection workflows.
- CLI Agent execution, sessions, status, cancellation and evidence.
- Workspace IDE with editor, terminal, preview, diff and approvals.
- IM Channel execution workflows and agent bindings.
- Recovery and stability flows that protect Tracevane runtime paths.
- Evidence, files, approvals and observability.

Move to `/runtime-admin`:

- OpenClaw config summary and validated edit entry points.
- OpenClaw extensions/plugins/skills inventory.
- Generic Agent and Channel management that is not part of a Tracevane task flow.
- Tracevane-managed service status for Gateway, Channel Connectors and Recovery.
- Doctor/recovery probe, diagnostics, backups and repair entry points.

Delegate or link out instead of rebuilding:

- Full generic OpenClaw plugin marketplace management.
- Full OpenClaw Control UI dashboards.
- General-purpose OpenClaw setup/onboarding flows unless Tracevane needs a constrained setup path.

## Current Implementation

`apps/web-vue` remains the workspace path for release stability, but the active frontend is React.

Current page classes:

- **Prototype-backed routes**: 11 Aurora HTML fragments rendered through `PrototypePage`. These preserve visual structure and route coverage while functionality is migrated.
- **React functional routes**: `/runtime-admin` and `/runtime-admin/:section` use `RuntimeAdminPage`, TanStack Query and existing APIs.

Runtime Admin sections:

- `overview`: health, config, runtime, recovery summary.
- `config`: read-only OpenClaw config summary and raw preview.
- `extensions`: skills/extensions inventory.
- `agents-channels`: generic Agent and Channel inventory.
- `services`: Tracevane-managed daemon status.
- `recovery`: recovery status, recent events, backups and safe manual probe.

Safe action policy:

- Default queries are read-only.
- `/api/openclaw-recovery/run` is only called with `action: "probe"` from Runtime Admin.
- Repair/config-repair/service restart actions must use explicit confirmation flows before being exposed here.

## Migration Rule

Each route graduates from prototype to real functionality in this order:

1. Keep the Aurora layout and route contract.
2. Define the data contract using existing backend APIs.
3. Add a typed query/mutation adapter.
4. Replace mock DOM mount behavior with React state and components.
5. Add a focused system test for route, API endpoints, empty/loading/error states and any mutation guard.
6. Remove obsolete prototype-only behavior for that route.

## Priority Order

1. Runtime Admin: finish safe read-only management and confirmed repair actions.
2. Model Gateway: replace provider/model/usage/app-connection mock panels with live API data.
3. IM Channels / Channel Connectors: show live daemon config, bindings, service health and session evidence.
4. Workspace IDE: real file tree, editor, terminal, Git, Markdown/HTML preview and diff review.
5. Chat / CLI Agent sessions: real session list, run progress, artifacts and cancellation.
6. Dashboard: live operations cockpit assembled from the above domains.

## Risks

- Raw HTML fragments are useful for visual parity but are not an acceptable long-term functional implementation.
- OpenClaw generic management can bloat the product if it appears in the main navigation.
- Config writes are high-risk because OpenClaw schema changes over time; write flows must validate against current schema before saving.
- Service restart/repair actions can interrupt active tasks; they need confirmation, preview and rollback evidence.
- A route is not considered complete until both frontend behavior and backend API contract are tested.
