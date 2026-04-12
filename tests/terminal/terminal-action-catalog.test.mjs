import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const actionCatalog =
  await import("../../apps/api/modules/terminal/action-catalog.ts");

test("terminal action catalog exposes builtin and script action groups", () => {
  const payload = actionCatalog.buildTerminalActionCatalog();

  assert.deepEqual(
    payload.groups.map((group) => group.key),
    ["builtin", "scripts"],
  );
  assert.ok(payload.groups[0]?.items.length);
  assert.ok(payload.groups[1]?.items.length);
});

test("terminal action catalog includes executable command fields", () => {
  const payload = actionCatalog.buildTerminalActionCatalog();

  const commands = payload.groups.flatMap((group) =>
    group.items.map((item) => item.command),
  );

  assert.ok(
    commands.every((command) => typeof command === "string" && command),
  );
});
