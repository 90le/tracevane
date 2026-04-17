import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const appVue = read("apps/web-vue/src/App.vue");
const routerSource = read("apps/web-vue/src/router.ts");
const uiContentSource = read("apps/web-vue/src/data/mock.ts");

test("shell redesign introduces topbar, context rail, and task-group navigation", () => {
  assert.match(appVue, /StudioShellTopbar/);
  assert.match(appVue, /StudioShellContextRail/);
  assert.match(appVue, /shell-main-grid/);
  assert.match(
    appVue,
    /const\s*\{[^}]*\bthemeMode\b[^}]*\bsetThemeMode\b[^}]*\}\s*=\s*useThemePreference\s*\(\s*\)/s,
  );
  assert.match(appVue, /<ConfirmDialog\b/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.match(appVue, /<[^>]*\btheme-mode\s*=\s*["']themeMode["']/);

  for (const routePath of [
    "/home",
    "/chat",
    "/agents",
    "/channels",
    "/cron",
    "/system",
    "/terminal",
  ]) {
    assert.match(
      routerSource,
      new RegExp(`path:\\s*["']${routePath.replace("/", "\\/")}["']`),
    );
  }
  assert.match(routerSource, /alias:\s*\[[^\]]*["']\/dashboard["']/s);

  for (const target of [
    "/home",
    "/chat",
    "/agents",
    "/system",
    "/terminal",
    "/config",
    "/skills",
  ]) {
    assert.match(
      uiContentSource,
      new RegExp(`to:\\s*["']${target.replace("/", "\\/")}["']`),
    );
  }
});
