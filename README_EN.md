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

> Tracevane ships as an OpenClaw UI extension for people who already run OpenClaw: paste one prompt to your OpenClaw agent and it installs everything.

## Capabilities

| Area | What it provides |
| --- | --- |
| Workspace & files | File management, online editing, preview, terminal, and Git workflows. |
| Model Gateway | Providers, models, routing, account pools, protocol adapters, and usage. |
| Channel Connectors | Connect Feishu, Octo, and other message inputs to Agent workflows. |
| CLI Agents | Readiness checks and execution surfaces for Codex, Claude Code, and OpenCode. |
| Runtime health | Service, configuration, device-trust, and runtime diagnostics. |

## Quick install

Supported on Linux, macOS, and WSL2 using a Linux filesystem. Bash, Node.js, and an onboarded OpenClaw installation are required. No OpenClaw yet? See "Install OpenClaw from scratch" below.

### Option 1: let your OpenClaw agent install it (recommended)

Paste this prompt into your OpenClaw conversation. The agent downloads the installer, verifies the SHA-256, installs, and runs health checks — tokens and credentials never enter the chat:

```text
OpenClaw is already installed and onboarded on this machine. First verify the environment with: openclaw --version, openclaw doctor, openclaw gateway status. Then download the Tracevane installer from https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh to a local path, review the script, and run it with --check-release to confirm the release version and SHA-256. If everything checks out, run it with --mode gateway --json to mount Tracevane at the gateway path /tracevane. Never use curl | bash, and never bypass TLS, SHA-256, config validation, or health checks. When done, report the JSON fields version, installDir, configPath, accessUrls, healthChecks, warnings, and degradedFeatures, and confirm both the /tracevane route and the 3760 fallback health check pass. Redact every token and credential — do not echo them; I will read the access token myself from ~/.openclaw/openclaw.json.
```

Prompts for the standalone entry (`127.0.0.1:3760`), fresh machines, and audit dry-runs live in [Agent installation prompts](docs/agent-installation.md).

### Option 2: run the installer yourself

Download and inspect the script first; do not use `curl | bash`.

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release

# Single-port mode (recommended): mount at the gateway path /tracevane
/tmp/install-tracevane.sh --mode gateway --json

# Or the standalone entry: http://127.0.0.1:3760
/tmp/install-tracevane.sh --mode standalone --json
```

The installer verifies release metadata and SHA-256, then returns the install directory, configuration path, access URLs, and health results. See [Installation](docs/installation.md) for every flag.

### Install OpenClaw from scratch (first time only)

**Fresh machine:** the Tracevane installer does not install a completely missing OpenClaw CLI; it only upgrades an existing installation that is too old. If `openclaw --version` is not found:

```bash
node --version
npm --version
npm install -g openclaw@latest
openclaw --version
openclaw onboard --install-daemon
openclaw doctor
openclaw gateway status
```

Onboarding asks you to select a model provider and authorize an account or API key. Keep credentials out of issues, logs, and agent conversations. Refer to the [official OpenClaw installation guide](https://docs.openclaw.ai/install) for current runtime requirements and alternative methods. Once the checks pass, go back to option 1 or 2.

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
