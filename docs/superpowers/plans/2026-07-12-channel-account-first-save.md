# Channel Account First Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first Channel Connectors v3 account save succeed on a clean profile and replace the flashing plan modal with deterministic async feedback.

**Architecture:** Separate the effective configuration timestamp from its optimistic-concurrency revision at the v3 snapshot boundary. Use a deterministic hash revision only while no native config exists, retain persisted `updatedAt` revisions afterward, and open the React confirmation dialog only after the plan mutation succeeds.

**Tech Stack:** TypeScript, Node.js `crypto`, React 19, TanStack Query, Radix Dialog, Node test runner.

## Global Constraints

- Do not change Feishu/Lark OAuth, credentials, validation requirements, or send secrets to tests/logs.
- Preserve persisted-config optimistic concurrency, candidate hashing, atomic write, last-known-good, reload, and rollback behavior.
- Do not add dependencies or a second revision/config abstraction.
- Modify only the listed Channel Connectors files and the required research/design/plan documentation.
- Preserve the two pre-existing untracked plan files in the worktree and never stage them.

---

### Task 1: Stable cold-start v3 revision

**Files:**
- Modify: `tests/system/channel-connectors-v3-service.test.mjs`
- Modify: `apps/api/modules/channel-connectors/service.ts`

**Interfaces:**
- Consumes: `readV3Snapshot`, `v3ConfigRevision`, existing `createHash`, `getV3Config`, `planV3Config`, and `saveV3Config`.
- Produces: `ChannelConnectorsV3Snapshot.revision: string` and `unpersistedV3ConfigRevision(config): string`.

- [ ] **Step 1: Write the failing cold-start regression test**

Add a test whose clock advances on every call, reads the absent-file configuration twice, and asserts stable revisions before planning:

```js
let nowMs = Date.parse("2026-07-12T12:00:00.000Z");
const service = createChannelConnectorsService(config, {
  homeDir: root,
  now: () => new Date(nowMs++),
});
const initial = service.getV3Config();
const reread = service.getV3Config();
assert.equal(reread.revision, initial.revision);
assert.match(initial.revision, /^unpersisted:[a-f0-9]{64}$/);
const plan = service.planV3Config({
  config: initial.config,
  expectedRevision: initial.revision,
});
assert.equal(plan.ok, true);
assert.ok(plan.planId);
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `npm run build:api && node --test --test-name-pattern="cold-start v3 revision" tests/system/channel-connectors-v3-service.test.mjs`

Expected: FAIL because consecutive absent-file reads expose different timestamp revisions.

- [ ] **Step 3: Implement the snapshot revision boundary**

Change the snapshot and absent/persisted reads to carry an explicit revision:

```ts
interface ChannelConnectorsV3Snapshot {
  config: ChannelConnectorsV3Config;
  revision: string;
}

function unpersistedV3ConfigRevision(config: ChannelConnectorsV3Config): string {
  return `unpersisted:${createHash("sha256")
    .update(JSON.stringify({ ...config, updatedAt: "" }))
    .digest("hex")}`;
}
```

Use `snapshot.revision` in `currentV3Config`, `planV3Config`, the apply precondition, and the final apply response. Keep `v3ConfigRevision` for persisted snapshots.

- [ ] **Step 4: Verify green and persisted revision semantics**

Extend the test to save the config, assert the revision no longer starts with `unpersisted:`, and assert two post-save reads keep the same revision. Run the same focused command and expect PASS.

- [ ] **Step 5: Commit only Task 1 files**

```text
git add apps/api/modules/channel-connectors/service.ts tests/system/channel-connectors-v3-service.test.mjs
git commit -m "fix: stabilize first channel config revision"
```

### Task 2: Non-flashing account plan feedback

**Files:**
- Modify: `tests/system/web-channel-connectors.test.mjs`
- Modify: `apps/web/src/features/channel-connectors/views/V3AccountsView.tsx`

**Interfaces:**
- Consumes: existing `planMutation`, `pendingCandidate`, `plan`, `planOpen`, and `toast` state.
- Produces: a request flow that opens `V3PlanDialog` only from `onSuccess` and clears pending state on error.

- [ ] **Step 1: Write the failing Web contract regression**

Add assertions for the exact state order:

```js
assert.doesNotMatch(accounts, /setPlanOpen\(true\);\s*planMutation\.mutate/);
assert.match(accounts, /onSuccess: \(nextPlan\) => \{\s*setPlan\(nextPlan\);\s*setPlanOpen\(true\);\s*\}/);
assert.match(accounts, /onError: \(error\) => \{\s*setPendingCandidate\(null\);/);
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test --test-name-pattern="account plan" tests/system/web-channel-connectors.test.mjs`

Expected: FAIL because the current code opens the dialog before mutation completion.

- [ ] **Step 3: Move modal opening to mutation success**

Implement:

```tsx
const requestPlan = (candidate: ChannelConnectorsV3Config) => {
  setPendingCandidate(candidate);
  setPlan(null);
  planMutation.mutate(
    { config: candidate, expectedRevision: configQuery.data?.revision },
    {
      onSuccess: (nextPlan) => {
        setPlan(nextPlan);
        setPlanOpen(true);
      },
      onError: (error) => {
        setPendingCandidate(null);
        toast.error("无法生成变更计划", { description: error.message });
      },
    },
  );
};
```

Render `Loader2` and “正在检查…” in the existing primary button while `planning` is true; do not add new state or effects.

- [ ] **Step 4: Run focused Web test and typecheck**

Run: `node --test --test-name-pattern="account plan" tests/system/web-channel-connectors.test.mjs`

Run: `npm run typecheck:web`

Expected: PASS.

- [ ] **Step 5: Commit only Task 2 files**

```text
git add apps/web/src/features/channel-connectors/views/V3AccountsView.tsx tests/system/web-channel-connectors.test.mjs
git commit -m "fix: keep channel account plan feedback stable"
```

### Task 3: Research record and end-to-end verification

**Files:**
- Modify: `docs/研究先行开发清单.md`
- Create: `docs/superpowers/specs/2026-07-12-channel-account-first-save-design.md`
- Create: `docs/superpowers/plans/2026-07-12-channel-account-first-save.md`

**Interfaces:**
- Consumes: the completed backend/frontend behavior and official Radix/TanStack mutation contracts.
- Produces: durable decision/verification evidence for the Channel Connectors workflow.

- [ ] **Step 1: Record the research and decision**

Add a dated checklist entry with the observed GET→POST 409, the deterministic unpersisted revision, the persisted revision boundary, the plan-success modal rule, and official Radix/TanStack links.

- [ ] **Step 2: Run the focused suites**

Run: `npm run build:api`

Run: `node --test tests/system/channel-connectors-v3-service.test.mjs tests/system/web-channel-connectors.test.mjs`

Run: `npm run typecheck:web`

Run: `git diff --check`

Expected: all commands PASS.

- [ ] **Step 3: Browser regression**

With a clean local Channel Connectors config, navigate to `#/im-channels`, open 渠道账号, create a local draft account, and click 检查并保存. Verify a stable “确认配置影响” dialog appears, the request returns 200, there are no console errors, and cancel without applying the synthetic account.

- [ ] **Step 4: Commit only Task 3 docs**

```text
git add docs/研究先行开发清单.md docs/superpowers/specs/2026-07-12-channel-account-first-save-design.md docs/superpowers/plans/2026-07-12-channel-account-first-save.md
git commit -m "docs: record channel account first-save contract"
```
