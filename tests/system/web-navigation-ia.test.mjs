import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("primary navigation exposes core operating domains, not legacy aggregation pages", () => {
  const navigation = read("apps/web/src/app/navigation.ts");

  assert.match(navigation, /label: "模型路由"/);
  assert.match(navigation, /label: "消息接入"/);
  assert.match(navigation, /label: "Agent CLI"/);
  assert.doesNotMatch(navigation, /path: "\/external"/);
  assert.doesNotMatch(navigation, /label: "外部接入"/);
  assert.doesNotMatch(navigation, /path: "\/long-tasks"/);
  assert.doesNotMatch(navigation, /label: "长任务"/);
  assert.match(navigation, /path: "\/platforms"/);
  assert.doesNotMatch(navigation, /path: "\/recovery"/);
  assert.doesNotMatch(navigation, /label: "恢复"/);
});

test("legacy external and recovery routes remain compatible deep-links", () => {
  const router = read("apps/web/src/app/router.tsx");
  const platforms = read("apps/web/src/features/platforms/PlatformsPage.tsx");
  const sections = read("apps/web/src/features/platforms/sections.ts");

  assert.match(
    router,
    /path="\/external"[\s\S]*?<Navigate to="\/platforms" replace \/>/,
  );
  assert.doesNotMatch(router, /path="\/long-tasks"/);
  assert.doesNotMatch(router, /ExternalConnectionsPage/);
  assert.doesNotMatch(router, /LongTasksPage/);
  assert.match(
    router,
    /path="\/recovery"[\s\S]*?<Navigate to="\/platforms\/openclaw\/guard" replace \/>/,
  );
  assert.match(platforms, /const OpenClawWorkspace = React\.lazy/);
  assert.match(platforms, /import\("\.\/openclaw\/OpenClawWorkspace"\)/);
  assert.match(platforms, /React\.Suspense/);
  assert.match(platforms, /<OpenClawWorkspace section=\{section\} \/>/);
  assert.doesNotMatch(platforms, /import \{ OverviewView, OpenClawWorkspace \} from "\.\/views"/);
  assert.match(sections, /if \(section === "recovery"\) return "guard"/);
});

test("dashboard and platform wording route integration evidence through support surfaces", () => {
  const dashboard = read("apps/web/src/features/dashboard/DashboardPage.tsx");
  const platformAggregate = read(
    "apps/web/src/features/platforms/usePlatformsAggregate.ts",
  );

  assert.doesNotMatch(dashboard, /label: "外部接入"/);
  assert.doesNotMatch(dashboard, /label: "恢复"/);
  assert.doesNotMatch(dashboard, /ROUTES\.external/);
  assert.match(dashboard, /任务监督/);
  assert.match(dashboard, /平台守护日志/);
  assert.doesNotMatch(platformAggregate, /title: "集成证据"/);
  assert.doesNotMatch(platformAggregate, /id: "external-mcp"/);
  assert.match(platformAggregate, /to: "\/platforms\/openclaw\/guard"/);
});
