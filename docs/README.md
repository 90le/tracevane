# Tracevane Docs Index

> Updated: 2026-06-22
> Rule: docs describe current intent, boundaries and contracts. Historical implementation detail belongs in git history.

## Authoritative Entry

- `产品战略重置方案.md` - product reset, market boundary, naming gate and implementation phases.
- `产品对标策略.md` - market benchmark strategy, product pillars, anti-bloat rules and research cadence.
- `产品需求.md` - current PRD for the Tracevane direction.
- `系统架构.md` - frontend, API, daemon, store and runtime boundaries.
- `当前进展.md` - compact current snapshot, open work and verification baseline.
- `研究先行开发清单.md` - mandatory research-first and naming checks before implementation.

## Active Tracks

### Frontend

- `前端功能架构.md` - functional migration architecture; Aurora fragments are visual contracts, each route graduates to real React + TanStack Query + existing APIs.
- `prototypes/README.md` / `prototypes/INDEX.md` - Aurora SPA prototype framework, page-form mapping and React landing rules.
- `prototypes/React前端方向调研.md` - React + Vite + Tailwind v4 + shadcn/ui direction research and rejected routes.
- `界面设计守则.md` / `DESIGN.md` (repo root) - interface design constitution and page-form discipline.

### Model Gateway

- `网关目标方案.md` - Gateway goal, protocol matrix, provider/routing and acceptance.
- `网关进度.md` - current Gateway / Channel Connectors facts, boundaries and next steps.
- `网关账户型Provider方案.md` - account-style provider research and proof boundaries.
- `模型网关详细目标.md` - locked execution goal for the Aurora-aligned Gateway page and completion bar.
- `模型网关信息架构契约.md` - locked Model Gateway information architecture (four tabs, child flows, danger writes).

### Channel Connectors

- `渠道连接器原生方案.md` - native IM to CLI Agent runtime.
- `渠道连接器能力地图.md` - Channel Connectors capability map.
- `飞书长连接问题跟踪.md` - Feishu long-connection facts and regression history (authoritative Feishu tracker).

### Workspace IDE / Recovery

- `工作区IDE目标.md` - IDE-grade local edit/run/preview/AI/diff workspace goal.
- `自愈守护进程目标.md` / `自愈守护进程进度.md` - OpenClaw recovery guard.

## Contract References

These describe Chat/rendering contracts. They are reference documents and must not redefine product positioning away from `产品战略重置方案.md`.

- `聊天契约.md`
- `聊天会话策略.md`
- `聊天开放门槛.md`
- `聊天设计方案.md`
- `混合渲染方案.md`
- `富消息使用说明.md`
- `聊天官方对齐.md`

## Cleanup Policy

1. Do not add long round-by-round logs to evergreen docs. Verification history belongs in git, not in goal/progress docs.
2. Do not present Dreaming or legacy plugin management as active scope.
3. Do not add a new feature plan before official/API/SDK/GitHub/community research is recorded.
4. Do not use market-crowded product names without the naming gate.
5. Keep prototypes, handoff prompts and one-off visual experiments out of the docs index unless they are the active review target.
6. Prefer deleting or archiving stale docs over maintaining parallel contradictory plans.
