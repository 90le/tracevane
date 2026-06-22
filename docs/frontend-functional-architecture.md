# Tracevane Frontend Functional Architecture

> Updated: 2026-06-21
> Scope: React frontend rebuild, real functionality migration, platform integration boundary

## Decision

The frontend reset is not a visual-only migration. Aurora prototypes are the visual and interaction contract, but the production frontend must move to real React pages backed by existing Tracevane APIs.

The durable structure is:

1. **Tracevane Workbench**: task-first surfaces for AI Agent sessions, Workspace IDE, Model Gateway, IM Channels, long tasks, approvals, files/evidence and recovery.
2. **Platform Integrations**: `/platforms` is a low-frequency platform boundary for third-party runtime identity, health, permissions, version and diagnostics.
3. **OpenClaw Platform**: `/platforms/openclaw` is the first deep platform child domain for OpenClaw support operations that Tracevane depends on.
4. **API Data Layer**: TanStack Query hooks consume existing backend APIs first. Backend changes require a separate contract note and tests.
5. **Aurora Design System**: visual tokens, shell behavior, density and interaction patterns remain the design baseline.

Product hierarchy is strict: Tracevane is not an OpenClaw console skin. OpenClaw is a supported runtime substrate and platform integration. It must not define Tracevane's primary navigation, page hierarchy, product wording, or workflow ownership.

## Research Checked

- React Router nested/layout routing docs: `https://reactrouter.com/start/declarative/installation`
- TanStack Query React docs: `https://tanstack.com/query/latest/docs/framework/react/overview`
- Tailwind CSS v4 + Vite docs: `https://tailwindcss.com/docs/installation/using-vite`
- shadcn/ui Vite and Tailwind v4 docs: `https://ui.shadcn.com/docs/installation/vite`, `https://ui.shadcn.com/docs/tailwind-v4`
- React Router HashRouter docs: `https://reactrouter.com/main/api/declarative-routers/HashRouter`
- TanStack Query `useQuery` docs: `https://tanstack.com/query/latest/docs/framework/react/reference/useQuery`
- MDN File System API and user activation docs: `https://developer.mozilla.org/docs/Web/API/File_System_API`, `https://developer.mozilla.org/en-US/docs/Web/Security/User_activation`
- Local OpenClaw 2026.6.8 CLI help:
  - `openclaw dashboard` opens the Control UI.
  - `openclaw config` supports `get/set/patch/unset/file/schema/validate`.
  - `openclaw doctor` supports read-only lint and repair flows.
  - `openclaw gateway` supports status, diagnostics, start/stop/restart and service install.
  - `openclaw plugins`, `openclaw skills`, `openclaw agents`, `openclaw channels`, `openclaw secrets` already own generic runtime CRUD.

## Product Boundary

Tracevane must not become a duplicate OpenClaw web console.

Main workflow pages must be named and shaped around Tracevane jobs-to-be-done, not OpenClaw administration. If a page primarily answers "how do I run, supervise, recover, review, route, approve, or inspect an AI Agent task?", it belongs in the Tracevane workbench. If it primarily answers "how do I configure or diagnose the underlying OpenClaw host/runtime?", it belongs under `/platforms/openclaw` or should link out to the official OpenClaw UI.

Keep in the main Tracevane workbench:

- Model Gateway provider/protocol/client connection workflows.
- CLI Agent execution, sessions, status, cancellation and evidence.
- Workspace IDE with editor, terminal, preview, diff and approvals.
- IM Channel execution workflows and agent bindings.
- Recovery and stability flows that protect Tracevane runtime paths.
- Evidence, files, approvals and observability.

Keep only platform support in `/platforms`:

- Third-party platform account, runtime identity, version, permission, credential-health and diagnostic summaries.
- Links from platform summaries back to the real Tracevane workbench page that owns the daily workflow.
- OpenClaw as a managed child domain under `/platforms/openclaw`.

Move OpenClaw support operations to `/platforms/openclaw`:

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

- **Prototype-backed routes**: 1 Aurora HTML fragment rendered through `PrototypePage`. This preserves visual structure and route coverage while functionality is migrated.
- **React functional routes**: `/dashboard` uses `DashboardPage`; `/chat` uses `ChatWorkbenchPage`; `/ide` uses `WorkspaceIdePage`; `/long-tasks` uses `LongTasksPage`; `/cli-agents` uses `CliAgentsPage`; `/model-gateway` uses `ModelGatewayPage`; `/im-channels` uses `ImChannelsPage`; `/external` uses `ExternalConnectionsPage`; `/files` uses `FileEvidencePage`; `/recovery` uses `RecoveryPage`; `/platforms` uses `PlatformIntegrationsPage`; `/platforms/openclaw` and `/platforms/openclaw/:section` use `OpenClawPlatformPage`, TanStack Query and existing APIs. Legacy `/runtime-admin` routes redirect to the OpenClaw child domain.

Dashboard sections:

- `hero`: overall Tracevane readiness from system health, Gateway health, Chat sessions, Channel Connector sessions and Terminal status.
- `domains`: main Tracevane workbench shortcuts with live status.
- `attention`: recovery, Gateway health, Channel replay and system runtime evidence.
- `summary`: dashboard summary counts and runtime metadata.

Dashboard first React pass is intentionally read-only. It does not subscribe to dashboard SSE or execute repair/smoke actions until stream lifecycle, task-idle checks and evidence rules are designed.

Chat sections:

- `sessions`: recent Tracevane Agent sessions from `/api/chat/bootstrap`.
- `messages`: history messages, empty states and tool-call summaries for the selected session.
- `runs`: run overlays and lifecycle preview.
- `queue`: queued/blocked outbound messages.
- `diagnostics`: Gateway reachability, transport, auth and truncation diagnostics.
- `inspector`: runtime state, controls, tool cards and observability timeline.

Chat first React pass is intentionally read-only. Send, abort, reset, delete, queue mutation and host-management controls need explicit confirmation, duplicate-request handling, runtime evidence and rollback/visibility rules before exposure.

Workspace IDE sections:

- `workspace`: project-root file browser and read-only file content.
- `preview`: Markdown/plain text preview for the currently selected text-like file.
- `diff`: file-scoped Git diff, when available.
- `git`: branch, cleanliness and changed-file summary.
- `terminal`: Terminal runtime/agent CLI status and persisted sessions.
- `evidence/ai`: recent commits and locked AI-edit intent.

Workspace IDE first React pass is intentionally read-only. File writes, Git stage/commit, terminal launch/end and AI diff apply need explicit confirmation, rollback/evidence and mobile-safe interaction design before exposure.

CLI Agents sections:

- `overview`: persona agent count, installed agent CLIs, chat session count, Channel Connector active run count and Gateway health.
- `agents`: Tracevane-facing persona/runtime agent inventory from `/api/agents`; generic OpenClaw CRUD remains delegated to platform support.
- `cli`: Codex, Claude Code and OpenCode binary install/version state from Terminal status.
- `sessions`: persisted terminal sessions and recent Tracevane chat sessions.
- `channels`: Channel Connectors async agent-session evidence and recent events.

CLI Agents first React pass is intentionally read-only. Terminal launch/end, Channel Connector command actions, session kill/reap and chat send/cancel need confirmation/evidence flows before exposure.

Long Tasks sections:

- `hero`: running/planned/failed counts and evidence-source coverage.
- `task list`: synthesized long-running work from Chat runtime overlays/sessions/queue, Channel Connector active sessions/events, Terminal sessions and Recovery status.
- `detail`: selected task progress, status/source metrics, recent evidence and locked control boundary.

Long Tasks first React pass is intentionally read-only. It reads `/api/chat/bootstrap`, `/api/channel-connectors/agent-sessions`, `/api/terminal/sessions` and `/api/openclaw-recovery/status`. It does not pause, stop, retry, reap, abort, restart or launch work. This is intentional because TUI silence, child-agent fan-out, detached terminal sessions and recovery probes cannot be classified safely by output timeout alone.

Model Gateway sections:

- `overview`: Aurora `hero` metrics, active route rows, health overview and client connection summary.
- `providers`: Aurora `page-head / toolbar / split / tablewrap / detail` Provider List-Detail workbench. Provider search/filter/detect/new, configuration, smoke, default route and delete actions stay in the original toolbar or inspector action rows.
- `providercfg`: Aurora `subpage / subpage-grid / cfg / save-bar` Provider create/edit child view for base URL, API format, auth, structured endpoint profile rows, structured model catalog rows, network, reasoning, metadata and app scopes.
- `models`: Aurora model table plus capability/price `cfg` panel, backed by Provider model catalog and usage rows.
- `usage`: Aurora KPI, distribution and latency panels.
- `accounts`: Aurora account-pool child view for account-backed Providers, backed by real `accountProvider.accounts` with refresh, enable/disable and cooldown-clear actions.
- `apps`: Aurora client-connection child view reached from the Overview "管理" action, not a fifth primary tab. Preview/apply/rollback call the existing Gateway App Connection APIs and destructive writes require confirmation.

Model Gateway must treat `docs/prototypes/pages/model-gateway.html` as the page-level visual and interaction contract. React implementation may bind real Gateway APIs into the prototype slots, but missing fields must use prototype placeholders or empty states instead of changing layout, adding new cards or inventing alternate styles. The implemented view set must match the prototype exactly: `overview / providers / providercfg / models / accounts / apps / usage`. Main tabs stay limited to `overview / Provider / models / usage`; secondary views are reached only from prototype actions. Provider mutation, route selection, app connection writes and destructive actions must stay behind focused child flows or confirmation-backed controls. Provider model editing uses controlled structured rows for model id, display name, alias, context/output budget and capability flags; newline/comma text areas are not accepted because they lose alias/default/capability data and drift from the prototype child-page flow.

IM Channels sections:

- `overview`: native daemon reachability, pending replay, Feishu/Octo connection counts and recent session events.
- `channels`: configured channel/account summary from `/api/channels`, without raw credentials.
- `bindings`: Tracevane channel bindings and native daemon platform bindings.
- `sessions`: persistent CLI Agent sessions; kill/reap are locked out of this first pass.
- `logs`: daemon log tail.

IM Channels first React pass is intentionally read-only. Transport smoke, command actions and session kill/reap need confirmation/evidence flows before being exposed.

External Connections sections:

- `overview`: external connection count, Skills readiness, Gateway app connections and IM transport evidence.
- `connections`: synthesized read-only connection list from OpenClaw config MCP summary, Skills, Gateway App Connections, Channel Connector runtime and Tracevane HTTP diagnostics.
- `capabilities`: top Skills/tool capability rows from `/api/skills`.
- `auth`: masked authorization and ownership boundaries; no browser-visible secret material.

External Connections first React pass is intentionally read-only. It reads `/api/config`, `/api/skills`, `/api/model-gateway/app-connections`, `/api/channel-connectors/status` and `/api/system/diagnostics`. It does not add/remove connections, test transports, refresh OAuth, apply App Connections or mutate MCP servers. Writes remain owned by Model Gateway, IM Channels, Platform/OpenClaw or a future confirmation-backed connector flow.

File Evidence sections:

- `overview`: project-root file/directory counts, text-like count, Git cleanliness and root path.
- `files`: project-root browse results sorted by modified time.
- `search`: recursive file search for locating evidence, without invoking browser file-system access.
- `git`: Git status changes and recent commit evidence.
- `detail`: selected file metadata, bounded text preview and file-scoped Git diff.

File Evidence first React pass is intentionally read-only. It reads `/api/files/summary`, `/api/files/browse`, `/api/files/search`, `/api/files/read`, `/api/git/status` and `/api/git/diff`. It does not call file write, upload, rename, copy/move, archive, delete or download endpoints. MDN's File System Access security model requires explicit user permission and user activation for local file access/write-style capabilities; Tracevane therefore keeps file mutation under Workspace IDE and future approval/rollback flows instead of exposing generic file management in the evidence page.

OpenClaw Platform sections:

- `overview`: health, config, runtime, recovery summary.
- `config`: read-only OpenClaw config summary, policy/section counts and raw preview.
- `extensions`: skills/extensions inventory.
- `agents-channels`: generic Agent and Channel inventory.
- `services`: Tracevane-managed daemon status.
- `recovery`: recovery status, recent events, backups, guard policy and safe manual probe.

Safe action policy:

- Default queries are read-only.
- `/api/openclaw-recovery/run` is only called with `action: "probe"` from OpenClaw Platform.
- Repair/config-repair/restore-backup/service restart actions are displayed as locked actions until explicit confirmation, schema/diff preview, backup path, task-idle checks and rollback evidence are implemented.

Recovery sections:

- `overview`: Tracevane System Guard status, Gateway probe, Recovery daemon, service snapshot, system runtime and policy guard score.
- `events`: paged Recovery event evidence from `/api/openclaw-recovery/events`.
- `backups`: paged backup evidence from `/api/openclaw-recovery/backups`.
- `guardrails`: locked action matrix and explicit risks for long-running TUI/child-agent workflows.

Recovery first React pass is intentionally read-only. It reads `/api/openclaw-recovery/status`, `/api/openclaw-recovery/events`, `/api/openclaw-recovery/backups`, `/api/openclaw-recovery/daemon-service` and `/api/system/health`. It does not call repair, config repair, backup restore, daemon-service mutation or any POST action. This keeps the main Tracevane System Guard focused on evidence and prevents accidental interruption of active Codex/Claude/OpenCode tasks.

## Migration Rule

Each route graduates from prototype to real functionality in this order:

1. Keep the Aurora layout and route contract.
2. Define the data contract using existing backend APIs.
3. Add a typed query/mutation adapter.
4. Replace mock DOM mount behavior with React state and components.
5. Add a focused system test for route, API endpoints, empty/loading/error states and any mutation guard.
6. Remove obsolete prototype-only behavior for that route.

## Priority Order

1. Platform Integrations / OpenClaw Platform: finish safe read-only management and confirmed repair actions.
2. Chat: real session list, run progress, artifacts and cancellation.
3. Approvals: graduate the remaining prototype route without turning it into OpenClaw CRUD.
4. Workspace IDE edit depth: controlled write, preview-time edit, task launch and AI diff apply flows after confirmation/rollback contracts.

## Risks

- Raw HTML fragments are useful for visual parity but are not an acceptable long-term functional implementation.
- OpenClaw or any third-party generic management can bloat and confuse the product if it appears as a main Tracevane workflow or influences core page structure.
- Config writes are high-risk because OpenClaw schema changes over time; write flows must validate against current schema before saving.
- Service restart/repair actions can interrupt active tasks; they need confirmation, preview and rollback evidence.
- A route is not considered complete until both frontend behavior and backend API contract are tested.
