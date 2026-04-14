import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const modulePath = path.join(
  rootDir,
  "apps/api/modules/config/config-audit-events.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("buildConfigAuditEvents maps diff records into persisted config_change events", async () => {
  const { buildConfigAuditEvents } = await import(moduleUrl);

  const occurredAt = "2026-04-13T10:00:00.000Z";
  const events = buildConfigAuditEvents({
    occurredAt,
    changes: [
      {
        module: "transport",
        path: "transport.gateway.basePath",
        label: "Gateway Base Path",
        before: "/api/gateway",
        after: "/api/gateway/v2",
        changeType: "updated",
      },
      {
        module: "deviceTrust",
        path: "deviceTrust.autoApproveLocalHelper",
        label: "Auto Approve Local Helper",
        before: false,
        after: true,
        changeType: "updated",
      },
    ],
  });

  assert.equal(events.length, 2);

  assert.equal(events[0].kind, "config_change");
  assert.equal(events[0].category, "audit");
  assert.equal(events[0].sourceModule, "config");
  assert.equal(events[0].sourceEntity, "config:transport.gateway.basePath");
  assert.equal(events[0].details.path, "transport.gateway.basePath");
  assert.equal(events[0].action, "transport.gateway.basePath.update");

  assert.equal(events[1].kind, "config_change");
  assert.equal(events[1].category, "audit");
  assert.equal(events[1].sourceModule, "config");
  assert.equal(
    events[1].sourceEntity,
    "config:deviceTrust.autoApproveLocalHelper",
  );
  assert.equal(events[1].details.path, "deviceTrust.autoApproveLocalHelper");
  assert.equal(events[1].action, "deviceTrust.autoApproveLocalHelper.toggle");

  for (const event of events) {
    assert.equal(event.occurredAt, occurredAt);
    assert.equal(event.persistedAt, occurredAt);
    assert.equal(typeof event.dedupeKey, "string");
    assert.ok(event.dedupeKey.length > 0);
    assert.equal(event.status, "updated");
  }
});
