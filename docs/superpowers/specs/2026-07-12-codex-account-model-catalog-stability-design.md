# Codex Account Model Catalog Stability Design

## Goal

Make Codex-account-backed model routing derive its candidate catalog from the current Codex installation, verify requests with the correct Codex upstream identity, and report request/route state truthfully, while never applying Tracevane Gateway configuration to the user's Codex CLI.

## Confirmed product boundary

- Codex CLI remains signed in directly to the user's Codex account.
- Tracevane must not write Gateway provider, endpoint, key, catalog, context-window, or compaction settings into `~/.codex/config.toml`.
- The Codex account may still be used inside Tracevane as an account-backed Provider for Claude Code, OpenCode, OpenClaw, and Tracevane-owned requests.
- Tracevane may read `~/.codex/models_cache.json` as a local candidate-catalog source, but must not overwrite it.
- Claude Code, OpenCode, and OpenClaw remain explicitly applied/rolled back through the existing backup and atomic-write flow.

## Root causes

1. `codexAccountDefaultModels()` is merged at login, refresh, and registry repair, so the account catalog remains static even when Codex refreshes its own model cache.
2. Account refresh updates OAuth tokens only; it does not synchronize candidate models.
3. The Codex-account upstream path preserves an inbound `User-Agent` and only supplies the Codex User-Agent when none exists. Luna is available with a Codex User-Agent but returns 404 with a generic Node/client User-Agent.
4. Provider-health success is reused as request outcome, causing HTTP 404 requests to be recorded as successful.
5. The UI labels structural route state `fixed` as “正常”, even when live smoke failed.
6. The app-connection flow still offers to apply Gateway configuration to Codex CLI, contrary to the required direct-account-login boundary.

## Architecture

### Candidate catalog synchronization

Add a focused parser for `~/.codex/models_cache.json`. It accepts only a bounded schema, ignores malformed entries, records cache metadata, and maps valid entries into the existing `ModelGatewayProviderModelCatalog` shape. The cache is candidate discovery, not proof of per-account availability.

Catalog precedence for a Codex account-backed Provider:

1. Valid models from the local Codex cache.
2. Existing manually retained Provider models that are not managed defaults.
3. Built-in defaults as an offline fallback only.

For matching model IDs, current Codex cache metadata wins over built-in context limits and feature hints. Missing fields may fall back to verified built-in/public metadata. Synchronization runs during registry repair, completed Codex login, and successful token refresh.

### Upstream request identity

At the Codex-account boundary, always replace the upstream `User-Agent` with Tracevane's Codex-compatible User-Agent. Client identity must not leak through to the ChatGPT Codex backend. Other providers retain existing User-Agent behavior.

### Request and route state

Keep Provider circuit health separate from logical request success:

- A 404 may leave Provider health/circuit closed.
- The request outcome must be `failure` for non-2xx responses.
- Structural states are displayed as “已固定 / 自动选择 / 已降级 / 未解析”.
- Live smoke is persisted in the backend runtime state by route signature and displayed independently as “未验证 / 通过 / 失败 / 已过期”. Browser `localStorage` is no longer the source of truth.

The three status dimensions remain independent:

1. Provider health controls circuit and account availability.
2. Request outcome records whether each logical HTTP request succeeded.
3. Route smoke records the most recent synthetic verification for the resolved scope/provider/model/protocol signature.

### Codex CLI management

Codex remains visible as an unmanaged direct-login client, but `canApply` is false and its issue text explains that Tracevane intentionally preserves the user's official account login. Bulk apply excludes Codex. A direct Codex apply request returns a stable conflict error without writing or backing up `~/.codex/config.toml`.

### Dialog markup

The app-connection confirmation dialog must not render block content such as the diff view inside `DialogDescription`'s paragraph element. Descriptive prose and block diff content are rendered as sibling elements with valid semantics.

## Failure handling

- Missing, stale, unreadable, or malformed Codex cache: preserve last known Provider catalog and merge offline defaults; never erase models.
- Cache entry with invalid ID or bounds: ignore that entry.
- Login/refresh succeeds while catalog sync fails: keep account ready and surface catalog source as fallback; authentication must not be rolled back.
- Non-Codex client apply failure: retain existing backup/rollback behavior.
- Unsupported preferred model: keep the preference visible, mark validation failure, and allow an explicitly verified fallback route; do not silently rewrite Codex CLI.

## Verification

- Unit/system tests for valid, missing, stale, and malformed Codex caches.
- Regression tests proving Codex-account upstream User-Agent replacement and non-Codex Provider preservation.
- Regression test proving HTTP 404 is a failed request without requiring Provider circuit failure.
- Runtime-state tests for unverified, passed, failed, and expired route smoke records keyed by route signature.
- App-connection tests proving single and bulk apply never write Codex CLI configuration.
- Web tests for structural labels and independent smoke failure display.
- Web contract test proving the app-connection dialog no longer nests block content inside `DialogDescription`.
- Typecheck, focused model-gateway tests, full model-gateway system suite, and live Windows smoke for Terra/Luna through all supported protocols.

## External evidence

OpenAI documents `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` as valid GPT-5.6 model IDs. The current local Codex cache also lists all three, but with Codex-product-specific context metadata. Public API metadata is therefore reference metadata, while local candidate discovery plus live account smoke controls Tracevane operational availability.
