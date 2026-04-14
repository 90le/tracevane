# Config Audit Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate key config changes into the persisted system event log so `/system/events` can display readable config audit events with config-oriented next-step actions.

**Architecture:** Add a narrow config audit seam on the backend: a whitelist definition, a field-path diff helper, and a config-audit event mapper that emits `config_change` persisted events after successful writes. Reuse the existing persisted event writer/store on the backend and extend the frontend event center only enough to understand `config_change` records, render before/after details, and route next-step actions into Config.

**Tech Stack:** TypeScript, existing config service/routes under `apps/api/modules/config`, persisted system event infrastructure under `apps/api/modules/system`, Vue 3, Vue Router, node:test, existing `/system/events` frontend feature files

---

## Scope check

This plan covers only **Config audit integration Phase 1**:

- Key config-field whitelist
- Field-path before/after diff helper
- `config_change` persisted events written after successful config writes
- Frontend event-center compatibility for config audit events
- Config-directed next-step actions from `/system/events`

This plan does **not** cover:

- Full-field config audit history
- Rejected/invalid config write audit taxonomy
- Separate config audit page
- Generic deep-diff engine
- Config audit for all modules indiscriminately

## File structure and responsibilities

### Backend config audit files

- Create: `apps/api/modules/config/config-audit-fields.ts` — whitelist of high-value config fields plus label/module/action metadata
- Create: `apps/api/modules/config/config-audit-diff.ts` — extract and compare only whitelisted field paths from before/after config states
- Create: `apps/api/modules/config/config-audit-events.ts` — map diff records into persisted `config_change` events
- Modify: `apps/api/modules/config/service.ts` — capture before/after config states and write config audit events after successful saves
- Modify: `apps/api/modules/system/event-types.ts` — ensure persisted event record kind/action typing can represent `config_change`
- Modify: `apps/api/modules/system/event-writer.ts` — expose config-audit-safe event write entry if needed
- Modify: `types/system.ts` — extend event types for config audit details/action payloads

### Frontend config audit compatibility files

- Modify: `apps/web-vue/src/features/system/system-event-types.ts` — add `config_change`
- Modify: `apps/web-vue/src/features/system/system-event-actions.ts` — add config-directed actions (`open-config` / `open-config-section`)
- Modify: `apps/web-vue/src/features/system/SystemEventDetailPanel.vue` — render path/before/after for config audit events
- Modify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue` — route config audit actions to Config
- Modify: `apps/web-vue/src/features/system/system-event-store.ts` — preserve config audit event fields/details for detail rendering

### Tests and verification files

- Create: `tests/system/config-audit-fields.test.mjs`
- Create: `tests/system/config-audit-diff.test.mjs`
- Create: `tests/system/config-audit-events.test.mjs`
- Modify: `tests/system/studio-web-system-event-center.test.mjs`
- Modify: `tests/system/system-event-selectors.test.mjs`
- Keep green: `tests/system/system-service-persisted-events.test.mjs`

---

### Task 1: Define the config audit whitelist seam

**Files:**
- Create: `apps/api/modules/config/config-audit-fields.ts`
- Test: `tests/system/config-audit-fields.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/config/config-audit-fields.ts")).href}?t=${Date.now()}`;

test("config audit whitelist defines key transport and trust fields", async () => {
  const mod = await import(moduleUrl);
  assert.equal(Array.isArray(mod.CONFIG_AUDIT_FIELD_WHITELIST), true);

  const gatewayBasePath = mod.CONFIG_AUDIT_FIELD_WHITELIST.find(
    (entry) => entry.path === "transport.gateway.basePath",
  );
  assert.ok(gatewayBasePath);
  assert.equal(gatewayBasePath.module, "system");
  assert.equal(gatewayBasePath.label, "Gateway basePath");

  const helperAutoApprove = mod.CONFIG_AUDIT_FIELD_WHITELIST.find(
    (entry) => entry.path === "deviceTrust.autoApproveLocalHelper",
  );
  assert.ok(helperAutoApprove);
  assert.equal(helperAutoApprove.actionKey, "open-config-section");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/config-audit-fields.test.mjs`
Expected: FAIL because the whitelist file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/config/config-audit-fields.ts`

```ts
export interface ConfigAuditFieldEntry {
  path: string;
  module: "system" | "config";
  label: string;
  severity: "info" | "warning";
  actionKey: "open-config" | "open-config-section";
}

export const CONFIG_AUDIT_FIELD_WHITELIST: ReadonlyArray<ConfigAuditFieldEntry> = [
  {
    path: "transport.standalone.enabled",
    module: "system",
    label: "Standalone transport",
    severity: "info",
    actionKey: "open-config-section",
  },
  {
    path: "transport.standalone.port",
    module: "system",
    label: "Standalone port",
    severity: "info",
    actionKey: "open-config-section",
  },
  {
    path: "transport.gateway.enabled",
    module: "system",
    label: "Gateway transport",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "transport.gateway.basePath",
    module: "system",
    label: "Gateway basePath",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayPort",
    module: "system",
    label: "Gateway port",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayWsUrl",
    module: "system",
    label: "Gateway WS URL",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayControlUiBasePath",
    module: "system",
    label: "Gateway control UI basePath",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "deviceTrust.autoApproveLocalHelper",
    module: "system",
    label: "Local helper auto-approve",
    severity: "warning",
    actionKey: "open-config-section",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/config-audit-fields.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/config/config-audit-fields.ts \
  tests/system/config-audit-fields.test.mjs

git commit -m "审计：定义配置白名单"
```

### Task 2: Build the whitelist-based diff helper

**Files:**
- Create: `apps/api/modules/config/config-audit-diff.ts`
- Test: `tests/system/config-audit-diff.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/config/config-audit-diff.ts")).href}?t=${Date.now()}`;

test("diff helper only reports changes for whitelisted fields", async () => {
  const { diffConfigAuditChanges } = await import(moduleUrl);

  const changes = diffConfigAuditChanges({
    before: {
      transport: {
        gateway: { enabled: true, basePath: "/studio" },
      },
      display: { theme: "dark" },
    },
    after: {
      transport: {
        gateway: { enabled: false, basePath: "/ops" },
      },
      display: { theme: "light" },
    },
  });

  assert.deepEqual(changes.map((entry) => entry.path), [
    "transport.gateway.enabled",
    "transport.gateway.basePath",
  ]);
  assert.equal(changes.some((entry) => entry.path === "display.theme"), false);
  assert.equal(changes[0].before, true);
  assert.equal(changes[0].after, false);
});

test("diff helper does not emit when whitelisted value is unchanged", async () => {
  const { diffConfigAuditChanges } = await import(moduleUrl);

  const changes = diffConfigAuditChanges({
    before: {
      transport: { gateway: { enabled: true } },
    },
    after: {
      transport: { gateway: { enabled: true } },
    },
  });

  assert.deepEqual(changes, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/config-audit-diff.test.mjs`
Expected: FAIL because the diff helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/config/config-audit-diff.ts`

```ts
import {
  CONFIG_AUDIT_FIELD_WHITELIST,
  type ConfigAuditFieldEntry,
} from "./config-audit-fields.js";

export interface ConfigAuditDiffRecord extends ConfigAuditFieldEntry {
  before: unknown;
  after: unknown;
  changeType: "updated";
}

function getByPath(source: unknown, targetPath: string): unknown {
  return targetPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function diffConfigAuditChanges(input: {
  before: unknown;
  after: unknown;
}): ConfigAuditDiffRecord[] {
  return CONFIG_AUDIT_FIELD_WHITELIST.flatMap((entry) => {
    const before = getByPath(input.before, entry.path);
    const after = getByPath(input.after, entry.path);
    if (Object.is(before, after)) {
      return [];
    }
    return [
      {
        ...entry,
        before,
        after,
        changeType: "updated" as const,
      },
    ];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/config-audit-diff.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/config/config-audit-diff.ts \
  tests/system/config-audit-diff.test.mjs

git commit -m "审计：比较关键配置"
```

### Task 3: Map config diffs into persisted config_change events

**Files:**
- Create: `apps/api/modules/config/config-audit-events.ts`
- Modify: `types/system.ts`
- Modify: `apps/api/modules/system/event-types.ts`
- Test: `tests/system/config-audit-events.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/config/config-audit-events.ts")).href}?t=${Date.now()}`;

test("config audit events map diff records into persisted config_change events", async () => {
  const { buildConfigAuditEvents } = await import(moduleUrl);

  const events = buildConfigAuditEvents({
    occurredAt: "2026-04-14T10:00:00.000Z",
    changes: [
      {
        module: "system",
        path: "transport.gateway.basePath",
        label: "Gateway basePath",
        severity: "warning",
        actionKey: "open-config-section",
        before: "/studio",
        after: "/ops",
        changeType: "updated",
      },
    ],
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "config_change");
  assert.equal(events[0].category, "audit");
  assert.equal(events[0].sourceModule, "config");
  assert.equal(events[0].sourceEntity, "config:transport.gateway.basePath");
  assert.equal(events[0].action?.key, "open-config-section");
  assert.equal(events[0].details?.path, "transport.gateway.basePath");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/config-audit-events.test.mjs`
Expected: FAIL because the event mapper and config event types do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/config/config-audit-events.ts`

```ts
import type { SystemPersistedEventRecord } from "../system/event-types.js";
import type { ConfigAuditDiffRecord } from "./config-audit-diff.js";

export function buildConfigAuditEvents(input: {
  occurredAt: string;
  changes: ConfigAuditDiffRecord[];
}): SystemPersistedEventRecord[] {
  return input.changes.map((change, index) => ({
    id: `config-change:${change.path}:${input.occurredAt}:${index}`,
    dedupeKey: `config-change:${change.path}:${input.occurredAt}`,
    kind: "config_change",
    category: "audit",
    severity: change.severity,
    occurredAt: input.occurredAt,
    persistedAt: input.occurredAt,
    title: `${change.label} 配置已更新`,
    summary: `从 ${String(change.before)} 改为 ${String(change.after)}`,
    status: "changed",
    sourceModule: "config",
    sourceEntity: `config:${change.path}`,
    details: {
      module: change.module,
      path: change.path,
      label: change.label,
      before: change.before,
      after: change.after,
      changeType: change.changeType,
    },
    action: {
      key: change.actionKey,
    },
  }));
}
```

`types/system.ts` additive excerpt

```ts
export interface SystemEventActionMeta {
  key: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/config-audit-events.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/config/config-audit-events.ts \
  apps/api/modules/system/event-types.ts \
  types/system.ts \
  tests/system/config-audit-events.test.mjs

git commit -m "审计：生成配置事件"
```

### Task 4: Hook config writes into the persisted event writer

**Files:**
- Modify: `apps/api/modules/config/service.ts`
- Modify: `apps/api/modules/system/event-writer.ts`
- Test: `tests/system/system-service-persisted-events.test.mjs`
- Regression: `tests/system/dashboard-service.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createConfigService } from "../../dist/apps/api/modules/config/service.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-config-audit-"));
  fs.mkdirSync(path.join(root, "system"), { recursive: true });
  fs.writeFileSync(path.join(root, "config.json"), "{}\n", "utf8");
  return root;
}

test("config service persists config_change events after successful key-field write", async () => {
  const root = createTempRoot();
  const service = createConfigService({
    openclawRoot: root,
    openclawConfigFile: path.join(root, "config.json"),
  });

  await service.saveConfig({
    transport: {
      gateway: { enabled: false, basePath: "/ops" },
    },
  });

  const jsonlPath = path.join(root, "system", "system-events.jsonl");
  assert.equal(fs.existsSync(jsonlPath), true);
  const rows = fs.readFileSync(jsonlPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(rows.some((row) => row.kind === "config_change"));
  assert.ok(rows.some((row) => row.sourceEntity === "config:transport.gateway.basePath"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-service-persisted-events.test.mjs tests/system/dashboard-service.test.mjs`
Expected: FAIL because config writes do not yet emit config audit events.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/config/service.ts` additive excerpt

```ts
const before = readOpenClawConfig(config);
const response = writeConfigPatch(...);
const after = readOpenClawConfig(config);
const changes = diffConfigAuditChanges({ before, after });
const events = buildConfigAuditEvents({
  occurredAt: new Date().toISOString(),
  changes,
});
for (const event of events) {
  persistedEventWriter.persistActionEvent(event);
}
```

`apps/api/modules/system/event-writer.ts` additive excerpt

```ts
persistAuditEvents(events: SystemPersistedEventRecord[]): void {
  if (!events.length) return;
  store.append(events);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-service-persisted-events.test.mjs tests/system/dashboard-service.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/config/service.ts \
  apps/api/modules/system/event-writer.ts \
  tests/system/system-service-persisted-events.test.mjs

git commit -m "审计：接入配置写入"
```

### Task 5: Render config audit events in `/system/events`

**Files:**
- Modify: `apps/web-vue/src/features/system/system-event-types.ts`
- Modify: `apps/web-vue/src/features/system/system-event-actions.ts`
- Modify: `apps/web-vue/src/features/system/system-event-store.ts`
- Modify: `apps/web-vue/src/features/system/SystemEventDetailPanel.vue`
- Modify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`
- Modify: `tests/system/system-event-selectors.test.mjs`
- Modify: `tests/system/studio-web-system-event-center.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const detailPanelPath = path.join(rootDir, "apps/web-vue/src/features/system/SystemEventDetailPanel.vue");
const actionsPath = path.join(rootDir, "apps/web-vue/src/features/system/system-event-actions.ts");
const typesPath = path.join(rootDir, "apps/web-vue/src/features/system/system-event-types.ts");

test("frontend event kinds include config_change and config actions route to config", () => {
  const actions = fs.readFileSync(actionsPath, "utf8");
  const types = fs.readFileSync(typesPath, "utf8");
  assert.match(types, /"config_change"/);
  assert.match(actions, /open-config/);
});

test("detail panel renders config path and before\/after for config audit events", () => {
  const panel = fs.readFileSync(detailPanelPath, "utf8");
  assert.match(panel, /before/);
  assert.match(panel, /after/);
  assert.match(panel, /path/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs`
Expected: FAIL because config audit events are not yet rendered specially.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-event-types.ts` excerpt

```ts
export type SystemEventKind =
  | "diagnostic_issue"
  | "device_trust_pending"
  | "release_update_available"
  | "repair_succeeded"
  | "repair_failed"
  | "upgrade_started"
  | "upgrade_failed"
  | "device_trust_approved"
  | "device_trust_approve_failed"
  | "helper_repair_succeeded"
  | "helper_repair_failed"
  | "config_change";
```

`apps/web-vue/src/features/system/system-event-actions.ts` excerpt

```ts
if (event.kind === "config_change") {
  return [
    {
      id: `config-${event.id}`,
      label: "打开配置",
      intent: "open-config",
    },
  ];
}
```

`apps/web-vue/src/features/system/SystemEventDetailPanel.vue` excerpt

```vue
<div v-if="eventItem.kind === 'config_change'" class="system-event-detail-row">
  <span>{{ text('配置路径', 'Config Path') }}</span>
  <strong>{{ String((eventItem as any).details?.path || '-') }}</strong>
</div>
<div v-if="eventItem.kind === 'config_change'" class="system-event-detail-row">
  <span>{{ text('变更前', 'Before') }}</span>
  <strong>{{ String((eventItem as any).details?.before || '-') }}</strong>
</div>
<div v-if="eventItem.kind === 'config_change'" class="system-event-detail-row">
  <span>{{ text('变更后', 'After') }}</span>
  <strong>{{ String((eventItem as any).details?.after || '-') }}</strong>
</div>
```

`apps/web-vue/src/features/system/SystemEventCenterPage.vue` excerpt

```ts
if (intent === "open-config") {
  await router.push("/config");
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/system-event-types.ts \
  apps/web-vue/src/features/system/system-event-actions.ts \
  apps/web-vue/src/features/system/system-event-store.ts \
  apps/web-vue/src/features/system/SystemEventDetailPanel.vue \
  apps/web-vue/src/features/system/SystemEventCenterPage.vue \
  tests/system/system-event-selectors.test.mjs \
  tests/system/studio-web-system-event-center.test.mjs

git commit -m "审计：展示配置变更"
```

### Task 6: Run the config audit integration gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-14-config-audit-integration.md`
- Verify: `apps/api/modules/config/config-audit-fields.ts`
- Verify: `apps/api/modules/config/config-audit-diff.ts`
- Verify: `apps/api/modules/config/config-audit-events.ts`
- Verify: `apps/api/modules/config/service.ts`
- Verify: `apps/web-vue/src/features/system/SystemEventDetailPanel.vue`
- Verify: `apps/web-vue/src/features/system/system-event-actions.ts`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## Config audit integration exit criteria

- Key config field changes are whitelisted explicitly.
- Successful config writes emit `config_change` persisted events into the system event log.
- Non-whitelisted config changes do not generate audit events.
- Config audit events appear in `/system/events` and show before/after details.
- Config audit events expose a next-step action back into Config.
- Targeted config-audit tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Rejected / invalid config write audit taxonomy
2. Expanded module coverage beyond the first key-field whitelist
```

- [ ] **Step 2: Run the config audit verification gate**

Run: `node --test tests/system/config-audit-fields.test.mjs tests/system/config-audit-diff.test.mjs tests/system/config-audit-events.test.mjs tests/system/system-service-persisted-events.test.mjs tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- whitelist field definitions
- diff helper
- config event mapper
- config service write hook
- frontend config event rendering

Do not widen into full config audit history or invalid-request taxonomy.

- [ ] **Step 4: Re-run the config audit verification gate**

Run: `node --test tests/system/config-audit-fields.test.mjs tests/system/config-audit-diff.test.mjs tests/system/config-audit-events.test.mjs tests/system/system-service-persisted-events.test.mjs tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-14-config-audit-integration.md

git commit -m "审计：完成配置接入"
```

---

## Self-review

### Spec coverage

This plan covers the approved config audit integration scope:

- key-field whitelist
- before/after diff on successful writes
- persisted `config_change` events
- frontend event-center compatibility for config audit history

It intentionally does **not** implement full-field config audit history, rejected-request taxonomy, or a dedicated config audit page.

### Placeholder scan

No placeholders remain. Each task names exact files, tests, commands, and minimal code.

### Type consistency

The plan uses one config audit vocabulary throughout:

- `config_change`
- `before`
- `after`
- `path`
- `open-config-section` / `open-config`

The backend writes config audit events through the existing persisted event writer, and the frontend continues consuming them through the existing `/system/events` flow.

## Config audit integration exit criteria

- Key config field changes are whitelisted explicitly.
- Successful config writes emit `config_change` persisted events into the system event log.
- Non-whitelisted config changes do not generate audit events.
- Config audit events appear in `/system/events` and show before/after details.
- Config audit events expose a next-step action back into Config.
- Targeted config-audit tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Rejected / invalid config write audit taxonomy
2. Expanded module coverage beyond the first key-field whitelist
