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
  "apps/web-vue/src/features/system/system-event-timeline.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("buildSystemEventTimeline groups by day and sorts by occurredAt desc in each group", async () => {
  const { buildSystemEventTimeline } = await import(moduleUrl);

  const events = [
    {
      id: "e1",
      kind: "diagnostic_issue",
      category: "alerts",
      severity: "error",
      occurredAt: "2026-04-13T08:00:00.000Z",
      title: "A",
    },
    {
      id: "e2",
      kind: "release_update_available",
      category: "operations",
      severity: "info",
      occurredAt: "2026-04-13T10:00:00.000Z",
      title: "B",
    },
    {
      id: "e3",
      kind: "device_trust_pending",
      category: "recovery",
      severity: "warning",
      occurredAt: "2026-04-12T23:00:00.000Z",
      title: "C",
    },
  ];

  const timeline = buildSystemEventTimeline(events);

  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].date, "2026-04-13");
  assert.deepEqual(
    timeline[0].items.map((item) => item.id),
    ["e2", "e1"],
  );
  assert.equal(timeline[1].date, "2026-04-12");
  assert.deepEqual(
    timeline[1].items.map((item) => item.id),
    ["e3"],
  );
});
