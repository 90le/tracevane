# Tracevane

> Compatibility repository path: `tracevane`  
> Product direction: local-first AI Agent Workspace and connectivity control layer  
> OpenClaw status: supported host/runtime, but not the full product boundary

Tracevane is a local-first control workbench for running, connecting, observing,
recovering and verifying AI Agent workflows across local projects, Model Gateway,
IM channels, CLI Agent runtimes and platform substrates.

The project currently ships as an OpenClaw UI extension while keeping Tracevane's
product boundary broader than OpenClaw: OpenClaw is one supported host and
runtime surface, not the whole workspace model.

## What Tracevane Covers

| Domain | Current responsibility |
|---|---|
| Workspace / Files | File operations, online editing, preview, terminal handoff, Git/evidence oriented workspace flows. |
| File Manager Online Editor | Lightweight Monaco-based multi-tab text editing launched from the file manager. |
| Standalone IDE Workbench | Project-level IDE direction with explorer, editor groups, panels, terminal, problems/output, layout persistence and future LSP/Git/tasks/debug. |
| Model Gateway | Provider routing, protocol adapters, endpoint profiles, account/media support, active routes and usage surfaces. |
| Channel Connectors | Feishu/Octo private chat integration to Agent workflows, files, progress, permissions and delivery evidence. |
| CLI Agents | Codex, Claude Code and OpenCode runtime readiness plus Agent Runs. CLI Agents are not treated as terminal management. |
| Platform / System Guard | OpenClaw config compatibility, service repair, daemon health, device trust, runtime summaries and event/audit support. |

## Repository Layout

```txt
.
├── apps/
│   ├── api/                 # Tracevane backend service, routes, modules and daemons
│   └── web/                 # React/Vite frontend workbench
├── docs/
│   ├── brand-identity.md     # Domain recommendation, logo direction and browser icon inventory
│   ├── ide-code-editor-solution/
│   │   ├── 00-README.md     # IDE / online editor planning index
│   │   └── 01..08-*.md      # Product, architecture, frontend/backend and rollout notes
│   └── 界面设计守则.md        # UI/design guardrails
├── assets/brand/             # Source SVG/browser icon brand pack
├── lib/                     # OpenClaw/plugin host compatibility and delivery helpers
├── scripts/                 # Build, dev, release and smoke-test scripts
├── tests/                   # System, terminal and browser smoke tests
├── types/                   # Shared TypeScript contracts
├── index.ts                 # OpenClaw extension entrypoint
├── DESIGN.md                # Active product/design source of truth
└── openclaw.plugin.json     # Extension manifest
```

## Main Documentation

Start with these documents, in this order:

1. [DESIGN.md](DESIGN.md) — active product/design source of truth.
2. [docs/brand-identity.md](docs/brand-identity.md) — domain recommendation, selected logo route and icon asset inventory.
3. [docs/界面设计守则.md](docs/界面设计守则.md) — visual and interaction guardrails.
4. [docs/ide-code-editor-solution/00-README.md](docs/ide-code-editor-solution/00-README.md) — code editor / IDE documentation index.
5. [apps/api/README.md](apps/api/README.md) — backend foundation notes.

The previous README referenced several planning documents that are no longer in
`docs/`. This README now points only to documents that are present in the
repository.

## Development

Install dependencies:

```bash
npm install
```

Common verification and build commands:

```bash
npm run typecheck:api
npm run typecheck:web
npm run build:api
npm run build:web
npm run build
```

Run the development environment:

```bash
npm run dev:restart
```

The development launcher is supported on Windows, macOS, and Linux; it starts
the API and web server in the background, records PID/log files under
`.tmp/dev-runtime`, and restarts either process if it exits. It requires a
single native Node/npm environment for the checkout. Do not share a
`node_modules` directory between Windows and WSL/Linux because optional native
dependencies are platform-specific. If you change environments, remove
`node_modules` and `apps/web/node_modules`, then run `npm ci` in the selected
environment.

If the default web port is occupied, select another port without stopping an
unrelated process:

```powershell
$env:TRACEVANE_WEB_PORT = "5180"; npm run dev:restart
```

```bash
TRACEVANE_WEB_PORT=5180 npm run dev:restart
```

Useful focused commands:

```bash
npm run dev:web
npm run dev:api
npm run dev:fresh
npm run test:system
npm run test:web:api
```

Default local endpoints:

- Web: `http://127.0.0.1:5176`
- API: `http://127.0.0.1:3761`

These are development endpoints. Customer standalone installs use the packaged
runtime defaults documented in `DEPLOY.md` (currently port `3760`).

## Release and Installation

Tracevane is released as an OpenClaw UI extension. New customer installs should
use OpenClaw `>= 2026.5.28`. The release pipeline does not require manual
Tracevane version editing: `./pack.sh` auto-increments the patch version from
`package.json`, synchronizes the installer and landing page, builds API/Web
artifacts, and emits site metadata plus the release tarball SHA-256 consumed by
the installer and upgrade checks.

Common release commands:

```bash
./pack.sh
./pack.sh 1.2.3
./pack.sh --print-version
./pack.sh --no-source-sync --output-dir /tmp/tracevane-release-test
bash install-tracevane.sh --check-release
```

Customer-facing deployment details live in [DEPLOY.md](DEPLOY.md). The public
landing page is [index.html](index.html), and the self-contained installer is
[install-tracevane.sh](install-tracevane.sh). The installer defaults to the
latest site metadata; offline or private-mirror installs should pass
`--version` or `--package-url` explicitly, and should also provide
`--package-sha256` when metadata is unavailable.

## Testing and Smoke Checks

The repository includes targeted system tests and smoke scripts under `tests/`
and `scripts/`. Pick the smallest check that proves the touched surface:

- API/backend contracts: `npm run typecheck:api`, `npm run test:system`
- Web contracts: `npm run typecheck:web`, `npm run build:web`
- Model Gateway: `npm run smoke:model-gateway:cli` or the narrower gateway smoke script
- Channel Connectors: use the matching `smoke:channel-connectors:*` script
- File Manager browser flows: use the matching `smoke:file-manager:*` script

## Engineering Rules

Tracevane follows a reuse-first engineering posture:

1. Prefer native browser/Node/TypeScript APIs, existing project utilities and
   already-installed dependencies before custom code.
2. Keep diffs small, reviewable and reversible.
3. Prefer deletion and consolidation over new wrapper layers.
4. Do not introduce new dependencies without a clear, verified reason.
5. Preserve user-visible behavior unless the task explicitly changes it.

## Research-First Gate

Before changing external contracts or user-visible behavior in Gateway, Channel
Connectors, CLI Agent runners, providers, SDK/API integrations, protocols,
IDE/editor runtime, terminal runtime, file-management workflows or platform
substrates:

1. Check current official docs/specs/API references/SDK docs/changelogs first.
2. Use active GitHub repositories/issues/discussions second.
3. Treat community reports/examples only as operational failure-mode evidence.
4. If a contract cannot be verified, keep the feature explicitly unsupported
   instead of silently half-working.
5. Record the research in the relevant implementation, design, checklist or
   progress document before or with the code change.

For purely local refactors, documentation cleanup or tests that do not change
contracts, keep the change small and verify locally.

## OpenClaw Extension Notes

- Extension entrypoint: `index.ts`
- Runtime build output: `dist/index.js`
- Manifest: `openclaw.plugin.json`
- Package metadata: `package.json` field `openclaw`
- Default transport modes: standalone API and OpenClaw gateway route

Tracevane should remain usable through OpenClaw while keeping internal modules,
shared types and frontend surfaces independent enough to support future local
workspace runtimes.
