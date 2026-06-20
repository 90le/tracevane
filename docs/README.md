# Tracevane Docs Index

> Updated: 2026-06-18
> Rule: docs describe current intent, boundaries and contracts. Historical implementation detail belongs in git history.

## Authoritative Entry

- `product-strategy-reset-plan.md` - product reset, market boundary, naming gate and implementation phases.
- `product-benchmark-strategy.md` - market benchmark strategy, product pillars, anti-bloat rules and research cadence.
- `产品需求.md` - current PRD for the Tracevane direction.
- `系统架构.md` - frontend, API, daemon, store and runtime boundaries.
- `当前进展.md` - compact current snapshot, open work and verification baseline.
- `research-first-development-checklist.md` - mandatory research-first and naming checks before implementation.

## Active Tracks

- `前端重构方案.md` / `prototypes/INDEX.md` - current frontend prototype reset, V8 app-shell baseline and React + shadcn/ui direction.
- `tracevane-gateway-goal.md` / `tracevane-gateway-progress.md` - Gateway stability, provider protocol matrix and App Connections.
- `tracevane-gateway-account-provider-plan.md` - account-style provider research and proof boundaries.
- `workspace-ide-goal.md` - IDE-grade local edit/run/preview/AI/diff workspace goal.
- `channel-connectors-native-agent-bot-plan.md` - native IM to CLI Agent runtime.
- `channel-connectors-native-feature-map.md` - Channel Connectors capability map.
- `feishu-long-connection-issue-tracker.md` / `feishu-channel-connectors-fix-plan.md` - Feishu stability history while still useful for regressions.
- `openclaw-recovery-daemon-goal.md` / `openclaw-recovery-daemon-progress.md` - OpenClaw recovery guard.

## Contract References

- `聊天契约.md`
- `聊天会话策略.md`
- `聊天开放门槛.md`
- `聊天设计方案.md`
- `混合渲染方案.md`
- `富消息使用说明.md`
- `chat-official-parity.md`
- `界面设计守则.md`

These are reference documents. They should not redefine product positioning away from `product-strategy-reset-plan.md`.

## Cleanup Policy

1. Do not add long round-by-round logs to evergreen docs.
2. Do not present Dreaming or legacy plugin management as active scope.
3. Do not add a new feature plan before official/API/SDK/GitHub/community research is recorded.
4. Do not use market-crowded product names without the naming gate.
5. Keep prototypes, handoff prompts and visual experiments out of the current docs index unless they are the active review target.
6. Prefer deleting or archiving stale docs over maintaining parallel contradictory plans.
