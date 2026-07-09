# Model Gateway UI/UX Refactor Plan

Status: active
Created: 2026-07-09

## Objective

Refactor the full Tracevane Model Gateway UI/UX and add the backend data needed to support the new frontend experience. The work is implemented in stages, with a git commit after each completed stage.

## Visual References

Primary reference:

- [`gateway-control-plane-reference.png`](./gateway-control-plane-reference.png)
- [`gateway-control-plane-reference@2x.png`](./gateway-control-plane-reference@2x.png)

Supplemental configuration reference:

- [`gateway-configuration-studio-reference.png`](./gateway-configuration-studio-reference.png)
- [`gateway-configuration-studio-reference@2x.png`](./gateway-configuration-studio-reference@2x.png)

The `@2x` images are local high-resolution references generated from the selected ImageGen mockups. They are reference artifacts only; production UI must be built with Aurora tokens and React components, not by embedding these bitmaps.

## Design Direction

Use the primary reference as the suite-level direction: a Gateway Operations Console with a clear left navigation, model-gateway tabs, health-first overview, provider list, setup flow, account pool, model catalog, and usage analytics.

Use the configuration reference for setup-heavy details:

- Add Provider method selection and quick-connect flow.
- Provider grouping and provider marks.
- Account pool rows and session health.
- Model catalog search, provider marks, capability chips, default badges.

Use the existing refined Usage page as the chart and metric language:

- KPI strips with prior-period comparison.
- Ranked model rows with provider marks.
- Daily stacked input/output token bars.

## External Product Patterns Reviewed

- LiteLLM: virtual keys, spend tracking, logs and gateway administration patterns.
- Portkey: logs, analytics and request observability structure.
- New API: open-source gateway operation patterns, channel/model/usage management.

These references shape information architecture only. Tracevane must remain a local-first Aurora console, not a generic analytics dashboard.

## Page Targets

### Overview

Target: Route health command center.

Required UI:

- Gateway health strip with route/provider/client readiness.
- Client-route cockpit matrix.
- Provider health panel with status bars.
- Route smoke/check action queue.
- Risk queue for client connection or provider issues.

Backend needs:

- Aggregated route readiness by app scope.
- Provider health summary with counts and worst state.
- Client connection readiness and pending action summaries.
- Recent route smoke status by scope/provider/model.

### Providers

Target: Provider management table with identity, health and route relationships.

Required UI:

- Provider rows with logo-like marks, status, protocol/type chips and model/endpoint counts.
- Active route chips showing which clients use each provider.
- Inline actions for configure, test, account pool and health reset.
- Grouping for API-key providers, account-backed providers and local/self-hosted providers.

Backend needs:

- Provider category grouping.
- Endpoint/model/account counts.
- Active route references per provider.
- Health score and reset eligibility.

### Add Provider

Target: Guided setup flow.

Required UI:

- Left method list: quick API provider, supplier catalog, local/self-hosted, account provider, advanced manual.
- Right progressive quick-connect form: provider name, base URL, API key, protocol detection, model discovery, test result, save.
- Inline validation states and protocol/model preview.

Backend needs:

- Detect-provider output that can drive protocol, model, endpoint and auth recommendations.
- Test result summary suitable for inline success/warn/error state.

### Account Pool

Target: Account rotation and session health management.

Required UI:

- Provider/account header with routing strategy chips.
- Account rows with masked account, tier, state, expiry, quota/request usage, last refresh, active route weight.
- Actions for login, refresh token, enable/disable, clear cooldown.

Backend needs:

- Account usage/request summaries for recent period.
- Expiry risk and refresh status.
- Routing strategy and selected account diagnostics.

### Models

Target: Dense model catalog and capability management.

Required UI:

- Search and provider/capability filters.
- Rows with provider mark, model id, alias, context/output budget, capability chips and default status.
- Inline alias/default controls and row action menu.

Backend needs:

- Aggregated model catalog across enabled providers.
- Capability filter metadata.
- Default model state per provider/app scope.

### Usage

Target: Already partially refactored; align with suite style.

Required UI:

- KPI strips for requests, total tokens, input tokens and output tokens.
- Prior-period comparison for finite date ranges.
- Ranked model usage with provider/model marks.
- Daily stacked input/output token bars.

Backend needs:

- Existing `/usage` range/custom query and model/daily aggregation.
- Optional future provider identity on usage rows, if model-name inference becomes insufficient.

## Shared UI Language

- Keep Aurora: `bg`, `canvas`, `panel`, `panel-2`, `line`, `primary`, `teal`, `violet`, semantic green/amber/red.
- Prefer grouped table/list surfaces over card stacks.
- Use status-first rows: identity, state, relationship, action.
- Use segmented controls for modes and filters.
- Use icons inside buttons and provider/model marks for scanability.
- Do not add cost/cache/latency panels unless a later product requirement explicitly requests them.
- Do not embed generated screenshots in production UI.

## Commit Stages

1. Reference and specification assets.
2. Shared frontend view-model helpers and lightweight UI components for gateway rows, marks, status chips and metric strips.
3. Backend aggregate endpoint(s) or response extensions needed by Overview/Providers.
4. Overview refactor.
5. Providers and Add Provider refactor.
6. Account Pool refactor.
7. Models refactor.
8. Usage final alignment and cross-page visual QA.

Each stage must include focused verification and a git commit using the project Lore Commit Protocol.

## Verification Gates

Minimum local gates by scope:

- Docs/reference-only: `git diff --check`.
- Frontend UI changes: `npm run typecheck:web`, `node --test tests/system/web-model-gateway.test.mjs`, browser screenshot smoke.
- API/type changes: `npm run typecheck:api`, targeted `model-gateway-service` tests.
- Full closeout: `npm run typecheck`, relevant system tests, browser screenshots for all Model Gateway views.

## Current Constraints

- Work starts from branch `codex/model-gateway-uiux-refactor`.
- Use existing Aurora tokens and shared primitives first.
- Keep unrelated workspace changes untouched.
- Preserve current runtime behavior unless a staged requirement explicitly changes it.
