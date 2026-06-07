# OpenClaw Studio Guardrails

This file applies to the whole OpenClaw Studio workspace.

## Channel Connectors CC-First Migration Gate

Channel Connectors, CLI Agent Bot, IM channel, menu/card, progress, file, session, permission, and runner work must follow this order:

1. Locate the matching CC Go implementation under `release/openclaw-studio-0.1.70/resources/codex-stack/cc-connect-source`.
2. Port the CC contract 1:1 first: input/output shape, session key, command semantics, menu/card behavior, progress/tool events, file staging/send, retries, error envelope, permission, and tests.
3. Verify the Studio port with regression tests and, when the behavior is user-visible, Feishu/Octo or CLI live smoke.
4. Only then apply Studio-specific refinements.

Do not rebuild CC features from scratch when source exists. A non-CC design is allowed only when CC has no equivalent capability, the CC design cannot work in Studio's TypeScript/runtime boundary, or the replacement is proven better with explicit rationale, tests, and documentation.

Codex `app-server` / persistent session work is beta-only until it reaches parity with the CC-style `exec/resume` path for files, tools, streaming progress, stop, compact, and recovery. It must not become the live default by accident.

Keep `docs/channel-connectors-cc-migration-checklist.md` updated whenever Channel Connectors scope changes. Commits that intentionally diverge from CC must record the reason in the commit trailers.

For Studio Gateway protocol conversion work, `/tmp/cc-switch-src` is the maturity reference for SSE reconstruction, tool/history mapping, usage/cache, reasoning/thinking, and error envelopes.
