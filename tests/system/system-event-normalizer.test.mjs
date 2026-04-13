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
  "apps/web-vue/src/features/system/system-event-normalizer.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("buildSystemDerivedEvents derives required system events", async () => {
  const { buildSystemDerivedEvents } = await import(moduleUrl);

  const events = buildSystemDerivedEvents({
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
      event.kind === "diagnostic_issue" && event.sourceModule === "gateway",
  );
  assert.ok(gatewayIssue);
  assert.equal(gatewayIssue.category, "alerts");
  assert.equal(gatewayIssue.severity, "error");
  assert.ok(gatewayIssue.id.length > 0);
  assert.ok(gatewayIssue.occurredAt.length > 0);
  assert.ok(gatewayIssue.title.length > 0);

  const bootstrapIssue = events.find(
    (event) =>
      event.kind === "diagnostic_issue" && event.sourceModule === "bootstrap",
  );
  assert.ok(bootstrapIssue);

  const trustPending = events.find(
    (event) => event.kind === "device_trust_pending",
  );
  assert.ok(trustPending);
  assert.equal(trustPending.category, "recovery");
  assert.equal(trustPending.severity, "warning");

  const releaseEvent = events.find(
    (event) => event.kind === "release_update_available",
  );
  assert.ok(releaseEvent);
  assert.equal(releaseEvent.category, "operations");
  assert.equal(releaseEvent.severity, "info");
});

test("buildSystemDerivedEvents treats bootstrap pending count as diagnostic issue", async () => {
  const { buildSystemDerivedEvents } = await import(moduleUrl);

  const events = buildSystemDerivedEvents({
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
});
