# Project-local native agents

Codex supports project-scoped custom agents as `.codex/agents/*.toml`.

This repo defines two narrow read-only project agents:

- `tracevane-ide-scope` — stage/scope boundary auditor for File Manager, Online Editor, Mini Explorer, IDE Workbench, terminal, LSP/Git/debug and theme changes.
- `tracevane-theme-auditor` — Aurora token, dense-surface and light/dark theme auditor for Monaco, xterm, Dockview, File Surface, IDE Workbench, Diff, Problems and Output.

Use installed roles first for normal work:

- `explore` for fast file/symbol mapping.
- `architect` for read-only design and boundary analysis.
- `executor` for implementation.
- `test-engineer` for tests.
- `verifier` for completion evidence.
- `writer` for documentation.

Use the project custom agents only when a focused read-only audit materially improves correctness. Do not use them as generic workers, and do not use them as a substitute for reading the IDE docs or following stage boundaries.

Add another custom agent TOML only when all are true:

1. The role repeats across multiple Tracevane tasks.
2. Installed roles plus `AGENTS.md` are not specific enough.
3. The new instructions are narrower than root `AGENTS.md`.
4. The agent has a clear read/write boundary.
5. The agent will be spawned explicitly; Codex does not spawn subagents unless asked.
