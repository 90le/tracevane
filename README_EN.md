# Tracevane

<p align="center">
  <img src="assets/brand/tracevane-lockup.svg" alt="Tracevane" width="440">
</p>

<p align="center">
  <strong>A local-first AI Agent control workbench for OpenClaw.</strong><br>
  Manage workspaces, model gateways, channels, CLI agents, and runtime health from one interface.
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="https://90le.github.io/tracevane/">Website</a> ·
  <a href="https://github.com/90le/tracevane/releases/latest">Releases</a> ·
  <a href="https://github.com/90le/tracevane/issues">Issues</a>
</p>

<p align="center">
  <a href="https://github.com/90le/tracevane/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/90le/tracevane?display_name=tag&style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-35e69a?style=flat-square"></a>
  <a href="https://github.com/90le/tracevane/actions"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/90le/tracevane/pages.yml?style=flat-square&label=pages"></a>
</p>

> Tracevane currently ships as an OpenClaw UI extension and is in maintenance mode. Existing capabilities will be maintained, without a fixed feature cadence.

## Capabilities

| Area | What it provides |
| --- | --- |
| Workspace & files | File management, online editing, preview, terminal, and Git workflows. |
| Model Gateway | Providers, models, routing, account pools, protocol adapters, and usage. |
| Channel Connectors | Connect Feishu, Octo, and other message inputs to Agent workflows. |
| CLI Agents | Readiness checks and execution surfaces for Codex, Claude Code, and OpenCode. |
| Runtime health | Service, configuration, device-trust, and runtime diagnostics. |

## Quick install

Supported on Linux, macOS, and WSL using a Linux filesystem. Bash, Node.js, and a working OpenClaw environment are required. Download and inspect the installer first; do not use `curl | bash`.

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
/tmp/install-tracevane.sh --mode standalone --json
```

For an existing OpenClaw Gateway, change only the final command:

```bash
/tmp/install-tracevane.sh --mode gateway --json
```

The installer verifies release metadata and SHA-256, then returns the install directory, configuration path, access URLs, and health results. See [Installation](docs/installation.md) and [Agent installation prompts](docs/agent-installation.md).

## Development

```bash
npm ci
npm run dev:restart
```

Development defaults: Web `http://127.0.0.1:5176`, API `http://127.0.0.1:3761`.

```bash
npm run typecheck
npm run typecheck:web
npm run build
npm run test:system
```

Development is supported on Windows, macOS, and Linux. Do not share `node_modules` between Windows and WSL; run `npm ci` again after switching environments.

## Documentation

- [Installation and uninstall](docs/installation.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Model Gateway acceptance boundaries](docs/model-gateway/README.md)
- [IDE and online editor design](docs/ide-code-editor-solution/00-README.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Repository layout

```text
apps/api       Backend services and runtime modules
apps/web       React / Vite frontend
lib            OpenClaw compatibility and delivery helpers
types          Shared frontend/backend contracts
scripts        Build, release, and smoke scripts
tests          System tests and browser smoke tests
index.ts       OpenClaw extension entrypoint
```

## Contributing and license

Search existing issues before opening a new one. Report security problems privately as described in [SECURITY.md](SECURITY.md), and read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code.

Tracevane is available under the [MIT License](LICENSE).
