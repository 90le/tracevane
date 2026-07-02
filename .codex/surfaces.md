# Tracevane Codex surfaces design

This document records which Codex customization surfaces this project uses and which are intentionally not enabled.

| Surface | Status | Reason |
| --- | --- | --- |
| Root `AGENTS.md` | Active | Main durable engineering contract and routing policy. |
| Nested `AGENTS.md` | Active | Narrow rules for docs, File Manager, editor-core, Files API and terminal runtime. |
| `.codex/config.toml` | Active, conservative | Raises instruction budget, bounds subagents, enables public OpenAI Docs MCP. |
| `.codex/agents/*.toml` | Active, read-only auditors | Two explicit audit agents for IDE scope and theme drift. |
| `.agents/skills/tracevane-ide-workflow` | Active | Reusable stage-classification and verification workflow for editor/IDE work. |
| Project MCP | Minimal | OpenAI Docs MCP only; no private/service MCP until a concrete workflow needs it. |
| Project hooks | Not enabled | Global OMX hooks already exist; project hooks need trust review and should be mechanical only. |
| Project plugin | Not enabled | Single-repo workflows are covered by AGENTS + skill. Build a plugin only for distribution. |

## Future additions checklist

Before adding a new surface, answer:

1. Is the need repeated, not one-off?
2. Is this the smallest surface for the job?
3. Can it be verified locally?
4. Does it avoid secrets and personal preferences in repo?
5. Does it reduce agent drift more than it adds configuration complexity?

If any answer is no, prefer docs/AGENTS guidance over new config.
