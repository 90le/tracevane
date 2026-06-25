# Tracevane Docs

> Updated: 2026-06-25
> Rule: active docs describe the current product target and architecture. Historical plans, progress logs and superseded experiments belong in git history, not in the live docs index.

## Current authoritative docs

Read these first:

1. `产品需求.md` — current product goal, scope and domain priorities.
2. `系统架构.md` — current backend/frontend/runtime architecture.
3. `前端功能架构.md` — current frontend information architecture and page ownership.
4. `Tracevane三域重构规格说明.md` — Model Gateway / IM Channels / CLI Agents boundary spec.
5. `Tracevane三域重构任务目标.md` — current staged goals and known next tasks.

> 2026-06-25 IA correction: the live product is no longer planned as many equal admin pages. Model Gateway / IM Channels / CLI Agents are the three core operating domains. `External`, `Long Tasks`, and legacy `/recovery` remain compatibility deep-links only: external capability evidence and OpenClaw substrate guard live under Platform/support, and supervised work is a CLI Agents/owner-domain projection rather than a primary domain.
6. `IM渠道目标与设计.md` — IM Channels product target and backend/frontend capability boundary.
7. `IM渠道前端设计契约.md` — IM Channels Aurora UI contract, page/view split, Drawer/Sheet/Dialog rules, and field templates.
8. `CLI代理目标与设计.md` — CLI Agents target design and de-OpenClaw boundary.
9. `网关IM收尾与CLIAgents完成目标.md` — final closure plan for Gateway/IM and full CLI Agents completion.
10. `研究先行开发清单.md` — required research-first implementation gate.

## Supporting reference docs

Keep these as scoped references. They must not redefine the product away from the current authoritative docs above.

- `工作区IDE目标.md` — Workspace IDE target.
- `自愈守护进程目标.md` / `自愈守护进程进度.md` — OpenClaw platform guard notes; surfaced under Platform, not as an independent core domain.
- `聊天契约.md` / `聊天会话策略.md` / `聊天开放门槛.md` / `聊天设计方案.md` / `聊天官方对齐.md` — Chat contracts.
- `混合渲染方案.md` / `富消息使用说明.md` — rendering and rich message references.
- `界面设计守则.md` — UI design rules.
- `prototypes/` — visual reference only, not product truth.

## Product summary

Tracevane is a local-first AI Agent connectivity and runtime control layer.

It connects:

```text
Model providers / Codex accounts / API keys
        ↓
Model Gateway: protocol adaptation, routing, account pool, app connection config
        ↓
Codex / Claude Code / OpenCode / local Chat / IM-triggered tasks
        ↓
CLI Agent runtime and Agent Runs
        ↓
Evidence, delivery logs, usage, recovery and diagnostics
```

## Domain ownership

| Domain | Owns | Must not own |
| --- | --- | --- |
| Model Gateway | Provider, model catalog, endpoint profile, protocol adapter, routing, usage/cache evidence, account pool, Codex/Claude/OpenCode/OpenClaw client config, gateway daemon. | IM platform credentials, CLI process lifecycle, persona/OpenClaw CRUD. |
| IM Channels | IM platform account, bot credentials, webhook/long connection, binding, inbound message, outbound delivery, IM session, channel daemon. | Provider/model routing internals, terminal PTY lifecycle, generic OpenClaw config. |
| CLI Agents | Codex/Claude Code/OpenCode runtime status, launch/resume/stop boundary, terminal sessions, Agent Runs, runtime evidence. | IM account setup, provider secret management, OpenClaw generic admin. |
| Chat / Workspace / Platform | Local chat, IDE/files/terminal/Git evidence, OpenClaw substrate guard, service recovery and integration evidence. | Replacing the three core domains above. |
| External / Task Supervision compatibility links | Read-only integration evidence and cross-domain supervised-work projections reachable from owner/support pages. | Owning writes, becoming top-level product domains, or duplicating CLI Agents / IM / Gateway controls. |

## Cleanup policy

- Prefer one current design doc over several stale progress logs.
- Delete superseded docs instead of keeping contradictory versions.
- Do not claim a page is complete when it is only read-only.
- Do not promote read-only aggregation pages (`/external`), cross-domain projections (`/long-tasks`) or substrate guard pages (`/recovery`) to core navigation domains.
- Do not describe OpenClaw generic CRUD as CLI Agents core scope.
- Do not add new provider/CLI/IM behavior without research-first evidence.
