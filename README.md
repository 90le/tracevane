# Tracevane

> Compatibility repository path: `tracevane`
> Current product direction: local-first AI Agent Workspace and connectivity control layer

Tracevane is evolving into a local-first Workspace for running, connecting, observing, recovering and verifying AI Agent workflows across local projects, Model Gateway, IM channels, CLI Agent runtimes and platform substrates.

OpenClaw remains a supported runtime/platform. It is not the full product boundary.

## Current Core

- Workspace: files, editor, preview, terminal, Git, evidence and Agent handoff.
- Model Gateway: provider routing, protocol adapters, endpoint profiles, App Connections and usage.
- IM Channels: Feishu/Octo private chat to Agent workflows, files, progress, permissions and delivery evidence.
- CLI Agents: Codex, Claude Code and OpenCode runtime readiness and Agent Runs. CLI Agents are not terminal management.
- Platform / System Guard: OpenClaw config compatibility, service repair, daemon health and secret audit support.

## Documentation Entry

Start here:

1. [docs/整体目标.md](docs/整体目标.md)
2. [docs/产品需求.md](docs/产品需求.md)
3. [docs/Workspace目标.md](docs/Workspace目标.md)
4. [docs/Workspace设计文档.md](docs/Workspace设计文档.md)
5. [docs/Workspace架构.md](docs/Workspace架构.md)
6. [docs/Workspace前端架构.md](docs/Workspace前端架构.md)
7. [docs/Workspace后端设计.md](docs/Workspace后端设计.md)
8. [docs/研究先行开发清单.md](docs/研究先行开发清单.md)

## Development

```bash
npm install
npm run typecheck:api
npm run typecheck:web
npm run build:api
npm run build:web
npm run dev:restart
```

Dev defaults:

- Web: `http://127.0.0.1:5176`
- API: `http://127.0.0.1:3761`

## Working Rule

Gateway, Channel Connectors, CLI Agent, provider, SDK/API, protocol, Workspace, terminal, file-management and user-visible behavior changes must begin with current official/API/SDK/GitHub/community research. If a contract cannot be verified, the feature must remain explicitly unsupported instead of silently half-working.
