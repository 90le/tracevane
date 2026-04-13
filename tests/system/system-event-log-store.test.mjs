import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const modulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-store-paths.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

test("resolveSystemEventStorePaths returns jsonl and state file paths", async () => {
  const { resolveSystemEventStorePaths } = await import(moduleUrl);

  const paths = resolveSystemEventStorePaths({
    stateDir: "/tmp/openclaw-state",
  });

  assert.deepEqual(paths, {
    eventsJsonlPath: "/tmp/openclaw-state/system-events.jsonl",
    eventStatePath: "/tmp/openclaw-state/system-events.state.json",
  });
});
