import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("all daemon domains expose the normalized supervisor contract", () => {
  const source = read("types/supervisor.ts");
  assert.match(source, /"session" \| "persistent"/);
  assert.match(source, /"not-installed"/);
  assert.match(source, /"stale-config"/);
  assert.match(source, /"task-not-found"/);
  assert.match(source, /"permission-denied"/);
  for (const file of [
    "types/model-gateway.ts",
    "types/channel-connectors.ts",
    "types/openclaw-recovery.ts",
  ]) {
    assert.match(read(file), /TracevaneServiceManagerStatus/);
  }
});
