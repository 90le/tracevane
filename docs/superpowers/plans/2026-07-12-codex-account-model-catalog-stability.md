# Codex Account Model Catalog Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize Codex-account candidate models safely, fix account-backed request identity and status semantics, and keep Codex CLI on direct account login without Gateway configuration writes.

**Architecture:** Reuse the existing model-gateway service, provider catalog types, atomic file utilities, smoke path, and app-connection backup flow. Add one focused Codex cache parser, integrate it at the three existing managed-account lifecycle points, and keep discovery, request success, Provider health, and client configuration as separate concerns.

**Tech Stack:** Node.js 22, TypeScript, built-in `node:test`, React, TanStack Query, existing Tracevane model-gateway contracts.

## Global Constraints

- Support Windows, macOS, and Linux through `homeDir` and `node:path`; no WSL requirement.
- Do not add dependencies.
- Do not write or replace `~/.codex/models_cache.json`.
- Do not apply Tracevane Gateway configuration to Codex CLI.
- Preserve user-owned unrelated files and the existing untracked `docs/superpowers/` documents.
- Write every behavioral regression test first and observe the expected failure before production edits.
- Update `docs/研究先行开发清单.md` with the verified model-catalog sources and direct-login boundary.

---

### Task 1: Codex cache candidate catalog

**Files:**
- Create: `apps/api/modules/model-gateway/codex-model-cache.ts`
- Modify: `apps/api/modules/model-gateway/service.ts`
- Test: `tests/system/model-gateway-service.test.mjs`

**Interfaces:**
- Produces: `readCodexModelCache(homeDir: string): CodexModelCacheReadResult`.
- `CodexModelCacheReadResult` returns `models`, `fetchedAt`, `clientVersion`, `etag`, and `state: "current" | "missing" | "invalid"` without throwing for a bad user cache.

- [ ] **Step 1: Write failing cache synchronization tests**

Add tests that create a temporary `homeDir/.codex/models_cache.json`, start the real model-gateway service, and assert that a managed Codex Provider uses cache values for `gpt-5.6-terra`, ignores malformed entries, and retains built-in fallback models when the cache is absent.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test --test-name-pattern="Codex model cache" tests/system/model-gateway-service.test.mjs
```

Expected: FAIL because account-backed catalogs still use `codexAccountDefaultModels()` exclusively.

- [ ] **Step 3: Implement the bounded parser**

Implement a read-only parser using `fs.readFileSync`, `JSON.parse`, existing numeric bounds, and a model-ID allow pattern. Map cache entries to existing provider models; preserve cache context metadata and infer existing feature flags without inventing account availability.

- [ ] **Step 4: Integrate lifecycle refresh points**

Replace static-only merging in registry repair and completed login with `managedCodexAccountModels(homeDir, existingModels)`. After successful token refresh, resynchronize the matching Provider catalog without changing account readiness when cache parsing falls back.

- [ ] **Step 5: Verify GREEN**

Run the Task 1 command and expect all selected tests to pass.

### Task 2: Codex-account upstream identity and truthful request outcomes

**Files:**
- Modify: `apps/api/modules/model-gateway/service.ts`
- Test: `tests/system/model-gateway-service.test.mjs`

**Interfaces:**
- Codex account-backed requests always send `CODEX_ACCOUNT_USER_AGENT` upstream.
- Runtime request outcome is based on HTTP request success, while Provider health retains its current circuit policy.

- [ ] **Step 1: Write failing request-boundary tests**

Add one real upstream fixture assertion that an inbound `User-Agent: node` becomes the Codex-compatible upstream value for an account-backed Provider, plus a control assertion that a normal API-key Provider preserves the inbound header.

Add a 404 fixture asserting `requestLog[0].outcome === "failure"` while Provider circuit state remains closed.

- [ ] **Step 2: Verify RED**

```powershell
node --test --test-name-pattern="Codex account User-Agent|404 request outcome" tests/system/model-gateway-service.test.mjs
```

Expected: the account-backed request exposes `node`, and the 404 request is recorded as success.

- [ ] **Step 3: Implement minimal separation**

At the Codex account-backed boundary, use `headers.set("user-agent", CODEX_ACCOUNT_USER_AGENT)` rather than setting only when absent. Compute `requestSucceeded` from the response's logical success and pass that to runtime outcome recording; continue passing the existing health predicate only to Provider circuit accounting.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 command and expect all selected tests to pass.

### Task 3: Keep Codex CLI unmanaged

**Files:**
- Modify: `apps/api/modules/model-gateway/service.ts`
- Modify: `apps/web/src/features/model-gateway/views/AppConnectionsView.tsx`
- Test: `tests/system/model-gateway-service.test.mjs`
- Test: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- `listAppConnections()` returns Codex with `canApply: false` and a direct-login issue.
- `applyAppConnection(...codex...)` returns `model_gateway_codex_direct_login_preserved` with HTTP 409 before any backup or write.
- `applyAppConnections()` applies only Claude Code, OpenCode, and OpenClaw.

- [ ] **Step 1: Write failing single/bulk apply tests**

Create a sentinel `~/.codex/config.toml`, invoke single Codex apply and bulk apply, and assert byte-for-byte preservation. Assert bulk results contain only the three gateway-managed clients.

- [ ] **Step 2: Verify RED**

```powershell
node --test --test-name-pattern="preserves direct Codex login|bulk apply excludes Codex" tests/system/model-gateway-service.test.mjs
```

Expected: current code rewrites the sentinel Codex configuration.

- [ ] **Step 3: Implement the management boundary**

Add a stable direct-login issue in `buildAppConnection`, reject direct Codex apply before reading/writing the target, and filter Codex from bulk apply. Adjust the UI copy and disabled action so the direct-account-login choice is explicit rather than shown as an unresolved failure.

- [ ] **Step 4: Verify GREEN and web contract**

```powershell
node --test --test-name-pattern="preserves direct Codex login|bulk apply excludes Codex" tests/system/model-gateway-service.test.mjs
node --test tests/system/web-model-gateway.test.mjs
```

Expected: all selected tests pass.

### Task 4: Persist route smoke independently from Provider and request state

**Files:**
- Modify: `types/model-gateway.ts`
- Modify: `apps/api/modules/model-gateway/service.ts`
- Modify: `apps/web/src/lib/query/model-gateway.ts`
- Modify: `apps/web/src/features/model-gateway/views/OverviewView.tsx`
- Test: `tests/system/model-gateway-service.test.mjs`
- Test: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- `ModelGatewayRouteSmokeState` is `unverified | passed | failed | expired`.
- Each `ModelGatewayActiveRouteStatus` exposes a `verification` record keyed internally by scope/provider/model/protocol signature.
- Active-route smoke writes the backend record after both success and failure; Provider health and request outcome remain unchanged by this presentation state.

- [ ] **Step 1: Write failing runtime-state tests**

Assert a newly resolved route is `unverified`, a successful smoke becomes `passed`, a 404 smoke becomes `failed`, and a record older than the bounded TTL is returned as `expired`. Change the selected model and assert the new signature is `unverified` rather than inheriting the prior model's result.

- [ ] **Step 2: Verify RED**

```powershell
node --test --test-name-pattern="route smoke state" tests/system/model-gateway-service.test.mjs
```

Expected: FAIL because active route contracts do not expose backend verification state.

- [ ] **Step 3: Implement the minimal persisted state**

Extend the existing runtime JSON with a bounded route-smoke map. Compute a stable signature from scope/provider/model/protocol, write only sanitized status/error fields, prune old/signature-orphan entries, and project the current record into active route status. Remove browser `localStorage` as the authoritative store.

- [ ] **Step 4: Verify GREEN**

Run the Task 4 command and expect all selected tests to pass.

### Task 5: Separate structural route and live validation language

**Files:**
- Modify: `apps/web/src/features/model-gateway/views/OverviewView.tsx`
- Test: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- Structural route labels are `已固定`, `自动选择`, `已降级`, and `未解析`.
- Top summary says `已解析` rather than `路由可用`.
- Smoke status uses backend `verification.state` and remains independent; a failure cannot be summarized as route-normal.

- [ ] **Step 1: Write a failing source/UI contract test**

Assert that the structural badge no longer maps `fixed` to `正常`, the summary uses `已解析`, and failed smoke contributes to the visible top-level warning copy.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/system/web-model-gateway.test.mjs
```

Expected: FAIL on the old `正常` and `路由可用` copy.

- [ ] **Step 3: Implement the minimal UI semantics**

Rename structural badges and merge backend smoke failure/expiry counts into the top status/summary.

- [ ] **Step 4: Verify GREEN**

Run the Task 5 command and expect all tests to pass.

### Task 6: Fix app-connection dialog semantics

**Files:**
- Modify: `apps/web/src/features/model-gateway/views/AppConnectionsView.tsx`
- Test: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- `DialogDescription` contains inline descriptive text only.
- `DiffView` is rendered as a sibling block under the dialog body.

- [ ] **Step 1: Write a failing markup contract test**

Assert the diff view is not nested inside `DialogDescription` and the dialog keeps an accessible description.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/system/web-model-gateway.test.mjs
```

Expected: FAIL on the existing block-inside-paragraph structure.

- [ ] **Step 3: Move block content to a sibling**

Keep concise prose inside `DialogDescription`; render `DiffView` immediately afterward in the dialog content container without changing confirmation behavior.

- [ ] **Step 4: Verify GREEN**

Run the Task 6 command and expect all tests to pass.

### Task 7: Research record and end-to-end verification

**Files:**
- Modify: `docs/研究先行开发清单.md`

**Interfaces:**
- Documents public model IDs, Codex local-cache candidate metadata, the need for per-account smoke, forced Codex upstream identity, and the direct-login Codex CLI boundary.

- [ ] **Step 1: Update the research checklist**

Record the official GPT-5.6 model pages, the verified local Codex cache fields, the distinction between public API and Codex-account budgets, and the chosen no-Codex-config-write policy.

- [ ] **Step 2: Run focused verification**

```powershell
npm run typecheck
npm run typecheck:web
node --test tests/system/model-gateway-service.test.mjs tests/system/web-model-gateway.test.mjs tests/system/model-gateway-active-routes-smoke-script.test.mjs
git diff --check
```

Expected: zero type errors, zero failed tests, and no whitespace errors.

- [ ] **Step 3: Run live Windows verification**

Restart the existing Windows-native development stack, confirm ports 43761/45176/18796/18797/18798 are healthy, verify Codex CLI configuration is unchanged, and smoke Terra/Luna through the three gateway-managed client protocols.

- [ ] **Step 4: Review scope**

Confirm only planned files changed and the pre-existing untracked `docs/superpowers/` files were not staged unintentionally.
