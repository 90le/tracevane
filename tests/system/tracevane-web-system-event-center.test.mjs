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
const apiPath = path.join(rootDir, "apps/web-vue/src/features/system/api.ts");
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
  assert.match(page, /buildSystemEventNextStepActions/);
  assert.match(page, /:actions="nextStepActions"/);
  assert.match(page, /@trigger-action="handleNextStepAction"/);
  assert.match(page, /async function handleNextStepAction/);
  assert.match(page, /router\.push\('\/terminal'\)/);
  assert.match(page, /router\.push\('\/system'\)/);
  assert.match(page, /intent === 'open-config'/);
  assert.match(page, /intent === 'open-config-section'/);
  assert.match(page, /router\.push\('\/config'\)/);
  assert.match(
    page,
    /router\.push\(`\/config\?section=\$\{encodeURIComponent\(configPath\)\}`\)/,
  );
});

test("system event center page hydrates store and summary from backend endpoints", () => {
  const page = fs.readFileSync(eventCenterPagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");

  assert.match(page, /import \{[^}]*onMounted[^}]*\} from 'vue'/);
  assert.match(page, /fetchSystemEventCenterSnapshot/);
  assert.match(page, /fetchSystemEventCenterSummary/);
  assert.match(
    api,
    /fetchSystemEventCenterSnapshot\(\): Promise<[\s\S]*PersistedSystemEventPayload\[\][\s\S]*>/,
  );
  assert.match(
    api,
    /fetchSystemEventCenterSummary\(\): Promise<SystemEventSummaryPayload>/,
  );
  assert.match(
    page,
    /import \{\s*buildSystemEventSummaryItems[^}]*\} from '\.\/system-event-selectors'/,
  );
  assert.match(page, /buildDefaultSystemEventCenterRecipe/);
  assert.match(
    page,
    /const\s+\[\s*snapshot\s*,\s*summary\s*\]\s*=\s*await\s+Promise\.all\(/,
  );
  assert.match(page, /fetchSystemEventCenterSnapshot\(\)/);
  assert.match(page, /fetchSystemEventCenterSummary\(\)/);
  assert.match(page, /store\.hydrate\(snapshot\)/);
  assert.match(
    page,
    /summaryItems\s*=\s*computed\(\(\)\s*=>\s*buildSystemEventSummaryItems\(/,
  );
});

test("system event center feature files exist", () => {
  assert.equal(fs.existsSync(summaryBarPath), true);
  assert.equal(fs.existsSync(filterBarPath), true);
  assert.equal(fs.existsSync(timelinePath), true);
  assert.equal(fs.existsSync(detailPanelPath), true);
  assert.equal(fs.existsSync(cssPath), true);
});

test("system event detail panel renders config change fields", () => {
  const panel = fs.readFileSync(detailPanelPath, "utf8");
  assert.match(panel, /text\('配置路径', 'Config Path'\)/);
  assert.match(panel, /text\('变更前', 'Before'\)/);
  assert.match(panel, /text\('变更后', 'After'\)/);
  assert.match(panel, /eventItem\.details\?\.path/);
  assert.match(panel, /eventItem\.details\?\.before/);
  assert.match(panel, /eventItem\.details\?\.after/);
});

test("route manifest exposes /system/events shell route", () => {
  const manifest = fs.readFileSync(routeManifestPath, "utf8");
  assert.match(
    manifest,
    /import\("\.\.\/system\/SystemEventCenterPage\.vue"\)/,
  );
  assert.match(manifest, /path:\s*"\/system\/events"/);
});

test("system control page demotes event center behind recovery", () => {
  const systemControlPage = fs.readFileSync(systemControlPagePath, "utf8");
  assert.match(systemControlPage, /\/system\/recovery/);
  assert.doesNotMatch(systemControlPage, /\/system\/events/);
});
