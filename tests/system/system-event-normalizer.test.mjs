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
  "apps/api/modules/system/event-normalizer.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("buildSystemSnapshotDerivedEvents derives required system events", async () => {
  const { buildSystemSnapshotDerivedEvents } = await import(moduleUrl);

  const events = buildSystemSnapshotDerivedEvents({
    diagnostics: {
      checkedAt: "2026-04-13T08:00:00.000Z",
      gateway: { rpcOk: false },
      status: { bootstrapPendingCount: 0 },
    },
    bootstrap: {
      checkedAt: "2026-04-13T08:01:00.000Z",
      ready: false,
    },
    deviceTrust: {
      checkedAt: "2026-04-13T08:02:00.000Z",
      pending: [{ requestId: "req-1" }],
    },
    studioRelease: {
      checkedAt: "2026-04-13T08:03:00.000Z",
      currentVersion: "0.1.20",
      latestVersion: "0.1.21",
      updateAvailable: true,
    },
  });

  const kinds = events.map((event) => event.kind);
  assert.ok(kinds.includes("diagnostic_issue"));
  assert.ok(kinds.includes("device_trust_pending"));
  assert.ok(kinds.includes("release_update_available"));

  const gatewayIssue = events.find(
    (event) =>
      event.kind === "diagnostic_issue" &&
      event.sourceModule === "diagnostics" &&
      event.severity === "error",
  );
  assert.ok(gatewayIssue);
  assert.equal(gatewayIssue.category, "alerts");
  assert.equal(gatewayIssue.status, "failed");
  assert.equal(gatewayIssue.dedupeKey, "diagnostics:gateway-rpc");
  assert.equal(gatewayIssue.sourceEntity, "system:diagnostics");
  assert.equal(gatewayIssue.action, "snapshot");
  assert.equal(typeof gatewayIssue.persistedAt, "string");

  const bootstrapIssue = events.find(
    (event) =>
      event.kind === "diagnostic_issue" && event.sourceModule === "bootstrap",
  );
  assert.ok(bootstrapIssue);

  const trustPending = events.find(
    (event) => event.kind === "device_trust_pending",
  );
  assert.ok(trustPending);
  assert.equal(trustPending.category, "audit");
  assert.equal(trustPending.severity, "warning");

  const releaseEvent = events.find(
    (event) => event.kind === "release_update_available",
  );
  assert.ok(releaseEvent);
  assert.equal(releaseEvent.category, "operations");
  assert.equal(releaseEvent.severity, "info");
});

test("buildSystemSnapshotDerivedEvents treats bootstrap pending count as diagnostic issue", async () => {
  const { buildSystemSnapshotDerivedEvents } = await import(moduleUrl);

  const events = buildSystemSnapshotDerivedEvents({
    diagnostics: {
      checkedAt: "2026-04-13T09:00:00.000Z",
      gateway: { rpcOk: true },
      status: { bootstrapPendingCount: 2 },
    },
    bootstrap: {
      checkedAt: "2026-04-13T09:01:00.000Z",
      ready: true,
    },
    deviceTrust: {
      checkedAt: "2026-04-13T09:02:00.000Z",
      pending: [],
    },
    studioRelease: {
      checkedAt: "2026-04-13T09:03:00.000Z",
      currentVersion: "0.1.20",
      latestVersion: null,
      updateAvailable: false,
    },
  });

  const bootstrapIssue = events.find(
    (event) =>
      event.kind === "diagnostic_issue" && event.sourceModule === "bootstrap",
  );
  assert.ok(bootstrapIssue);
  assert.equal(bootstrapIssue.status, "pending");
});

test("buildSystemSnapshotDerivedEvents emits resolved recovery events for healthy snapshots", async () => {
  const { buildSystemSnapshotDerivedEvents } = await import(moduleUrl);

  const events = buildSystemSnapshotDerivedEvents({
    diagnostics: {
      checkedAt: "2026-04-13T10:00:00.000Z",
      gateway: { rpcOk: true },
      status: { bootstrapPendingCount: 0 },
    },
    bootstrap: {
      checkedAt: "2026-04-13T10:01:00.000Z",
      ready: true,
    },
    deviceTrust: {
      checkedAt: "2026-04-13T10:02:00.000Z",
      pending: [],
    },
    studioRelease: {
      checkedAt: "2026-04-13T10:03:00.000Z",
      currentVersion: "0.1.21",
      latestVersion: null,
      updateAvailable: false,
    },
  });

  const resolvedGateway = events.find(
    (event) => event.dedupeKey === "diagnostics:gateway-rpc",
  );
  const resolvedBootstrap = events.find(
    (event) => event.dedupeKey === "bootstrap:pending",
  );
  const resolvedTrust = events.find(
    (event) => event.dedupeKey === "device-trust:pending",
  );
  const resolvedRelease = events.find(
    (event) => event.dedupeKey === "release:update-available",
  );

  assert.equal(resolvedGateway?.status, "resolved");
  assert.equal(resolvedBootstrap?.status, "resolved");
  assert.equal(resolvedTrust?.status, "resolved");
  assert.equal(resolvedRelease?.status, "resolved");
});
