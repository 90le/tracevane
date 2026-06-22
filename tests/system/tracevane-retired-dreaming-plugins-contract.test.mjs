import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

test("Tracevane shell no longer exposes Dreaming memory or Plugins management routes", () => {
  const navigation = read("apps/web/src/app/navigation.ts");
  const router = read("apps/web/src/app/router.tsx");

  // New feature-sliced frontend: assert no Dreaming / legacy plugin-management
  // routes or labels survive in the navigation manifest or the router.
  assert.doesNotMatch(navigation, /dreaming|DreamingView|MoonStar/i);
  assert.doesNotMatch(navigation, /\/plugins\b|PluginsView/);
  assert.doesNotMatch(navigation, /label:\s*["']梦境["']|label:\s*["']插件["']/);
  assert.doesNotMatch(router, /dreaming|DreamingPage|DreamingView/i);
  assert.doesNotMatch(router, /\/plugins\b|PluginsPage|PluginsView/);
});

test("Tracevane backend no longer registers Dreaming memory or Plugins management APIs", () => {
  const apiIndex = read("apps/api/index.ts");
  const server = read("apps/api/server.ts");
  const context = read("apps/api/core/context.ts");
  const systemRoutes = read("apps/api/modules/system/routes.ts");
  const systemService = read("apps/api/modules/system/service.ts");
  const systemBootstrap = read("apps/api/modules/system/bootstrap.ts");
  const typesIndex = read("types/index.ts");

  assert.doesNotMatch(apiIndex, /createPluginsService|plugins,/);
  assert.doesNotMatch(server, /registerPluginsRoutes|\/api\/plugins/);
  assert.doesNotMatch(context, /PluginsService|plugins:\s*PluginsService/);
  assert.doesNotMatch(systemRoutes, /\/api\/system\/dreaming|DreamingToggleRequest/);
  assert.doesNotMatch(systemService, /Dreaming[A-Za-z]+|dreaming-service|types\/dreaming/);
  assert.doesNotMatch(systemBootstrap, /Dreaming|dreaming-memory-slot|dreaming-shared/);
  assert.doesNotMatch(typesIndex, /dreaming\.js|plugins\.js/);
});

test("retired Dreaming memory and Plugins management source files are deleted", () => {
  [
    "types/dreaming.ts",
    "types/plugins.ts",
    "apps/api/modules/plugins/service.ts",
    "apps/api/modules/plugins/routes.ts",
    "apps/api/modules/system/dreaming-service.ts",
    "apps/api/modules/system/dreaming-shared.ts",
    "apps/web/src/features/dreaming",
    "apps/web/src/features/plugins",
  ].forEach((relativePath) => {
    assert.equal(exists(relativePath), false, `${relativePath} should be removed`);
  });
});
