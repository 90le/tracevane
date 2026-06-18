# Product Strategy Reset Plan

> Status: planning baseline
> Updated: 2026-06-18
> Rule: this document replaces the old "OpenClaw management console" product framing. Implementation happens in later feature work.

## 1. New Positioning

The project should evolve from **OpenClaw Studio, an OpenClaw management console**, into a **local-first AI Agent control workbench**.

OpenClaw remains an important runtime integration, but it is no longer the product boundary. The product boundary is:

- model gateway and provider routing
- CLI Agent workbench for Codex, Claude Code, OpenCode, OpenClaw and future agents
- IM/channel execution bridge
- runtime recovery and configuration compatibility guard
- observability, evidence, cost, latency, tool calls and session lifecycle
- project artifacts, files and operational runbooks that help humans supervise agent work

The project should not compete with OpenClaw official Web UI on generic OpenClaw CRUD. It should keep the parts where Studio adds independent value across runtimes, providers and channels.

## 2. External Market Signals

Recent checks show the market already has strong products in these adjacent spaces:

| Space | Signal | Product decision |
| --- | --- | --- |
| OpenClaw official Web UI | OpenClaw docs describe Control UI, Dashboard and WebChat as built-in gateway/admin/chat surfaces: `https://docs.openclaw.ai/web/control-ui`, `https://docs.openclaw.ai/web/dashboard`, `https://docs.openclaw.ai/web/webchat` | Delegate generic OpenClaw chat/config/admin duplication when official UI is good enough. |
| Self-hosted chat UI | Open WebUI and LibreChat cover model-agnostic chat, tools, memory, files, artifacts and agents: `https://docs.openwebui.com/features/`, `https://www.librechat.ai/docs/features` | Studio Chat must become an agent operations workbench, not a chat clone. |
| Workflow/agent builder | Dify, n8n, Microsoft Copilot Studio and Oracle AI Agent Studio already own visual workflows and enterprise agent builders: `https://dify.ai/`, `https://docs.n8n.io/advanced-ai/intro-tutorial/`, `https://www.microsoft.com/en-us/microsoft-365-copilot/microsoft-copilot-studio`, `https://www.oracle.com/news/announcement/oracle-introduces-ai-agent-studio-2025-03-20/` | Avoid building a generic no-code agent builder unless it is tied to local CLI Agent/IM/Gateway operations. |
| Observability | Langfuse focuses on traces, sessions, evals, prompt management and model usage: `https://langfuse.com/docs` | Build the minimum self-hosted operations observability first; do not pretend to replace full LLMOps platforms. |
| CLI Agent contracts | Codex, Claude Code and OpenCode expose their own CLI/config/hooks/SDK/session surfaces: `https://developers.openai.com/codex/cli/reference`, `https://code.claude.com/docs/en/hooks`, `https://opencode.ai/docs/cli/`, `https://opencode.ai/docs/sdk/` | Prefer official structured events, hooks, SDKs and session APIs over TUI text parsing. |

## 3. Keep, Delegate, Retire

Keep and strengthen:

- **Model Gateway**: provider center, endpoint profiles, app connections, protocol matrix, usage, health, circuit and fallback.
- **Channel Connectors**: Feishu/Octo IM to CLI Agent, files, progress, permissions, busy guard and session lifecycle.
- **CLI Agent Workbench**: Codex, Claude Code, OpenCode, OpenClaw profiles, native session state, model binding, workdir and permissions.
- **System Guard / Recovery**: OpenClaw config compatibility, daemon repair, service health, secret audit and repair evidence.
- **Observability**: task/session traces, tool calls, approvals, final delivery, cost/tokens, provider errors and verification evidence.
- **Files / Artifacts**: attachment staging, generated files, run outputs and project evidence, not a heavy file manager.

Delegate or shrink:

- **Config**: keep only critical compatibility, preview/diff/backup and safe guided writes. Do not duplicate every official OpenClaw setting.
- **Agents / Channels**: keep runtime profile and binding surfaces that Studio needs; delegate broad OpenClaw CRUD when official UI is better.
- **Skills**: keep only if it becomes a cross-Agent capability package/workflow surface; otherwise make it a retire candidate.
- **Terminal**: keep as a maintenance/debug surface, not a primary product workflow.
- **Dashboard**: change from status clone to task-first operations cockpit.

Retired or no longer active:

- Dreaming / memory management page and BFF.
- Studio Plugins management page and BFF.
- Old provider/account/archive/cost-heavy Gateway usage surface.
- Third-party migration-first implementation plans that treat old projects as authority.

## 4. Naming Plan

No final product name is selected yet.

The current repository/package can keep the historical `OpenClaw Studio` name until a cleared replacement is chosen, but new product documents should avoid making OpenClaw the long-term product identity.

Rejected or high-risk names from initial web checks:

| Name family | Why not use it |
| --- | --- |
| AgentOps Studio | Existing AI agent projects/products use this exact phrase or close variants. |
| Agent Studio / AI Agent Studio | Heavily used by Oracle, Automation Anywhere, Moveworks, Workato, Cloudera, Algolia and others. |
| Agent Nexus / Nexus | Existing AI agent platform and YC company naming collision. |
| Relay Studio / Conversation Relay Studio | Existing studio/business and Twilio-related naming collision risk. |
| Agent Harbor | Existing AI agent products/services use the name. |
| Runplane / Workplane / ThreadRail / Lattice Ops / AgentWard | Existing AI agent/runtime/control/CRM products occupy nearby semantics. |

Naming gate before any rename:

1. Search exact phrase and close variants on web, GitHub, npm, PyPI, Docker Hub and common app marketplaces.
2. Check domain availability for `.com`, `.dev`, `.ai` and a neutral fallback.
3. Check trademark databases before public release; web search is not legal clearance.
4. Avoid generic crowded forms: `Agent Studio`, `AgentOps`, `Nexus`, `Relay`, `Harbor`, `Runplane`, `Workplane`.
5. Prefer a coined, short, pronounceable name that can own a category without depending on OpenClaw.
6. Keep the internal module names stable until product rename and package rename can be done together.

Working placeholder in docs: **Studio AI Workbench**.

## 5. Documentation Reset

Current docs should be rebuilt around durable boundaries, not per-turn implementation logs.

Authoritative docs after this reset:

- `docs/product-strategy-reset-plan.md` - strategic reset, market boundary, naming and implementation phases.
- `docs/产品需求.md` - current PRD for the new workbench direction.
- `docs/系统架构.md` - runtime and module boundaries.
- `docs/当前进展.md` - short current snapshot and open work only.
- `docs/research-first-development-checklist.md` - external research and naming gates before implementation.
- Targeted goal/progress docs for Gateway, Channel Connectors and Recovery while those tracks are active.
- Chat contract/rendering docs only as API/contract references, not product direction.

Cleanup rules:

- Remove "active" wording for retired Dreaming and Studio Plugins management.
- Remove broken doc links.
- Stop appending long historical verification logs to current progress.
- Move old design experiments, prototypes and one-off handoff prompts out of the current docs index unless they are actively being reviewed.
- Keep historical details in git history, not in evergreen docs.

## 6. Implementation Phases

Phase 0 - Documentation reset:

- Rewrite README, docs index, PRD, architecture and current progress around the new positioning.
- Add naming gate and rejected-name record.
- Keep code name unchanged until final name is selected.

Phase 1 - Domain classification:

- Tag every Studio domain as `core`, `support`, `delegate-to-openclaw`, `retire-candidate` or `retired`.
- Reflect those tags in route manifests, page copy and docs.

Phase 2 - Product rename readiness:

- Produce 5-10 name candidates.
- Run web/GitHub/package/domain/trademark preflight.
- Pick one name only after it clears the naming gate.
- Rename user-facing UI, docs and package metadata in one controlled change.

Phase 3 - OpenClaw de-management:

- Shrink Config, Agents, Channels and Skills to Studio-specific workflows.
- Add outbound links or guidance to official OpenClaw UI where Studio should not duplicate.
- Keep Recovery and compatibility validation because they are Studio value.

Phase 4 - Operations core:

- Make Gateway, Channel Connectors, CLI Agent Workbench, Recovery and Observability the first-class navigation.
- Turn Dashboard into a task-first cockpit.
- Make Chat an agent operations surface with session evidence, artifacts and controls.

## 7. Success Criteria

- A new contributor can understand the product without reading historical task logs.
- OpenClaw is described as one supported runtime, not the whole product.
- No active docs claim Dreaming or Studio Plugins management are in scope.
- Every new Gateway, CLI Agent, provider, channel or SDK change starts with external contract research.
- Product rename does not use an obvious market-conflicting name.
