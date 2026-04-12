import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const viewModelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat-v2/chat-runtime-view-model.ts",
);

test("chat runtime view model consumes runtime summary helpers", () => {
  const source = fs.readFileSync(viewModelPath, "utf8");
  assert.match(source, /buildChatRuntimeSummary/);
  assert.match(source, /buildChatOverlaySummary/);
  assert.match(source, /const runtimeSummary = computed/);
  assert.match(source, /const overlaySummary = computed/);
});
