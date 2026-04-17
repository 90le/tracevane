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

  assert.match(routerSource, /path:\s*['\"]\/home['\"]/);
  assert.match(routerSource, /alias:\s*\[?['\"]\/dashboard['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/chat['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/agents['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/channels['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/cron['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/system['\"]/);
  assert.match(routerSource, /path:\s*['\"]\/terminal['\"]/);

  assert.match(uiContentSource, /to:\s*['\"]\/home['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/chat['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/agents['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/system['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/terminal['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/config['\"]/);
  assert.match(uiContentSource, /to:\s*['\"]\/skills['\"]/);
});
