import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/route-manifest.ts",
);
const navPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);
const routerPath = path.join(rootDir, "apps/web-vue/src/router.ts");
const appPath = path.join(rootDir, "apps/web-vue/src/App.vue");
const legacyMockPath = path.join(rootDir, "apps/web-vue/src/data/mock.ts");
const legacySessionsViewPath = path.join(
  rootDir,
  "apps/web-vue/src/views/SessionsView.vue",
);

test("shell route manifest defines grouped current routes and future placeholders", () => {
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /key:\s*"overview"/);
  assert.match(manifest, /key:\s*"operations"/);
  assert.match(manifest, /key:\s*"management"/);
  assert.match(manifest, /key:\s*"system"/);
  assert.match(manifest, /key:\s*"room"/);
  assert.match(manifest, /future:\s*true/);
  assert.doesNotMatch(manifest, /Legacy test sentinel/);
});

test("manifest exports shell route records without context panel policy", () => {
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /export const shellRoutes/);
  assert.doesNotMatch(manifest, /contextPanel/);

  for (const routePath of [
    "/dashboard",
    "/agents",
    "/channels",
    "/channel-connectors",
    "/model-gateway",
    "/skills",
    "/cron",
    "/config",
    "/system/recovery",
    "/system/events",
    "/system",
  ]) {
    assert.match(
      manifest,
      new RegExp(`path:\\s*\"${routePath.replace(/\//g, "\\/")}\"`),
    );
  }

});

test("router and app consume shell route metadata instead of local mock navigation", () => {
  assert.equal(fs.existsSync(navPath), true);
  const router = fs.readFileSync(routerPath, "utf8");
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(router, /from "\.\/features\/shell\/route-manifest"|from '\.\/features\/shell\/route-manifest'/);
  assert.match(router, /routes:\s*shellRoutes/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-navigation'/);
  assert.match(app, /isFilesSurface/);
  assert.match(app, /!isChatSurface && !isFilesSurface/);
  assert.doesNotMatch(app, /useUiContent/);
  assert.equal(fs.existsSync(legacyMockPath), false);
  assert.equal(fs.existsSync(legacySessionsViewPath), false);
});
