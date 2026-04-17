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
  assert.match(systemControlPage, /system-health-strip/);
  assert.match(systemControlPage, /system-control-grid/);
  assert.match(systemControlPage, /system-main-stage/);
  assert.match(systemControlPage, /system-raw-inspector/);
  assert.match(
    systemControlPage,
    /@media \(max-width: 1180px\) \{[\s\S]*\.system-main-stage \{[\s\S]*order:\s*-1;/,
  );
  assert.match(
    systemControlPage,
    /@media \(max-width: 880px\) \{[\s\S]*\.system-stage-tabs\.mobile-stage-tabs \{[\s\S]*overflow-x:\s*auto/,
  );

  assert.match(terminalConsolePage, /terminal-workspace-surface/);
  assert.match(terminalConsolePage, /terminal-workspace-grid/);
  assert.match(terminalConsolePage, /terminal-main-canvas/);
  assert.match(terminalConsolePage, /terminal-side-utilities/);
  assert.match(
    terminalConsolePage,
    /@media \(max-width: 1120px\) \{[\s\S]*\.terminal-main-canvas \{[\s\S]*order:\s*-1;/,
  );
});
