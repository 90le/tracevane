import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const systemControlPage = read(
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const terminalConsolePage = read(
  "apps/web-vue/src/features/terminal/TerminalConsolePage.vue",
);

test("system and terminal pages keep dedicated surface contracts", () => {
  assert.match(systemControlPage, /system-control-surface/);
  assert.match(terminalConsolePage, /terminal-workspace-surface/);
});
