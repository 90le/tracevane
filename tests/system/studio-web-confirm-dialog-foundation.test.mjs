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

test("confirm dialog foundation defines shared tone and structure contracts", () => {
  const dialogVue = read("apps/web-vue/src/components/ConfirmDialog.vue");
  const composableSource = read(
    "apps/web-vue/src/composables/useConfirmDialog.ts",
  );
  const chatShellPage = read(
    "apps/web-vue/src/features/chat-v2/ChatShellPage.vue",
  );

  assert.match(
    composableSource,
    /ConfirmDialogTone\s*=\s*["']default["']\s*\|\s*["']danger["']\s*\|\s*["']safe["']/,
    'expected ConfirmDialogTone to include "safe"',
  );
  assert.match(
    dialogVue,
    /class="confirm-dialog__surface"/,
    "expected ConfirmDialog to expose confirm-dialog__surface class",
  );
  assert.match(
    dialogVue,
    /class="confirm-dialog__actions"/,
    "expected ConfirmDialog to expose confirm-dialog__actions class",
  );
  assert.match(
    dialogVue,
    /activeConfirmDialog\.tone\s*===\s*['"]danger['"]|activeConfirmDialog\.value\.tone\s*===\s*['"]danger['"]/,
    "expected ConfirmDialog to check danger tone explicitly",
  );
  assert.match(
    dialogVue,
    /activeConfirmDialog\.tone\s*===\s*['"]safe['"]|activeConfirmDialog\.value\.tone\s*===\s*['"]safe['"]/,
    "expected ConfirmDialog to check safe tone explicitly",
  );
  assert.match(
    chatShellPage,
    /class="chat-host-exec-confirm-dialog"/,
    "expected chat shell to expose host exec confirm dialog surface",
  );
  assert.match(
    chatShellPage,
    /class="chat-host-exec-confirm-primary"/,
    "expected chat shell to expose host exec confirm primary action",
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
