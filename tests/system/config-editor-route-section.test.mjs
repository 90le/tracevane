import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const configEditorPath = path.join(
  rootDir,
  "apps/web-vue/src/features/config/ConfigEditorPage.vue",
);

test("config editor maps query.section into a config tab", () => {
  const source = fs.readFileSync(configEditorPath, "utf8");

  assert.match(source, /function resolveConfigTabFromSection/);
  assert.match(source, /section\.startsWith\('transport\.'\)/);
  assert.match(source, /section\.startsWith\('gateway'\)/);
  assert.match(source, /section\.startsWith\('deviceTrust\.'\)/);
  assert.match(source, /route\.query\.section/);
});
