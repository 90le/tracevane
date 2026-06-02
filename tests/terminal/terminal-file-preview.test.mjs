import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const previewModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-file-preview.ts");

test("terminal file preview tabs are created only for file payloads", () => {
  assert.equal(
    typeof previewModule.createTerminalFilePreviewId("root", "file.ts"),
    "string",
  );

  const tab = previewModule.createTerminalFilePreviewTab({
    rootId: "openclaw-root",
    path: "workspace/index.ts",
    absolutePath: "/home/binbin/.openclaw/workspace/index.ts",
    kind: "file",
    name: "index.ts",
  });

  assert.deepEqual(tab, {
    id: "openclaw-root::workspace/index.ts",
    rootId: "openclaw-root",
    path: "workspace/index.ts",
    absolutePath: "/home/binbin/.openclaw/workspace/index.ts",
    name: "index.ts",
  });

  assert.equal(
    previewModule.createTerminalFilePreviewTab({
      rootId: "openclaw-root",
      path: "workspace",
      absolutePath: "/home/binbin/.openclaw/workspace",
      kind: "directory",
      name: "workspace",
    }),
    null,
  );
});

test("terminal file preview tab navigation wraps across open files", () => {
  const tabs = [
    { id: "root::a.ts" },
    { id: "root::b.ts" },
    { id: "root::c.ts" },
  ];

  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(tabs, "root::a.ts", 1),
    "root::b.ts",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(tabs, "root::a.ts", -1),
    "root::c.ts",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(tabs, "root::c.ts", 1),
    "root::a.ts",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(tabs, "missing", 1),
    "root::a.ts",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(tabs, "missing", -1),
    "root::c.ts",
  );
});

test("terminal file preview tab navigation ignores empty and single-tab sets", () => {
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId([], "root::a.ts", 1),
    "",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(
      [{ id: "root::a.ts" }],
      "root::a.ts",
      1,
    ),
    "",
  );
  assert.equal(
    previewModule.resolveNextTerminalFilePreviewTabId(
      [{ id: "" }, { id: "root::a.ts" }],
      "root::a.ts",
      -1,
    ),
    "",
  );
});

test("terminal file preview tab window keeps active tabs visible with overflow counts", () => {
  const tabs = Array.from({ length: 10 }, (_, index) => ({
    id: `root::file-${index + 1}.ts`,
  }));

  assert.deepEqual(
    previewModule.resolveTerminalFilePreviewTabWindow(tabs, "root::file-6.ts", 7),
    {
      startIndex: 2,
      endIndex: 9,
      visibleTabs: tabs.slice(2, 9),
      hiddenBeforeCount: 2,
      hiddenAfterCount: 1,
      hiddenCount: 3,
    },
  );

  assert.deepEqual(
    previewModule.resolveTerminalFilePreviewTabWindow(tabs, "root::file-10.ts", 7),
    {
      startIndex: 3,
      endIndex: 10,
      visibleTabs: tabs.slice(3, 10),
      hiddenBeforeCount: 3,
      hiddenAfterCount: 0,
      hiddenCount: 3,
    },
  );

  assert.deepEqual(
    previewModule.resolveTerminalFilePreviewTabWindow(tabs.slice(0, 3), "missing", 7),
    {
      startIndex: 0,
      endIndex: 3,
      visibleTabs: tabs.slice(0, 3),
      hiddenBeforeCount: 0,
      hiddenAfterCount: 0,
      hiddenCount: 0,
    },
  );
});

test("terminal file preview snapshots persist sanitized open file metadata", () => {
  const snapshot = previewModule.serializeTerminalFilePreviewSnapshot(
    [
      {
        id: "ignored",
        rootId: "root",
        path: "src/main.ts",
        absolutePath: "/workspace/src/main.ts",
        name: "main.ts",
      },
      {
        id: "duplicate",
        rootId: "root",
        path: "src/main.ts",
        absolutePath: "/workspace/src/main.ts",
        name: "main.ts",
      },
      {
        id: "root::README.md",
        rootId: "root",
        path: "README.md",
        absolutePath: "/workspace/README.md",
        name: "",
      },
    ],
    "root::README.md",
  );

  assert.deepEqual(
    previewModule.parseTerminalFilePreviewSnapshot(snapshot),
    {
      activeTabId: "root::README.md",
      tabs: [
        {
          id: "root::src/main.ts",
          rootId: "root",
          path: "src/main.ts",
          absolutePath: "/workspace/src/main.ts",
          name: "main.ts",
        },
        {
          id: "root::README.md",
          rootId: "root",
          path: "README.md",
          absolutePath: "/workspace/README.md",
          name: "README.md",
        },
      ],
    },
  );
});

test("terminal file preview snapshots reject invalid data and bound restored tabs", () => {
  assert.equal(previewModule.parseTerminalFilePreviewSnapshot("not-json"), null);
  assert.equal(previewModule.parseTerminalFilePreviewSnapshot(JSON.stringify({ tabs: [] })), null);
  assert.equal(previewModule.serializeTerminalFilePreviewSnapshot([], ""), "");

  const manyTabs = Array.from(
    { length: previewModule.TERMINAL_FILE_PREVIEW_SNAPSHOT_LIMIT + 8 },
    (_, index) => ({
      id: `root::file-${index}.ts`,
      rootId: "root",
      path: `file-${index}.ts`,
      absolutePath: `/workspace/file-${index}.ts`,
      name: `file-${index}.ts`,
    }),
  );

  const parsed = previewModule.parseTerminalFilePreviewSnapshot(
    previewModule.serializeTerminalFilePreviewSnapshot(manyTabs, "missing"),
  );
  assert.equal(parsed?.tabs.length, previewModule.TERMINAL_FILE_PREVIEW_SNAPSHOT_LIMIT);
  assert.equal(parsed?.activeTabId, "root::file-0.ts");
});
