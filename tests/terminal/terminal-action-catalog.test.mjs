import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const catalog =
  await import("../../apps/web-vue/src/features/terminal/terminal-action-catalog.ts");

test("buildTerminalActionLayers separates builtin and script layers", () => {
  const layers = catalog.buildTerminalActionLayers();

  assert.deepEqual(
    layers.map((layer) => layer.key),
    ["builtin", "scripts"],
  );
  assert.ok(layers[0]?.items.length);
  assert.ok(layers[1]?.items.length);
});
