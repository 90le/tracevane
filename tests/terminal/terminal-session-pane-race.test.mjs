import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const panePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalSessionPane.vue",
);

test("terminal session pane guards against stale descriptor fetch responses", () => {
  const source = fs.readFileSync(panePath, "utf8");

  assert.match(source, /let descriptorRequestSeq = 0/);
  assert.match(source, /const requestSeq = \+\+descriptorRequestSeq/);
  assert.match(source, /if \(requestSeq !== descriptorRequestSeq\)/);
});
