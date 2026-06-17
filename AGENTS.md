# OpenClaw Studio Guardrails

This file applies to the whole OpenClaw Studio workspace.

## Research-First Implementation Gate

Before starting or changing any feature, adapter, provider, SDK/API integration, Channel Connector, CLI Agent runner, IM workflow, Gateway protocol route, UI workflow, or user-visible behavior:

1. Verify the current external landscape on the web before designing the implementation. Check official docs/specs/API references/SDK docs/changelogs first, then active GitHub repositories/issues/discussions, then community reports or examples for operational failure modes.
2. Record the research in the relevant goal, progress, or checklist doc before or with the code change: sources checked, date, stable contracts found, rejected options, known risks, and the verification plan.
3. Prefer official and directly verified contracts over memory, old local snapshots, or third-party implementations. Historical projects and migration sources are archival context only; they are not implementation authority or required migration targets.
4. If network access is unavailable, do not invent a contract. Use only already documented verified contracts, mark the stale-data risk explicitly, and keep unsupported routes explicit until they are verified.
5. Implement only after comparing current external evidence with the local TypeScript/runtime boundary. User-visible behavior must be protected by regression tests and, when behavior depends on real services or CLIs, by focused smoke verification.

Keep `docs/research-first-development-checklist.md` updated whenever Gateway, Channel Connectors, CLI Agent runner, provider, SDK, protocol, or user-facing workflow scope changes. Commits that intentionally rely on an unverified or temporary contract must record that limitation in commit trailers.
