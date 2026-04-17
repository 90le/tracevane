import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function exists(filePath) {
  return fs.existsSync(path.join(rootDir, filePath));
}

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

test("confirm dialog foundation exposes shared component/composable path contracts", () => {
  assert.ok(
    exists("apps/web-vue/src/components/ConfirmDialog.vue"),
    "missing shared confirm dialog component: apps/web-vue/src/components/ConfirmDialog.vue",
  );
  assert.ok(
    exists("apps/web-vue/src/composables/useConfirmDialog.ts"),
    "missing shared confirm dialog composable: apps/web-vue/src/composables/useConfirmDialog.ts",
  );
});

test("app shell mounts shared ConfirmDialog component", () => {
  const appVue = read("apps/web-vue/src/App.vue");

  assert.match(
    appVue,
    /import\s+ConfirmDialog\s+from\s+["']\.\/components\/ConfirmDialog\.vue["']/,
    "expected App.vue to import shared ConfirmDialog from ./components/ConfirmDialog.vue",
  );
  assert.match(
    appVue,
    /<ConfirmDialog\b/,
    "expected App.vue template to mount shared ConfirmDialog",
  );
});
