# Studio AI Workbench

> Historical repository name: `OpenClaw Studio`
> Current product direction: local-first AI Agent control workbench

This project is no longer framed as a generic OpenClaw management console. It is evolving into a local-first workbench for running, connecting, observing and recovering AI Agent workflows across OpenClaw, Codex, Claude Code, OpenCode, IM channels and model providers.

OpenClaw remains a supported runtime. It is not the full product boundary.

## Current Core

- Model Gateway: provider routing, protocol adapters, endpoint profiles, App Connections and usage.
- Channel Connectors: Feishu/Octo private chat to CLI Agent workflows, files, progress, permissions and busy guard.
- CLI Agent Workbench: Codex, Claude Code, OpenCode and OpenClaw runtime profiles.
- System Guard / Recovery: OpenClaw config compatibility, service repair, daemon health and secret audit support.
- Chat / Files / Dashboard: kept as Studio-specific workbench surfaces, not generic clones of official Web UIs.

## Retired Scope

- Dreaming / memory management page and BFF.
- Studio Plugins management page and BFF.
- Old broad Gateway usage surface with provider/account/key archives, pagination, CSV and cost estimation.
- Third-party migration-first plans as implementation authority.

## Documentation Entry

Start here:

1. [docs/product-strategy-reset-plan.md](docs/product-strategy-reset-plan.md)
2. [docs/产品需求.md](docs/产品需求.md)
3. [docs/系统架构.md](docs/系统架构.md)
4. [docs/当前进展.md](docs/当前进展.md)
5. [docs/research-first-development-checklist.md](docs/research-first-development-checklist.md)

Active track docs:

- [docs/studio-gateway-goal.md](docs/studio-gateway-goal.md)
- [docs/studio-gateway-progress.md](docs/studio-gateway-progress.md)
- [docs/channel-connectors-native-agent-bot-plan.md](docs/channel-connectors-native-agent-bot-plan.md)
- [docs/openclaw-recovery-daemon-goal.md](docs/openclaw-recovery-daemon-goal.md)
- [docs/openclaw-recovery-daemon-progress.md](docs/openclaw-recovery-daemon-progress.md)

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

Gateway, Channel Connectors, CLI Agent, provider, SDK/API, protocol and user-visible behavior changes must begin with current official/API/SDK/GitHub/community research. If a contract cannot be verified, the feature must remain explicitly unsupported instead of silently half-working.
