import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const explorerStateModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-resource-explorer-state.ts");

test("terminal resource explorer snapshots persist selected tree context", () => {
  const serialized = explorerStateModule.serializeTerminalResourceExplorerSnapshot({
    rootId: "openclaw-root",
    expandedPaths: ["projects/openclaw/apps", "projects/openclaw"],
    selectedPath: "/projects/openclaw/apps/web-vue/",
    showHidden: false,
  });

  assert.deepEqual(
    explorerStateModule.parseTerminalResourceExplorerSnapshot(serialized),
    {
      rootId: "openclaw-root",
      expandedPaths: [
        "projects",
        "projects/openclaw",
        "projects/openclaw/apps",
      ],
      selectedPath: "projects/openclaw/apps/web-vue",
      showHidden: false,
    },
  );
});

test("terminal resource explorer snapshots reject invalid roots and bound expanded folders", () => {
  assert.equal(explorerStateModule.parseTerminalResourceExplorerSnapshot("not-json"), null);
  assert.equal(
    explorerStateModule.serializeTerminalResourceExplorerSnapshot({
      rootId: "",
      expandedPaths: ["a"],
      selectedPath: "a",
      showHidden: true,
    }),
    "",
  );

  const expandedPaths = Array.from(
    { length: explorerStateModule.TERMINAL_RESOURCE_EXPLORER_EXPANDED_PATH_LIMIT + 12 },
    (_, index) => `folder-${index}/child`,
  );
  const parsed = explorerStateModule.parseTerminalResourceExplorerSnapshot(
    JSON.stringify({
      rootId: "root",
      expandedPaths,
      selectedPath: "folder-1/child/file.ts",
    }),
  );

  assert.equal(
    parsed?.expandedPaths.length,
    explorerStateModule.TERMINAL_RESOURCE_EXPLORER_EXPANDED_PATH_LIMIT,
  );
  assert.equal(parsed?.showHidden, true);
});

test("terminal resource explorer snapshots accept legacy expanded path maps", () => {
  const parsed = explorerStateModule.parseTerminalResourceExplorerSnapshot(
    JSON.stringify({
      rootId: "root",
      expandedPaths: {
        "src/features": true,
        "src/hidden": false,
      },
      selectedPath: "src/features/terminal",
      showHidden: true,
    }),
  );

  assert.deepEqual(parsed?.expandedPaths, ["src", "src/features"]);
});
