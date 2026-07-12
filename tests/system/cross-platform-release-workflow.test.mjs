import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cross-platform workflow runs the same release gate on native runners", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/cross-platform-release.yml", import.meta.url), "utf8");
  for (const runner of ["windows-latest", "macos-latest", "ubuntu-latest"]) {
    assert.match(workflow, new RegExp(runner));
  }
  assert.match(workflow, /node-version:\s*["']?22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /playwright install chromium/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run release:cross-platform:full/);
});
