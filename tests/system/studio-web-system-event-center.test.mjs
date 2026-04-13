import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");

const eventCenterPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemEventCenterPage.vue",
);
const summaryBarPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemEventSummaryBar.vue",
);
const filterBarPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemEventFilterBar.vue",
);
const timelinePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemEventTimeline.vue",
);
const detailPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemEventDetailPanel.vue",
);
const cssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-events.css",
);
const routeManifestPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/route-manifest.ts",
);
const systemControlPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);

test("system event center page composes summary, filter, timeline, and detail shells", () => {
  assert.equal(fs.existsSync(eventCenterPagePath), true);

  const page = fs.readFileSync(eventCenterPagePath, "utf8");
  assert.match(
    page,
    /import SystemEventSummaryBar from '\.\/SystemEventSummaryBar\.vue'/,
  );
  assert.match(
    page,
    /import SystemEventFilterBar from '\.\/SystemEventFilterBar\.vue'/,
  );
  assert.match(
    page,
    /import SystemEventTimeline from '\.\/SystemEventTimeline\.vue'/,
  );
  assert.match(
    page,
    /import SystemEventDetailPanel from '\.\/SystemEventDetailPanel\.vue'/,
  );
  assert.match(page, /<SystemEventSummaryBar/);
  assert.match(page, /<SystemEventFilterBar/);
  assert.match(page, /<SystemEventTimeline/);
  assert.match(page, /<SystemEventDetailPanel/);
  assert.match(page, /system-events\.css/);
});

test("system event center page hydrates store from /api/system/events on mounted", () => {
  const page = fs.readFileSync(eventCenterPagePath, "utf8");

  assert.match(page, /import \{[^}]*onMounted[^}]*\} from 'vue'/);
  assert.match(
    page,
    /import \{\s*fetchSystemEventCenterSnapshot\s*\} from '\.\/api'/,
  );
  assert.match(
    page,
    /import \{\s*useSystemEventStore\s*\} from '\.\/system-event-store'/,
  );
  assert.match(page, /const\s+store\s*=\s*useSystemEventStore\(\)/);
  assert.match(page, /onMounted\(async\s*\(\)\s*=>\s*\{/);
  assert.match(
    page,
    /const\s+snapshot\s*=\s*await\s+fetchSystemEventCenterSnapshot\(\)/,
  );
  assert.match(page, /store\.hydrate\(snapshot\)/);
});

test("system event center feature files exist", () => {
  assert.equal(fs.existsSync(summaryBarPath), true);
  assert.equal(fs.existsSync(filterBarPath), true);
  assert.equal(fs.existsSync(timelinePath), true);
  assert.equal(fs.existsSync(detailPanelPath), true);
  assert.equal(fs.existsSync(cssPath), true);
});

test("route manifest exposes /system/events shell route", () => {
  const manifest = fs.readFileSync(routeManifestPath, "utf8");
  assert.match(
    manifest,
    /import\("\.\.\/system\/SystemEventCenterPage\.vue"\)/,
  );
  assert.match(manifest, /path:\s*"\/system\/events"/);
});

test("system control page has CTA entry to event center", () => {
  const systemControlPage = fs.readFileSync(systemControlPagePath, "utf8");
  assert.match(systemControlPage, /\/system\/events/);
});
