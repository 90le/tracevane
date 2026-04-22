import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const actionCatalog =
  await import("../../apps/api/modules/terminal/action-catalog.ts");

test("terminal action catalog exposes richer grouped actions", () => {
  const payload = actionCatalog.buildTerminalActionCatalog();

  assert.deepEqual(
    payload.groups.map((group) => group.key),
    ["builtin", "development", "workspace"],
  );
  assert.ok(payload.groups[0]?.items.length);
  assert.ok(payload.groups[1]?.items.length);
  assert.ok(payload.groups[2]?.items.length);
});

test("terminal action catalog includes executable metadata for each action", () => {
  const payload = actionCatalog.buildTerminalActionCatalog();

  const items = payload.groups.flatMap((group) => group.items);

  assert.ok(
    items.every(
      (item) =>
        typeof item.command === "string" &&
        item.command &&
        typeof item.descriptionZh === "string" &&
        item.descriptionZh &&
        typeof item.recommendedTitle === "string" &&
        item.recommendedTitle &&
        item.runMode === "new-session",
    ),
  );
});
