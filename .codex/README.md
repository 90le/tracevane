# Tracevane project Codex configuration

This directory stores project-local Codex/OMX guidance for this Tracevane workspace.

## What is authoritative

- `../AGENTS.md` is the auto-loaded project guardrail for Codex agents.
- `config.toml` is the conservative project-local Codex config layer.
- `project-context.md` is the compact Tracevane IDE/editor implementation brief referenced by `AGENTS.md`.
- `../docs/ide-code-editor-solution/` is the implementation contract for File Manager Online Editor, File Surface, Mini Explorer, IDE Workbench, terminal, LSP/Git/debug and theme adaptation.
- `../DESIGN.md`, `../docs/界面设计守则.md`, and `../apps/web/src/design/theme.css` are the visual source of truth.

## Why this exists

The IDE/editor plan is detailed enough that agents must not improvise from generic IDE memory. Agents should first classify the target stage, read the relevant docs, then implement only that stage's scope and verification gates.

## Project config policy

Keep `.codex/config.toml` conservative. Prefer durable behavior in `AGENTS.md`; use config only for documented Codex settings such as instruction budget and subagent fan-out. Do not set project-local models, providers, credentials, approval policy, sandbox mode, MCP servers, or hooks unless the team explicitly decides to own that behavior in-repo.

## Native subagents

This repo defines two narrow read-only project agents:

- `tracevane-ide-scope`: stage/scope boundary auditor.
- `tracevane-theme-auditor`: Aurora token and light/dark theme auditor.

Use installed OMX roles for normal work (`explore`, `architect`, `executor`, `test-engineer`, `verifier`, `writer`). Spawn project agents only when a scope/theme audit materially improves correctness.

## Skills, MCP, hooks and plugins

- Repo skill: `.agents/skills/tracevane-ide-workflow` for IDE/editor stage workflow.
- MCP: `.codex/config.toml` enables public OpenAI Docs MCP for current Codex/OpenAI docs lookup.
- Hooks: no project hooks enabled; see `.codex/hooks/README.md`.
- Plugins: no project plugin yet; create one only for cross-repo distribution.
